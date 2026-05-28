const crypto = require("crypto");
const {
  captureAssignedSite,
  enforceCaptureImageStorageLimit,
  isCaptureAbortError,
  launchScreenshotBrowser,
} = require("./screenshotTaker.service");
const { readState, updateState } = require("./screenshotTaker.storage");
const {
  notifyScheduledBatchStarted,
  notifyScheduledBatchSummary,
  notifyScheduledCapture,
} = require("./screenshotTaker.telegram.service");

let schedulerTimer = null;
let schedulerTickRunning = false;
const PRIMARY_JOB_PHASE = "primary";
const RETRY_JOB_PHASE = "retry";
const ACTIVE_BATCH_STATUSES = new Set(["queued", "running", "retrying", "stopping"]);
const DEFAULT_JOB_TIMEOUT_MS = 3 * 60 * 1000;

const scannerRuntime = {
  activeJob: null,
  activeAbortController: null,
  activeJobs: new Map(),
  activeAbortControllers: new Map(),
  cancelledBatchIds: new Set(),
  batchBrowserPromises: new Map(),
  batchBrowsers: new Map(),
  queue: [],
  currentBatch: null,
  telegramTasks: new Set(),
  telegramMessageCounter: 0,
  telegramSendQueue: Promise.resolve(),
  lastScanStartedAt: null,
  lastScanFinishedAt: null,
  lastError: "",
  processing: false,
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeDelayMinutes(value) {
  const delayMinutes = Number(value || 0);

  if (!Number.isInteger(delayMinutes) || delayMinutes < 1 || delayMinutes > 1440) {
    const error = new Error("Delay must be between 1 and 1440 minutes");
    error.statusCode = 400;
    throw error;
  }

  return delayMinutes;
}

function normalizeParallelCaptures(value) {
  const maxParallelCaptures = Number(process.env.SCREENSHOT_MAX_PARALLEL_CAPTURES || 100);
  const maxAllowedParallelCaptures = Number.isInteger(maxParallelCaptures) && maxParallelCaptures > 0
    ? Math.min(100, maxParallelCaptures)
    : 100;
  const parallelCaptures = Number(value || 1);

  if (!Number.isInteger(parallelCaptures) || parallelCaptures < 1 || parallelCaptures > maxAllowedParallelCaptures) {
    const error = new Error(`Parallel captures must be between 1 and ${maxAllowedParallelCaptures}`);
    error.statusCode = 400;
    throw error;
  }

  return parallelCaptures;
}

function getPositiveInteger(value, fallback, options = {}) {
  const number = Number(value);
  const minimum = Number.isFinite(options.minimum) ? options.minimum : 1;
  const maximum = Number.isFinite(options.maximum) ? options.maximum : Number.POSITIVE_INFINITY;
  const normalized = Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;

  return Math.min(maximum, Math.max(minimum, normalized));
}

function getJobTimeoutMs() {
  const configuredTimeout = Number(process.env.SCREENSHOT_JOB_TIMEOUT_MS || 0);

  if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
    return getPositiveInteger(configuredTimeout, DEFAULT_JOB_TIMEOUT_MS, {
      minimum: 30000,
      maximum: 60 * 60 * 1000,
    });
  }

  const navigationTimeout = getPositiveInteger(
    process.env.SCREENSHOT_NAVIGATION_TIMEOUT_MS,
    45000,
    { minimum: 1000 }
  );
  const captureTimeout = getPositiveInteger(
    process.env.SCREENSHOT_CAPTURE_TIMEOUT_MS,
    30000,
    { minimum: 1000 }
  );
  const networkIdleTimeout = getPositiveInteger(
    process.env.SCREENSHOT_NETWORK_IDLE_TIMEOUT_MS,
    5000,
    { minimum: 1000 }
  );

  return Math.max(
    DEFAULT_JOB_TIMEOUT_MS,
    navigationTimeout * 2 + captureTimeout * 3 + networkIdleTimeout * 2 + 30000
  );
}

function createJobTimeoutError(job, timeoutMs) {
  const error = new Error(
    `Screenshot job timed out after ${Math.ceil(timeoutMs / 1000)} seconds for ${job.domain || job.url || "site"}`
  );
  error.code = "SCREENSHOT_JOB_TIMEOUT";
  return error;
}

function normalizeTelegramConfig(payloadTelegram, currentTelegram = {}) {
  const current = currentTelegram || {};

  if (!payloadTelegram || typeof payloadTelegram !== "object") {
    return {
      ...current,
      enabled: Boolean(current.enabled),
      chatId: String(current.chatId || "").trim(),
      botToken: String(current.botToken || "").trim(),
      lastError: String(current.lastError || ""),
      sentCount: Number(current.sentCount || 0),
      failedCount: Number(current.failedCount || 0),
    };
  }

  const enabled = Boolean(payloadTelegram.enabled);
  const chatId = String(payloadTelegram.chatId ?? current.chatId ?? "").trim();
  const incomingBotToken = String(payloadTelegram.botToken || "").trim();
  const botToken = payloadTelegram.clearBotToken
    ? ""
    : incomingBotToken || String(current.botToken || "").trim();

  if (enabled && (!chatId || !botToken)) {
    const error = new Error("Telegram bot token and chat/group ID are required when Telegram is enabled");
    error.statusCode = 400;
    throw error;
  }

  const configChanged =
    enabled !== Boolean(current.enabled) ||
    chatId !== String(current.chatId || "").trim() ||
    Boolean(incomingBotToken) ||
    Boolean(payloadTelegram.clearBotToken);

  return {
    ...current,
    enabled,
    chatId,
    botToken,
    updatedAt: configChanged ? nowIso() : current.updatedAt || null,
    lastSentAt: current.lastSentAt || null,
    lastError: configChanged ? "" : String(current.lastError || ""),
    sentCount: Number(current.sentCount || 0),
    failedCount: Number(current.failedCount || 0),
  };
}

function sanitizeSchedule(schedule = {}) {
  const telegram = schedule.telegram || {};

  return {
    ...schedule,
    telegram: {
      enabled: Boolean(telegram.enabled),
      chatId: String(telegram.chatId || ""),
      hasBotToken: Boolean(telegram.botToken),
      updatedAt: telegram.updatedAt || null,
      lastSentAt: telegram.lastSentAt || null,
      lastError: String(telegram.lastError || ""),
      sentCount: Number(telegram.sentCount || 0),
      failedCount: Number(telegram.failedCount || 0),
    },
  };
}

function recordTelegramDelivery({ success, errorMessage = "" }) {
  updateState((state) => {
    const currentTelegram = state.schedule?.telegram || {};

    state.schedule = {
      ...(state.schedule || {}),
      telegram: {
        ...currentTelegram,
        lastSentAt: success ? nowIso() : currentTelegram.lastSentAt || null,
        lastError: success ? "" : errorMessage,
        sentCount: success ? Number(currentTelegram.sentCount || 0) + 1 : Number(currentTelegram.sentCount || 0),
        failedCount: success
          ? Number(currentTelegram.failedCount || 0)
          : Number(currentTelegram.failedCount || 0) + 1,
      },
    };

    return state;
  });
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function resetTelegramMessageSequence() {
  scannerRuntime.telegramMessageCounter = 0;
}

function getNextTelegramMessageNumber() {
  scannerRuntime.telegramMessageCounter += 1;
  return scannerRuntime.telegramMessageCounter;
}

function queueTelegramSend(task) {
  const queuedTask = scannerRuntime.telegramSendQueue
    .catch(() => {})
    .then(task);

  scannerRuntime.telegramSendQueue = queuedTask.catch(() => {});

  return queuedTask;
}

function getAssignedSites() {
  return readState().sites.filter((site) => site.active !== false);
}

function getAssignedSite(siteId) {
  return readState().sites.find((site) => site.id === siteId && site.active !== false) || null;
}

function createJob(site, source = "manual", batchId = "", options = {}) {
  return {
    id: crypto.randomUUID(),
    siteId: site.id,
    domain: site.domain,
    url: site.url,
    brandName: site.brandName || "",
    source,
    batchId,
    phase: options.phase || PRIMARY_JOB_PHASE,
    attempt: Number(options.attempt || 1),
    retryOfJobId: String(options.retryOfJobId || ""),
    batchIndex: Number(options.batchIndex || 0),
    batchTotal: Number(options.batchTotal || 0),
    status: "queued",
    queuedAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    error: "",
    capture: null,
  };
}

function serializeJob(job) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    siteId: job.siteId,
    domain: job.domain,
    url: job.url,
    brandName: job.brandName,
    source: job.source,
    batchId: job.batchId,
    phase: job.phase || PRIMARY_JOB_PHASE,
    attempt: Number(job.attempt || 1),
    retryOfJobId: job.retryOfJobId || "",
    batchIndex: Number(job.batchIndex || 0),
    batchTotal: Number(job.batchTotal || 0),
    status: job.status,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    capture: job.capture,
    timeoutAt: job.timeoutAt || null,
  };
}

function getScheduleFromState() {
  return readState().schedule || { enabled: false, delayMinutes: 60, parallelCaptures: 2 };
}

function getActiveJobs() {
  return Array.from(scannerRuntime.activeJobs.values());
}

function syncPrimaryActiveJob() {
  const activeJob = getActiveJobs()[0] || null;

  scannerRuntime.activeJob = activeJob;
  scannerRuntime.activeAbortController = activeJob
    ? scannerRuntime.activeAbortControllers.get(activeJob.id) || null
    : null;
}

function trackTelegramTask(task) {
  scannerRuntime.telegramTasks.add(task);

  task
    .catch(() => {})
    .finally(() => {
      scannerRuntime.telegramTasks.delete(task);
    });

  return task;
}

function createJobDeadline(job, abortController) {
  const timeoutMs = getJobTimeoutMs();
  let timeoutId = null;
  let timedOut = false;

  const promise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      const timeoutError = createJobTimeoutError(job, timeoutMs);

      scannerRuntime.lastError = timeoutError.message;

      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
      }

      if (job.source === "schedule" && job.batchId) {
        closeBatchBrowser(job.batchId);
      }

      reject(timeoutError);
    }, timeoutMs);

    if (typeof timeoutId.unref === "function") {
      timeoutId.unref();
    }
  });

  return {
    promise,
    get timedOut() {
      return timedOut;
    },
    timeoutMs,
    cleanup() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}

function getBatchBrowserPromise(batchId) {
  if (!batchId) {
    return null;
  }

  const existingPromise = scannerRuntime.batchBrowserPromises.get(batchId);

  if (existingPromise) {
    return existingPromise;
  }

  const browserPromise = launchScreenshotBrowser()
    .then((browser) => {
      scannerRuntime.batchBrowsers.set(batchId, browser);
      return browser;
    })
    .catch((error) => {
      scannerRuntime.batchBrowserPromises.delete(batchId);
      scannerRuntime.batchBrowsers.delete(batchId);
      throw error;
    });

  scannerRuntime.batchBrowserPromises.set(batchId, browserPromise);
  return browserPromise;
}

function closeBatchBrowser(batchId) {
  if (!batchId) {
    return;
  }

  const browser = scannerRuntime.batchBrowsers.get(batchId);
  const browserPromise = scannerRuntime.batchBrowserPromises.get(batchId);

  scannerRuntime.batchBrowsers.delete(batchId);
  scannerRuntime.batchBrowserPromises.delete(batchId);

  if (browser) {
    void browser.close().catch(() => {});
    return;
  }

  if (browserPromise) {
    void browserPromise
      .then((resolvedBrowser) => resolvedBrowser.close().catch(() => {}))
      .catch(() => {});
  }
}

function isHttpErrorCapture(capture = {}) {
  const status = Number(capture.httpStatus || 0);

  return status >= 400;
}

function isScheduledCaptureError(capture = {}) {
  return capture?.status === "failed" || isHttpErrorCapture(capture);
}

function getScheduledCaptureError(job = {}, capture = {}) {
  if (capture?.status === "failed") {
    return capture.error || "Screenshot capture failed";
  }

  if (isHttpErrorCapture(capture)) {
    return `Website returned HTTP status ${Number(capture.httpStatus || 0)}`;
  }

  return job.error || "Screenshot capture failed";
}

function buildBatchErrorItem(job = {}, capture = {}) {
  return {
    siteId: job.siteId,
    domain: job.domain,
    url: job.url,
    brandName: job.brandName || "",
    httpStatus: Number(capture?.httpStatus || 0),
    attempt: Number(job.attempt || 1),
    phase: job.phase || PRIMARY_JOB_PHASE,
    batchIndex: Number(job.batchIndex || 0),
    batchTotal: Number(job.batchTotal || 0),
    error: getScheduledCaptureError(job, capture),
    capturedAt: job.finishedAt || nowIso(),
  };
}

function upsertBatchError(errors = [], errorItem = {}) {
  const nextErrors = errors.filter((item) => item.siteId !== errorItem.siteId);

  return [...nextErrors, errorItem];
}

function removeBatchError(errors = [], siteId) {
  return errors.filter((item) => item.siteId !== siteId);
}

function upsertRetryCandidate(candidates = [], job = {}, capture = {}) {
  const candidate = {
    siteId: job.siteId,
    domain: job.domain,
    url: job.url,
    brandName: job.brandName || "",
    originalJobId: job.id,
    httpStatus: Number(capture?.httpStatus || 0),
    error: getScheduledCaptureError(job, capture),
    batchIndex: Number(job.batchIndex || 0),
    batchTotal: Number(job.batchTotal || 0),
  };
  const nextCandidates = candidates.filter((item) => item.siteId !== candidate.siteId);

  return [...nextCandidates, candidate];
}

function queueRetryJobsForBatch(batch = {}) {
  const retryCandidates = Array.isArray(batch.retryCandidates) ? batch.retryCandidates : [];
  const sitesById = new Map(getAssignedSites().map((site) => [site.id, site]));
  const retryJobs = retryCandidates
    .map((candidate) => {
      const site = sitesById.get(candidate.siteId);

      if (!site) {
        return null;
      }

      return createJob(site, "schedule", batch.id, {
        phase: RETRY_JOB_PHASE,
        attempt: 2,
        retryOfJobId: candidate.originalJobId || "",
        batchIndex: candidate.batchIndex || 0,
        batchTotal: candidate.batchTotal || batch.totalCount || 0,
      });
    })
    .filter(Boolean);

  scannerRuntime.currentBatch = {
    ...batch,
    status: retryJobs.length ? "retrying" : "running",
    retryPhase: retryJobs.length ? "running" : "completed",
    retryCount: retryJobs.length,
    retriedCount: 0,
    retryFailedCount: 0,
  };

  retryJobs.forEach((job) => {
    scannerRuntime.queue.push(job);
  });

  if (retryJobs.length) {
    setImmediate(() => {
      void processQueue();
    });
  }

  return Boolean(retryJobs.length);
}

async function sendScheduledCaptureNotification(job, capture) {
  if (job.source !== "schedule") {
    return;
  }

  try {
    const result = await queueTelegramSend(() => {
      const telegramCapture = {
        ...capture,
        telegramMessageNumber: getNextTelegramMessageNumber(),
      };

      return notifyScheduledCapture({
        schedule: getScheduleFromState(),
        site: job,
        capture: telegramCapture,
      });
    });

    if (result) {
      recordTelegramDelivery({ success: true });
    }
  } catch (error) {
    const errorMessage = error.message || "Failed to send screenshot to Telegram";

    recordTelegramDelivery({ success: false, errorMessage });
    scannerRuntime.lastError = `Telegram send failed: ${errorMessage}`;
  }
}

async function sendScheduledBatchStartedNotification(batch) {
  try {
    const result = await queueTelegramSend(() => (
      notifyScheduledBatchStarted({
        schedule: getScheduleFromState(),
        batch,
      })
    ));

    if (result) {
      recordTelegramDelivery({ success: true });
    }
  } catch (error) {
    const errorMessage = error.message || "Failed to send scheduled scan start message to Telegram";

    recordTelegramDelivery({ success: false, errorMessage });
    scannerRuntime.lastError = `Telegram start message failed: ${errorMessage}`;
  }
}

async function sendScheduledBatchSummaryNotification(batch) {
  try {
    const result = await queueTelegramSend(() => (
      notifyScheduledBatchSummary({
        schedule: getScheduleFromState(),
        batch,
      })
    ));

    if (result) {
      recordTelegramDelivery({ success: true });
    }
  } catch (error) {
    const errorMessage = error.message || "Failed to send scheduled scan summary to Telegram";

    recordTelegramDelivery({ success: false, errorMessage });
    scannerRuntime.lastError = `Telegram summary failed: ${errorMessage}`;
  }
}

async function runCompletedBatchMaintenance(batch) {
  await Promise.allSettled(Array.from(scannerRuntime.telegramTasks));

  if (Array.isArray(batch.errors) && batch.errors.length) {
    await sendScheduledBatchSummaryNotification(batch);
  }

  await Promise.allSettled(Array.from(scannerRuntime.telegramTasks));

  try {
    enforceCaptureImageStorageLimit("scheduled-batch-complete");
  } catch (error) {
    scannerRuntime.lastError = error.message || "Failed to maintain screenshot image storage";
  }
}

function markBatchStopped(batchId) {
  if (!batchId || scannerRuntime.currentBatch?.id !== batchId) {
    return;
  }

  const finishedAt = nowIso();

  scannerRuntime.currentBatch = {
    ...scannerRuntime.currentBatch,
    status: "stopped",
    finishedAt,
  };
  scannerRuntime.lastScanFinishedAt = finishedAt;
}

function finishScheduleBatchIfComplete(batchId) {
  if (!batchId || scannerRuntime.currentBatch?.id !== batchId) {
    return;
  }

  const hasQueuedBatchJobs = scannerRuntime.queue.some((job) => job.batchId === batchId);
  const activeBatchJob = getActiveJobs().some((job) => job.batchId === batchId);

  if (hasQueuedBatchJobs || activeBatchJob) {
    return;
  }

  if (scannerRuntime.currentBatch.retryPhase === "pending") {
    if (queueRetryJobsForBatch(scannerRuntime.currentBatch)) {
      return;
    }

    scannerRuntime.currentBatch = {
      ...scannerRuntime.currentBatch,
      retryPhase: "completed",
    };
  } else if (scannerRuntime.currentBatch.retryPhase === "running") {
    scannerRuntime.currentBatch = {
      ...scannerRuntime.currentBatch,
      retryPhase: "completed",
    };
  }

  const finishedAt = new Date();
  const stateSchedule = getScheduleFromState();
  const delayMinutes = normalizeDelayMinutes(stateSchedule.delayMinutes || 60);
  const completedScanCount = Number(stateSchedule.completedScanCount || 0) + 1;
  const completedBatch = {
    ...scannerRuntime.currentBatch,
    status: "completed",
    finishedAt: finishedAt.toISOString(),
    errors: Array.isArray(scannerRuntime.currentBatch.errors) ? scannerRuntime.currentBatch.errors : [],
  };

  updateState((state) => {
    state.schedule = {
      ...(state.schedule || {}),
      delayMinutes,
      lastRunAt: finishedAt.toISOString(),
      nextRunAt: state.schedule?.enabled ? addMinutes(finishedAt, delayMinutes).toISOString() : null,
      completedScanCount,
    };
    return state;
  });

  scannerRuntime.currentBatch = completedBatch;
  scannerRuntime.lastScanFinishedAt = finishedAt.toISOString();
  closeBatchBrowser(batchId);

  void runCompletedBatchMaintenance(completedBatch);
}

function canStartQueuedJob(job) {
  const activeJobs = getActiveJobs();
  const activeBatch = scannerRuntime.currentBatch;
  const isActiveBatch = activeBatch && ACTIVE_BATCH_STATUSES.has(activeBatch.status);

  if (isActiveBatch && (job.source !== "schedule" || job.batchId !== activeBatch.id)) {
    return false;
  }

  if (!activeJobs.length) {
    return true;
  }

  if (job.source !== "schedule" || !job.batchId) {
    return false;
  }

  if (job.phase === RETRY_JOB_PHASE) {
    return false;
  }

  const schedule = getScheduleFromState();
  const parallelLimit = normalizeParallelCaptures(schedule.parallelCaptures || 1);
  const activeScheduleBatch = activeJobs.every((activeJob) => (
    activeJob.source === "schedule" && activeJob.batchId === job.batchId
  ));

  return activeScheduleBatch && activeJobs.length < parallelLimit;
}

async function runQueuedJob(job) {
  const abortController = new AbortController();
  const jobDeadline = createJobDeadline(job, abortController);
  const runningJob = {
    ...job,
    status: "scanning",
    startedAt: nowIso(),
    timeoutAt: new Date(Date.now() + jobDeadline.timeoutMs).toISOString(),
  };

  scannerRuntime.activeJobs.set(job.id, runningJob);
  scannerRuntime.activeAbortControllers.set(job.id, abortController);
  syncPrimaryActiveJob();
  scannerRuntime.lastScanStartedAt = runningJob.startedAt;
  scannerRuntime.lastError = "";

  if (job.batchId && scannerRuntime.currentBatch?.id === job.batchId && !scannerRuntime.currentBatch.startedAt) {
    scannerRuntime.currentBatch = {
      ...scannerRuntime.currentBatch,
      status: "running",
      startedAt: runningJob.startedAt,
    };
  }

  let completedJob = runningJob;

  try {
    const capture = await Promise.race([
      (async () => {
        const sharedBrowser = job.source === "schedule" && job.batchId
          ? await getBatchBrowserPromise(job.batchId)
          : null;

        return captureAssignedSite(job.siteId, {
          signal: abortController.signal,
          source: job.source,
          batchId: job.batchId,
          browser: sharedBrowser,
        });
      })(),
      jobDeadline.promise,
    ]);

    completedJob = {
      ...runningJob,
      status: capture.status === "success" ? "completed" : "failed",
      finishedAt: nowIso(),
      error: capture.error || "",
      capture,
    };

    if (capture.status === "failed") {
      scannerRuntime.lastError = capture.error || "Screenshot capture failed";
    }
  } catch (error) {
    const timedOut = jobDeadline.timedOut || error?.code === "SCREENSHOT_JOB_TIMEOUT";
    const stoppedBySchedule =
      !timedOut && (
        isCaptureAbortError(error) ||
        (
          job.source === "schedule" &&
          scannerRuntime.cancelledBatchIds.has(job.batchId)
        )
      );
    const failureMessage = timedOut
      ? createJobTimeoutError(job, jobDeadline.timeoutMs).message
      : error.message || "Screenshot capture failed";

    completedJob = {
      ...runningJob,
      status: stoppedBySchedule ? "stopped" : "failed",
      finishedAt: nowIso(),
      error: stoppedBySchedule ? "Stopped by schedule" : failureMessage,
    };

    if (!stoppedBySchedule) {
      scannerRuntime.lastError = completedJob.error;
    }
  } finally {
    jobDeadline.cleanup();

    const stoppedScheduleBatch =
      completedJob?.source === "schedule" &&
      completedJob?.batchId &&
      scannerRuntime.cancelledBatchIds.has(completedJob.batchId);
    const shouldNotifyTelegram =
      completedJob?.source === "schedule" &&
      ["completed", "failed"].includes(completedJob.status) &&
      !stoppedScheduleBatch;
    const notificationCapture = {
      ...(completedJob.capture || {
        id: "",
        status: "failed",
        capturedAt: completedJob.finishedAt || nowIso(),
        error: completedJob.error || "Screenshot capture failed",
      }),
      batchIndex: Number(completedJob.batchIndex || 0),
      batchTotal: Number(completedJob.batchTotal || scannerRuntime.currentBatch?.totalCount || 0),
    };
    const hasCaptureError = isScheduledCaptureError(notificationCapture);
    const effectiveFailed = completedJob.status === "failed" || hasCaptureError;
    const isRetryJob = completedJob.phase === RETRY_JOB_PHASE;

    if (shouldNotifyTelegram) {
      // Telegram sending should not block the next scheduled website capture.
      trackTelegramTask(sendScheduledCaptureNotification(completedJob, notificationCapture));
    }

    if (completedJob?.batchId && scannerRuntime.currentBatch?.id === completedJob.batchId) {
      if (stoppedScheduleBatch || completedJob.status === "stopped" || scannerRuntime.currentBatch?.status === "stopping") {
        markBatchStopped(completedJob.batchId);
      } else {
        const existingErrors = Array.isArray(scannerRuntime.currentBatch.errors)
          ? scannerRuntime.currentBatch.errors
          : [];
        let nextErrors = existingErrors;
        const nextPatch = {};

        if (isRetryJob) {
          nextPatch.retriedCount = Math.min(
            (scannerRuntime.currentBatch.retriedCount || 0) + 1,
            scannerRuntime.currentBatch.retryCount || 0
          );
          nextPatch.retryFailedCount = effectiveFailed
            ? (scannerRuntime.currentBatch.retryFailedCount || 0) + 1
            : scannerRuntime.currentBatch.retryFailedCount || 0;
          nextErrors = effectiveFailed
            ? upsertBatchError(existingErrors, buildBatchErrorItem(completedJob, notificationCapture))
            : removeBatchError(existingErrors, completedJob.siteId);
        } else {
          nextPatch.completedCount = Math.min(
            (scannerRuntime.currentBatch.completedCount || 0) + 1,
            scannerRuntime.currentBatch.totalCount || 0
          );
          nextPatch.failedCount = effectiveFailed
            ? (scannerRuntime.currentBatch.failedCount || 0) + 1
            : scannerRuntime.currentBatch.failedCount || 0;

          if (effectiveFailed) {
            nextErrors = upsertBatchError(existingErrors, buildBatchErrorItem(completedJob, notificationCapture));
            nextPatch.retryCandidates = upsertRetryCandidate(
              scannerRuntime.currentBatch.retryCandidates || [],
              completedJob,
              notificationCapture
            );
          }
        }

        scannerRuntime.currentBatch = {
          ...scannerRuntime.currentBatch,
          ...nextPatch,
          errors: nextErrors,
        };
      }
    }

    scannerRuntime.activeJobs.delete(job.id);
    scannerRuntime.activeAbortControllers.delete(job.id);
    syncPrimaryActiveJob();

    if (!stoppedScheduleBatch) {
      finishScheduleBatchIfComplete(completedJob?.batchId);
    }

    if (stoppedScheduleBatch && !getActiveJobs().some((activeJob) => activeJob.batchId === completedJob.batchId)) {
      scannerRuntime.cancelledBatchIds.delete(completedJob.batchId);
      closeBatchBrowser(completedJob.batchId);
    }

    if (scannerRuntime.queue.length) {
      setImmediate(() => {
        void processQueue();
      });
    }
  }
}

async function processQueue() {
  if (scannerRuntime.processing || !scannerRuntime.queue.length) {
    return;
  }

  scannerRuntime.processing = true;

  try {
    while (scannerRuntime.queue.length) {
      const nextJobIndex = scannerRuntime.queue.findIndex((job) => canStartQueuedJob(job));

      if (nextJobIndex < 0) {
        break;
      }

      const [job] = scannerRuntime.queue.splice(nextJobIndex, 1);
      void runQueuedJob(job);
    }
  } finally {
    scannerRuntime.processing = false;
  }
}

function removeQueuedJobsForSite(siteId) {
  const removedJobs = scannerRuntime.queue.filter((job) => job.siteId === siteId);
  scannerRuntime.queue = scannerRuntime.queue.filter((job) => job.siteId !== siteId);

  removedJobs.forEach((job) => {
    if (job.source === "schedule" && scannerRuntime.currentBatch?.id === job.batchId) {
      scannerRuntime.currentBatch = {
        ...scannerRuntime.currentBatch,
        totalCount: Math.max(
          scannerRuntime.currentBatch.completedCount || 0,
          (scannerRuntime.currentBatch.totalCount || 0) - 1
        ),
      };
    }
  });
}

function queueCaptureSite(siteId, options = {}) {
  const site = getAssignedSite(siteId);

  if (!site) {
    const error = new Error("Screenshot site not found");
    error.statusCode = 404;
    throw error;
  }

  const activeJob = getActiveJobs().find((job) => job.siteId === siteId);

  if (activeJob) {
    return serializeJob(activeJob);
  }

  removeQueuedJobsForSite(siteId);

  const job = createJob(site, options.source || "manual", options.batchId || "");

  if (options.priority) {
    scannerRuntime.queue.unshift(job);
  } else {
    scannerRuntime.queue.push(job);
  }

  setImmediate(() => {
    void processQueue();
  });

  return serializeJob(job);
}

function queueScheduleScan() {
  if (scannerRuntime.currentBatch && ACTIVE_BATCH_STATUSES.has(scannerRuntime.currentBatch.status)) {
    return scannerRuntime.currentBatch;
  }

  const sites = getAssignedSites();
  const batchId = crypto.randomUUID();
  const queuedAt = nowIso();
  const stateSchedule = getScheduleFromState();
  const parallelCaptures = normalizeParallelCaptures(stateSchedule.parallelCaptures || 2);
  const cycleNumber = Number(stateSchedule.completedScanCount || 0) + 1;

  resetTelegramMessageSequence();
  scannerRuntime.queue = scannerRuntime.queue.filter((job) => job.source !== "schedule");
  scannerRuntime.currentBatch = {
    id: batchId,
    source: "schedule",
    status: sites.length ? "queued" : "completed",
    cycleNumber,
    totalCount: sites.length,
    completedCount: 0,
    failedCount: 0,
    parallelCaptures,
    retryPhase: "pending",
    retryCount: 0,
    retriedCount: 0,
    retryFailedCount: 0,
    retryCandidates: [],
    errors: [],
    queuedAt,
    startedAt: null,
    finishedAt: sites.length ? null : queuedAt,
  };

  sites.forEach((site, index) => {
    scannerRuntime.queue.push(createJob(site, "schedule", batchId, {
      batchIndex: index + 1,
      batchTotal: sites.length,
    }));
  });

  trackTelegramTask(sendScheduledBatchStartedNotification(scannerRuntime.currentBatch));

  if (!sites.length) {
    const finishedAt = new Date();
    const delayMinutes = normalizeDelayMinutes(stateSchedule.delayMinutes || 60);

    updateState((state) => {
      state.schedule = {
        ...(state.schedule || {}),
        delayMinutes,
        lastRunAt: finishedAt.toISOString(),
        nextRunAt: state.schedule?.enabled ? addMinutes(finishedAt, delayMinutes).toISOString() : null,
      };
      return state;
    });
  }

  setImmediate(() => {
    void processQueue();
  });

  return scannerRuntime.currentBatch;
}

function clearQueuedScheduleJobs() {
  scannerRuntime.queue = scannerRuntime.queue.filter((job) => job.source !== "schedule");

  if (scannerRuntime.currentBatch && ACTIVE_BATCH_STATUSES.has(scannerRuntime.currentBatch.status)) {
    const batchId = scannerRuntime.currentBatch.id;
    const activeScheduleJobs = getActiveJobs().filter((job) => (
      job.source === "schedule" && job.batchId === batchId
    ));
    const hasActiveScheduleJob = activeScheduleJobs.length > 0;

    scannerRuntime.cancelledBatchIds.add(batchId);

    scannerRuntime.currentBatch = {
      ...scannerRuntime.currentBatch,
      status: hasActiveScheduleJob ? "stopping" : "stopped",
      finishedAt: hasActiveScheduleJob ? null : nowIso(),
    };

    if (!hasActiveScheduleJob) {
      scannerRuntime.lastScanFinishedAt = scannerRuntime.currentBatch.finishedAt;
      scannerRuntime.cancelledBatchIds.delete(batchId);
      closeBatchBrowser(batchId);
      return;
    }

    activeScheduleJobs.forEach((job) => {
      const abortController = scannerRuntime.activeAbortControllers.get(job.id);

      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
      }
    });
  }
}

function isDue(schedule) {
  if (!schedule.nextRunAt) {
    return true;
  }

  const nextRunAt = new Date(schedule.nextRunAt);

  if (Number.isNaN(nextRunAt.getTime())) {
    return true;
  }

  return Date.now() >= nextRunAt.getTime();
}

async function runSchedulerTick() {
  if (schedulerTickRunning) {
    return;
  }

  const state = readState();
  const schedule = state.schedule || {};

  if (!schedule.enabled || !isDue(schedule)) {
    return;
  }

  schedulerTickRunning = true;

  try {
    queueScheduleScan();
  } finally {
    schedulerTickRunning = false;
  }
}

function startScreenshotScheduler() {
  if (schedulerTimer) {
    return;
  }

  schedulerTimer = setInterval(() => {
    void runSchedulerTick();
  }, 15000);
}

function getSchedule() {
  return sanitizeSchedule(readState().schedule);
}

function getScannerStatus() {
  const schedule = getScheduleFromState();
  const activeJobs = getActiveJobs().map(serializeJob);
  const activeJob = activeJobs[0] || null;
  const queue = scannerRuntime.queue.map(serializeJob);

  return {
    running: Boolean(activeJobs.length),
    activeJob,
    activeJobs,
    queue,
    queuedCount: queue.length,
    activeSiteId: activeJob?.siteId || "",
    activeSiteIds: activeJobs.map((job) => job.siteId),
    queuedSiteIds: queue.map((job) => job.siteId),
    currentBatch: scannerRuntime.currentBatch,
    lastScanStartedAt: scannerRuntime.lastScanStartedAt,
    lastScanFinishedAt: scannerRuntime.lastScanFinishedAt,
    lastError: scannerRuntime.lastError,
    schedule: sanitizeSchedule(schedule),
    serverNow: nowIso(),
  };
}

function updateSchedule(payload = {}, options = {}) {
  const enabled = Boolean(payload.enabled);
  const delayMinutes = normalizeDelayMinutes(payload.delayMinutes || 60);
  const parallelCaptures = normalizeParallelCaptures(payload.parallelCaptures || 2);
  const updatedAt = new Date();
  const currentSchedule = getScheduleFromState();
  const telegram = options.canManageTelegram
    ? normalizeTelegramConfig(payload.telegram, currentSchedule.telegram)
    : normalizeTelegramConfig(undefined, currentSchedule.telegram);

  let savedSchedule;

  updateState((state) => {
    state.schedule = {
      ...(state.schedule || {}),
      enabled,
      delayMinutes,
      parallelCaptures,
      telegram,
      updatedAt: updatedAt.toISOString(),
      nextRunAt: enabled ? updatedAt.toISOString() : null,
    };
    savedSchedule = state.schedule;
    return state;
  });

  if (enabled) {
    setImmediate(() => {
      void runSchedulerTick();
    });
  } else {
    clearQueuedScheduleJobs();
  }

  return sanitizeSchedule(savedSchedule);
}

module.exports = {
  getSchedule,
  getScannerStatus,
  queueCaptureSite,
  queueScheduleScan,
  startScreenshotScheduler,
  updateSchedule,
};
