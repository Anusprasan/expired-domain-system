const crypto = require("crypto");
const dns = require("dns").promises;
const fs = require("fs");
const net = require("net");
const path = require("path");
const { chromium } = require("playwright");
const { CAPTURE_DIR, readState, updateState } = require("./shortLinkChecker.storage");
const { notifyShortLinkBatchSummary, notifyShortLinkError } = require("./shortLinkChecker.telegram.service");

const MAX_CHECK_HISTORY = 1000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_SCAN_MODE = "capture";
const STATUS_ONLY_SCAN_MODE = "status-only";
const STATUS_CLOUDFLARE = "cloudflare";
const STATUS_SECURITY_VERIFICATION = "security-verification";
const DEFAULT_ALERT_STATUS_CODES = [400, 401, 403, 404, 408, 429, 500, 502, 503, 504];
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const SHORT_LINK_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
let schedulerTimer = null;
let schedulerTickRunning = false;

const checkerRuntime = {
  running: false,
  currentBatch: null,
  stopRequested: false,
  activeAbortControllers: new Map(),
  telegramMessageCounter: 0,
  telegramSendQueue: Promise.resolve(),
};

function nowIso() {
  return new Date().toISOString();
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resetTelegramMessageSequence() {
  checkerRuntime.telegramMessageCounter = 0;
}

function getNextTelegramMessageNumber() {
  checkerRuntime.telegramMessageCounter += 1;
  return checkerRuntime.telegramMessageCounter;
}

function queueTelegramSend(task) {
  const queuedTask = checkerRuntime.telegramSendQueue
    .catch(() => {})
    .then(task);

  checkerRuntime.telegramSendQueue = queuedTask.catch(() => {});

  return queuedTask;
}

async function waitForTelegramSendQueue() {
  await checkerRuntime.telegramSendQueue.catch(() => {});
}

function createShortLinkStopError() {
  const error = new Error("Short-link scheduled check stopped");
  error.code = "SHORT_LINK_CHECK_STOPPED";
  return error;
}

function isShortLinkStopError(error) {
  return error?.code === "SHORT_LINK_CHECK_STOPPED";
}

function isShortLinkStopRequested(signal) {
  return Boolean(signal?.aborted || checkerRuntime.stopRequested);
}

function throwIfShortLinkStopRequested(signal) {
  if (isShortLinkStopRequested(signal)) {
    throw createShortLinkStopError();
  }
}

function createTimeoutSignal(timeoutMs, parentSignal = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, getPositiveInteger(timeoutMs, 30000));
  const abortFromParent = () => {
    controller.abort();
  };

  if (typeof timeout.unref === "function") {
    timeout.unref();
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);

      if (parentSignal) {
        parentSignal.removeEventListener("abort", abortFromParent);
      }
    },
  };
}

function getPositiveInteger(value, fallback, options = {}) {
  const number = Number(value);
  const minimum = Number.isFinite(options.minimum) ? options.minimum : 1;
  const maximum = Number.isFinite(options.maximum) ? options.maximum : Number.POSITIVE_INFINITY;
  const normalized = Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;

  return Math.min(maximum, Math.max(minimum, normalized));
}

function getCaptureRetentionMs() {
  return getPositiveInteger(process.env.SHORT_LINK_CAPTURE_RETENTION_HOURS, 48, {
    minimum: 1,
    maximum: 24 * 365,
  }) * 60 * 60 * 1000;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + getPositiveInteger(minutes, 60) * 60 * 1000);
}

function normalizeScanMode(value) {
  return String(value || DEFAULT_SCAN_MODE) === STATUS_ONLY_SCAN_MODE ? STATUS_ONLY_SCAN_MODE : DEFAULT_SCAN_MODE;
}

function normalizeStatusCodes(value, fallback = DEFAULT_ALERT_STATUS_CODES) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,\s]+/)
        .filter(Boolean);
  const normalizedCodes = rawValues
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 599);
  const uniqueCodes = [...new Set(normalizedCodes)];

  if (!uniqueCodes.length && fallback) {
    return [...fallback];
  }

  return uniqueCodes.sort((left, right) => left - right);
}

function normalizeCustomAlertStatusCodes(value = []) {
  const rawItems = Array.isArray(value) ? value : [];
  const byCode = new Map();

  rawItems.forEach((item) => {
    const code = Number(item?.code);
    const name = String(item?.name || "").trim().replace(/\s+/g, " ").slice(0, 40);

    if (Number.isInteger(code) && code >= 0 && code <= 599 && name) {
      byCode.set(code, { code, name });
    }
  });

  return [...byCode.values()].sort((left, right) => left.code - right.code);
}

function getTelegramAlertStatusCodes(telegram = {}) {
  return Array.isArray(telegram.alertStatusCodes)
    ? normalizeStatusCodes(telegram.alertStatusCodes, [])
    : [...DEFAULT_ALERT_STATUS_CODES];
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeUrl(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    throw new Error("Short link is required");
  }

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
  const parsedUrl = new URL(withProtocol);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS short links can be checked");
  }

  assertAllowedHostname(parsedUrl.hostname);

  return parsedUrl.toString();
}

function normalizePathname(pathname) {
  const normalizedPath = String(pathname || "/").replace(/\/+$/g, "");
  return normalizedPath || "/";
}

function getDuplicateShortUrlKey(value) {
  const parsedUrl = new URL(normalizeUrl(value));
  const normalizedPort = parsedUrl.port && !(
    (parsedUrl.protocol === "http:" && parsedUrl.port === "80") ||
    (parsedUrl.protocol === "https:" && parsedUrl.port === "443")
  )
    ? `:${parsedUrl.port}`
    : "";

  return (
    `${parsedUrl.hostname.toLowerCase()}${normalizedPort}` +
    `${normalizePathname(parsedUrl.pathname)}${parsedUrl.search}${parsedUrl.hash}`
  ).toLowerCase();
}

function getSafeDuplicateShortUrlKey(value) {
  try {
    return getDuplicateShortUrlKey(value);
  } catch {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/g, "");
  }
}

function isPrivateIpAddress(address) {
  if (!address) {
    return true;
  }

  const normalizedAddress = address.toLowerCase();

  if (
    normalizedAddress === "::1" ||
    normalizedAddress.startsWith("fc") ||
    normalizedAddress.startsWith("fd") ||
    normalizedAddress.startsWith("fe80")
  ) {
    return true;
  }

  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    const [first, second] = parts;

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }

  return false;
}

function assertAllowedHostname(hostname) {
  const normalizedHostname = String(hostname || "").toLowerCase();

  if (!normalizedHostname || normalizedHostname === "localhost" || normalizedHostname.endsWith(".localhost")) {
    throw new Error("Localhost links cannot be checked");
  }

  if (net.isIP(normalizedHostname) && isPrivateIpAddress(normalizedHostname)) {
    throw new Error("Private network links cannot be checked");
  }
}

async function assertSafeTarget(url) {
  const parsedUrl = new URL(url);
  assertAllowedHostname(parsedUrl.hostname);

  const resolvedAddresses = await dns.lookup(parsedUrl.hostname, { all: true }).catch(() => []);

  if (resolvedAddresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error("Private network links cannot be checked");
  }
}

function buildRequestGuard() {
  const safeHostCache = new Map();

  return async (targetUrl) => {
    let parsedRequestUrl;

    try {
      parsedRequestUrl = new URL(targetUrl);
    } catch {
      return;
    }

    if (!["http:", "https:"].includes(parsedRequestUrl.protocol)) {
      return;
    }

    if (!safeHostCache.has(parsedRequestUrl.hostname)) {
      safeHostCache.set(parsedRequestUrl.hostname, assertSafeTarget(targetUrl));
    }

    await safeHostCache.get(parsedRequestUrl.hostname);
  };
}

function isErrorStatus(statusCode) {
  const status = Number(statusCode || 0);
  return !status || status >= 400;
}

function isHttpErrorStatus(statusCode) {
  const status = Number(statusCode || 0);
  return status >= 400;
}

function getNavigationWaitUntil() {
  const waitUntil = String(process.env.SHORT_LINK_NAVIGATION_WAIT_UNTIL || "domcontentloaded")
    .trim()
    .toLowerCase();
  const allowedValues = new Set(["load", "domcontentloaded", "networkidle"]);

  return allowedValues.has(waitUntil) ? waitUntil : "domcontentloaded";
}

function cleanCheckerErrorMessage(value, fallback = "") {
  const message = typeof value === "string" ? value : value?.message;
  const cleaned = String(message || fallback || "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .split(/\r?\n\s*Call log:/i)[0]
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function hasAnyText(value, patterns = []) {
  const text = String(value || "").toLowerCase();
  return patterns.some((pattern) => text.includes(pattern));
}

function emptyVerificationInfo() {
  return {
    verificationDetected: false,
    verificationType: "",
    verificationName: "",
    verificationReason: "",
  };
}

function buildVerificationInfo(type, name, reason) {
  return {
    verificationDetected: true,
    verificationType: type,
    verificationName: name,
    verificationReason: reason,
  };
}

function detectVerificationPage({ title = "", bodyText = "", html = "", finalUrl = "", headers = {} } = {}) {
  const headerText = Object.entries(headers || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .toLowerCase();
  const pageText = `${title}\n${bodyText}\n${html}\n${finalUrl}`.toLowerCase();
  const cloudflareChallengeSignals = [
    "performance and security by cloudflare",
    "ray id:",
    "cf-browser-verification",
    "cf_chl_",
    "/cdn-cgi/challenge-platform",
    "checking if the site connection is secure",
    "needs to review the security of your connection",
    "ddos protection by cloudflare",
  ];
  const securityVerificationSignals = [
    "performing security verification",
    "security service to protect against malicious bots",
    "verifies you are not a bot",
    "verify you are human",
    "human verification",
    "security verification",
    "complete the security check",
    "checking your browser",
  ];
  const hasCloudflareHeaderChallenge =
    headerText.includes("cf-mitigated: challenge") ||
    headerText.includes("cf-chl") ||
    headerText.includes("server: cloudflare") && hasAnyText(pageText, securityVerificationSignals);
  const hasCloudflarePageChallenge =
    pageText.includes("cloudflare") && hasAnyText(pageText, cloudflareChallengeSignals);

  if (hasCloudflareHeaderChallenge || hasCloudflarePageChallenge) {
    return buildVerificationInfo(
      STATUS_CLOUDFLARE,
      "Cloudflare verification",
      "Cloudflare Error page or challenge detected"
    );
  }

  if (hasAnyText(pageText, securityVerificationSignals)) {
    return buildVerificationInfo(
      STATUS_SECURITY_VERIFICATION,
      "Security verification",
      "Server Error or Security verification page detected"
    );
  }

  return emptyVerificationInfo();
}

async function inspectVerificationPage(page, response = null) {
  const snapshot = await page.evaluate(() => ({
    title: document.title || "",
    bodyText: document.body?.innerText?.slice(0, 12000) || "",
    html: document.documentElement?.innerHTML?.slice(0, 20000) || "",
  })).catch(() => ({ title: "", bodyText: "", html: "" }));

  return {
    title: snapshot.title || await page.title().catch(() => ""),
    verification: detectVerificationPage({
      ...snapshot,
      finalUrl: page.url(),
      headers: response?.headers?.() || {},
    }),
  };
}

function isRedirectStatus(statusCode) {
  return REDIRECT_STATUS_CODES.has(Number(statusCode || 0));
}

function getLatestCheckForLink(checks, linkId) {
  return checks
    .filter((check) => check.linkId === linkId)
    .sort((left, right) => new Date(right.checkedAt) - new Date(left.checkedAt))[0] || null;
}

function sanitizeTelegram(telegram = {}) {
  return {
    enabled: Boolean(telegram.enabled),
    chatId: String(telegram.chatId || ""),
    hasBotToken: Boolean(telegram.botToken),
    updatedAt: telegram.updatedAt || null,
    lastSentAt: telegram.lastSentAt || null,
    lastError: String(telegram.lastError || ""),
    sentCount: Number(telegram.sentCount || 0),
    failedCount: Number(telegram.failedCount || 0),
    alertStatusCodes: getTelegramAlertStatusCodes(telegram),
    customAlertStatusCodes: normalizeCustomAlertStatusCodes(telegram.customAlertStatusCodes),
    notifyCloudflareVerification: Boolean(telegram.notifyCloudflareVerification),
    notifySecurityVerification: Boolean(telegram.notifySecurityVerification),
  };
}

function sanitizeSchedule(schedule = {}) {
  return {
    enabled: Boolean(schedule.enabled),
    delayMinutes: getPositiveInteger(schedule.delayMinutes, 60, { minimum: 1, maximum: 1440 }),
    parallelChecks: getPositiveInteger(schedule.parallelChecks, 2, { minimum: 1, maximum: 5 }),
    scanMode: normalizeScanMode(schedule.scanMode),
    nextRunAt: schedule.nextRunAt || null,
    lastStartedAt: schedule.lastStartedAt || null,
    lastFinishedAt: schedule.lastFinishedAt || null,
    lastError: String(schedule.lastError || ""),
    updatedAt: schedule.updatedAt || null,
  };
}

function getCheckerStatus() {
  const currentBatch = checkerRuntime.currentBatch
    ? {
        ...checkerRuntime.currentBatch,
        activeItems: Array.isArray(checkerRuntime.currentBatch.activeItems)
          ? checkerRuntime.currentBatch.activeItems
          : [],
      }
    : null;

  return {
    serverNow: nowIso(),
    running: Boolean(checkerRuntime.running),
    stopRequested: Boolean(checkerRuntime.stopRequested),
    currentBatch,
    schedule: sanitizeSchedule(readState().schedule),
  };
}

function markBatchStopping(batch) {
  if (!batch) {
    return null;
  }

  batch.status = "stopping";
  batch.stopRequestedAt = batch.stopRequestedAt || nowIso();
  return batch;
}

function requestStopCurrentScheduleBatch() {
  const batch = checkerRuntime.currentBatch;

  if (!checkerRuntime.running || !batch || batch.source !== "schedule") {
    return false;
  }

  checkerRuntime.stopRequested = true;
  markBatchStopping(batch);
  checkerRuntime.currentBatch = {
    ...batch,
    activeItems: Array.isArray(batch.activeItems) ? batch.activeItems : [],
  };

  checkerRuntime.activeAbortControllers.forEach((controller) => {
    controller.abort();
  });

  return true;
}

function serializeCheck(check) {
  if (!check) {
    return null;
  }

  return {
    id: check.id,
    linkId: check.linkId,
    status: check.status,
    checkedAt: check.checkedAt,
    shortUrl: check.shortUrl,
    exactStatusCode: check.exactStatusCode || 0,
    exactStatusText: check.exactStatusText || "",
    finalStatusCode: check.finalStatusCode || 0,
    finalUrl: check.finalUrl || "",
    title: check.title || "",
    error: check.error || "",
    durationMs: check.durationMs || 0,
    scanMode: normalizeScanMode(check.scanMode),
    screenshotEndpoint: check.screenshotFileName ? `/checks/${check.id}/image` : "",
    telegramSent: Boolean(check.telegramSent),
    telegramError: check.telegramError || "",
    telegramAlertMatched: Array.isArray(check.telegramAlertMatched) ? check.telegramAlertMatched : [],
    verificationDetected: Boolean(check.verificationDetected),
    verificationType: check.verificationType || "",
    verificationName: check.verificationName || "",
    verificationReason: check.verificationReason || "",
  };
}

function serializeLink(link, checks = []) {
  return {
    ...link,
    latestCheck: serializeCheck(getLatestCheckForLink(checks, link.id)),
  };
}

function getTimeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function matchesShortLinkSearch(link, searchTerm) {
  const term = String(searchTerm || "").trim().toLowerCase();

  if (!term) {
    return true;
  }

  return [
    link.title,
    link.shortUrl,
    link.moneySiteDomain,
    link.brandName,
    link.note,
    link.latestCheck?.finalUrl,
    link.latestCheck?.error,
    link.latestCheck?.verificationName,
    link.latestCheck?.verificationReason,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term));
}

function matchesShortLinkStatus(link, status) {
  if (!status || status === "all") {
    return true;
  }

  if (status === "not-checked") {
    return !link.latestCheck?.checkedAt;
  }

  return link.latestCheck?.status === status;
}

function matchesShortLinkActive(link, active) {
  if (!active || active === "all") {
    return true;
  }

  if (active === "active") {
    return link.active !== false;
  }

  if (active === "inactive") {
    return link.active === false;
  }

  return true;
}

function sortShortLinks(links, sort = "updatedAt", order = "desc") {
  const direction = String(order).toLowerCase() === "asc" ? 1 : -1;

  return [...links].sort((left, right) => {
    if (sort === "shortUrl") {
      return String(left.shortUrl || "").localeCompare(String(right.shortUrl || "")) * direction;
    }

    if (sort === "moneySiteDomain") {
      return String(left.moneySiteDomain || "").localeCompare(String(right.moneySiteDomain || "")) * direction;
    }

    if (sort === "checkedAt") {
      return (getTimeValue(left.latestCheck?.checkedAt) - getTimeValue(right.latestCheck?.checkedAt)) * direction;
    }

    if (sort === "status") {
      return String(left.latestCheck?.status || "").localeCompare(String(right.latestCheck?.status || "")) * direction;
    }

    return (getTimeValue(left.updatedAt) - getTimeValue(right.updatedAt)) * direction;
  });
}

function buildShortLinkSummary(links) {
  return {
    totalCount: links.length,
    activeCount: links.filter((link) => link.active !== false).length,
    checkedCount: links.filter((link) => link.latestCheck?.checkedAt).length,
    successCount: links.filter((link) => link.latestCheck?.status === "success").length,
    errorCount: links.filter((link) => link.latestCheck?.status === "error").length,
    cloudflareCount: links.filter((link) => link.latestCheck?.status === STATUS_CLOUDFLARE).length,
    securityVerificationCount: links.filter((link) => link.latestCheck?.status === STATUS_SECURITY_VERIFICATION).length,
  };
}

function listShortLinks(options = {}) {
  cleanupExpiredCheckImages();
  const state = readState();
  const page = getPositiveInteger(options.page, 1, { minimum: 1, maximum: 100000 });
  const limit = getPositiveInteger(options.limit, DEFAULT_PAGE_SIZE, { minimum: 1, maximum: MAX_PAGE_SIZE });
  const allItems = state.links.map((link) => serializeLink(link, state.checks));
  const summary = buildShortLinkSummary(allItems);
  const filteredItems = sortShortLinks(
    allItems
      .filter((link) => matchesShortLinkSearch(link, options.search))
      .filter((link) => matchesShortLinkStatus(link, options.status))
      .filter((link) => matchesShortLinkActive(link, options.active)),
    options.sort,
    options.order
  );
  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const normalizedPage = Math.min(page, totalPages);
  const startIndex = (normalizedPage - 1) * limit;

  return {
    items: filteredItems.slice(startIndex, startIndex + limit),
    summary,
    pagination: {
      page: normalizedPage,
      limit,
      totalItems,
      totalPages,
      hasNextPage: normalizedPage < totalPages,
      hasPreviousPage: normalizedPage > 1,
    },
    filters: {
      search: String(options.search || ""),
      status: String(options.status || "all"),
      active: String(options.active || "all"),
      sort: String(options.sort || "updatedAt"),
      order: String(options.order || "desc"),
    },
  };
}

function sanitizeLinkPayload(payload = {}, currentLink = null) {
  const shortUrl = normalizeUrl(payload.shortUrl ?? currentLink?.shortUrl);
  const moneySite = payload.moneySite && typeof payload.moneySite === "object" ? payload.moneySite : {};
  const moneySiteId = normalizeText(payload.moneySiteId ?? moneySite.id ?? moneySite._id ?? currentLink?.moneySiteId);
  const moneySiteDomain = normalizeText(
    payload.moneySiteDomain ?? moneySite.domain ?? currentLink?.moneySiteDomain
  ).toLowerCase();
  const brandName = normalizeText(
    payload.brandName ??
    moneySite.brandName ??
    moneySite.brandId?.brandName ??
    currentLink?.brandName
  );

  return {
    title: normalizeText(payload.title ?? currentLink?.title),
    shortUrl,
    moneySiteId,
    moneySiteDomain,
    brandName,
    note: normalizeText(payload.note ?? currentLink?.note),
    active: payload.active !== undefined ? Boolean(payload.active) : currentLink?.active !== false,
  };
}

function createShortLink(payload = {}, actor = {}) {
  const timestamp = nowIso();
  const sanitized = sanitizeLinkPayload(payload);
  const duplicateKey = getDuplicateShortUrlKey(sanitized.shortUrl);
  let savedLink = null;

  updateState((state) => {
    const existing = state.links.find((link) => getSafeDuplicateShortUrlKey(link.shortUrl) === duplicateKey);

    if (existing) {
      const error = new Error("Short link already exists");
      error.statusCode = 409;
      throw error;
    }

    savedLink = {
      ...sanitized,
      id: crypto.randomUUID(),
      createdAt: timestamp,
      createdBy: actor,
      updatedAt: timestamp,
      updatedBy: actor,
    };

    state.links.push(savedLink);
    return state;
  });

  return serializeLink(savedLink, readState().checks);
}

function updateShortLink(linkId, payload = {}, actor = {}) {
  const timestamp = nowIso();
  let savedLink = null;

  updateState((state) => {
    const existingIndex = state.links.findIndex((link) => link.id === linkId);

    if (existingIndex < 0) {
      const error = new Error("Short link not found");
      error.statusCode = 404;
      throw error;
    }

    const currentLink = state.links[existingIndex];
    const sanitized = sanitizeLinkPayload(payload, currentLink);
    const duplicateKey = getDuplicateShortUrlKey(sanitized.shortUrl);
    const duplicate = state.links.find((link) => (
      link.id !== linkId && getSafeDuplicateShortUrlKey(link.shortUrl) === duplicateKey
    ));

    if (duplicate) {
      const error = new Error("Short link already exists");
      error.statusCode = 409;
      throw error;
    }

    savedLink = {
      ...currentLink,
      ...sanitized,
      updatedAt: timestamp,
      updatedBy: actor,
    };

    state.links[existingIndex] = savedLink;
    return state;
  });

  return serializeLink(savedLink, readState().checks);
}

function splitImportLine(line) {
  const trimmedLine = String(line || "").trim();

  if (!trimmedLine) {
    return [];
  }

  if (trimmedLine.includes("\t")) {
    return trimmedLine.split("\t").map((item) => item.trim());
  }

  if (trimmedLine.includes(",")) {
    return trimmedLine.split(",").map((item) => item.trim());
  }

  return trimmedLine.split(/\s{2,}|\s+\|\s+|\s+;\s+/).map((item) => item.trim()).filter(Boolean);
}

function looksLikeLink(value) {
  return /^https?:\/\//i.test(String(value || "")) || /\.[a-z]{2,}(\/|$)/i.test(String(value || ""));
}

function parseImportText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = splitImportLine(line);
      const urlIndex = columns.findIndex((column) => looksLikeLink(column));

      if (urlIndex < 0) {
        return { rawLine: line, shortUrl: line };
      }

      if (urlIndex > 0) {
        return {
          rawLine: line,
          title: columns[0] || "",
          shortUrl: columns[urlIndex] || "",
          moneySiteDomain: columns[urlIndex + 1] || "",
          note: columns.slice(urlIndex + 2).filter(Boolean).join(" "),
        };
      }

      return {
        rawLine: line,
        shortUrl: columns[0] || "",
        moneySiteDomain: columns[1] || "",
        title: columns[2] || "",
        note: columns.slice(3).filter(Boolean).join(" "),
      };
    });
}

function importShortLinks(payload = {}, actor = {}) {
  const rows = Array.isArray(payload.items) && payload.items.length
    ? payload.items
    : parseImportText(payload.text);
  const timestamp = nowIso();
  const createdLinks = [];
  const skipped = [];

  updateState((state) => {
    const existingUrls = new Set(state.links.map((link) => getSafeDuplicateShortUrlKey(link.shortUrl)));
    const batchUrls = new Set();

    rows.forEach((row, index) => {
      try {
        const sanitized = sanitizeLinkPayload({
          ...row,
          active: row.active !== undefined ? row.active : payload.active,
        });
        const normalizedUrl = getDuplicateShortUrlKey(sanitized.shortUrl);

        if (existingUrls.has(normalizedUrl) || batchUrls.has(normalizedUrl)) {
          skipped.push({
            row: index + 1,
            shortUrl: sanitized.shortUrl,
            moneySiteDomain: sanitized.moneySiteDomain,
            brandName: sanitized.brandName,
            title: sanitized.title,
            reason: "Short link already exists",
          });
          return;
        }

        const savedLink = {
          ...sanitized,
          id: crypto.randomUUID(),
          createdAt: timestamp,
          createdBy: actor,
          updatedAt: timestamp,
          updatedBy: actor,
        };

        state.links.push(savedLink);
        createdLinks.push(savedLink);
        batchUrls.add(normalizedUrl);
      } catch (error) {
        skipped.push({
          row: index + 1,
          rawLine: row.rawLine || row.shortUrl || "",
          shortUrl: row.shortUrl || "",
          moneySiteDomain: row.moneySiteDomain || row.moneySite?.domain || "",
          title: row.title || "",
          reason: error.message || "Invalid short link",
        });
      }
    });

    return state;
  });

  return {
    createdCount: createdLinks.length,
    skippedCount: skipped.length,
    items: createdLinks.map((link) => serializeLink(link, readState().checks)),
    skipped,
  };
}

function deleteCheckFile(check = {}) {
  if (!check.screenshotFileName) {
    return;
  }

  fs.rmSync(path.join(CAPTURE_DIR, check.screenshotFileName), { force: true });
}

function assertMaintenanceAllowed(actionLabel) {
  const schedule = sanitizeSchedule(readState().schedule);

  if (checkerRuntime.running || schedulerTickRunning) {
    const error = new Error(`Stop the running short-link check before ${actionLabel}`);
    error.statusCode = 409;
    throw error;
  }

  if (schedule.enabled) {
    const error = new Error(`Stop the short-link schedule before ${actionLabel}`);
    error.statusCode = 409;
    throw error;
  }
}

function cleanupExpiredCheckImages() {
  const cutoffMs = Date.now() - getCaptureRetentionMs();
  const currentState = readState();
  const hasExpiredImages = (currentState.checks || []).some((check) => (
    check.screenshotFileName && getTimeValue(check.checkedAt) && getTimeValue(check.checkedAt) < cutoffMs
  ));

  if (!hasExpiredImages) {
    return { removedCount: 0 };
  }

  let removedCount = 0;

  updateState((state) => {
    state.checks = (state.checks || []).map((check) => {
      if (!check.screenshotFileName) {
        return check;
      }

      const checkedAtMs = getTimeValue(check.checkedAt);

      if (!checkedAtMs || checkedAtMs >= cutoffMs) {
        return check;
      }

      try {
        deleteCheckFile(check);
        removedCount += 1;
      } catch {}

      return {
        ...check,
        screenshotFileName: "",
        screenshotExpiredAt: nowIso(),
      };
    });

    state.lastImageCleanupAt = nowIso();
    state.lastImageCleanupResult = {
      removedCount,
      retentionHours: Math.round(getCaptureRetentionMs() / (60 * 60 * 1000)),
    };
    return state;
  });

  return { removedCount };
}

function clearAllCheckImages() {
  assertMaintenanceAllowed("clearing images");

  const screenshotFileNames = new Set();

  updateState((state) => {
    state.checks = (state.checks || []).map((check) => {
      if (!check.screenshotFileName) {
        return check;
      }

      screenshotFileNames.add(check.screenshotFileName);

      return {
        ...check,
        screenshotFileName: "",
        screenshotClearedAt: nowIso(),
      };
    });

    state.lastImageClearAt = nowIso();
    return state;
  });

  let removedFiles = 0;

  screenshotFileNames.forEach((fileName) => {
    const imagePath = path.join(CAPTURE_DIR, fileName);

    if (!fs.existsSync(imagePath)) {
      return;
    }

    fs.rmSync(imagePath, { force: true });
    removedFiles += 1;
  });

  if (fs.existsSync(CAPTURE_DIR)) {
    fs.readdirSync(CAPTURE_DIR, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isFile()) {
        return;
      }

      fs.rmSync(path.join(CAPTURE_DIR, entry.name), { force: true });
      removedFiles += 1;
    });
  }

  return {
    removedFiles,
    clearedChecks: screenshotFileNames.size,
  };
}

function removeShortLink(linkId) {
  let removedLink = null;
  let removedChecks = [];

  updateState((state) => {
    removedLink = state.links.find((link) => link.id === linkId) || null;

    if (!removedLink) {
      const error = new Error("Short link not found");
      error.statusCode = 404;
      throw error;
    }

    removedChecks = state.checks.filter((check) => check.linkId === linkId);
    state.links = state.links.filter((link) => link.id !== linkId);
    state.checks = state.checks.filter((check) => check.linkId !== linkId);
    return state;
  });

  removedChecks.forEach((check) => {
    try {
      deleteCheckFile(check);
    } catch {}
  });

  return removedLink;
}

function removeAllShortLinks(actor = {}) {
  assertMaintenanceAllowed("deleting all links");

  let removedLinks = 0;
  let removedChecks = [];
  const screenshotFileNames = new Set();
  const timestamp = nowIso();

  updateState((state) => {
    removedLinks = (state.links || []).length;
    removedChecks = [...(state.checks || [])];

    removedChecks.forEach((check) => {
      if (check.screenshotFileName) {
        screenshotFileNames.add(check.screenshotFileName);
      }
    });

    state.links = [];
    state.checks = [];
    state.lastLinksClearAt = timestamp;
    state.lastLinksClearBy = actor;
    return state;
  });

  let removedFiles = 0;

  screenshotFileNames.forEach((fileName) => {
    const imagePath = path.join(CAPTURE_DIR, fileName);

    if (!fs.existsSync(imagePath)) {
      return;
    }

    fs.rmSync(imagePath, { force: true });
    removedFiles += 1;
  });

  return {
    removedLinks,
    removedChecks: removedChecks.length,
    removedFiles,
  };
}

async function getExactLinkStatus(shortUrl, options = {}) {
  throwIfShortLinkStopRequested(options.signal);
  await assertSafeTarget(shortUrl);
  throwIfShortLinkStopRequested(options.signal);

  const request = createTimeoutSignal(
    getPositiveInteger(process.env.SHORT_LINK_EXACT_STATUS_TIMEOUT_MS, 30000),
    options.signal
  );

  try {
    const response = await fetch(shortUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "user-agent": SHORT_LINK_USER_AGENT,
      },
      signal: request.signal,
    });

    return {
      exactStatusCode: response.status,
      exactStatusText: response.statusText || "",
    };
  } catch (error) {
    if (isShortLinkStopRequested(options.signal)) {
      throw createShortLinkStopError();
    }

    return {
      exactStatusCode: 0,
      exactStatusText: "",
      exactStatusError: cleanCheckerErrorMessage(error, "Failed to request short link"),
    };
  } finally {
    request.cleanup();
  }
}

async function getFinalLinkStatus(shortUrl, options = {}) {
  const timeoutMs = getPositiveInteger(process.env.SHORT_LINK_FINAL_STATUS_TIMEOUT_MS, 30000);
  const maxRedirects = getPositiveInteger(process.env.SHORT_LINK_MAX_REDIRECTS, 10, {
    minimum: 1,
    maximum: 20,
  });
  let currentUrl = shortUrl;
  let finalUrl = shortUrl;
  let finalStatusCode = 0;
  let finalStatusText = "";

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      throwIfShortLinkStopRequested(options.signal);
      await assertSafeTarget(currentUrl);
      throwIfShortLinkStopRequested(options.signal);

      const request = createTimeoutSignal(timeoutMs, options.signal);
      let response;

      try {
        response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers: {
            "user-agent": SHORT_LINK_USER_AGENT,
          },
          signal: request.signal,
        });
      } finally {
        request.cleanup();
      }

      finalStatusCode = Number(response.status || 0);
      finalStatusText = response.statusText || "";
      finalUrl = currentUrl;

      const location = response.headers.get("location");

      if (!isRedirectStatus(finalStatusCode) || !location) {
        break;
      }

      if (redirectCount >= maxRedirects) {
        return {
          finalStatusCode,
          finalStatusText,
          finalUrl,
          finalStatusError: `Redirect limit reached (${maxRedirects})`,
        };
      }

      const nextUrl = new URL(location, currentUrl).toString();
      const nextProtocol = new URL(nextUrl).protocol;

      if (!nextProtocol || !["http:", "https:"].includes(nextProtocol)) {
        return {
          finalStatusCode,
          finalStatusText,
          finalUrl: nextUrl,
          finalStatusError: "Final URL protocol is not supported",
        };
      }

      currentUrl = nextUrl;
    }

    return {
      finalStatusCode,
      finalStatusText,
      finalUrl,
      finalStatusError: "",
    };
  } catch (error) {
    if (isShortLinkStopRequested(options.signal)) {
      throw createShortLinkStopError();
    }

    return {
      finalStatusCode,
      finalStatusText,
      finalUrl,
      finalStatusError: cleanCheckerErrorMessage(error, "Failed to request final URL"),
    };
  }
}

async function captureShortLinkPage(link, exactStatus, finalStatus = {}, options = {}) {
  const checkId = crypto.randomUUID();
  const screenshotFileName = `${checkId}.png`;
  const screenshotPath = path.join(CAPTURE_DIR, screenshotFileName);
  const viewportWidth = getPositiveInteger(process.env.SHORT_LINK_VIEWPORT_WIDTH, 1366);
  const viewportHeight = getPositiveInteger(process.env.SHORT_LINK_VIEWPORT_HEIGHT, 900);
  const timeout = getPositiveInteger(process.env.SHORT_LINK_NAVIGATION_TIMEOUT_MS, 45000);
  const screenshotTimeout = getPositiveInteger(process.env.SHORT_LINK_CAPTURE_TIMEOUT_MS, 30000);
  const fullPage = String(process.env.SHORT_LINK_FULL_PAGE || "true").toLowerCase() !== "false";
  const waitUntil = getNavigationWaitUntil();
  const networkIdleTimeout = getPositiveInteger(process.env.SHORT_LINK_NETWORK_IDLE_TIMEOUT_MS, 0, {
    minimum: 0,
    maximum: 30000,
  });
  const startedAt = Date.now();
  let browser;
  let context;
  const closeForStop = () => {
    if (context) {
      void context.close().catch(() => {});
    }

    if (browser) {
      void browser.close().catch(() => {});
    }
  };

  if (options.signal) {
    options.signal.addEventListener("abort", closeForStop, { once: true });
  }

  try {
    throwIfShortLinkStopRequested(options.signal);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    throwIfShortLinkStopRequested(options.signal);

    context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
      userAgent: SHORT_LINK_USER_AGENT,
    });
    throwIfShortLinkStopRequested(options.signal);

    const assertSafeRequestTarget = buildRequestGuard();

    await context.route("**/*", async (route, request) => {
      try {
        if (isShortLinkStopRequested(options.signal)) {
          await route.abort().catch(() => {});
          return;
        }

        await assertSafeRequestTarget(request.url());
        await route.continue();
      } catch {
        await route.abort().catch(() => {});
      }
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(timeout);
    page.setDefaultTimeout(timeout);

    let navigationResponse = null;
    let navigationWarning = "";
    let firstMainDocumentResponse = null;
    let latestMainDocumentResponse = null;

    page.on("response", (response) => {
      const request = response.request();

      try {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          if (!firstMainDocumentResponse) {
            firstMainDocumentResponse = response;
          }

          latestMainDocumentResponse = response;
        }
      } catch {}
    });

    try {
      throwIfShortLinkStopRequested(options.signal);
      navigationResponse = await page.goto(link.shortUrl, { waitUntil, timeout });
    } catch (error) {
      if (isShortLinkStopRequested(options.signal)) {
        throw createShortLinkStopError();
      }

      navigationWarning = cleanCheckerErrorMessage(error, "Navigation failed");

      if (!page.url() || page.url() === "about:blank") {
        throw error;
      }
    }

    throwIfShortLinkStopRequested(options.signal);
    await page.waitForSelector("body", { timeout: Math.min(timeout, 12000) }).catch(() => {});
    if (networkIdleTimeout) {
      await page.waitForLoadState("networkidle", { timeout: networkIdleTimeout }).catch(() => {});
    }
    await delay(getPositiveInteger(process.env.SHORT_LINK_RENDER_SETTLE_MS, 800, { minimum: 0 }));
    throwIfShortLinkStopRequested(options.signal);

    const verificationInspection = await inspectVerificationPage(
      page,
      latestMainDocumentResponse || navigationResponse
    );
    const title = verificationInspection.title;
    const verification = verificationInspection.verification;
    const pageUrl = page.url();
    const finalUrl = pageUrl && pageUrl !== "about:blank" ? pageUrl : finalStatus.finalUrl || link.shortUrl;
    const navigationStatusCode = Number(
      navigationResponse?.status?.() ||
      latestMainDocumentResponse?.status?.() ||
      0
    );
    const finalStatusCode = navigationStatusCode || Number(finalStatus.finalStatusCode || 0);
    const browserExactStatusCode = Number(firstMainDocumentResponse?.status?.() || 0);
    const exactStatusCode = browserExactStatusCode || Number(exactStatus.exactStatusCode || 0);
    const exactStatusText = browserExactStatusCode
      ? firstMainDocumentResponse?.statusText?.() || ""
      : exactStatus.exactStatusText || "";

    throwIfShortLinkStopRequested(options.signal);
    await page.screenshot({
      path: screenshotPath,
      fullPage,
      animations: "disabled",
      timeout: screenshotTimeout,
    });

    const exactStatusIsError = isHttpErrorStatus(exactStatusCode);
    const finalStatusIsError = isHttpErrorStatus(finalStatusCode);
    const statusIsError = exactStatusIsError || finalStatusIsError;
    const status = verification.verificationDetected
      ? verification.verificationType
      : statusIsError
        ? "error"
        : "success";
    const errorParts = [
      exactStatusIsError
        ? `Short link returned status ${exactStatusCode || "unavailable"}`
        : "",
      finalStatusIsError ? `Final page returned status ${finalStatusCode || "unavailable"}` : "",
      statusIsError ? navigationWarning : "",
    ].filter(Boolean);

    return {
      id: checkId,
      linkId: link.id,
      shortUrl: link.shortUrl,
      status,
      checkedAt: nowIso(),
      exactStatusCode,
      exactStatusText,
      finalStatusCode,
      finalUrl,
      title,
      error: status === "error" ? errorParts.join(" | ") : "",
      screenshotFileName,
      scanMode: DEFAULT_SCAN_MODE,
      durationMs: Date.now() - startedAt,
      ...verification,
    };
  } catch (error) {
    if (isShortLinkStopError(error) || isShortLinkStopRequested(options.signal)) {
      throw createShortLinkStopError();
    }

    if (fs.existsSync(screenshotPath)) {
      fs.rmSync(screenshotPath, { force: true });
    }

    return {
      id: checkId,
      linkId: link.id,
      shortUrl: link.shortUrl,
      status: "error",
      checkedAt: nowIso(),
      exactStatusCode: exactStatus.exactStatusCode,
      exactStatusText: exactStatus.exactStatusText,
      finalStatusCode: finalStatus.finalStatusCode || 0,
      finalUrl: finalStatus.finalUrl || "",
      title: "",
      error: [
        exactStatus.exactStatusError,
        finalStatus.finalStatusError,
        cleanCheckerErrorMessage(error, "Short link check failed"),
      ].filter(Boolean).join(" | "),
      screenshotFileName: "",
      scanMode: DEFAULT_SCAN_MODE,
      durationMs: Date.now() - startedAt,
      ...emptyVerificationInfo(),
    };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }

    if (browser) {
      await browser.close().catch(() => {});
    }

    if (options.signal) {
      options.signal.removeEventListener("abort", closeForStop);
    }
  }
}

function buildStatusOnlyCheck(link, exactStatus, finalStatus, startedAt) {
  const exactStatusIsError = isHttpErrorStatus(exactStatus.exactStatusCode);
  const finalStatusIsError = isErrorStatus(finalStatus.finalStatusCode);
  const statusIsError = exactStatusIsError || finalStatusIsError;
  const errorParts = [
    !exactStatus.exactStatusCode && finalStatusIsError ? exactStatus.exactStatusError || "" : "",
    finalStatus.finalStatusError || "",
    exactStatusIsError ? `Short link returned status ${exactStatus.exactStatusCode || "unavailable"}` : "",
    finalStatusIsError
      ? `Final URL returned status ${finalStatus.finalStatusCode || "unavailable"}`
      : "",
  ].filter(Boolean);

  return {
    id: crypto.randomUUID(),
    linkId: link.id,
    shortUrl: link.shortUrl,
    status: statusIsError ? "error" : "success",
    checkedAt: nowIso(),
    exactStatusCode: exactStatus.exactStatusCode,
    exactStatusText: exactStatus.exactStatusText,
    finalStatusCode: finalStatus.finalStatusCode || 0,
    finalUrl: finalStatus.finalUrl || "",
    title: "",
    error: statusIsError ? errorParts.join(" | ") : "",
    screenshotFileName: "",
    scanMode: STATUS_ONLY_SCAN_MODE,
    durationMs: Date.now() - startedAt,
  };
}

function trimCheckHistory(state) {
  const sortedChecks = [...state.checks].sort((left, right) => new Date(right.checkedAt) - new Date(left.checkedAt));
  const retainedChecks = sortedChecks.slice(0, MAX_CHECK_HISTORY);
  const removedChecks = sortedChecks.slice(MAX_CHECK_HISTORY);

  removedChecks.forEach((check) => {
    try {
      deleteCheckFile(check);
    } catch {}
  });

  state.checks = retainedChecks;
  return state;
}

function recordTelegramDelivery(checkId, result, error = null) {
  updateState((state) => {
    state.checks = state.checks.map((check) => (
      check.id === checkId
        ? {
            ...check,
            telegramSent: Boolean(result && !error),
            telegramError: error ? error.message || "Telegram send failed" : "",
          }
        : check
    ));

    state.telegram = {
      ...(state.telegram || {}),
      lastSentAt: result && !error ? nowIso() : state.telegram?.lastSentAt || null,
      lastError: error ? error.message || "Telegram send failed" : "",
      sentCount: result && !error ? Number(state.telegram?.sentCount || 0) + 1 : Number(state.telegram?.sentCount || 0),
      failedCount: error ? Number(state.telegram?.failedCount || 0) + 1 : Number(state.telegram?.failedCount || 0),
    };

    return state;
  });
}

function recordTelegramSummaryDelivery(result, error = null) {
  updateState((state) => {
    state.telegram = {
      ...(state.telegram || {}),
      lastSentAt: result && !error ? nowIso() : state.telegram?.lastSentAt || null,
      lastError: error ? error.message || "Telegram summary send failed" : "",
      sentCount: result && !error ? Number(state.telegram?.sentCount || 0) + 1 : Number(state.telegram?.sentCount || 0),
      failedCount: error ? Number(state.telegram?.failedCount || 0) + 1 : Number(state.telegram?.failedCount || 0),
    };

    return state;
  });
}

function getMatchedAlertStatusCodes(check = {}, telegram = {}) {
  const alertStatusCodes = getTelegramAlertStatusCodes(telegram);
  const allowUnavailableStatus =
    check.status === "error" ||
    check.status === STATUS_CLOUDFLARE ||
    check.status === STATUS_SECURITY_VERIFICATION;
  const checkStatusCodes = [
    check.exactStatusCode,
    check.finalStatusCode,
  ]
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 599)
    .filter((item) => item !== 0 || allowUnavailableStatus);
  const alertStatusSet = new Set(alertStatusCodes);

  return [...new Set(checkStatusCodes.filter((statusCode) => alertStatusSet.has(statusCode)))];
}

function getStatusCodeTelegramNotificationInfo(check = {}, telegram = {}) {
  const matchedStatusCodes = getMatchedAlertStatusCodes(check, telegram);

  if (!matchedStatusCodes.length) {
    return null;
  }

  const isVerificationStatus =
    check.status === STATUS_CLOUDFLARE ||
    check.status === STATUS_SECURITY_VERIFICATION;

  return {
    reason: `Matched status code: ${matchedStatusCodes.join(", ")}`,
    includeScreenshot: true,
    sendAsStatusCode: isVerificationStatus,
  };
}

function getTelegramNotificationInfo(check = {}, telegram = {}) {
  if (check.status === STATUS_CLOUDFLARE) {
    if (telegram.notifyCloudflareVerification) {
      return {
        reason: "Cloudflare verification",
        includeScreenshot: true,
        sendAsStatusCode: false,
      };
    }

    return getStatusCodeTelegramNotificationInfo(check, telegram);
  }

  if (check.status === STATUS_SECURITY_VERIFICATION) {
    if (telegram.notifySecurityVerification) {
      return {
        reason: "Security verification",
        includeScreenshot: true,
        sendAsStatusCode: false,
      };
    }

    return getStatusCodeTelegramNotificationInfo(check, telegram);
  }

  return getStatusCodeTelegramNotificationInfo(check, telegram);
}

function getTelegramNotificationReason(check = {}, telegram = {}) {
  return getTelegramNotificationInfo(check, telegram)?.reason || "";
}

function shouldNotifyTelegram(check = {}, telegram = {}) {
  return Boolean(
    telegram.enabled &&
    telegram.botToken &&
    telegram.chatId &&
    getTelegramNotificationReason(check, telegram)
  );
}

function getTelegramNotificationItems(items = [], telegram = {}) {
  if (!telegram.enabled || !telegram.botToken || !telegram.chatId) {
    return [];
  }

  return (Array.isArray(items) ? items : [])
    .map((check) => {
      const notificationInfo = getTelegramNotificationInfo(check, telegram);

      return {
        ...check,
        telegramNotifyReason: notificationInfo?.reason || "",
        telegramNotifyAsStatusCode: Boolean(notificationInfo?.sendAsStatusCode),
      };
    })
    .filter((check) => check.telegramNotifyReason);
}

async function checkShortLink(linkId, options = {}) {
  const state = readState();
  const link = state.links.find((item) => item.id === linkId);
  const scanMode = normalizeScanMode(options.scanMode);
  const suppressTelegram = Boolean(options.suppressTelegram);
  const backgroundTelegram = Boolean(options.backgroundTelegram);
  const signal = options.signal || null;
  const startedAt = Date.now();

  if (!link) {
    const error = new Error("Short link not found");
    error.statusCode = 404;
    throw error;
  }

  throwIfShortLinkStopRequested(signal);
  cleanupExpiredCheckImages();

  const exactStatus = await getExactLinkStatus(link.shortUrl, { signal });
  throwIfShortLinkStopRequested(signal);
  const finalStatus = await getFinalLinkStatus(link.shortUrl, { signal });
  throwIfShortLinkStopRequested(signal);
  const capturedCheck = scanMode === STATUS_ONLY_SCAN_MODE
    ? buildStatusOnlyCheck(link, exactStatus, finalStatus, startedAt)
    : await captureShortLinkPage(link, exactStatus, finalStatus, { signal });
  throwIfShortLinkStopRequested(signal);
  let check = capturedCheck;

  updateState((nextState) => {
    const matchedAlertCodes = getMatchedAlertStatusCodes(capturedCheck, nextState.telegram);
    const customStatusError = matchedAlertCodes.length
      ? `Matched status code: ${matchedAlertCodes.join(", ")}`
      : "";
    const hasCapturedError = capturedCheck.status === "error";
    const hasVerification = capturedCheck.status === STATUS_CLOUDFLARE ||
      capturedCheck.status === STATUS_SECURITY_VERIFICATION;
    const status = hasVerification
      ? capturedCheck.status
      : hasCapturedError || matchedAlertCodes.length
        ? "error"
        : "success";

    check = {
      ...capturedCheck,
      status,
      error: status === "error"
        ? [capturedCheck.error, customStatusError].filter(Boolean).join(" | ")
        : "",
      telegramAlertMatched: matchedAlertCodes,
    };
    nextState.checks = [check, ...nextState.checks];
    nextState.links = nextState.links.map((item) => (
      item.id === link.id
        ? {
            ...item,
            lastCheckedAt: check.checkedAt,
            lastStatus: check.status,
            lastError: check.error || "",
            updatedAt: item.updatedAt || check.checkedAt,
          }
        : item
    ));
    trimCheckHistory(nextState);
    return nextState;
  });

  if (!isShortLinkStopRequested(signal) && !suppressTelegram && shouldNotifyTelegram(check, readState().telegram)) {
    const sendTelegram = () => queueTelegramSend(async () => {
      const latestState = readState();
      const notificationInfo = getTelegramNotificationInfo(check, latestState.telegram);

      if (!notificationInfo?.reason) {
        return;
      }

      const checkForTelegram = {
        ...check,
        telegramNotifyReason: notificationInfo.reason,
        telegramNotifyAsStatusCode: Boolean(notificationInfo.sendAsStatusCode),
        telegramMessageNumber: getNextTelegramMessageNumber(),
      };
      const result = await notifyShortLinkError({
        telegram: latestState.telegram,
        link,
        check: checkForTelegram,
        imagePath: notificationInfo.includeScreenshot && check.screenshotFileName
          ? path.join(CAPTURE_DIR, check.screenshotFileName)
          : "",
      });

      if (result) {
        recordTelegramDelivery(check.id, result);
      }
    });

    if (backgroundTelegram) {
      void sendTelegram().catch((error) => {
        recordTelegramDelivery(check.id, null, error);
      });
    } else {
      try {
        await sendTelegram();
      } catch (error) {
        recordTelegramDelivery(check.id, null, error);
      }
    }
  }

  return serializeCheck(readState().checks.find((item) => item.id === check.id) || check);
}

async function checkAllShortLinks(options = {}) {
  if (checkerRuntime.running) {
    const error = new Error("Short link batch check is already running");
    error.statusCode = 409;
    throw error;
  }

  await waitForTelegramSendQueue();
  resetTelegramMessageSequence();

  if (options.source === "schedule" && !getScheduleSettings().enabled) {
    return {
      totalCount: 0,
      successCount: 0,
      errorCount: 0,
      stoppedCount: 0,
      items: [],
    };
  }

  const links = readState().links.filter((link) => link.active !== false);
  const results = new Array(links.length);
  const scanMode = normalizeScanMode(options.scanMode);
  const suppressPerLinkTelegram = options.suppressPerLinkTelegram !== undefined
    ? Boolean(options.suppressPerLinkTelegram)
    : false;
  const concurrency = getPositiveInteger(options.parallelChecks || process.env.SHORT_LINK_CHECK_ALL_CONCURRENCY, 2, {
    minimum: 1,
    maximum: Math.min(5, Math.max(1, links.length)),
  });
  const batch = {
    id: crypto.randomUUID(),
    source: options.source || "manual",
    scanMode,
    status: "running",
    totalCount: links.length,
    completedCount: 0,
    successCount: 0,
    errorCount: 0,
    stoppedCount: 0,
    activeItems: [],
    latestCompleted: null,
    startedAt: nowIso(),
    finishedAt: null,
    stopRequestedAt: null,
  };
  const activeItems = new Map();
  let nextIndex = 0;

  checkerRuntime.running = true;
  checkerRuntime.stopRequested = false;
  checkerRuntime.activeAbortControllers.clear();
  checkerRuntime.currentBatch = batch;

  async function worker() {
    while (nextIndex < links.length && !checkerRuntime.stopRequested) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const currentLink = links[currentIndex];
      const abortController = new AbortController();
      const activeItem = {
        index: currentIndex + 1,
        linkId: currentLink.id,
        shortUrl: currentLink.shortUrl,
        title: currentLink.title || "",
        startedAt: nowIso(),
      };

      activeItems.set(currentLink.id, activeItem);
      checkerRuntime.activeAbortControllers.set(currentLink.id, abortController);
      batch.activeItems = [...activeItems.values()];
      checkerRuntime.currentBatch = { ...batch };

      try {
        results[currentIndex] = await checkShortLink(currentLink.id, {
          scanMode,
          suppressTelegram: suppressPerLinkTelegram,
          backgroundTelegram: !suppressPerLinkTelegram,
          signal: abortController.signal,
        });
      } catch (error) {
        if (isShortLinkStopError(error) || checkerRuntime.stopRequested) {
          results[currentIndex] = null;
        } else {
          results[currentIndex] = {
            id: crypto.randomUUID(),
            linkId: currentLink.id,
            shortUrl: currentLink.shortUrl,
            status: "error",
            checkedAt: nowIso(),
            exactStatusCode: 0,
            exactStatusText: "",
            finalStatusCode: 0,
            finalUrl: "",
            title: "",
            error: error.message || "Short link check failed",
            durationMs: 0,
            screenshotEndpoint: "",
            telegramSent: false,
            telegramError: "",
            telegramAlertMatched: [],
            scanMode,
          };
        }
      }

      if (checkerRuntime.stopRequested) {
        markBatchStopping(batch);
      }

      checkerRuntime.activeAbortControllers.delete(currentLink.id);
      activeItems.delete(currentLink.id);
      batch.activeItems = [...activeItems.values()];

      if (!results[currentIndex]) {
        batch.stoppedCount = links.length - results.filter(Boolean).length;
        checkerRuntime.currentBatch = { ...batch };
        continue;
      }

      batch.completedCount += 1;
      batch.successCount += results[currentIndex]?.status === "success" ? 1 : 0;
      batch.errorCount += results[currentIndex]?.status === "error" ? 1 : 0;
      batch.latestCompleted = {
        linkId: results[currentIndex]?.linkId || currentLink.id,
        shortUrl: results[currentIndex]?.shortUrl || currentLink.shortUrl,
        status: results[currentIndex]?.status || "error",
        exactStatusCode: Number(results[currentIndex]?.exactStatusCode || 0),
        finalStatusCode: Number(results[currentIndex]?.finalStatusCode || 0),
        checkedAt: results[currentIndex]?.checkedAt || nowIso(),
      };
      checkerRuntime.currentBatch = { ...batch };
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    batch.status = checkerRuntime.stopRequested || batch.status === "stopping" ? "stopped" : "completed";
  } catch (error) {
    batch.status = "failed";
    batch.error = error.message || "Short link batch check failed";
    throw error;
  } finally {
    const completedResults = results.filter(Boolean);
    batch.stoppedCount = batch.status === "stopped"
      ? Math.max(Number(batch.stoppedCount || 0), links.length - completedResults.length)
      : Number(batch.stoppedCount || 0);
    batch.finishedAt = nowIso();
    batch.activeItems = [];
    checkerRuntime.running = false;
    checkerRuntime.stopRequested = false;
    checkerRuntime.activeAbortControllers.clear();
    checkerRuntime.currentBatch = { ...batch };
  }

  const completedResults = results.filter(Boolean);

  if (batch.status !== "stopped") {
    try {
      const latestState = readState();
      const telegramItems = getTelegramNotificationItems(completedResults, latestState.telegram);

      const result = telegramItems.length
        ? await queueTelegramSend(async () => {
            const telegramBatch = {
              ...batch,
              telegramMessageNumber: getNextTelegramMessageNumber(),
            };

            return notifyShortLinkBatchSummary({
              telegram: latestState.telegram,
              batch: telegramBatch,
              items: telegramItems,
            });
          })
        : null;

      if (result) {
        recordTelegramSummaryDelivery(result);
      }
    } catch (error) {
      recordTelegramSummaryDelivery(null, error);
    }
  }

  await waitForTelegramSendQueue();

  return {
    totalCount: links.length,
    successCount: completedResults.filter((check) => check.status === "success").length,
    errorCount: completedResults.filter((check) => check.status === "error").length,
    stoppedCount: Number(batch.stoppedCount || 0),
    items: completedResults,
  };
}

function getScheduleSettings() {
  return sanitizeSchedule(readState().schedule);
}

function updateScheduleSettings(payload = {}) {
  let savedSchedule = null;

  updateState((state) => {
    const currentSchedule = sanitizeSchedule(state.schedule);
    const delayMinutes = getPositiveInteger(payload.delayMinutes ?? currentSchedule.delayMinutes, 60, {
      minimum: 1,
      maximum: 1440,
    });
    const parallelChecks = getPositiveInteger(payload.parallelChecks ?? currentSchedule.parallelChecks, 2, {
      minimum: 1,
      maximum: 5,
    });
    const scanMode = normalizeScanMode(payload.scanMode ?? currentSchedule.scanMode);
    const enabled = payload.enabled !== undefined ? Boolean(payload.enabled) : currentSchedule.enabled;
    const delayChanged = delayMinutes !== currentSchedule.delayMinutes;
    const shouldResetNextRun = enabled && (!currentSchedule.enabled || delayChanged || !currentSchedule.nextRunAt);

    state.schedule = {
      ...currentSchedule,
      enabled,
      delayMinutes,
      parallelChecks,
      scanMode,
      nextRunAt: enabled
        ? shouldResetNextRun
          ? addMinutes(new Date(), delayMinutes).toISOString()
          : currentSchedule.nextRunAt
        : null,
      updatedAt: nowIso(),
    };
    savedSchedule = state.schedule;
    return state;
  });

  if (!savedSchedule?.enabled) {
    requestStopCurrentScheduleBatch();
  }

  return sanitizeSchedule(savedSchedule);
}

function setScheduleEnabled(enabled, payload = {}) {
  let savedSchedule = null;

  updateState((state) => {
    const currentSchedule = sanitizeSchedule(state.schedule);
    const delayMinutes = getPositiveInteger(payload.delayMinutes ?? currentSchedule.delayMinutes, 60, {
      minimum: 1,
      maximum: 1440,
    });
    const parallelChecks = getPositiveInteger(payload.parallelChecks ?? currentSchedule.parallelChecks, 2, {
      minimum: 1,
      maximum: 5,
    });
    state.schedule = {
      ...currentSchedule,
      delayMinutes,
      parallelChecks,
      scanMode: normalizeScanMode(payload.scanMode ?? currentSchedule.scanMode),
      enabled: Boolean(enabled),
      nextRunAt: enabled ? nowIso() : null,
      updatedAt: nowIso(),
      lastError: enabled ? "" : currentSchedule.lastError,
    };
    savedSchedule = state.schedule;
    return state;
  });

  if (!enabled) {
    requestStopCurrentScheduleBatch();
  }

  return sanitizeSchedule(savedSchedule);
}

function updateScheduleAfterRun({ startedAt, finishedAt, error = null } = {}) {
  updateState((state) => {
    const currentSchedule = sanitizeSchedule(state.schedule);
    state.schedule = {
      ...currentSchedule,
      lastStartedAt: startedAt || currentSchedule.lastStartedAt,
      lastFinishedAt: finishedAt || nowIso(),
      lastError: error ? error.message || "Scheduled short-link check failed" : "",
      nextRunAt: currentSchedule.enabled
        ? addMinutes(new Date(finishedAt || Date.now()), currentSchedule.delayMinutes).toISOString()
        : null,
    };
    return state;
  });
}

function isScheduleDue(schedule = {}) {
  if (!schedule.enabled) {
    return false;
  }

  if (!schedule.nextRunAt) {
    return true;
  }

  const nextRunAt = new Date(schedule.nextRunAt);

  if (Number.isNaN(nextRunAt.getTime())) {
    return true;
  }

  return nextRunAt.getTime() <= Date.now();
}

async function runScheduleTick() {
  if (schedulerTickRunning || checkerRuntime.running) {
    return;
  }

  const schedule = getScheduleSettings();

  if (!isScheduleDue(schedule)) {
    return;
  }

  schedulerTickRunning = true;
  const startedAt = nowIso();

  updateState((state) => {
    state.schedule = {
      ...sanitizeSchedule(state.schedule),
      lastStartedAt: startedAt,
      lastError: "",
    };
    return state;
  });

  try {
    await checkAllShortLinks({
      source: "schedule",
      parallelChecks: schedule.parallelChecks,
      scanMode: schedule.scanMode,
    });
    updateScheduleAfterRun({ startedAt, finishedAt: nowIso() });
  } catch (error) {
    updateScheduleAfterRun({ startedAt, finishedAt: nowIso(), error });
  } finally {
    schedulerTickRunning = false;
  }
}

function startShortLinkScheduleRunner() {
  if (schedulerTimer) {
    return schedulerTimer;
  }

  schedulerTimer = setInterval(() => {
    cleanupExpiredCheckImages();
    void runScheduleTick();
  }, getPositiveInteger(process.env.SHORT_LINK_SCHEDULER_TICK_MS, 10000, { minimum: 1000 }));
  cleanupExpiredCheckImages();
  void runScheduleTick();

  return schedulerTimer;
}

function getCheckImagePath(checkId) {
  const check = readState().checks.find((item) => item.id === checkId);

  if (!check?.screenshotFileName) {
    const error = new Error("Short link screenshot not found");
    error.statusCode = 404;
    throw error;
  }

  const imagePath = path.join(CAPTURE_DIR, check.screenshotFileName);

  if (!fs.existsSync(imagePath)) {
    const error = new Error("Short link screenshot file no longer exists");
    error.statusCode = 404;
    throw error;
  }

  return imagePath;
}

function getTelegramSettings() {
  return sanitizeTelegram(readState().telegram);
}

function updateTelegramSettings(payload = {}) {
  const currentTelegram = readState().telegram || {};
  const incomingBotToken = normalizeText(payload.botToken);
  const enabled = Boolean(payload.enabled);
  const chatId = normalizeText(payload.chatId ?? currentTelegram.chatId);
  const botToken = payload.clearBotToken
    ? ""
    : incomingBotToken || String(currentTelegram.botToken || "").trim();
  const currentAlertStatusCodes = Array.isArray(currentTelegram.alertStatusCodes)
    ? currentTelegram.alertStatusCodes
    : DEFAULT_ALERT_STATUS_CODES;
  const alertStatusCodes = normalizeStatusCodes(payload.alertStatusCodes ?? currentAlertStatusCodes, []);
  const selectedStatusSet = new Set(alertStatusCodes);
  const currentCustomAlertStatusCodes = normalizeCustomAlertStatusCodes(currentTelegram.customAlertStatusCodes);
  const customAlertStatusCodes = normalizeCustomAlertStatusCodes(
    payload.customAlertStatusCodes ?? currentCustomAlertStatusCodes
  ).filter((item) => selectedStatusSet.has(item.code));

  if (enabled && (!chatId || !botToken)) {
    const error = new Error("Telegram bot token and chat/group ID are required when alerts are enabled");
    error.statusCode = 400;
    throw error;
  }

  if (enabled && !alertStatusCodes.length) {
    const error = new Error("Select at least one HTTP status code for Telegram alerts");
    error.statusCode = 400;
    throw error;
  }

  let savedTelegram = null;

  updateState((state) => {
    state.telegram = {
      ...(state.telegram || {}),
      enabled,
      chatId,
      botToken,
      updatedAt: nowIso(),
      lastError: "",
      lastSentAt: state.telegram?.lastSentAt || null,
      sentCount: Number(state.telegram?.sentCount || 0),
      failedCount: Number(state.telegram?.failedCount || 0),
      alertStatusCodes,
      customAlertStatusCodes,
      notifyCloudflareVerification: payload.notifyCloudflareVerification !== undefined
        ? Boolean(payload.notifyCloudflareVerification)
        : Boolean(currentTelegram.notifyCloudflareVerification),
      notifySecurityVerification: payload.notifySecurityVerification !== undefined
        ? Boolean(payload.notifySecurityVerification)
        : Boolean(currentTelegram.notifySecurityVerification),
    };
    savedTelegram = state.telegram;
    return state;
  });

  return sanitizeTelegram(savedTelegram);
}

function getActorFromHeaders(headers = {}) {
  return {
    id: String(headers["x-short-link-proxy-user-id"] || ""),
    name: String(headers["x-short-link-proxy-user-name"] || "User"),
    email: String(headers["x-short-link-proxy-user-email"] || ""),
  };
}

module.exports = {
  clearAllCheckImages,
  checkAllShortLinks,
  checkShortLink,
  createShortLink,
  getActorFromHeaders,
  getCheckImagePath,
  getCheckerStatus,
  getScheduleSettings,
  getTelegramSettings,
  importShortLinks,
  listShortLinks,
  removeAllShortLinks,
  removeShortLink,
  setScheduleEnabled,
  startShortLinkScheduleRunner,
  updateScheduleSettings,
  updateShortLink,
  updateTelegramSettings,
};
