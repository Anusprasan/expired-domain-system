const crypto = require("crypto");
const dns = require("dns").promises;
const fs = require("fs");
const net = require("net");
const path = require("path");
const { chromium } = require("playwright");
const { SCREENSHOT_DIR, readState, updateState } = require("./screenshotTaker.storage");

const MAX_CAPTURE_HISTORY = 500;
const CAPTURE_ABORT_CODE = "CAPTURE_ABORTED";
const DEFAULT_IMAGE_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
const RETAINED_SCAN_BATCH_COUNT = 2;

function nowIso() {
  return new Date().toISOString();
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createCaptureAbortError(message = "Screenshot capture stopped") {
  const error = new Error(message);
  error.code = CAPTURE_ABORT_CODE;
  return error;
}

function isCaptureAbortError(error) {
  return error?.code === CAPTURE_ABORT_CODE;
}

function assertNotAborted(signal) {
  if (signal?.aborted) {
    throw createCaptureAbortError();
  }
}

function formatCaptureError(error) {
  const message = error?.message || "Failed to capture screenshot";
  const lowerMessage = message.toLowerCase();

  if (
    message.includes("Executable doesn't exist") ||
    message.includes("Please run the following command") ||
    message.includes("playwright install")
  ) {
    return "Playwright Chromium is not installed. Run `npx playwright install chromium` inside screenshot-taker-service.";
  }

  if (lowerMessage.includes("timeout")) {
    return "The website took too long to load. Please retry or increase SCREENSHOT_NAVIGATION_TIMEOUT_MS.";
  }

  if (message.includes("net::ERR_NAME_NOT_RESOLVED")) {
    return "DNS lookup failed for this website.";
  }

  if (message.includes("net::ERR_CONNECTION_REFUSED")) {
    return "The website refused the connection.";
  }

  if (message.includes("net::ERR_CONNECTION_TIMED_OUT")) {
    return "The website connection timed out.";
  }

  if (message.includes("net::ERR_TOO_MANY_REDIRECTS")) {
    return "The website redirected too many times.";
  }

  if (message.includes("Target page, context or browser has been closed")) {
    return "The browser session closed before the screenshot finished.";
  }

  return message;
}

function cleanCaptureErrorPart(value) {
  let text = String(value || "").trim();

  if (!text) {
    return "";
  }

  let previousText = "";

  while (text && text !== previousText) {
    previousText = text;
    text = text
      .replace(/^HTTP fallback failed:\s*/i, "")
      .replace(/^DOM fallback failed:\s*/i, "")
      .replace(/^Navigation failed:\s*/i, "")
      .trim();
  }

  return text.replace(/\s+/g, " ");
}

function combineCaptureErrors(primaryError, fallbackError) {
  const uniqueMessages = [];

  [primaryError, fallbackError]
    .flatMap((message) => String(message || "").split("|"))
    .map(cleanCaptureErrorPart)
    .filter(Boolean)
    .forEach((message) => {
      if (!uniqueMessages.includes(message)) {
        uniqueMessages.push(message);
      }
    });

  if (!uniqueMessages.length) {
    return "Screenshot capture failed";
  }

  if (uniqueMessages.length === 1) {
    return uniqueMessages[0];
  }

  return `${uniqueMessages[0]} | HTTP fallback: ${uniqueMessages.slice(1).join(" | ")}`;
}

async function navigateToLoadedPage(page, targetUrl, timeout) {
  try {
    const response = await page.goto(targetUrl, { waitUntil: "load", timeout });
    return { response, warning: "" };
  } catch (loadError) {
    const currentUrl = page.url();

    if (currentUrl && currentUrl !== "about:blank") {
      return { response: null, warning: formatCaptureError(loadError) };
    }

    try {
      const response = await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: Math.max(15000, Math.floor(timeout / 2)),
      });

      return { response, warning: formatCaptureError(loadError) };
    } catch (fallbackError) {
      throw new Error(
        `Navigation failed: ${formatCaptureError(loadError)} | DOM fallback failed: ${formatCaptureError(fallbackError)}`
      );
    }
  }
}

async function waitForFontsAndImages(page, timeoutMs) {
  await page
    .evaluate(async (imageWaitMs) => {
      const wait = (ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        });

      const fontReady = document.fonts?.ready?.catch(() => undefined) || Promise.resolve();
      const imageReady = Array.from(document.images || [])
        .filter((image) => !image.complete)
        .slice(0, 80)
        .map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            })
        );

      await Promise.race([Promise.all([fontReady, Promise.all(imageReady)]), wait(imageWaitMs)]);
    }, timeoutMs)
    .catch(() => {});
}

async function waitForPageReady(page, signal, options = {}) {
  const timeout = Number(options.timeout || 45000);
  const networkIdleTimeout = Number(options.networkIdleTimeout || 5000);
  const readyTimeout = Math.min(12000, timeout);
  const renderSettleMs = Number(process.env.SCREENSHOT_RENDER_SETTLE_MS || 1200);

  assertNotAborted(signal);
  await page.waitForSelector("body", { timeout: readyTimeout }).catch(() => {});
  assertNotAborted(signal);
  await page.waitForLoadState("load", { timeout: readyTimeout }).catch(() => {});
  assertNotAborted(signal);
  await page.waitForLoadState("networkidle", { timeout: networkIdleTimeout }).catch(() => {});
  assertNotAborted(signal);
  await page
    .waitForFunction(() => document.readyState === "complete", undefined, { timeout: readyTimeout })
    .catch(() => {});
  assertNotAborted(signal);
  await waitForFontsAndImages(page, readyTimeout);
  assertNotAborted(signal);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await delay(renderSettleMs);
  assertNotAborted(signal);
}

function normalizeUrl(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    throw new Error("Website URL is required");
  }

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
  const parsedUrl = new URL(withProtocol);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS websites can be captured");
  }

  assertAllowedHostname(parsedUrl.hostname);

  return parsedUrl.toString();
}

function getDomainFromUrl(url) {
  return new URL(url).hostname.replace(/^www\./i, "");
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
    throw new Error("Localhost websites cannot be captured");
  }

  if (net.isIP(normalizedHostname) && isPrivateIpAddress(normalizedHostname)) {
    throw new Error("Private network websites cannot be captured");
  }
}

async function assertSafeTarget(url) {
  const parsedUrl = new URL(url);
  assertAllowedHostname(parsedUrl.hostname);

  const resolvedAddresses = await dns.lookup(parsedUrl.hostname, { all: true }).catch(() => []);

  if (resolvedAddresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error("Private network websites cannot be captured");
  }
}

function getActorFromHeaders(headers = {}) {
  return {
    id: String(headers["x-screenshot-proxy-user-id"] || ""),
    name: String(headers["x-screenshot-proxy-user-name"] || "User"),
    email: String(headers["x-screenshot-proxy-user-email"] || ""),
  };
}

function getLatestCaptureForSite(captures, siteId) {
  return captures
    .filter((capture) => capture.siteId === siteId)
    .sort((left, right) => new Date(right.capturedAt) - new Date(left.capturedAt))[0] || null;
}

function serializeCapture(capture) {
  if (!capture) {
    return null;
  }

  return {
    id: capture.id,
    siteId: capture.siteId,
    status: capture.status,
    capturedAt: capture.capturedAt,
    finalUrl: capture.finalUrl || "",
    title: capture.title || "",
    error: capture.error || "",
    loadWarning: capture.loadWarning || "",
    httpStatus: capture.httpStatus || 0,
    durationMs: capture.durationMs || 0,
    size: capture.size || 0,
    previewAvailable: Boolean(capture.previewFileName),
    previewSize: capture.previewSize || 0,
    source: capture.source || "",
    batchId: capture.batchId || "",
    imageEndpoint: capture.status === "success" ? `/captures/${capture.id}/image` : "",
  };
}

function getFrontendPreviewQuality() {
  const configuredQuality = Number(process.env.SCREENSHOT_FRONTEND_PREVIEW_QUALITY || 18);

  if (!Number.isFinite(configuredQuality)) {
    return 18;
  }

  return Math.min(60, Math.max(1, Math.floor(configuredQuality)));
}

async function launchScreenshotBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

function shouldCreateFullPageFrontendPreview() {
  return String(process.env.SCREENSHOT_FRONTEND_PREVIEW_FULL_PAGE || "false").toLowerCase() === "true";
}

function shouldCaptureOriginalFullPage() {
  const configuredValue = process.env.SCREENSHOT_ORIGINAL_FULL_PAGE ?? "true";
  return String(configuredValue).toLowerCase() !== "false";
}

function shouldCreateTopHalfTelegramImage() {
  return String(process.env.SCREENSHOT_TELEGRAM_TOP_HALF_ENABLED || "false").toLowerCase() === "true";
}

function getTelegramTopHalfRatio() {
  const configuredRatio = Number(process.env.SCREENSHOT_TELEGRAM_TOP_HALF_RATIO || 0.5);

  if (!Number.isFinite(configuredRatio)) {
    return 0.5;
  }

  return Math.min(1, Math.max(0.1, configuredRatio));
}

function getTelegramTopHalfMinHeight() {
  const configuredHeight = Number(process.env.SCREENSHOT_TELEGRAM_TOP_HALF_MIN_HEIGHT || 320);

  if (!Number.isFinite(configuredHeight)) {
    return 320;
  }

  return Math.max(80, Math.floor(configuredHeight));
}

function serializeSite(site, captures = []) {
  const latestCapture = getLatestCaptureForSite(captures, site.id);

  return {
    ...site,
    latestCapture: serializeCapture(latestCapture),
  };
}

function listAssignedSites() {
  const state = readState();

  return state.sites
    .map((site) => serializeSite(site, state.captures))
    .sort((left, right) => {
      const leftTime = new Date(left.assignedAt || left.updatedAt || 0).getTime();
      const rightTime = new Date(right.assignedAt || right.updatedAt || 0).getTime();

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return String(left.domain || "").localeCompare(String(right.domain || ""));
    });
}

function upsertAssignedSite(payload = {}, actor = {}) {
  const url = normalizeUrl(payload.url || payload.domain);
  const domain = String(payload.domain || getDomainFromUrl(url)).trim() || getDomainFromUrl(url);
  const moneySiteId = String(payload.moneySiteId || "").trim();
  const timestamp = nowIso();
  let savedSite = null;

  updateState((state) => {
    const existingIndex = state.sites.findIndex((site) => (
      (moneySiteId && site.moneySiteId === moneySiteId) ||
      site.domain.toLowerCase() === domain.toLowerCase() ||
      site.url.toLowerCase() === url.toLowerCase()
    ));
    const existingSite = existingIndex >= 0 ? state.sites[existingIndex] : null;
    const nextSite = {
      ...(existingSite || {}),
      id: existingSite?.id || crypto.randomUUID(),
      moneySiteId,
      domain,
      url,
      brandName: String(payload.brandName || "").trim(),
      note: String(payload.note || "").trim(),
      active: payload.active !== false,
      assignedAt: existingSite?.assignedAt || timestamp,
      assignedBy: existingSite?.assignedBy || actor,
      updatedAt: timestamp,
      updatedBy: actor,
    };

    if (existingIndex >= 0) {
      state.sites[existingIndex] = nextSite;
    } else {
      state.sites.push(nextSite);
    }

    savedSite = nextSite;
    return state;
  });

  return serializeSite(savedSite, readState().captures);
}

function removeAssignedSite(siteId) {
  let removedSite = null;

  updateState((state) => {
    removedSite = state.sites.find((site) => site.id === siteId) || null;
    state.sites = state.sites.filter((site) => site.id !== siteId);
    return state;
  });

  if (!removedSite) {
    const error = new Error("Screenshot site not found");
    error.statusCode = 404;
    throw error;
  }

  return removedSite;
}

function clearCaptureImages() {
  let removedCaptureCount = 0;
  let clearedSiteCount = 0;
  let removedFileCount = 0;
  let removedBytes = 0;
  let failedFileCount = 0;

  updateState((state) => {
    removedCaptureCount = state.captures.length;
    clearedSiteCount = state.sites.filter((site) => (
      site.lastCaptureAt || site.lastCaptureStatus || site.lastCaptureError
    )).length;

    state.captures = [];
    state.sites = state.sites.map((site) => ({
      ...site,
      lastCaptureAt: null,
      lastCaptureStatus: "",
      lastCaptureError: "",
    }));

    return state;
  });

  if (fs.existsSync(SCREENSHOT_DIR)) {
    fs.readdirSync(SCREENSHOT_DIR).forEach((fileName) => {
      try {
        const filePath = path.join(SCREENSHOT_DIR, fileName);
        const stats = fs.statSync(filePath, { throwIfNoEntry: false });

        if (!stats?.isFile()) {
          return;
        }

        removedBytes += stats.size;
        fs.rmSync(filePath, { force: true });
        removedFileCount += 1;
      } catch {
        failedFileCount += 1;
      }
    });
  }

  const afterBytes = listScreenshotImageFiles().reduce((sum, file) => sum + file.size, 0);
  const maxBytes = getImageStorageLimitBytes(readState().storage);
  const cleanupResult = {
    reason: "manual-clear",
    triggered: true,
    maxBytes,
    beforeBytes: removedBytes + afterBytes,
    afterBytes,
    removedCaptureCount,
    removedFileCount,
    removedBytes,
    failedFileCount,
    retainedScanBatchCount: 0,
    retainedScanCaptureCount: 0,
    isOverLimitAfter: afterBytes > maxBytes,
    cleanedAt: nowIso(),
  };

  updateState((state) => {
    state.storage = {
      ...(state.storage || {}),
      imageLimitBytes: maxBytes,
      lastCleanupAt: cleanupResult.cleanedAt,
      lastCleanupResult: cleanupResult,
    };
    return state;
  });

  return {
    removedCaptureCount,
    removedFileCount,
    removedBytes,
    failedFileCount,
    clearedSiteCount,
  };
}

function getImageStorageLimitBytes(storage = {}) {
  const configuredLimit = Number(
    process.env.SCREENSHOT_IMAGE_STORAGE_LIMIT_BYTES || storage.imageLimitBytes || DEFAULT_IMAGE_STORAGE_LIMIT_BYTES
  );

  if (!Number.isFinite(configuredLimit) || configuredLimit < 1) {
    return DEFAULT_IMAGE_STORAGE_LIMIT_BYTES;
  }

  return Math.floor(configuredLimit);
}

function getCaptureFileNames(capture = {}) {
  return [...new Set([capture.fileName, capture.previewFileName, capture.telegramFileName].filter(Boolean).map(String))];
}

function getCaptureTimeMs(capture = {}) {
  const capturedAtMs = new Date(capture.capturedAt || 0).getTime();
  return Number.isNaN(capturedAtMs) ? 0 : capturedAtMs;
}

function listScreenshotImageFiles() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    return [];
  }

  return fs.readdirSync(SCREENSHOT_DIR).flatMap((fileName) => {
    try {
      const filePath = path.join(SCREENSHOT_DIR, fileName);
      const stats = fs.statSync(filePath, { throwIfNoEntry: false });

      if (!stats?.isFile()) {
        return [];
      }

      return [{
        fileName,
        path: filePath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      }];
    } catch {
      return [];
    }
  });
}

function getRetainedScanBatchIds(captures = []) {
  const batchMap = new Map();

  captures.forEach((capture) => {
    const batchId = String(capture.batchId || "");

    if (capture.source !== "schedule" || !batchId || capture.status !== "success") {
      return;
    }

    const latestCaptureMs = getCaptureTimeMs(capture);
    const currentBatch = batchMap.get(batchId);

    if (!currentBatch || latestCaptureMs > currentBatch.latestCaptureMs) {
      batchMap.set(batchId, {
        batchId,
        latestCaptureMs,
      });
    }
  });

  return Array.from(batchMap.values())
    .sort((left, right) => right.latestCaptureMs - left.latestCaptureMs)
    .slice(0, RETAINED_SCAN_BATCH_COUNT)
    .map((batch) => batch.batchId);
}

function getLatestAssignedCaptureIds(captures = [], sites = []) {
  const assignedSiteIds = new Set(sites.map((site) => site.id));
  const latestBySite = new Map();

  captures.forEach((capture) => {
    if (
      capture.status !== "success" ||
      !capture.fileName ||
      !assignedSiteIds.has(capture.siteId)
    ) {
      return;
    }

    const currentLatest = latestBySite.get(capture.siteId);

    if (!currentLatest || getCaptureTimeMs(capture) > getCaptureTimeMs(currentLatest)) {
      latestBySite.set(capture.siteId, capture);
    }
  });

  return new Set(Array.from(latestBySite.values()).map((capture) => capture.id));
}

function getProtectedCaptureInfo(captures = [], sites = []) {
  const retainedBatchIds = getRetainedScanBatchIds(captures);
  const retainedBatchIdSet = new Set(retainedBatchIds);
  const latestAssignedCaptureIds = getLatestAssignedCaptureIds(captures, sites);
  const protectedCaptureIds = new Set();

  captures.forEach((capture) => {
    if (latestAssignedCaptureIds.has(capture.id)) {
      protectedCaptureIds.add(capture.id);
      return;
    }

    if (
      capture.source === "schedule" &&
      capture.batchId &&
      retainedBatchIdSet.has(capture.batchId)
    ) {
      protectedCaptureIds.add(capture.id);
    }
  });

  return {
    retainedBatchIds,
    protectedCaptureIds,
  };
}

function syncSiteCaptureMetadata(state) {
  state.sites = state.sites.map((site) => {
    const latestCapture = getLatestCaptureForSite(state.captures, site.id);

    return {
      ...site,
      lastCaptureAt: latestCapture?.capturedAt || null,
      lastCaptureStatus: latestCapture?.status || "",
      lastCaptureError: latestCapture?.error || "",
    };
  });

  return state;
}

function getCaptureImageStorageSummary() {
  const state = readState();
  const maxBytes = getImageStorageLimitBytes(state.storage);
  const files = listScreenshotImageFiles();
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const referencedFileNames = new Set(state.captures.flatMap(getCaptureFileNames));
  const referencedFileCount = files.filter((file) => referencedFileNames.has(file.fileName)).length;
  const orphanFileCount = files.length - referencedFileCount;
  const retainedBatchIds = getRetainedScanBatchIds(state.captures);
  const retainedBatchIdSet = new Set(retainedBatchIds);
  const retainedScanCaptureCount = state.captures.filter((capture) => (
    capture.source === "schedule" &&
    capture.batchId &&
    retainedBatchIdSet.has(capture.batchId) &&
    capture.status === "success"
  )).length;
  const usagePercent = maxBytes ? (totalBytes / maxBytes) * 100 : 0;

  return {
    maxBytes,
    totalBytes,
    remainingBytes: Math.max(0, maxBytes - totalBytes),
    usagePercent: Number(usagePercent.toFixed(2)),
    usagePercentCapped: Number(Math.min(100, usagePercent).toFixed(2)),
    isOverLimit: totalBytes > maxBytes,
    fileCount: files.length,
    captureCount: state.captures.filter((capture) => capture.status === "success" && capture.fileName).length,
    referencedFileCount,
    orphanFileCount,
    retainedScanBatchCount: retainedBatchIds.length,
    retainedScanCaptureCount,
    cleanupPolicy: {
      retainedScanBatchCount: RETAINED_SCAN_BATCH_COUNT,
      maxBytes,
    },
    lastCleanupAt: state.storage?.lastCleanupAt || null,
    lastCleanupResult: state.storage?.lastCleanupResult || null,
  };
}

function enforceCaptureImageStorageLimit(reason = "storage-limit") {
  const state = readState();
  const maxBytes = getImageStorageLimitBytes(state.storage);
  const files = listScreenshotImageFiles();
  const beforeBytes = files.reduce((sum, file) => sum + file.size, 0);
  const cleanupResult = {
    reason,
    triggered: beforeBytes > maxBytes,
    maxBytes,
    beforeBytes,
    afterBytes: beforeBytes,
    removedCaptureCount: 0,
    removedFileCount: 0,
    removedBytes: 0,
    failedFileCount: 0,
    retainedScanBatchCount: 0,
    retainedScanCaptureCount: 0,
    isOverLimitAfter: beforeBytes > maxBytes,
    cleanedAt: nowIso(),
  };

  if (beforeBytes <= maxBytes) {
    return {
      ...getCaptureImageStorageSummary(),
      cleanup: cleanupResult,
    };
  }

  const { protectedCaptureIds, retainedBatchIds } = getProtectedCaptureInfo(state.captures, state.sites);
  const protectedFileNames = new Set(
    state.captures
      .filter((capture) => protectedCaptureIds.has(capture.id))
      .flatMap(getCaptureFileNames)
  );
  const removedFileNames = new Set();
  const removableFiles = files
    .filter((file) => !protectedFileNames.has(file.fileName))
    .sort((left, right) => left.mtimeMs - right.mtimeMs);

  removableFiles.forEach((file) => {
    try {
      fs.rmSync(file.path, { force: true });
      removedFileNames.add(file.fileName);
      cleanupResult.removedFileCount += 1;
      cleanupResult.removedBytes += file.size;
    } catch {
      cleanupResult.failedFileCount += 1;
    }
  });

  const remainingFileNames = new Set(
    files
      .map((file) => file.fileName)
      .filter((fileName) => !removedFileNames.has(fileName))
  );
  const removedCaptureIds = new Set();

  state.captures.forEach((capture) => {
    const fileNames = getCaptureFileNames(capture);

    if (!fileNames.length || protectedCaptureIds.has(capture.id)) {
      return;
    }

    if (
      fileNames.some((fileName) => removedFileNames.has(fileName)) ||
      fileNames.every((fileName) => !remainingFileNames.has(fileName))
    ) {
      removedCaptureIds.add(capture.id);
    }
  });

  cleanupResult.removedCaptureCount = removedCaptureIds.size;
  cleanupResult.retainedScanBatchCount = retainedBatchIds.length;
  cleanupResult.retainedScanCaptureCount = state.captures.filter((capture) => (
    protectedCaptureIds.has(capture.id) &&
    capture.source === "schedule" &&
    retainedBatchIds.includes(capture.batchId)
  )).length;
  cleanupResult.afterBytes = listScreenshotImageFiles().reduce((sum, file) => sum + file.size, 0);
  cleanupResult.isOverLimitAfter = cleanupResult.afterBytes > maxBytes;

  updateState((nextState) => {
    nextState.captures = nextState.captures.filter((capture) => !removedCaptureIds.has(capture.id));
    syncSiteCaptureMetadata(nextState);
    nextState.storage = {
      ...(nextState.storage || {}),
      imageLimitBytes: maxBytes,
      lastCleanupAt: cleanupResult.cleanedAt,
      lastCleanupResult: cleanupResult,
    };
    return nextState;
  });

  return {
    ...getCaptureImageStorageSummary(),
    cleanup: cleanupResult,
  };
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

async function captureWithUrl(site, targetUrl, options = {}) {
  const captureId = crypto.randomUUID();
  const startedAt = Date.now();
  const screenshotPath = path.join(SCREENSHOT_DIR, `${captureId}.png`);
  const previewScreenshotPath = path.join(SCREENSHOT_DIR, `${captureId}-preview.jpg`);
  const telegramScreenshotPath = path.join(SCREENSHOT_DIR, `${captureId}-telegram.png`);
  const viewportWidth = Number(process.env.SCREENSHOT_VIEWPORT_WIDTH || 1366);
  const viewportHeight = Number(process.env.SCREENSHOT_VIEWPORT_HEIGHT || 900);
  const timeout = Number(process.env.SCREENSHOT_NAVIGATION_TIMEOUT_MS || 45000);
  const networkIdleTimeout = Number(process.env.SCREENSHOT_NETWORK_IDLE_TIMEOUT_MS || 5000);
  const screenshotTimeout = Number(process.env.SCREENSHOT_CAPTURE_TIMEOUT_MS || 30000);
  const originalFullPage = shouldCaptureOriginalFullPage();
  const abortSignal = options.signal || null;
  let browser;
  let context;
  let ownsBrowser = false;
  const handleAbort = () => {
    if (context) {
      void context.close().catch(() => {});
    }

    if (ownsBrowser && browser) {
      void browser.close().catch(() => {});
    }
  };

  try {
    assertNotAborted(abortSignal);

    if (abortSignal) {
      abortSignal.addEventListener("abort", handleAbort, { once: true });
    }

    await assertSafeTarget(targetUrl);
    assertNotAborted(abortSignal);

    browser = options.browser || await launchScreenshotBrowser();
    ownsBrowser = !options.browser;
    assertNotAborted(abortSignal);

    context = await browser.newContext({
      viewport: { width: viewportWidth, height: viewportHeight },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    assertNotAborted(abortSignal);

    const assertSafeRequestTarget = buildRequestGuard();

    await context.route("**/*", async (route, request) => {
      try {
        await assertSafeRequestTarget(request.url());
        await route.continue();
      } catch {
        await route.abort().catch(() => {});
      }
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(timeout);
    page.setDefaultTimeout(timeout);
    assertNotAborted(abortSignal);

    const navigation = await navigateToLoadedPage(page, targetUrl, timeout);
    assertNotAborted(abortSignal);

    await waitForPageReady(page, abortSignal, { timeout, networkIdleTimeout });

    const title = await page.title().catch(() => "");
    const finalUrl = page.url();
    await page.screenshot({
      path: screenshotPath,
      fullPage: originalFullPage,
      animations: "disabled",
      timeout: screenshotTimeout,
    });
    assertNotAborted(abortSignal);

    let previewFileName = "";
    let previewSize = 0;

    try {
      await page.screenshot({
        path: previewScreenshotPath,
        type: "jpeg",
        quality: getFrontendPreviewQuality(),
        fullPage: shouldCreateFullPageFrontendPreview(),
        animations: "disabled",
        timeout: screenshotTimeout,
      });
      previewFileName = `${captureId}-preview.jpg`;
      previewSize = fs.statSync(previewScreenshotPath).size;
    } catch (previewError) {
      if (isCaptureAbortError(previewError) || abortSignal?.aborted) {
        throw createCaptureAbortError();
      }

      if (fs.existsSync(previewScreenshotPath)) {
        fs.rmSync(previewScreenshotPath, { force: true });
      }
    }

    let telegramFileName = `${captureId}.png`;

    if (shouldCreateTopHalfTelegramImage()) {
      try {
        const clipWidth = Math.max(1, Math.floor(viewportWidth));
        const clipHeight = Math.max(
          1,
          Math.min(
            Math.floor(viewportHeight),
            Math.floor(Math.max(getTelegramTopHalfMinHeight(), viewportHeight * getTelegramTopHalfRatio()))
          )
        );

        await page.screenshot({
          path: telegramScreenshotPath,
          type: "png",
          clip: {
            x: 0,
            y: 0,
            width: clipWidth,
            height: clipHeight,
          },
          animations: "disabled",
          timeout: screenshotTimeout,
        });

        telegramFileName = `${captureId}-telegram.png`;
      } catch {
        if (fs.existsSync(telegramScreenshotPath)) {
          fs.rmSync(telegramScreenshotPath, { force: true });
        }
      }
    }

    const stats = fs.statSync(screenshotPath);
    const httpStatus = navigation.response?.status?.() || 0;

    return {
      id: captureId,
      siteId: site.id,
      domain: site.domain,
      url: targetUrl,
      status: "success",
      capturedAt: nowIso(),
      finalUrl,
      title,
      loadWarning: navigation.warning || "",
      httpStatus,
      fileName: `${captureId}.png`,
      previewFileName,
      telegramFileName,
      durationMs: Date.now() - startedAt,
      size: stats.size,
      previewSize,
    };
  } catch (error) {
    if (isCaptureAbortError(error) || abortSignal?.aborted) {
      if (fs.existsSync(screenshotPath)) {
        fs.rmSync(screenshotPath, { force: true });
      }

      if (fs.existsSync(previewScreenshotPath)) {
        fs.rmSync(previewScreenshotPath, { force: true });
      }

      if (fs.existsSync(telegramScreenshotPath)) {
        fs.rmSync(telegramScreenshotPath, { force: true });
      }

      throw createCaptureAbortError();
    }

    if (fs.existsSync(screenshotPath)) {
      fs.rmSync(screenshotPath, { force: true });
    }

    if (fs.existsSync(previewScreenshotPath)) {
      fs.rmSync(previewScreenshotPath, { force: true });
    }

    if (fs.existsSync(telegramScreenshotPath)) {
      fs.rmSync(telegramScreenshotPath, { force: true });
    }

    return {
      id: captureId,
      siteId: site.id,
      domain: site.domain,
      url: targetUrl,
      status: "failed",
      capturedAt: nowIso(),
      error: combineCaptureErrors(formatCaptureError(error)),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (abortSignal) {
      abortSignal.removeEventListener("abort", handleAbort);
    }

    if (context) {
      await context.close().catch(() => {});
    }

    if (ownsBrowser && browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function captureWebsite(site, options = {}) {
  const primaryUrl = String(site.url || "");
  const firstAttempt = await captureWithUrl(site, primaryUrl, options);

  if (firstAttempt.status === "success") {
    return firstAttempt;
  }

  try {
    const parsedUrl = new URL(primaryUrl);

    if (parsedUrl.protocol === "https:") {
      const fallbackUrl = `http://${parsedUrl.host}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
      const fallbackAttempt = await captureWithUrl(site, fallbackUrl, options);

      if (fallbackAttempt.status === "success") {
        return fallbackAttempt;
      }

      return {
        ...firstAttempt,
        error: combineCaptureErrors(firstAttempt.error, fallbackAttempt.error),
      };
    }
  } catch {}

  return firstAttempt;
}

async function captureAssignedSite(siteId, options = {}) {
  const state = readState();
  const site = state.sites.find((item) => item.id === siteId);

  if (!site) {
    const error = new Error("Screenshot site not found");
    error.statusCode = 404;
    throw error;
  }

  const capture = {
    ...(await captureWebsite(site, options)),
    source: options.source || "manual",
    batchId: String(options.batchId || ""),
  };

  updateState((nextState) => {
    nextState.captures = [capture, ...nextState.captures].slice(0, MAX_CAPTURE_HISTORY);
    nextState.sites = nextState.sites.map((item) => (
      item.id === siteId
        ? {
            ...item,
            lastCaptureAt: capture.capturedAt,
            lastCaptureStatus: capture.status,
            lastCaptureError: capture.error || "",
          }
        : item
    ));
    return nextState;
  });

  if (capture.source !== "schedule") {
    enforceCaptureImageStorageLimit("assigned-capture");
  }

  return serializeCapture(capture);
}

async function captureLiveSite(payload = {}) {
  const url = normalizeUrl(payload.url || payload.domain);
  const site = {
    id: `live-${crypto.randomUUID()}`,
    domain: String(payload.domain || getDomainFromUrl(url)).trim() || getDomainFromUrl(url),
    url,
  };
  const capture = {
    ...(await captureWebsite(site)),
    source: "live",
    batchId: "",
  };

  updateState((nextState) => {
    nextState.captures = [capture, ...nextState.captures].slice(0, MAX_CAPTURE_HISTORY);
    return nextState;
  });

  enforceCaptureImageStorageLimit("live-capture");

  return serializeCapture(capture);
}

async function captureAllAssignedSites() {
  const sites = readState().sites.filter((site) => site.active !== false);
  const results = [];

  for (const site of sites) {
    results.push(await captureAssignedSite(site.id));
  }

  return results;
}

function getCaptureImagePath(captureId, options = {}) {
  const capture = readState().captures.find((item) => item.id === captureId);

  if (!capture || capture.status !== "success" || !capture.fileName) {
    const error = new Error("Screenshot image not found");
    error.statusCode = 404;
    throw error;
  }

  const preferredFileName = options.original ? capture.fileName : capture.previewFileName || capture.fileName;
  const imagePath = path.join(SCREENSHOT_DIR, preferredFileName);

  if (fs.existsSync(imagePath)) {
    return imagePath;
  }

  const fallbackPath = path.join(SCREENSHOT_DIR, capture.fileName);

  if (!fs.existsSync(fallbackPath)) {
    const error = new Error("Screenshot file no longer exists");
    error.statusCode = 404;
    throw error;
  }

  return fallbackPath;
}

function getCaptureTelegramImagePath(captureId) {
  const capture = readState().captures.find((item) => item.id === captureId);

  if (!capture || capture.status !== "success" || !capture.fileName) {
    const error = new Error("Screenshot image not found");
    error.statusCode = 404;
    throw error;
  }

  const preferredFileName = capture.telegramFileName || capture.fileName;
  const imagePath = path.join(SCREENSHOT_DIR, preferredFileName);

  if (fs.existsSync(imagePath)) {
    return imagePath;
  }

  const fallbackPath = path.join(SCREENSHOT_DIR, capture.fileName);

  if (fs.existsSync(fallbackPath)) {
    return fallbackPath;
  }

  const error = new Error("Screenshot file no longer exists");
  error.statusCode = 404;
  throw error;
}

module.exports = {
  clearCaptureImages,
  captureAllAssignedSites,
  captureAssignedSite,
  captureLiveSite,
  enforceCaptureImageStorageLimit,
  getActorFromHeaders,
  getCaptureImagePath,
  getCaptureImageStorageSummary,
  getCaptureTelegramImagePath,
  isCaptureAbortError,
  launchScreenshotBrowser,
  listAssignedSites,
  removeAssignedSite,
  upsertAssignedSite,
};
