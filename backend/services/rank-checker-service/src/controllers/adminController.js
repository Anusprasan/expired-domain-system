const mongoose = require('mongoose');
const SerpRun = require('../models/SerpRun');
const { DomainActivityLog, DOMAIN_ACTIVITY_ACTIONS } = require('../models/DomainActivityLog');
const { BackupRun } = require('../models/BackupRun');
const { attachBrands } = require('../services/systemBrandService');
const { ensureSettings, getSanitizedSettings } = require('../services/adminSettingsService');
const {
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  minutesToHours,
  hoursToMinutes,
  isAllowedIntervalMinutes,
  getNextScheduledAt,
  getScheduledSlotStartAt,
  getScheduleWindowSlots,
} = require('../services/scheduleTimeService');
const {
  parseWibTime,
  normalizeChatIds,
  VALID_BACKUP_FORMATS,
  VALID_BACKUP_FREQUENCIES,
  getBackupIntervalDays,
  getNextBackupAtFromNow,
  getTelegramTokenFromSettings,
  testTelegramTargets,
} = require('../services/backupService');
const {
  loadSerperAvailability,
  assertSerperAvailability,
} = require('../services/serperAvailabilityService');
const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const notifyAdminUpdate = (req, payload = {}) => req.app.locals.emitAdminUpdate?.(payload);
const SCHEDULE_WINDOW_PREVIOUS_SLOTS = 2;
const SCHEDULE_WINDOW_NEXT_SLOTS = 12;
const AUTO_CHECK_RUN_LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const getLogLimit = (queryLimit) => {
  const limitRaw = Number(queryLimit);
  return Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 100;
};
const parseDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const getTimeDistanceMs = (left, right) => Math.abs(left.getTime() - right.getTime());
const mapAutoCheckResultRow = (row) => ({
  rank: row.rank,
  title: row.title,
  snippet: row.snippet,
  link: row.link,
  domainHost: row.domainHost,
  badge: row.badge,
  matchType: row.matchType,
  matchedBrand: row.matchedBrand || null,
  matchedDomain: row.matchedDomain || null,
});
const mapAutoCheckScan = (run) => {
  const results = Array.isArray(run?.results) ? run.results.map(mapAutoCheckResultRow) : [];
  const ownResultCount = results.filter((item) => item.badge === 'OWN').length;

  return {
    _id: run._id,
    brand: run.brand || null,
    query: run.query,
    trigger: run.trigger,
    checkedAt: run.checkedAt,
    params: run.params || null,
    ownCount: Number(run.ownCount) || 0,
    unknownCount: Number(run.unknownCount) || 0,
    bestOwnRank: run.bestOwnRank ?? null,
    resultCount: results.length,
    ownResultCount,
    results,
  };
};
const getAutoCheckLogMissingReason = (log, run) => {
  if (run) return null;
  if (log?.action !== DOMAIN_ACTIVITY_ACTIONS.AUTO_CHECK) {
    return 'lifecycle-event';
  }
  if (log?.metadata?.ok === false) {
    return 'run-failed-before-save';
  }
  return 'saved-scan-missing';
};
const syncMatchedAutoCheckLogMetadata = async (log, run) => {
  if (!log?._id || !run?._id) {
    return;
  }

  const nextMetadata = {};
  if (!log?.metadata?.serpRunId) {
    nextMetadata['metadata.serpRunId'] = String(run._id);
  }
  if (!log?.metadata?.checkedAt && run?.checkedAt) {
    nextMetadata['metadata.checkedAt'] = run.checkedAt;
  }

  if (!Object.keys(nextMetadata).length) {
    return;
  }

  await DomainActivityLog.updateOne({ _id: log._id }, { $set: nextMetadata });
};
const findMatchingAutoCheckRun = async (log) => {
  if (!log?.brand) {
    return { run: null, matchedBy: null };
  }

  const serpRunId = String(log?.metadata?.serpRunId || '').trim();
  if (serpRunId && mongoose.Types.ObjectId.isValid(serpRunId)) {
    const runById = await SerpRun.findById(serpRunId).lean();
    if (runById) {
      return { run: runById, matchedBy: 'serpRunId' };
    }
  }

  const checkedAt = parseDateOrNull(log?.metadata?.checkedAt);
  if (checkedAt) {
    const runByCheckedAt = await SerpRun.findOne({
      brand: log.brand,
      trigger: 'auto',
      checkedAt,
    }).lean();
    if (runByCheckedAt) {
      return { run: runByCheckedAt, matchedBy: 'checkedAt' };
    }
  }

  const referenceTime = checkedAt || parseDateOrNull(log?.createdAt);
  if (!referenceTime) {
    return { run: null, matchedBy: null };
  }

  const rangeStart = new Date(referenceTime.getTime() - AUTO_CHECK_RUN_LOOKUP_WINDOW_MS);
  const rangeEnd = new Date(referenceTime.getTime() + AUTO_CHECK_RUN_LOOKUP_WINDOW_MS);
  const candidateRuns = await SerpRun.find({
    brand: log.brand,
    trigger: 'auto',
    checkedAt: {
      $gte: rangeStart,
      $lte: rangeEnd,
    },
  })
    .sort({ checkedAt: -1 })
    .limit(12)
    .lean();

  if (!candidateRuns.length) {
    return { run: null, matchedBy: null };
  }

  const closestRun = candidateRuns.reduce((best, current) => {
    if (!best) return current;
    return getTimeDistanceMs(new Date(current.checkedAt), referenceTime) <
      getTimeDistanceMs(new Date(best.checkedAt), referenceTime)
      ? current
      : best;
  }, null);

  return {
    run: closestRun,
    matchedBy: closestRun ? 'closestCheckedAt' : null,
  };
};
const buildAutoCheckSlotStatuses = ({ logs, intervalMinutes }) => {
  const slotMs = Math.max(1, intervalMinutes) * 60 * 1000;
  const bySlot = new Map();

  logs.forEach((item) => {
    const createdAt = item?.createdAt ? new Date(item.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return;

    const slotStartMs = Math.floor(createdAt.getTime() / slotMs) * slotMs;
    const slotKey = String(slotStartMs);
    const existing = bySlot.get(slotKey) || { slotAt: new Date(slotStartMs), okCount: 0, failCount: 0 };

    if (item?.metadata?.ok === false) {
      existing.failCount += 1;
    } else {
      existing.okCount += 1;
    }

    bySlot.set(slotKey, existing);
  });

  return Array.from(bySlot.values())
    .map((item) => ({
      slotAt: item.slotAt,
      status: item.failCount > 0 ? 'Failure' : 'Success',
      okCount: item.okCount,
      failCount: item.failCount,
    }))
    .sort((a, b) => new Date(a.slotAt) - new Date(b.slotAt));
};

const buildAutoCheckScheduleWindow = ({
  now,
  intervalMinutes,
  autoCheckEnabled,
  nextAutoCheckAt,
  schedulerStatus,
  slotStatuses,
}) => {
  const currentSlotAt = getScheduledSlotStartAt(now, intervalMinutes);
  const nextSlotAt = nextAutoCheckAt ? getScheduledSlotStartAt(nextAutoCheckAt, intervalMinutes) : null;
  const runningSlotAt = schedulerStatus?.isRunning
    ? getScheduledSlotStartAt(schedulerStatus.lastRunStartedAt || now, intervalMinutes)
    : null;
  const slotStatusMap = new Map(
    (slotStatuses || []).map((item) => [String(new Date(item.slotAt).getTime()), item.status])
  );

  return getScheduleWindowSlots({
    nowInput: now,
    intervalMinutesInput: intervalMinutes,
    previousSlots: SCHEDULE_WINDOW_PREVIOUS_SLOTS,
    nextSlots: SCHEDULE_WINDOW_NEXT_SLOTS,
  }).map((slotAt) => {
    const slotTime = new Date(slotAt);
    const slotKey = String(slotTime.getTime());
    const currentSlotTime = currentSlotAt.getTime();
    const runningSlotTime = runningSlotAt?.getTime?.() || null;
    const nextSlotTime = nextSlotAt?.getTime?.() || null;
    let status = slotStatusMap.get(slotKey) || null;

    if (!status) {
      if (runningSlotTime !== null && slotTime.getTime() === runningSlotTime) {
        status = 'Running';
      } else if ((!autoCheckEnabled || schedulerStatus?.stopRequested) && slotTime.getTime() >= currentSlotTime) {
        status = 'Stopped';
      } else if (nextSlotTime !== null && slotTime.getTime() === nextSlotTime) {
        status = 'Next';
      } else if (autoCheckEnabled && slotTime.getTime() > currentSlotTime) {
        status = 'Scheduled';
      } else if (autoCheckEnabled && slotTime.getTime() <= currentSlotTime) {
        status = 'Pending';
      } else {
        status = 'Pending';
      }
    }

    return {
      slotAt: slotTime,
      status,
    };
  });
};

const getAdminSettings = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    return res.json(getSanitizedSettings(settings));
  } catch (error) {
    return next(error);
  }
};

const getAutoCheckStatus = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const scheduler = req.app.locals.autoCheckScheduler;
    if (!scheduler) {
      return res.status(500).json({ error: 'Auto check scheduler unavailable' });
    }

    const sanitizedSettings = getSanitizedSettings(settings);
    const now = new Date();
    const intervalMinutes = hoursToMinutes(settings.checkIntervalHours || 1);
    const scheduleWindowSlots = getScheduleWindowSlots({
      nowInput: now,
      intervalMinutesInput: intervalMinutes,
      previousSlots: SCHEDULE_WINDOW_PREVIOUS_SLOTS,
      nextSlots: SCHEDULE_WINDOW_NEXT_SLOTS,
    });
    const scheduleWindowStart = scheduleWindowSlots[0] || getScheduledSlotStartAt(now, intervalMinutes);
    const autoCheckLogs = await DomainActivityLog.find({
      action: DOMAIN_ACTIVITY_ACTIONS.AUTO_CHECK,
      createdAt: { $gte: scheduleWindowStart },
    })
      .select('createdAt metadata.ok')
      .sort({ createdAt: -1 })
      .limit(500);
    const schedulerStatus = scheduler.getStatus();
    const autoCheckSlotStatuses = buildAutoCheckSlotStatuses({
      logs: autoCheckLogs,
      intervalMinutes,
    });
    const serperAvailability = await loadSerperAvailability({
      monthlyLimit: req.app.locals.serperMonthlyLimit,
    });

    return res.json({
      settings: {
        autoCheckEnabled: sanitizedSettings.autoCheckEnabled,
        checkIntervalHours: sanitizedSettings.checkIntervalHours,
        checkIntervalMinutes: sanitizedSettings.checkIntervalMinutes,
        lastAutoCheckAt: sanitizedSettings.lastAutoCheckAt,
        nextAutoCheckAt: sanitizedSettings.nextAutoCheckAt,
      },
      schedulerStatus,
      serperAvailability,
      scheduleWindow: buildAutoCheckScheduleWindow({
        now,
        intervalMinutes,
        autoCheckEnabled: sanitizedSettings.autoCheckEnabled,
        nextAutoCheckAt: sanitizedSettings.nextAutoCheckAt,
        schedulerStatus,
        slotStatuses: autoCheckSlotStatuses,
      }),
    });
  } catch (error) {
    return next(error);
  }
};

const updateSchedule = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const scheduler = req.app.locals.autoCheckScheduler;
    const enabled = req.body.autoCheckEnabled;
    const hasIntervalHours = Object.prototype.hasOwnProperty.call(req.body || {}, 'checkIntervalHours');
    const hasIntervalMinutes = Object.prototype.hasOwnProperty.call(req.body || {}, 'checkIntervalMinutes');
    const intervalHours = hasIntervalHours ? toNumber(req.body.checkIntervalHours) : null;
    const intervalMinutes = hasIntervalMinutes ? toNumber(req.body.checkIntervalMinutes) : null;

    if (hasIntervalHours && intervalHours === null) {
      return res.status(400).json({
        error: 'checkIntervalHours must be a valid number',
      });
    }

    if (hasIntervalMinutes && intervalMinutes === null) {
      return res.status(400).json({
        error: 'checkIntervalMinutes must be a valid number',
      });
    }

    const currentIntervalMinutes = hoursToMinutes(settings.checkIntervalHours || 1);
    const intervalProvided = hasIntervalMinutes || hasIntervalHours;
    const effectiveIntervalMinutes =
      intervalMinutes !== null
        ? intervalMinutes
        : intervalHours !== null
          ? hoursToMinutes(intervalHours)
          : currentIntervalMinutes;
    const intervalChanged = intervalProvided && effectiveIntervalMinutes !== currentIntervalMinutes;

    // Time changes require restarting auto-check (stop then run) to take effect.
    if (intervalChanged && settings.autoCheckEnabled && enabled !== false) {
      return res.status(409).json({
        error: 'Stop auto check and run again to apply time change',
      });
    }

    let shouldStartImmediately = false;
    if (typeof enabled === 'boolean') {
      const wasEnabled = settings.autoCheckEnabled;
      if (enabled) {
        await assertSerperAvailability({
          monthlyLimit: req.app.locals.serperMonthlyLimit,
        });
      }
      settings.autoCheckEnabled = enabled;
      if (enabled) {
        settings.nextAutoCheckAt = getNextScheduledAt(new Date(), hoursToMinutes(settings.checkIntervalHours));
        settings.autoCheckStartedBy = req.user?._id || settings.autoCheckStartedBy || null;
        shouldStartImmediately = !wasEnabled;
      }
      if (!wasEnabled && enabled) {
        await DomainActivityLog.create({
          action: DOMAIN_ACTIVITY_ACTIONS.AUTO_START,
          domain: 'AUTO-CHECK',
          domainHostKey: 'auto-check',
          note: `Auto-check started (${hoursToMinutes(settings.checkIntervalHours)} min interval)`,
          actor: req.user?._id || null,
          metadata: {
            intervalMinutes: hoursToMinutes(settings.checkIntervalHours),
            nextAutoCheckAt: settings.nextAutoCheckAt,
          },
        });
      }
      if (!enabled) {
        settings.nextAutoCheckAt = null;
        settings.autoCheckStartedBy = null;
      }
    }

    if (intervalChanged) {
      if (effectiveIntervalMinutes < MIN_INTERVAL_MINUTES || effectiveIntervalMinutes > MAX_INTERVAL_MINUTES) {
        return res.status(400).json({
          error: `checkIntervalMinutes must be between ${MIN_INTERVAL_MINUTES} and ${MAX_INTERVAL_MINUTES}`,
        });
      }
      if (!isAllowedIntervalMinutes(effectiveIntervalMinutes)) {
        return res.status(400).json({
          error: 'checkIntervalMinutes must be one of: 15, 30, 60',
        });
      }

      settings.checkIntervalHours = minutesToHours(effectiveIntervalMinutes);
      if (settings.autoCheckEnabled) {
        settings.nextAutoCheckAt = getNextScheduledAt(new Date(), effectiveIntervalMinutes);
      }
    }

    await settings.save();
    notifyAdminUpdate(req, { source: 'schedule-update' });

    if (shouldStartImmediately && scheduler && !scheduler.getStatus()?.isRunning) {
      try {
        await scheduler.runNowDetached({ source: 'scheduler' });
      } catch (schedulerError) {
        if (schedulerError?.statusCode !== 409) {
          console.error('Failed to start immediate auto-check run:', schedulerError.message);
        }
      }
    }

    return res.json(getSanitizedSettings(settings));
  } catch (error) {
    return next(error);
  }
};

const addApiKey = async (req, res, next) => {
  try {
    const { name, key, isActive } = req.body;
    if (!name?.trim() || !key?.trim()) {
      return res.status(400).json({ error: 'name and key are required' });
    }

    const settings = await ensureSettings();
    settings.serpApiKeys.push({
      name: name.trim(),
      key: key.trim(),
      isActive: typeof isActive === 'boolean' ? isActive : true,
    });

    await settings.save();
    notifyAdminUpdate(req, { source: 'api-key-add' });
    return res.status(201).json(getSanitizedSettings(settings));
  } catch (error) {
    return next(error);
  }
};

const updateApiKey = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const item = settings.serpApiKeys.id(req.params.keyId);
    if (!item) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const { name, key, isActive } = req.body;
    if (typeof name === 'string' && name.trim()) {
      item.name = name.trim();
    }
    if (typeof key === 'string' && key.trim()) {
      item.key = key.trim();
      item.lastError = '';
      item.lastErrorCode = '';
      item.lastErrorAt = null;
      item.exhaustedAt = null;
      item.lastKnownRemaining = null;
    }
    if (typeof isActive === 'boolean') {
      item.isActive = isActive;
      if (isActive) {
        item.lastError = '';
        item.lastErrorCode = '';
        item.lastErrorAt = null;
        item.exhaustedAt = null;
      }
    }

    await settings.save();
    notifyAdminUpdate(req, { source: 'api-key-update' });
    return res.json(getSanitizedSettings(settings));
  } catch (error) {
    return next(error);
  }
};

const deleteApiKey = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const item = settings.serpApiKeys.id(req.params.keyId);
    if (!item) {
      return res.status(404).json({ error: 'API key not found' });
    }

    item.deleteOne();
    await settings.save();
    notifyAdminUpdate(req, { source: 'api-key-delete' });

    return res.json(getSanitizedSettings(settings));
  } catch (error) {
    return next(error);
  }
};

const addGoogleRankApiKey = async (req, res, next) => {
  try {
    const { name, key, isActive } = req.body;
    if (!name?.trim() || !key?.trim()) {
      return res.status(400).json({ error: 'name and key are required' });
    }

    const settings = await ensureSettings();
    settings.googleRankApiKeys.push({
      name: name.trim(),
      key: key.trim(),
      isActive: typeof isActive === 'boolean' ? isActive : true,
      deactivatedByLimit: false,
      usageMonthKey: getCurrentMonthKey(),
      totalRequests: 0,
      exhaustedAt: null,
    });

    await settings.save();
    notifyAdminUpdate(req, { source: 'google-rank-key-add' });
    return res.status(201).json(getSanitizedSettings(settings));
  } catch (error) {
    return next(error);
  }
};

const updateGoogleRankApiKey = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const item = settings.googleRankApiKeys.id(req.params.keyId);
    if (!item) {
      return res.status(404).json({ error: 'Google Rank API key not found' });
    }

    const { name, key, isActive } = req.body;
    if (typeof name === 'string' && name.trim()) {
      item.name = name.trim();
    }
    if (typeof key === 'string' && key.trim()) {
      item.key = key.trim();
      item.deactivatedByLimit = false;
      item.usageMonthKey = getCurrentMonthKey();
      item.totalRequests = 0;
      item.exhaustedAt = null;
      item.lastError = '';
      item.lastErrorCode = '';
      item.lastErrorAt = null;
    }
    if (typeof isActive === 'boolean') {
      item.isActive = isActive;
      if (isActive) {
        item.deactivatedByLimit = false;
        item.exhaustedAt = null;
        item.lastError = '';
        item.lastErrorCode = '';
        item.lastErrorAt = null;
      }
    }

    await settings.save();
    notifyAdminUpdate(req, { source: 'google-rank-key-update' });
    return res.json(getSanitizedSettings(settings));
  } catch (error) {
    return next(error);
  }
};

const deleteGoogleRankApiKey = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const item = settings.googleRankApiKeys.id(req.params.keyId);
    if (!item) {
      return res.status(404).json({ error: 'Google Rank API key not found' });
    }

    item.deleteOne();
    await settings.save();
    notifyAdminUpdate(req, { source: 'google-rank-key-delete' });

    return res.json(getSanitizedSettings(settings));
  } catch (error) {
    return next(error);
  }
};

const getAdminDashboard = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyLimit = Number(req.app.locals.serperMonthlyLimit) || 2500;
    const serperAvailability = await loadSerperAvailability({ monthlyLimit });

    const recentRuns = await attachBrands(await SerpRun.find({}).sort({ checkedAt: -1 }).limit(20).lean());
    const lastRun = recentRuns[0] || null;
    const keyUsageRowsLifetime = await SerpRun.aggregate([
      {
        $match: {
          $or: [{ keyId: { $ne: null } }, { keyName: { $exists: true, $ne: '' } }],
        },
      },
      {
        $group: {
          _id: {
            keyId: '$keyId',
            keyName: '$keyName',
          },
          total: { $sum: 1 },
        },
      },
    ]);
    const keyUsageRowsMonth = await SerpRun.aggregate([
      {
        $match: {
          checkedAt: { $gte: monthStart },
          $or: [{ keyId: { $ne: null } }, { keyName: { $exists: true, $ne: '' } }],
        },
      },
      {
        $group: {
          _id: {
            keyId: '$keyId',
            keyName: '$keyName',
          },
          total: { $sum: 1 },
        },
      },
    ]);

    const getCountFromRows = (rows, key) => {
      const byId = rows.find((row) => row._id?.keyId && row._id.keyId.toString() === key._id.toString());
      if (byId) return byId.total || 0;

      const byName = rows.find((row) => row._id?.keyName && row._id.keyName === key.name);
      return byName?.total || 0;
    };

    const tokenSummary = await Promise.all(
      (settings.serpApiKeys || []).map(async (item) => {
        const trackedRequests = Math.max(0, Number(item.totalRequests) || 0);
        const totalRequestsMonth = getCountFromRows(keyUsageRowsMonth, item);
        const totalRequestsLifetime = getCountFromRows(keyUsageRowsLifetime, item);
        const remainingDisplay = Math.max(monthlyLimit - trackedRequests, 0);

        return {
          _id: item._id,
          name: item.name,
          isActive: item.isActive,
          monthlyLimit,
          totalRequests: trackedRequests,
          totalRequestsLifetime,
          remainingEstimated: remainingDisplay,
          remainingReported: null,
          remainingDisplay,
          baselineRemaining: item.baselineRemaining,
          baselineCapturedAt: item.baselineCapturedAt,
          exhaustedAt: item.exhaustedAt,
          lastUsedAt: item.lastUsedAt,
          lastError: item.lastError,
        };
      })
    );

    const activeKeys = (settings.serpApiKeys || []).filter((item) => item.isActive);
    const cursor = Number(settings.activeKeyCursor) || 0;
    const rotationIndex = activeKeys.length ? cursor % activeKeys.length : -1;
    const rotationKey = rotationIndex >= 0 ? activeKeys[rotationIndex] : null;
    const lastUsedKey = (settings.serpApiKeys || [])
      .filter((item) => item.lastUsedAt)
      .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt))[0] || null;

    const schedulerStatus = req.app.locals.autoCheckScheduler?.getStatus?.() || null;
    const backupSchedulerStatus = req.app.locals.backupScheduler?.getStatus?.() || null;
    const backupRuns = await BackupRun.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('triggeredBy', 'username email role');
    const intervalMinutes = hoursToMinutes(settings.checkIntervalHours || 1);
    const autoCheckLogWindowStart = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const autoCheckLogs = await DomainActivityLog.find({
      action: DOMAIN_ACTIVITY_ACTIONS.AUTO_CHECK,
      createdAt: { $gte: autoCheckLogWindowStart },
    })
      .select('createdAt metadata.ok')
      .sort({ createdAt: -1 })
      .limit(5000);
    const autoCheckSlotStatuses = buildAutoCheckSlotStatuses({
      logs: autoCheckLogs,
      intervalMinutes,
    });
    const autoCheckScheduleWindow = buildAutoCheckScheduleWindow({
      now,
      intervalMinutes,
      autoCheckEnabled: settings.autoCheckEnabled,
      nextAutoCheckAt: settings.nextAutoCheckAt,
      schedulerStatus,
      slotStatuses: autoCheckSlotStatuses,
    });

    return res.json({
      settings: getSanitizedSettings(settings),
      serperAvailability,
      tokens: tokenSummary,
      lastRun: lastRun
        ? {
            _id: lastRun._id,
            brand: lastRun.brand,
            checkedAt: lastRun.checkedAt,
            trigger: lastRun.trigger,
            bestOwnRank: lastRun.bestOwnRank,
          }
        : null,
      recentRunCount: recentRuns.length,
      schedulerStatus,
      backupSchedulerStatus,
      backupRuns,
      serperRuntime: {
        activeKeyCount: activeKeys.length,
        activeCursor: cursor,
        rotationKey: rotationKey
          ? {
              _id: rotationKey._id,
              name: rotationKey.name,
              lastUsedAt: rotationKey.lastUsedAt || null,
              lastError: rotationKey.lastError || '',
            }
          : null,
        lastUsedKey: lastUsedKey
          ? {
              _id: lastUsedKey._id,
              name: lastUsedKey.name,
              lastUsedAt: lastUsedKey.lastUsedAt || null,
              lastError: lastUsedKey.lastError || '',
            }
          : null,
      },
      autoCheckSlotStatuses,
      autoCheckScheduleWindow,
    });
  } catch (error) {
    return next(error);
  }
};

const updateBackupSettings = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const backupEnabled = req.body.backupEnabled;
    const backupFrequencyRaw = req.body.backupFrequency;
    const backupTimeWibRaw = req.body.backupTimeWib;
    const backupFormatRaw = req.body.backupFormat;
    const backupTelegramBotTokenRaw = req.body.backupTelegramBotToken;
    const backupTelegramChatIdsRaw = req.body.backupTelegramChatIds;
    const clearBackupTelegramBotToken = req.body.clearBackupTelegramBotToken;

    if (typeof backupEnabled === 'boolean') {
      settings.backupEnabled = backupEnabled;
      settings.backupEveryDays = getBackupIntervalDays(settings.backupFrequency);
      if (backupEnabled) {
        settings.backupStartedBy = req.user?._id || settings.backupStartedBy || null;
        settings.nextBackupAt = getNextBackupAtFromNow(new Date(), settings.backupTimeWib || '00:00');
      } else {
        settings.backupStartedBy = null;
        settings.nextBackupAt = null;
      }
    }

    if (backupFrequencyRaw !== undefined) {
      const backupFrequency = String(backupFrequencyRaw).toLowerCase();
      if (!VALID_BACKUP_FREQUENCIES.includes(backupFrequency)) {
        return res.status(400).json({ error: 'backupFrequency must be one of: daily, twice_weekly, weekly, monthly' });
      }
      settings.backupFrequency = backupFrequency;
      settings.backupEveryDays = getBackupIntervalDays(backupFrequency);
      settings.backupTwiceWeeklyNextGapDays = 3;
      if (settings.backupEnabled) {
        settings.nextBackupAt = getNextBackupAtFromNow(new Date(), settings.backupTimeWib || '00:00');
      }
    }

    if (backupTimeWibRaw !== undefined) {
      const parsedTime = parseWibTime(String(backupTimeWibRaw || ''));
      if (!parsedTime) {
        return res.status(400).json({ error: 'backupTimeWib must be in HH:mm format' });
      }
      settings.backupTimeWib = parsedTime.normalized;
      if (settings.backupEnabled) {
        settings.nextBackupAt = getNextBackupAtFromNow(new Date(), settings.backupTimeWib);
      }
    }

    if (backupFormatRaw !== undefined) {
      const backupFormat = String(backupFormatRaw).toLowerCase();
      if (!VALID_BACKUP_FORMATS.includes(backupFormat)) {
        return res.status(400).json({ error: 'backupFormat must be one of: json, ndjson' });
      }
      settings.backupFormat = backupFormat;
    }

    if (clearBackupTelegramBotToken === true) {
      settings.backupTelegramBotToken = '';
    } else if (backupTelegramBotTokenRaw !== undefined) {
      const nextToken = String(backupTelegramBotTokenRaw || '').trim();
      if (nextToken) {
        settings.backupTelegramBotToken = nextToken;
      }
    }

    if (backupTelegramChatIdsRaw !== undefined) {
      settings.backupTelegramChatIds = normalizeChatIds(backupTelegramChatIdsRaw);
    }

    await settings.save();
    notifyAdminUpdate(req, { source: 'backup-settings-update' });
    return res.json(getSanitizedSettings(settings));
  } catch (error) {
    return next(error);
  }
};

const updateNotificationSettings = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const {
      notificationsEnabled,
      notificationHourlyEnabled,
      notificationHourlySendAtMinute,
      notificationInstantEnabled,
      notificationInstantDropThreshold,
      notificationAlertOnDrop,
      notificationAlertOnNotFound,
      notificationDailyDigestEnabled,
      notificationDailyDigestTimeWib,
      notificationTelegramBotToken,
      notificationTelegramChatIds,
      clearNotificationTelegramBotToken,
    } = req.body || {};

    if (typeof notificationsEnabled === 'boolean') {
      settings.notificationsEnabled = notificationsEnabled;
    }
    if (typeof notificationHourlyEnabled === 'boolean') {
      settings.notificationHourlyEnabled = notificationHourlyEnabled;
    }
    if (notificationHourlySendAtMinute !== undefined) {
      const minute = Number(notificationHourlySendAtMinute);
      if (!Number.isFinite(minute) || minute < 0 || minute > 59) {
        return res.status(400).json({ error: 'notificationHourlySendAtMinute must be between 0 and 59' });
      }
      settings.notificationHourlySendAtMinute = Math.floor(minute);
    }
    if (typeof notificationInstantEnabled === 'boolean') {
      settings.notificationInstantEnabled = notificationInstantEnabled;
    }
    if (notificationInstantDropThreshold !== undefined) {
      const threshold = Number(notificationInstantDropThreshold);
      if (!Number.isFinite(threshold) || threshold < 1 || threshold > 10) {
        return res.status(400).json({ error: 'notificationInstantDropThreshold must be between 1 and 10' });
      }
      settings.notificationInstantDropThreshold = Math.floor(threshold);
    }
    if (typeof notificationAlertOnDrop === 'boolean') {
      settings.notificationAlertOnDrop = notificationAlertOnDrop;
    }
    if (typeof notificationAlertOnNotFound === 'boolean') {
      settings.notificationAlertOnNotFound = notificationAlertOnNotFound;
    }
    if (typeof notificationDailyDigestEnabled === 'boolean') {
      settings.notificationDailyDigestEnabled = notificationDailyDigestEnabled;
    }
    if (notificationDailyDigestTimeWib !== undefined) {
      const parsed = parseWibTime(String(notificationDailyDigestTimeWib || ''));
      if (!parsed) {
        return res.status(400).json({ error: 'notificationDailyDigestTimeWib must be in HH:mm format' });
      }
      settings.notificationDailyDigestTimeWib = parsed.normalized;
    }
    if (clearNotificationTelegramBotToken === true) {
      settings.notificationTelegramBotToken = '';
    } else if (notificationTelegramBotToken !== undefined) {
      const nextToken = String(notificationTelegramBotToken || '').trim();
      if (nextToken) {
        settings.notificationTelegramBotToken = nextToken;
      }
    }
    if (notificationTelegramChatIds !== undefined) {
      settings.notificationTelegramChatIds = normalizeChatIds(notificationTelegramChatIds);
    }

    await settings.save();
    notifyAdminUpdate(req, { source: 'notification-settings-update' });
    return res.json(getSanitizedSettings(settings));
  } catch (error) {
    return next(error);
  }
};

const runAutoNow = async (req, res, next) => {
  try {
    const scheduler = req.app.locals.autoCheckScheduler;
    if (!scheduler) {
      return res.status(500).json({ error: 'Auto check scheduler unavailable' });
    }

    await scheduler.runNowDetached();
    notifyAdminUpdate(req, { source: 'run-now' });
    return res.status(202).json({ ok: true, started: true, schedulerStatus: scheduler.getStatus() });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.errorCode || undefined,
        serperAvailability: error.serperAvailability || undefined,
      });
    }
    return next(error);
  }
};

const stopAutoRun = async (req, res, next) => {
  try {
    const scheduler = req.app.locals.autoCheckScheduler;
    if (!scheduler) {
      return res.status(500).json({ error: 'Auto check scheduler unavailable' });
    }

    const settings = await ensureSettings();
    const wasEnabled = settings.autoCheckEnabled;
    settings.autoCheckEnabled = false;
    settings.nextAutoCheckAt = null;
    const previousStartedBy = settings.autoCheckStartedBy;
    settings.autoCheckStartedBy = null;
    await settings.save();

    if (wasEnabled || scheduler.getStatus()?.isRunning) {
      await DomainActivityLog.create({
        action: DOMAIN_ACTIVITY_ACTIONS.AUTO_STOP,
        domain: 'AUTO-CHECK',
        domainHostKey: 'auto-check',
        note: 'Auto-check stopped',
        actor: req.user?._id || previousStartedBy || null,
        metadata: {
          stopRequestedWhileRunning: scheduler.getStatus()?.isRunning || false,
        },
      });
    }

    const stopRequested = scheduler.requestStop();
    notifyAdminUpdate(req, { source: 'stop-run' });
    return res.json({
      ok: true,
      stopRequested,
      schedulerStatus: scheduler.getStatus(),
      settings: getSanitizedSettings(settings),
    });
  } catch (error) {
    return next(error);
  }
};

const getDomainActivityLogs = async (req, res, next) => {
  try {
    const limit = getLogLimit(req.query.limit);

    const logs = await DomainActivityLog.find({
      action: {
        $in: [DOMAIN_ACTIVITY_ACTIONS.ADD, DOMAIN_ACTIVITY_ACTIONS.DELETE],
      },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'username email role')
      .lean();

    return res.json(await attachBrands(logs));
  } catch (error) {
    return next(error);
  }
};

const runBackupNow = async (req, res, next) => {
  try {
    const scheduler = req.app.locals.backupScheduler;
    if (!scheduler) {
      return res.status(500).json({ error: 'Backup scheduler unavailable' });
    }

    await scheduler.runNowDetached({ triggeredBy: req.user?._id || null });
    notifyAdminUpdate(req, { source: 'backup-run-now' });
    return res.status(202).json({ ok: true, started: true, backupSchedulerStatus: scheduler.getStatus() });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return next(error);
  }
};

const testBackupTelegram = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const telegramBotToken = getTelegramTokenFromSettings(
      {
        backupTelegramBotToken: req.body?.backupTelegramBotToken ?? settings.backupTelegramBotToken,
      },
      process.env.TELEGRAM_BOT_TOKEN || ''
    );
    const inputChatIds =
      req.body?.backupTelegramChatIds !== undefined ? req.body.backupTelegramChatIds : settings.backupTelegramChatIds;
    const normalizedChatIds = normalizeChatIds(inputChatIds);

    const result = await testTelegramTargets({
      telegramBotToken,
      chatIds: normalizedChatIds,
      text: req.body?.message,
    });

    return res.json({
      ok: result.failCount === 0,
      ...result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return next(error);
  }
};

const testNotificationTelegram = async (req, res, next) => {
  try {
    const settings = await ensureSettings();
    const inputToken = String(req.body?.notificationTelegramBotToken || '').trim();
    const telegramBotToken = getTelegramTokenFromSettings(
      {
        backupTelegramBotToken: inputToken || settings.notificationTelegramBotToken,
      },
      process.env.TELEGRAM_BOT_TOKEN || ''
    );
    const inputChatIds =
      req.body?.notificationTelegramChatIds !== undefined
        ? req.body.notificationTelegramChatIds
        : settings.notificationTelegramChatIds;
    const normalizedChatIds = normalizeChatIds(inputChatIds);

    const result = await testTelegramTargets({
      telegramBotToken,
      chatIds: normalizedChatIds,
      text:
        req.body?.message ||
        `Notification test message\nTime: ${new Date().toISOString()}\nIf you can read this, notification channel is working.`,
    });

    return res.json({
      ok: result.failCount === 0,
      ...result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return next(error);
  }
};

const getAutoCheckLogs = async (req, res, next) => {
  try {
    const limit = getLogLimit(req.query.limit);

    const logs = await DomainActivityLog.find({
      action: {
        $in: [
          DOMAIN_ACTIVITY_ACTIONS.AUTO_START,
          DOMAIN_ACTIVITY_ACTIONS.AUTO_STOP,
          DOMAIN_ACTIVITY_ACTIONS.AUTO_CHECK,
        ],
      },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'username email role')
      .lean();

    return res.json(await attachBrands(logs));
  } catch (error) {
    return next(error);
  }
};

const getAutoCheckLogDetail = async (req, res, next) => {
  try {
    const { logId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(logId)) {
      return res.status(404).json({ error: 'Auto-check log not found' });
    }

    const rawLog = await DomainActivityLog.findById(logId)
      .populate('actor', 'username email role')
      .lean();
    if (!rawLog) {
      return res.status(404).json({ error: 'Auto-check log not found' });
    }

    const [log] = await attachBrands([rawLog]);
    if (log?.action !== DOMAIN_ACTIVITY_ACTIONS.AUTO_CHECK) {
      return res.json({
        log,
        scan: null,
        matchedBy: null,
      });
    }

    const { run, matchedBy } = await findMatchingAutoCheckRun(rawLog);
    if (run) {
      await syncMatchedAutoCheckLogMetadata(rawLog, run);
    }
    const hydratedRun = run ? (await attachBrands([run]))[0] : null;

    return res.json({
      log,
      scan: hydratedRun ? mapAutoCheckScan(hydratedRun) : null,
      matchedBy,
      missingReason: getAutoCheckLogMissingReason(rawLog, run),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAdminSettings,
  getAutoCheckStatus,
  updateSchedule,
  updateBackupSettings,
  updateNotificationSettings,
  addApiKey,
  updateApiKey,
  deleteApiKey,
  addGoogleRankApiKey,
  updateGoogleRankApiKey,
  deleteGoogleRankApiKey,
  getAdminDashboard,
  runAutoNow,
  runBackupNow,
  testBackupTelegram,
  testNotificationTelegram,
  stopAutoRun,
  getDomainActivityLogs,
  getAutoCheckLogs,
  getAutoCheckLogDetail,
};
