import { decryptSecretValue, encryptSecretValue } from "../../app/utils/secureValue.js";
import CuttlyLink from "./cuttlyLink.model.js";
import CuttlySettings from "./cuttlySettings.model.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_DELAY_MINUTES = 60;
const DEFAULT_PARALLEL_CHECKS = 1;
const MAX_PARALLEL_CHECKS = 5;
const CUTTLY_API_ENDPOINT = "https://cutt.ly/api/api.php";
const SETTINGS_KEY = "default";
const CUTTLY_TIMEOUT_MS = 30000;

const CUTTLY_SHORTEN_STATUS_LABELS = {
  1: "The shortened link already comes from a shortening domain",
  2: "The entered link is not a link",
  3: "Preferred link name is already taken",
  4: "Invalid API key",
  5: "The link has not passed validation",
  6: "The link provided is from a blocked domain",
  7: "OK - the link has been shortened",
  8: "Monthly link limit reached",
};

const CUTTLY_STATS_STATUS_LABELS = {
  1: "Stats found",
};

const runtime = {
  running: false,
  stopRequested: false,
  activeAbortControllers: new Map(),
  currentBatch: null,
};

let scheduleTimer = null;
let scheduleTickRunning = false;

function nowDate() {
  return new Date();
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeUrl(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    throw new Error("URL is required");
  }

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
  const parsedUrl = new URL(withProtocol);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs can be checked");
  }

  return parsedUrl.toString();
}

function getPositiveInteger(value, fallback, { minimum = 1, maximum = Number.POSITIVE_INFINITY } = {}) {
  const number = Number(value);
  const normalized = Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;

  return Math.min(maximum, Math.max(minimum, normalized));
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + getPositiveInteger(minutes, DEFAULT_DELAY_MINUTES) * 60 * 1000);
}

function createStopError() {
  const error = new Error("Cutt.ly scheduled check stopped");
  error.code = "CUTTLY_CHECK_STOPPED";
  return error;
}

function isStopError(error) {
  return error?.code === "CUTTLY_CHECK_STOPPED";
}

function isStopRequested(signal) {
  return Boolean(signal?.aborted || runtime.stopRequested);
}

function throwIfStopRequested(signal) {
  if (isStopRequested(signal)) {
    throw createStopError();
  }
}

function createTimeoutSignal(timeoutMs, parentSignal = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getPositiveInteger(timeoutMs, CUTTLY_TIMEOUT_MS));
  const abortFromParent = () => controller.abort();

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

function getCuttlyStatusKind(statusCode, payload = {}, mode = "stats") {
  if (payload?.auth === false) {
    return "error";
  }

  if (mode === "stats") {
    return Number(statusCode) === 1 ? "ok" : "error";
  }

  if (Number(statusCode) === 6) {
    return "blocked";
  }

  if (Number(statusCode) === 7) {
    return "ok";
  }

  if ([1, 3].includes(Number(statusCode))) {
    return "warning";
  }

  return "error";
}

function getCuttlyStatusLabel(statusCode, mode = "stats") {
  if (mode === "stats") {
    return CUTTLY_STATS_STATUS_LABELS[Number(statusCode)] || `Cutt.ly stats status ${statusCode || "unknown"}`;
  }

  return CUTTLY_SHORTEN_STATUS_LABELS[Number(statusCode)] || "Unknown Cutt.ly response";
}

function serializeDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function sanitizeSchedule(schedule = {}) {
  return {
    enabled: Boolean(schedule.enabled),
    delayMinutes: getPositiveInteger(schedule.delayMinutes, DEFAULT_DELAY_MINUTES, {
      minimum: 1,
      maximum: 1440,
    }),
    parallelChecks: getPositiveInteger(schedule.parallelChecks, DEFAULT_PARALLEL_CHECKS, {
      minimum: 1,
      maximum: MAX_PARALLEL_CHECKS,
    }),
    nextRunAt: serializeDate(schedule.nextRunAt),
    lastStartedAt: serializeDate(schedule.lastStartedAt),
    lastFinishedAt: serializeDate(schedule.lastFinishedAt),
    lastError: schedule.lastError || "",
    updatedAt: serializeDate(schedule.updatedAt),
  };
}

function sanitizeTelegram(telegram = {}) {
  return {
    enabled: Boolean(telegram.enabled),
    chatId: telegram.chatId || "",
    hasBotToken: Boolean(telegram.botTokenEncrypted),
    lastSentAt: serializeDate(telegram.lastSentAt),
    lastError: telegram.lastError || "",
    sentCount: Number(telegram.sentCount || 0),
    failedCount: Number(telegram.failedCount || 0),
    updatedAt: serializeDate(telegram.updatedAt),
  };
}

function sanitizeSettings(settings = {}) {
  return {
    hasApiKey: Boolean(settings.apiKeyEncrypted),
    apiKeyUpdatedAt: serializeDate(settings.apiKeyUpdatedAt),
    schedule: sanitizeSchedule(settings.schedule),
    telegram: sanitizeTelegram(settings.telegram),
  };
}

function serializeCheck(check = {}) {
  return {
    status: check.status || "not_checked",
    source: check.source || "manual",
    cuttlyStatusCode: Number(check.cuttlyStatusCode || 0),
    cuttlyStatusLabel: check.cuttlyStatusLabel || "",
    httpStatus: Number(check.httpStatus || 0),
    message: check.message || "",
    shortLink: check.shortLink || "",
    fullLink: check.fullLink || "",
    title: check.title || "",
    cuttlyDate: check.cuttlyDate || "",
    clicks: Number(check.clicks || 0),
    checkedAt: serializeDate(check.checkedAt),
    durationMs: Number(check.durationMs || 0),
  };
}

function serializeLink(link) {
  return {
    id: String(link._id),
    _id: String(link._id),
    title: link.title || "",
    targetUrl: link.targetUrl || "",
    preferredName: link.preferredName || "",
    useUserDomain: Boolean(link.useUserDomain),
    isActive: Boolean(link.isActive),
    lastCheck: serializeCheck(link.lastCheck),
    createdAt: serializeDate(link.createdAt),
    updatedAt: serializeDate(link.updatedAt),
  };
}

function getBatchStatus() {
  const currentBatch = runtime.currentBatch
    ? {
        ...runtime.currentBatch,
        activeItems: Array.isArray(runtime.currentBatch.activeItems)
          ? runtime.currentBatch.activeItems
          : [],
      }
    : null;

  return {
    serverNow: nowDate().toISOString(),
    running: Boolean(runtime.running),
    stopRequested: Boolean(runtime.stopRequested),
    currentBatch,
  };
}

function getSummary(links = []) {
  return {
    totalCount: links.length,
    activeCount: links.filter((link) => link.isActive !== false).length,
    checkedCount: links.filter((link) => link.lastCheck?.checkedAt).length,
    okCount: links.filter((link) => link.lastCheck?.status === "ok").length,
    blockedCount: links.filter((link) => link.lastCheck?.status === "blocked").length,
    warningCount: links.filter((link) => link.lastCheck?.status === "warning").length,
    errorCount: links.filter((link) => link.lastCheck?.status === "error").length,
  };
}

async function getSettingsDocument({ includeSecrets = false } = {}) {
  const query = CuttlySettings.findOne({ key: SETTINGS_KEY });
  const settings = await (includeSecrets
    ? query.select("+apiKeyEncrypted +telegram.botTokenEncrypted")
    : query);

  if (settings) {
    return settings;
  }

  return CuttlySettings.create({ key: SETTINGS_KEY });
}

function decryptStoredValue(value, label) {
  try {
    return decryptSecretValue(value);
  } catch {
    throw new Error(`${label} could not be decrypted. Save it again.`);
  }
}

function getApiKey(settings) {
  const apiKey = decryptStoredValue(settings.apiKeyEncrypted, "Cutt.ly API key");

  if (!apiKey) {
    throw new Error("Save the Cutt.ly API key before checking links");
  }

  return apiKey;
}

function getTelegramBotToken(settings) {
  return decryptStoredValue(settings.telegram?.botTokenEncrypted, "Telegram bot token");
}

function normalizeLinkPayload(payload = {}, current = null) {
  return {
    title: normalizeText(payload.title ?? current?.title),
    targetUrl: normalizeUrl(payload.targetUrl ?? current?.targetUrl),
    preferredName: normalizeText(payload.preferredName ?? current?.preferredName),
    useUserDomain: normalizeBoolean(payload.useUserDomain, current?.useUserDomain ?? true),
    isActive: normalizeBoolean(payload.isActive, current?.isActive ?? true),
  };
}

async function ensureUniqueTargetUrl(targetUrl, excludeId = null) {
  const query = {
    targetUrl,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  };
  const existing = await CuttlyLink.findOne(query).select("_id targetUrl");

  if (existing) {
    throw new Error("This URL is already added");
  }
}

export async function listCuttlyLinksService(options = {}) {
  const page = getPositiveInteger(options.page, 1, { minimum: 1, maximum: 100000 });
  const limit = getPositiveInteger(options.limit, DEFAULT_PAGE_SIZE, {
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  });
  const search = normalizeText(options.search).toLowerCase();
  const status = String(options.status || "all");
  const active = String(options.active || "all");
  const query = {};

  if (status !== "all") {
    if (status === "not_checked") {
      query["lastCheck.checkedAt"] = null;
    } else {
      query["lastCheck.status"] = status;
    }
  }

  if (active === "active") {
    query.isActive = true;
  } else if (active === "inactive") {
    query.isActive = false;
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { targetUrl: { $regex: search, $options: "i" } },
      { preferredName: { $regex: search, $options: "i" } },
      { "lastCheck.fullLink": { $regex: search, $options: "i" } },
      { "lastCheck.shortLink": { $regex: search, $options: "i" } },
      { "lastCheck.title": { $regex: search, $options: "i" } },
      { "lastCheck.message": { $regex: search, $options: "i" } },
    ];
  }

  const [items, totalItems, allLinks, settings] = await Promise.all([
    CuttlyLink.find(query).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit),
    CuttlyLink.countDocuments(query),
    CuttlyLink.find().select("isActive lastCheck"),
    getSettingsDocument({ includeSecrets: true }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const normalizedPage = Math.min(page, totalPages);

  return {
    items: items.map(serializeLink),
    summary: getSummary(allLinks),
    pagination: {
      page: normalizedPage,
      limit,
      totalItems,
      totalPages,
      hasNextPage: normalizedPage < totalPages,
      hasPreviousPage: normalizedPage > 1,
    },
    settings: sanitizeSettings(settings),
    status: {
      ...getBatchStatus(),
      schedule: sanitizeSchedule(settings.schedule),
    },
  };
}

export async function createCuttlyLinkService(payload = {}, user = null) {
  const sanitized = normalizeLinkPayload(payload);
  await ensureUniqueTargetUrl(sanitized.targetUrl);

  const link = await CuttlyLink.create({
    ...sanitized,
    createdBy: user?._id || null,
    updatedBy: user?._id || null,
  });

  return serializeLink(link);
}

export async function updateCuttlyLinkService(id, payload = {}, user = null) {
  const link = await CuttlyLink.findById(id);

  if (!link) {
    throw new Error("Cutt.ly link not found");
  }

  const sanitized = normalizeLinkPayload(payload, link);
  await ensureUniqueTargetUrl(sanitized.targetUrl, link._id);

  Object.assign(link, {
    ...sanitized,
    updatedBy: user?._id || null,
  });
  await link.save();

  return serializeLink(link);
}

export async function deleteCuttlyLinkService(id) {
  const link = await CuttlyLink.findById(id);

  if (!link) {
    throw new Error("Cutt.ly link not found");
  }

  await link.deleteOne();
  return serializeLink(link);
}

async function requestCuttlyStatus({ link, apiKey, signal }) {
  throwIfStopRequested(signal);

  const request = createTimeoutSignal(process.env.CUTTLY_API_TIMEOUT_MS || CUTTLY_TIMEOUT_MS, signal);
  const startedAt = Date.now();

  try {
    const callCuttlyApi = async (params) => {
      const response = await fetch(`${CUTTLY_API_ENDPOINT}?${params.toString()}`, {
        method: "GET",
        signal: request.signal,
      });
      const text = await response.text();
      let payload = null;

      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }

      if (isStopRequested(signal)) {
        throw createStopError();
      }

      return { response, text, payload };
    };

    const statsCall = await callCuttlyApi(new URLSearchParams({
      key: apiKey,
      stats: link.targetUrl,
    }));
    const statsPayload = statsCall.payload && typeof statsCall.payload === "object" ? statsCall.payload : null;

    if (!statsPayload) {
      return {
        status: "error",
        cuttlyStatusCode: 0,
        cuttlyStatusLabel: statsCall.response.ok ? "Invalid Cutt.ly response" : "Cutt.ly API request failed",
        httpStatus: statsCall.response.status,
        message: statsCall.text || (statsCall.response.ok
          ? "Cutt.ly returned an invalid stats response"
          : `Cutt.ly API returned HTTP ${statsCall.response.status}`),
        rawResponse: statsCall.text || null,
        durationMs: Date.now() - startedAt,
      };
    }

    if (statsPayload?.auth === false) {
      return {
        status: "error",
        cuttlyStatusCode: 4,
        cuttlyStatusLabel: "Invalid API key",
        httpStatus: statsCall.response.status,
        message: "Invalid API key",
        rawResponse: statsPayload,
        durationMs: Date.now() - startedAt,
      };
    }

    const statsData = statsPayload?.stats && typeof statsPayload.stats === "object" ? statsPayload.stats : null;
    if (!statsData) {
      return {
        status: "error",
        cuttlyStatusCode: 0,
        cuttlyStatusLabel: "Invalid Cutt.ly response",
        httpStatus: statsCall.response.status,
        message: "Cutt.ly returned a stats response without stats data",
        rawResponse: statsPayload,
        durationMs: Date.now() - startedAt,
      };
    }

    const cuttlyStatusCode = Number(statsData.status || 0);
    const status = getCuttlyStatusKind(cuttlyStatusCode, statsPayload, "stats");
    const cuttlyStatusLabel = getCuttlyStatusLabel(cuttlyStatusCode, "stats");

    return {
      status,
      cuttlyStatusCode,
      cuttlyStatusLabel,
      httpStatus: statsCall.response.status,
      message: cuttlyStatusLabel,
      shortLink: statsData.shortLink || link.targetUrl,
      fullLink: statsData.fullLink || "",
      title: statsData.title || "",
      cuttlyDate: statsData.date || "",
      clicks: Number(statsData.clicks || 0),
      rawResponse: statsPayload,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (isStopRequested(signal)) {
      throw createStopError();
    }

    return {
      status: "error",
      cuttlyStatusCode: 0,
      cuttlyStatusLabel: "Cutt.ly request failed",
      httpStatus: 0,
      message: error.message || "Failed to call Cutt.ly API",
      rawResponse: null,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    request.cleanup();
  }
}

export async function checkCuttlyLinkService(id, options = {}) {
  const link = await CuttlyLink.findById(id);

  if (!link) {
    throw new Error("Cutt.ly link not found");
  }

  const settings = await getSettingsDocument({ includeSecrets: true });
  const apiKey = getApiKey(settings);
  const result = await requestCuttlyStatus({
    link,
    apiKey,
    signal: options.signal || null,
  });
  const check = {
    ...result,
    source: options.source || "manual",
    checkedAt: nowDate(),
  };

  link.lastCheck = check;
  await link.save();

  return serializeCheck(check);
}

async function sendTelegramMessage(settings, text) {
  if (!settings.telegram?.enabled || !settings.telegram.chatId || !settings.telegram.botTokenEncrypted) {
    return null;
  }

  const botToken = getTelegramBotToken(settings);
  const request = createTimeoutSignal(process.env.CUTTLY_TELEGRAM_TIMEOUT_MS || 10000);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: settings.telegram.chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: request.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.description || "Telegram request failed");
    }

    settings.telegram.lastSentAt = nowDate();
    settings.telegram.lastError = "";
    settings.telegram.sentCount = Number(settings.telegram.sentCount || 0) + 1;
    await settings.save();

    return payload;
  } catch (error) {
    settings.telegram.lastError = error.message || "Telegram request failed";
    settings.telegram.failedCount = Number(settings.telegram.failedCount || 0) + 1;
    await settings.save();
    throw error;
  } finally {
    request.cleanup();
  }
}

async function notifyScheduleSummary({ batch, items }) {
  const blockedItems = items.filter((item) => item.lastCheck?.status === "blocked");
  const errorItems = items.filter((item) => item.lastCheck?.status === "error");

  if (!blockedItems.length && !errorItems.length) {
    return;
  }

  const settings = await getSettingsDocument({ includeSecrets: true });

  if (!settings.telegram?.enabled) {
    return;
  }

  const lines = [
    "Cutt.ly link check summary",
    `Checked: ${batch.completedCount}/${batch.totalCount}`,
    `Blocked: ${batch.blockedCount}`,
    `Errors: ${batch.errorCount}`,
    "",
    ...[...blockedItems, ...errorItems].slice(0, 20).map((item) => {
      const check = item.lastCheck || {};
      return `${item.targetUrl} - ${check.cuttlyStatusCode || "-"} ${check.cuttlyStatusLabel || check.message || ""}`;
    }),
  ];

  if (blockedItems.length + errorItems.length > 20) {
    lines.push(`...and ${blockedItems.length + errorItems.length - 20} more`);
  }

  await sendTelegramMessage(settings, lines.join("\n"));
}

function markBatchStopping(batch) {
  if (!batch) {
    return null;
  }

  batch.status = "stopping";
  batch.stopRequestedAt = batch.stopRequestedAt || nowDate().toISOString();
  runtime.currentBatch = { ...batch };
  return batch;
}

function requestStopCurrentScheduleBatch() {
  const batch = runtime.currentBatch;

  if (!runtime.running || !batch || batch.source !== "schedule") {
    return false;
  }

  runtime.stopRequested = true;
  markBatchStopping(batch);
  runtime.activeAbortControllers.forEach((controller) => controller.abort());
  return true;
}

export async function checkAllCuttlyLinksService(options = {}) {
  if (runtime.running) {
    const error = new Error("Cutt.ly batch check is already running");
    error.statusCode = 409;
    throw error;
  }

  const source = options.source || "manual";
  const links = await CuttlyLink.find({ isActive: true }).sort({ updatedAt: -1 });
  const settings = await getSettingsDocument({ includeSecrets: true });
  const apiKey = getApiKey(settings);
  const parallelChecks = getPositiveInteger(options.parallelChecks || settings.schedule?.parallelChecks, DEFAULT_PARALLEL_CHECKS, {
    minimum: 1,
    maximum: Math.min(MAX_PARALLEL_CHECKS, Math.max(1, links.length || 1)),
  });
  const batch = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    source,
    status: "running",
    totalCount: links.length,
    completedCount: 0,
    okCount: 0,
    blockedCount: 0,
    warningCount: 0,
    errorCount: 0,
    stoppedCount: 0,
    activeItems: [],
    latestCompleted: null,
    startedAt: nowDate().toISOString(),
    finishedAt: null,
    stopRequestedAt: null,
  };
  const activeItems = new Map();
  const results = new Array(links.length);
  let nextIndex = 0;

  runtime.running = true;
  runtime.stopRequested = false;
  runtime.activeAbortControllers.clear();
  runtime.currentBatch = batch;

  async function worker() {
    while (nextIndex < links.length && !runtime.stopRequested) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const link = links[currentIndex];
      const abortController = new AbortController();

      activeItems.set(String(link._id), {
        index: currentIndex + 1,
        linkId: String(link._id),
        targetUrl: link.targetUrl,
        title: link.title || "",
        startedAt: nowDate().toISOString(),
      });
      runtime.activeAbortControllers.set(String(link._id), abortController);
      batch.activeItems = [...activeItems.values()];
      runtime.currentBatch = { ...batch };

      try {
        const result = await requestCuttlyStatus({
          link,
          apiKey,
          signal: abortController.signal,
        });
        const check = {
          ...result,
          source,
          checkedAt: nowDate(),
        };

        link.lastCheck = check;
        await link.save();
        results[currentIndex] = serializeLink(link);
      } catch (error) {
        if (isStopError(error) || runtime.stopRequested) {
          results[currentIndex] = null;
        } else {
          const check = {
            status: "error",
            source,
            cuttlyStatusCode: 0,
            cuttlyStatusLabel: "Check failed",
            httpStatus: 0,
            message: error.message || "Cutt.ly check failed",
            checkedAt: nowDate(),
          };

          link.lastCheck = check;
          await link.save();
          results[currentIndex] = serializeLink(link);
        }
      }

      if (runtime.stopRequested) {
        markBatchStopping(batch);
      }

      runtime.activeAbortControllers.delete(String(link._id));
      activeItems.delete(String(link._id));
      batch.activeItems = [...activeItems.values()];

      if (!results[currentIndex]) {
        batch.stoppedCount = links.length - results.filter(Boolean).length;
        runtime.currentBatch = { ...batch };
        continue;
      }

      const latestCheck = results[currentIndex].lastCheck;
      batch.completedCount += 1;
      batch.okCount += latestCheck.status === "ok" ? 1 : 0;
      batch.blockedCount += latestCheck.status === "blocked" ? 1 : 0;
      batch.warningCount += latestCheck.status === "warning" ? 1 : 0;
      batch.errorCount += latestCheck.status === "error" ? 1 : 0;
      batch.latestCompleted = {
        linkId: results[currentIndex].id,
        targetUrl: results[currentIndex].targetUrl,
        status: latestCheck.status,
        cuttlyStatusCode: latestCheck.cuttlyStatusCode,
        checkedAt: latestCheck.checkedAt,
      };
      runtime.currentBatch = { ...batch };
    }
  }

  try {
    await Promise.all(Array.from({ length: parallelChecks }, () => worker()));
    batch.status = runtime.stopRequested || batch.status === "stopping" ? "stopped" : "completed";
  } catch (error) {
    batch.status = "failed";
    batch.error = error.message || "Cutt.ly batch check failed";
    throw error;
  } finally {
    const completedResults = results.filter(Boolean);
    batch.stoppedCount = batch.status === "stopped"
      ? Math.max(Number(batch.stoppedCount || 0), links.length - completedResults.length)
      : Number(batch.stoppedCount || 0);
    batch.finishedAt = nowDate().toISOString();
    batch.activeItems = [];
    runtime.running = false;
    runtime.stopRequested = false;
    runtime.activeAbortControllers.clear();
    runtime.currentBatch = { ...batch };
  }

  const completedResults = results.filter(Boolean);

  if (source === "schedule" && batch.status !== "stopped") {
    await notifyScheduleSummary({ batch, items: completedResults }).catch(() => {});
  }

  return {
    totalCount: links.length,
    completedCount: completedResults.length,
    okCount: batch.okCount,
    blockedCount: batch.blockedCount,
    warningCount: batch.warningCount,
    errorCount: batch.errorCount,
    stoppedCount: batch.stoppedCount,
    items: completedResults,
  };
}

export async function getCuttlySettingsService() {
  const settings = await getSettingsDocument({ includeSecrets: true });

  return sanitizeSettings(settings);
}

export function getCuttlyStatusService() {
  return getBatchStatus();
}

export async function updateCuttlyApiSettingsService(payload = {}) {
  const apiKey = String(payload.apiKey || "").trim();
  const settings = await getSettingsDocument({ includeSecrets: true });

  if (!apiKey && !settings.apiKeyEncrypted) {
    throw new Error("Cutt.ly API key is required");
  }

  if (apiKey) {
    settings.apiKeyEncrypted = encryptSecretValue(apiKey);
    settings.apiKeyUpdatedAt = nowDate();
  }

  await settings.save();
  return sanitizeSettings(settings);
}

export async function updateCuttlyTelegramSettingsService(payload = {}) {
  const settings = await getSettingsDocument({ includeSecrets: true });
  const enabled = normalizeBoolean(payload.enabled, settings.telegram?.enabled || false);
  const chatId = String(payload.chatId ?? settings.telegram?.chatId ?? "").trim();
  const botToken = String(payload.botToken || "").trim();

  if (enabled && !chatId) {
    throw new Error("Telegram chat/group ID is required");
  }

  if (enabled && payload.clearBotToken && !botToken) {
    throw new Error("Telegram bot token is required when alerts are enabled");
  }

  if (enabled && !botToken && !settings.telegram?.botTokenEncrypted) {
    throw new Error("Telegram bot token is required");
  }

  settings.telegram.enabled = enabled;
  settings.telegram.chatId = chatId;
  settings.telegram.updatedAt = nowDate();
  settings.telegram.lastError = "";

  if (payload.clearBotToken) {
    settings.telegram.botTokenEncrypted = "";
  } else if (botToken) {
    settings.telegram.botTokenEncrypted = encryptSecretValue(botToken);
  }

  await settings.save();
  return sanitizeSettings(settings).telegram;
}

export async function updateCuttlyScheduleSettingsService(payload = {}) {
  const settings = await getSettingsDocument({ includeSecrets: true });
  const currentSchedule = sanitizeSchedule(settings.schedule);
  const enabled = payload.enabled !== undefined
    ? normalizeBoolean(payload.enabled, currentSchedule.enabled)
    : currentSchedule.enabled;
  const delayMinutes = getPositiveInteger(payload.delayMinutes ?? currentSchedule.delayMinutes, DEFAULT_DELAY_MINUTES, {
    minimum: 1,
    maximum: 1440,
  });
  const parallelChecks = getPositiveInteger(payload.parallelChecks ?? currentSchedule.parallelChecks, DEFAULT_PARALLEL_CHECKS, {
    minimum: 1,
    maximum: MAX_PARALLEL_CHECKS,
  });

  if (enabled) {
    getApiKey(settings);
  }

  const delayChanged = delayMinutes !== currentSchedule.delayMinutes;
  const shouldResetNextRun = enabled && (!currentSchedule.enabled || delayChanged || !currentSchedule.nextRunAt);

  settings.schedule.enabled = enabled;
  settings.schedule.delayMinutes = delayMinutes;
  settings.schedule.parallelChecks = parallelChecks;
  settings.schedule.nextRunAt = enabled
    ? shouldResetNextRun
      ? addMinutes(nowDate(), delayMinutes)
      : new Date(currentSchedule.nextRunAt)
    : null;
  settings.schedule.updatedAt = nowDate();

  if (!enabled) {
    requestStopCurrentScheduleBatch();
  }

  await settings.save();
  return sanitizeSchedule(settings.schedule);
}

export async function setCuttlyScheduleEnabledService(enabled, payload = {}) {
  const settings = await getSettingsDocument({ includeSecrets: true });
  const delayMinutes = getPositiveInteger(payload.delayMinutes ?? settings.schedule?.delayMinutes, DEFAULT_DELAY_MINUTES, {
    minimum: 1,
    maximum: 1440,
  });
  const parallelChecks = getPositiveInteger(payload.parallelChecks ?? settings.schedule?.parallelChecks, DEFAULT_PARALLEL_CHECKS, {
    minimum: 1,
    maximum: MAX_PARALLEL_CHECKS,
  });

  if (enabled) {
    getApiKey(settings);
  }

  settings.schedule.enabled = Boolean(enabled);
  settings.schedule.delayMinutes = delayMinutes;
  settings.schedule.parallelChecks = parallelChecks;
  settings.schedule.nextRunAt = enabled ? nowDate() : null;
  settings.schedule.updatedAt = nowDate();
  settings.schedule.lastError = enabled ? "" : settings.schedule.lastError;

  if (!enabled) {
    requestStopCurrentScheduleBatch();
  }

  await settings.save();
  return sanitizeSchedule(settings.schedule);
}

async function updateScheduleAfterRun({ startedAt, finishedAt, error = null } = {}) {
  const settings = await getSettingsDocument();
  const schedule = sanitizeSchedule(settings.schedule);

  settings.schedule.lastStartedAt = startedAt || settings.schedule.lastStartedAt;
  settings.schedule.lastFinishedAt = finishedAt || nowDate();
  settings.schedule.lastError = error ? error.message || "Scheduled Cutt.ly check failed" : "";
  settings.schedule.nextRunAt = schedule.enabled
    ? addMinutes(new Date(finishedAt || Date.now()), schedule.delayMinutes)
    : null;

  await settings.save();
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
  if (scheduleTickRunning || runtime.running) {
    return;
  }

  const settings = await getSettingsDocument();
  const schedule = sanitizeSchedule(settings.schedule);

  if (!isScheduleDue(schedule)) {
    return;
  }

  scheduleTickRunning = true;
  const startedAt = nowDate();

  settings.schedule.lastStartedAt = startedAt;
  settings.schedule.lastError = "";
  await settings.save();

  try {
    await checkAllCuttlyLinksService({
      source: "schedule",
      parallelChecks: schedule.parallelChecks,
    });
    await updateScheduleAfterRun({ startedAt, finishedAt: nowDate() });
  } catch (error) {
    await updateScheduleAfterRun({ startedAt, finishedAt: nowDate(), error });
  } finally {
    scheduleTickRunning = false;
  }
}

export function startCuttlyLinkCheckerScheduleRunner() {
  if (scheduleTimer) {
    return scheduleTimer;
  }

  scheduleTimer = setInterval(() => {
    void runScheduleTick().catch((error) => {
      console.warn("[cuttly-link-checker] Schedule tick failed:", error.message);
    });
  }, getPositiveInteger(process.env.CUTTLY_LINK_CHECKER_TICK_MS, 10000, { minimum: 1000 }));

  void runScheduleTick().catch((error) => {
    console.warn("[cuttly-link-checker] Initial schedule tick failed:", error.message);
  });

  return scheduleTimer;
}
