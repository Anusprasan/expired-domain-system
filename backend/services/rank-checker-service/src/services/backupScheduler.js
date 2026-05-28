const AdminSettings = require('../models/AdminSettings');
const { BACKUP_RUN_SOURCE } = require('../models/BackupRun');
const {
  runTelegramBackup,
  logFailedBackupRun,
  getNextBackupAtFromNow,
  getNextBackupAtFromScheduled,
  normalizeChatIds,
  getTimeframeDaysForFrequency,
} = require('./backupService');

const POLL_INTERVAL_MS = 60 * 1000;

const createBackupScheduler = ({ onStatusChange = () => {}, telegramBotToken = '' }) => {
  let timer = null;
  let isRunning = false;
  let lastRunStartedAt = null;
  let lastRunFinishedAt = null;
  let lastRunSource = null;
  let lastError = null;

  const getStatus = () => ({
    isRunning,
    pollIntervalMs: POLL_INTERVAL_MS,
    lastRunStartedAt,
    lastRunFinishedAt,
    lastRunSource,
    lastError,
  });
  const notify = () => onStatusChange(getStatus());

  const executeBackup = async ({ settings, source, triggeredBy = null, scheduledAt = new Date() }) => {
    isRunning = true;
    lastError = null;
    lastRunSource = source;
    lastRunStartedAt = new Date();
    notify();

    try {
      const result = await runTelegramBackup({
        settings,
        source,
        triggeredBy,
        telegramBotToken,
      });

      settings.lastBackupAt = result.finishedAt;
      settings.lastBackupStatus = 'success';
      settings.lastBackupError = '';
      if (settings.backupFrequency === 'twice_weekly') {
        settings.backupTwiceWeeklyNextGapDays = settings.backupTwiceWeeklyNextGapDays === 4 ? 3 : 4;
      } else {
        settings.backupTwiceWeeklyNextGapDays = 3;
      }
      settings.nextBackupAt = settings.backupEnabled
        ? getNextBackupAtFromScheduled(scheduledAt, settings)
        : null;
      await settings.save();
    } catch (error) {
      lastError = error.message || String(error);
      settings.lastBackupStatus = 'failed';
      settings.lastBackupError = lastError;
      settings.nextBackupAt = settings.backupEnabled
        ? getNextBackupAtFromNow(new Date(), settings.backupTimeWib || '00:00')
        : null;
      await settings.save();

      await logFailedBackupRun({
        source,
        triggeredBy,
        timeframeDays: getTimeframeDaysForFrequency(settings),
        format: settings.backupFormat,
        chatIds: normalizeChatIds(settings.backupTelegramChatIds),
        startedAt: lastRunStartedAt,
        error,
      });
    } finally {
      isRunning = false;
      lastRunFinishedAt = new Date();
      notify();
    }
  };

  const tick = async () => {
    if (isRunning) return;

    const settings = await AdminSettings.findOne();
    if (!settings || !settings.backupEnabled) return;

    if (!settings.nextBackupAt) {
      settings.nextBackupAt = getNextBackupAtFromNow(new Date(), settings.backupTimeWib || '00:00');
      await settings.save();
      return;
    }

    const now = new Date();
    if (settings.nextBackupAt > now) return;

    const scheduledAt = new Date(settings.nextBackupAt);
    await executeBackup({
      settings,
      source: BACKUP_RUN_SOURCE.SCHEDULER,
      triggeredBy: settings.backupStartedBy || null,
      scheduledAt,
    });
  };

  const runNowDetached = async ({ triggeredBy = null } = {}) => {
    if (isRunning) {
      const err = new Error('Backup is already running');
      err.statusCode = 409;
      throw err;
    }

    const settings = await AdminSettings.findOne();
    if (!settings) {
      const err = new Error('Settings not found');
      err.statusCode = 404;
      throw err;
    }

    executeBackup({
      settings,
      source: BACKUP_RUN_SOURCE.MANUAL,
      triggeredBy,
      scheduledAt: new Date(),
    }).catch((error) => {
      console.error('Manual backup run failed:', error.message);
    });
  };

  const start = () => {
    if (timer) return;
    timer = setInterval(() => {
      tick().catch((error) => {
        console.error('Backup scheduler tick failed:', error.message);
      });
    }, POLL_INTERVAL_MS);
    timer.unref();
    tick().catch((error) => {
      console.error('Backup scheduler startup tick failed:', error.message);
    });
  };

  const stop = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  return {
    start,
    stop,
    tick,
    runNowDetached,
    getStatus,
  };
};

module.exports = {
  createBackupScheduler,
};
