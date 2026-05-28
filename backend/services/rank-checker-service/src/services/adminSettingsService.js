const AdminSettings = require('../models/AdminSettings');
const { hoursToMinutes, minutesToHours, normalizeAllowedIntervalMinutes } = require('./scheduleTimeService');
const {
  parseWibTime,
  normalizeChatIds,
  VALID_BACKUP_FORMATS,
  VALID_BACKUP_FREQUENCIES,
  getBackupIntervalDays,
  getTimeframeDaysForFrequency,
} = require('./backupService');

const DEFAULT_INTERVAL_HOURS = 1;
const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

const parseEnvKeys = (rawValue) => {
  if (!rawValue) return [];
  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((key, index) => ({
      name: `ENV Key ${index + 1}`,
      key,
      isActive: true,
    }));
};

const ensureSettings = async ({ envKeys = [] } = {}) => {
  let settings = await AdminSettings.findOne();

  if (!settings) {
    settings = await AdminSettings.create({
      autoCheckEnabled: false,
      checkIntervalHours: DEFAULT_INTERVAL_HOURS,
      serpApiKeys: envKeys,
      nextAutoCheckAt: null,
    });
    return settings;
  }

  let shouldSave = false;

  const normalizedHours = minutesToHours(
    normalizeAllowedIntervalMinutes(hoursToMinutes(settings.checkIntervalHours || DEFAULT_INTERVAL_HOURS))
  );
  if (Math.abs(Number(settings.checkIntervalHours || 0) - normalizedHours) > 1e-9) {
    settings.checkIntervalHours = normalizedHours;
    shouldSave = true;
  }

  if (!settings.serpApiKeys?.length && envKeys.length) {
    settings.serpApiKeys = envKeys;
    shouldSave = true;
  }

  if (!Array.isArray(settings.googleRankApiKeys)) {
    settings.googleRankApiKeys = [];
    shouldSave = true;
  }

  (settings.googleRankApiKeys || []).forEach((item) => {
    const currentMonthKey = getCurrentMonthKey();
    if (!String(item.usageMonthKey || '').trim()) {
      item.usageMonthKey = currentMonthKey;
      shouldSave = true;
    }

    if (String(item.usageMonthKey || '').trim() !== currentMonthKey) {
      item.usageMonthKey = currentMonthKey;
      item.totalRequests = 0;
      item.exhaustedAt = null;
      if (item.deactivatedByLimit) {
        item.isActive = true;
      }
      item.deactivatedByLimit = false;
      if (item.lastErrorCode === 'google_rank_limit_reached') {
        item.lastError = '';
        item.lastErrorCode = '';
        item.lastErrorAt = null;
      }
      shouldSave = true;
    }

    const normalizedRequests = Number.isFinite(Number(item.totalRequests))
      ? Math.max(0, Math.floor(Number(item.totalRequests)))
      : 0;

    if (Number(item.totalRequests) !== normalizedRequests) {
      item.totalRequests = normalizedRequests;
      shouldSave = true;
    }

    if (!item.exhaustedAt && normalizedRequests >= 250) {
      item.exhaustedAt = new Date();
      shouldSave = true;
    }

    if (normalizedRequests >= 250 && item.isActive) {
      item.isActive = false;
      item.deactivatedByLimit = true;
      shouldSave = true;
    }
  });

  if (!Number.isFinite(Number(settings.googleRankActiveKeyCursor)) || Number(settings.googleRankActiveKeyCursor) < 0) {
    settings.googleRankActiveKeyCursor = 0;
    shouldSave = true;
  }

  if (!VALID_BACKUP_FREQUENCIES.includes(settings.backupFrequency)) {
    settings.backupFrequency = 'daily';
    shouldSave = true;
  }

  const mappedEveryDays = getBackupIntervalDays(settings.backupFrequency);
  if (!Number.isFinite(settings.backupEveryDays) || settings.backupEveryDays !== mappedEveryDays) {
    settings.backupEveryDays = mappedEveryDays;
    shouldSave = true;
  }

  const twiceWeeklyGap = settings.backupTwiceWeeklyNextGapDays === 4 ? 4 : 3;
  if (settings.backupTwiceWeeklyNextGapDays !== twiceWeeklyGap) {
    settings.backupTwiceWeeklyNextGapDays = twiceWeeklyGap;
    shouldSave = true;
  }

  const parsedWibTime = parseWibTime(settings.backupTimeWib || '');
  if (!parsedWibTime) {
    settings.backupTimeWib = '00:00';
    shouldSave = true;
  } else if (settings.backupTimeWib !== parsedWibTime.normalized) {
    settings.backupTimeWib = parsedWibTime.normalized;
    shouldSave = true;
  }

  const expectedTimeframeDays = getTimeframeDaysForFrequency(settings);
  if (!Number.isFinite(Number(settings.backupTimeframeDays)) || Number(settings.backupTimeframeDays) !== expectedTimeframeDays) {
    settings.backupTimeframeDays = expectedTimeframeDays;
    shouldSave = true;
  }

  if (!VALID_BACKUP_FORMATS.includes(settings.backupFormat)) {
    settings.backupFormat = 'json';
    shouldSave = true;
  }

  const normalizedBotToken = String(settings.backupTelegramBotToken || '').trim();
  if (settings.backupTelegramBotToken !== normalizedBotToken) {
    settings.backupTelegramBotToken = normalizedBotToken;
    shouldSave = true;
  }

  const normalizedChatIds = normalizeChatIds(settings.backupTelegramChatIds);
  if (JSON.stringify(normalizedChatIds) !== JSON.stringify(settings.backupTelegramChatIds || [])) {
    settings.backupTelegramChatIds = normalizedChatIds;
    shouldSave = true;
  }

  const normalizedNotificationToken = String(settings.notificationTelegramBotToken || '').trim();
  if (settings.notificationTelegramBotToken !== normalizedNotificationToken) {
    settings.notificationTelegramBotToken = normalizedNotificationToken;
    shouldSave = true;
  }

  const normalizedNotificationChatIds = normalizeChatIds(settings.notificationTelegramChatIds);
  if (JSON.stringify(normalizedNotificationChatIds) !== JSON.stringify(settings.notificationTelegramChatIds || [])) {
    settings.notificationTelegramChatIds = normalizedNotificationChatIds;
    shouldSave = true;
  }

  const normalizedHourlyMinute = Number.isFinite(Number(settings.notificationHourlySendAtMinute))
    ? Math.max(0, Math.min(59, Math.floor(Number(settings.notificationHourlySendAtMinute))))
    : 0;
  if (Number(settings.notificationHourlySendAtMinute) !== normalizedHourlyMinute) {
    settings.notificationHourlySendAtMinute = normalizedHourlyMinute;
    shouldSave = true;
  }

  const normalizedDropThreshold = Number.isFinite(Number(settings.notificationInstantDropThreshold))
    ? Math.max(1, Math.min(10, Math.floor(Number(settings.notificationInstantDropThreshold))))
    : 3;
  if (Number(settings.notificationInstantDropThreshold) !== normalizedDropThreshold) {
    settings.notificationInstantDropThreshold = normalizedDropThreshold;
    shouldSave = true;
  }

  const parsedDigestTime = parseWibTime(settings.notificationDailyDigestTimeWib || '');
  if (!parsedDigestTime) {
    settings.notificationDailyDigestTimeWib = '23:00';
    shouldSave = true;
  } else if (settings.notificationDailyDigestTimeWib !== parsedDigestTime.normalized) {
    settings.notificationDailyDigestTimeWib = parsedDigestTime.normalized;
    shouldSave = true;
  }

  if (shouldSave) {
    await settings.save();
  }

  return settings;
};

const getSettings = async () => {
  const settings = await AdminSettings.findOne();
  return settings;
};

const applyBaselineFromEnv = async ({ baselineRemaining, baselineKeyName = '' }) => {
  if (!Number.isFinite(baselineRemaining) || baselineRemaining < 0) return null;

  const settings = await AdminSettings.findOne();
  if (!settings?.serpApiKeys?.length) return null;

  const target =
    settings.serpApiKeys.find((item) => item.name === baselineKeyName) ||
    settings.serpApiKeys[0];

  if (!target || target.baselineCapturedAt) return settings;

  target.baselineRemaining = baselineRemaining;
  target.baselineCapturedAt = new Date();
  await settings.save();
  return settings;
};

const getSanitizedSettings = (settings) => {
  if (!settings) return null;

  return {
    _id: settings._id,
    autoCheckEnabled: settings.autoCheckEnabled,
    checkIntervalHours: settings.checkIntervalHours,
    checkIntervalMinutes: normalizeAllowedIntervalMinutes(
      hoursToMinutes(settings.checkIntervalHours || DEFAULT_INTERVAL_HOURS)
    ),
    lastAutoCheckAt: settings.lastAutoCheckAt,
    nextAutoCheckAt: settings.nextAutoCheckAt,
    autoCheckStartedBy: settings.autoCheckStartedBy || null,
    backupEnabled: settings.backupEnabled || false,
    backupFrequency: VALID_BACKUP_FREQUENCIES.includes(settings.backupFrequency)
      ? settings.backupFrequency
      : 'daily',
    backupEveryDays: Number(settings.backupEveryDays) || 1,
    backupTimeWib: settings.backupTimeWib || '00:00',
    backupTimeframeDays: getTimeframeDaysForFrequency(settings),
    backupFormat: settings.backupFormat || 'json',
    backupTelegramBotTokenConfigured: Boolean(String(settings.backupTelegramBotToken || '').trim()),
    backupTelegramBotTokenMasked: String(settings.backupTelegramBotToken || '').trim()
      ? `***${String(settings.backupTelegramBotToken || '').trim().slice(-6)}`
      : '',
    backupTelegramChatIds: normalizeChatIds(settings.backupTelegramChatIds),
    notificationsEnabled: settings.notificationsEnabled || false,
    notificationHourlyEnabled: settings.notificationHourlyEnabled !== false,
    notificationHourlySendAtMinute: Number.isFinite(Number(settings.notificationHourlySendAtMinute))
      ? Math.max(0, Math.min(59, Math.floor(Number(settings.notificationHourlySendAtMinute))))
      : 0,
    notificationInstantEnabled: settings.notificationInstantEnabled !== false,
    notificationInstantDropThreshold: Number.isFinite(Number(settings.notificationInstantDropThreshold))
      ? Math.max(1, Math.min(10, Math.floor(Number(settings.notificationInstantDropThreshold))))
      : 3,
    notificationAlertOnDrop: settings.notificationAlertOnDrop !== false,
    notificationAlertOnNotFound: settings.notificationAlertOnNotFound !== false,
    notificationDailyDigestEnabled: settings.notificationDailyDigestEnabled !== false,
    notificationDailyDigestTimeWib: parseWibTime(settings.notificationDailyDigestTimeWib || '')?.normalized || '23:00',
    notificationTelegramBotTokenConfigured: Boolean(String(settings.notificationTelegramBotToken || '').trim()),
    notificationTelegramBotTokenMasked: String(settings.notificationTelegramBotToken || '').trim()
      ? `***${String(settings.notificationTelegramBotToken || '').trim().slice(-6)}`
      : '',
    notificationTelegramChatIds: normalizeChatIds(settings.notificationTelegramChatIds),
    notificationLastHourlySlotKey: String(settings.notificationLastHourlySlotKey || ''),
    notificationLastDailyDigestDateKey: String(settings.notificationLastDailyDigestDateKey || ''),
    backupStartedBy: settings.backupStartedBy || null,
    lastBackupAt: settings.lastBackupAt || null,
    nextBackupAt: settings.nextBackupAt || null,
    lastBackupStatus: settings.lastBackupStatus || 'idle',
    lastBackupError: settings.lastBackupError || '',
    serpApiKeys: (settings.serpApiKeys || []).map((item) => ({
      _id: item._id,
      name: item.name,
      isActive: item.isActive,
      lastUsedAt: item.lastUsedAt,
      exhaustedAt: item.exhaustedAt,
      lastError: item.lastError,
      lastErrorCode: item.lastErrorCode,
      lastErrorAt: item.lastErrorAt,
      lastKnownRemaining: item.lastKnownRemaining,
      totalRequests: item.totalRequests,
      baselineRemaining: item.baselineRemaining,
      baselineCapturedAt: item.baselineCapturedAt,
      maskedKey: item.key?.length > 6 ? `${item.key.slice(0, 3)}***${item.key.slice(-3)}` : '***',
    })),
    googleRankApiKeys: (settings.googleRankApiKeys || []).map((item) => ({
      _id: item._id,
      name: item.name,
      isActive: item.isActive,
      deactivatedByLimit: item.deactivatedByLimit || false,
      usageMonthKey: String(item.usageMonthKey || ''),
      lastUsedAt: item.lastUsedAt || null,
      exhaustedAt: item.exhaustedAt || null,
      lastError: item.lastError || '',
      lastErrorCode: item.lastErrorCode || '',
      lastErrorAt: item.lastErrorAt || null,
      totalRequests: Math.max(0, Number(item.totalRequests) || 0),
      monthlyLimit: 250,
      maskedKey: item.key?.length > 6 ? `${item.key.slice(0, 3)}***${item.key.slice(-3)}` : '***',
    })),
  };
};

module.exports = {
  DEFAULT_INTERVAL_HOURS,
  parseEnvKeys,
  ensureSettings,
  getSettings,
  applyBaselineFromEnv,
  getSanitizedSettings,
};

