const mongoose = require('mongoose');

const MIN_INTERVAL_HOURS = 15 / 60;
const MAX_INTERVAL_HOURS = 60 / 60;

const serpApiKeySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    baselineRemaining: { type: Number, default: null },
    baselineCapturedAt: { type: Date, default: null },
    lastUsedAt: { type: Date },
    exhaustedAt: { type: Date },
    lastError: { type: String, default: '' },
    lastErrorCode: { type: String, default: '' },
    lastErrorAt: { type: Date, default: null },
    lastKnownRemaining: { type: Number, default: null },
    totalRequests: { type: Number, default: 0 },
  },
  { _id: true }
);

const googleRankApiKeySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    deactivatedByLimit: { type: Boolean, default: false },
    usageMonthKey: { type: String, default: '' },
    lastUsedAt: { type: Date, default: null },
    exhaustedAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    lastErrorCode: { type: String, default: '' },
    lastErrorAt: { type: Date, default: null },
    totalRequests: { type: Number, default: 0 },
  },
  { _id: true }
);

const adminSettingsSchema = new mongoose.Schema(
  {
    autoCheckEnabled: { type: Boolean, default: false },
    checkIntervalHours: { type: Number, default: 1, min: MIN_INTERVAL_HOURS, max: MAX_INTERVAL_HOURS },
    lastAutoCheckAt: { type: Date, default: null },
    nextAutoCheckAt: { type: Date, default: null },
    autoCheckStartedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    backupEnabled: { type: Boolean, default: false },
    backupFrequency: { type: String, enum: ['daily', 'twice_weekly', 'weekly', 'monthly'], default: 'daily' },
    backupEveryDays: { type: Number, default: 1, min: 1, max: 30 },
    backupTwiceWeeklyNextGapDays: { type: Number, default: 3, min: 3, max: 4 },
    backupTimeWib: { type: String, default: '00:00' },
    backupTimeframeDays: { type: Number, default: 0 },
    backupFormat: { type: String, enum: ['json', 'ndjson'], default: 'json' },
    backupTelegramBotToken: { type: String, default: '' },
    backupTelegramChatIds: { type: [String], default: [] },
    backupStartedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastBackupAt: { type: Date, default: null },
    nextBackupAt: { type: Date, default: null },
    lastBackupStatus: { type: String, enum: ['success', 'failed', 'idle'], default: 'idle' },
    lastBackupError: { type: String, default: '' },
    notificationsEnabled: { type: Boolean, default: false },
    notificationHourlyEnabled: { type: Boolean, default: true },
    notificationHourlySendAtMinute: { type: Number, default: 0, min: 0, max: 59 },
    notificationInstantEnabled: { type: Boolean, default: true },
    notificationInstantDropThreshold: { type: Number, default: 3, min: 1, max: 10 },
    notificationAlertOnDrop: { type: Boolean, default: true },
    notificationAlertOnNotFound: { type: Boolean, default: true },
    notificationDailyDigestEnabled: { type: Boolean, default: true },
    notificationDailyDigestTimeWib: { type: String, default: '23:00' },
    notificationTelegramBotToken: { type: String, default: '' },
    notificationTelegramChatIds: { type: [String], default: [] },
    notificationLastHourlySlotKey: { type: String, default: '' },
    notificationLastRunSnapshot: { type: Map, of: Number, default: {} },
    notificationLastHourlySnapshot: { type: Map, of: Number, default: {} },
    notificationLastSentSlotKey: { type: String, default: '' },
    notificationLastSentSnapshotHash: { type: String, default: '' },
    notificationLastDailyDigestDateKey: { type: String, default: '' },
    activeKeyCursor: { type: Number, default: 0 },
    serpApiKeys: { type: [serpApiKeySchema], default: [] },
    googleRankActiveKeyCursor: { type: Number, default: 0 },
    googleRankApiKeys: { type: [googleRankApiKeySchema], default: [] },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);
