const mongoose = require('mongoose');

const BACKUP_RUN_STATUS = {
  SUCCESS: 'success',
  FAILED: 'failed',
};

const BACKUP_RUN_SOURCE = {
  SCHEDULER: 'scheduler',
  MANUAL: 'manual',
};

const backupRunSchema = new mongoose.Schema(
  {
    source: { type: String, enum: Object.values(BACKUP_RUN_SOURCE), required: true, index: true },
    status: { type: String, enum: Object.values(BACKUP_RUN_STATUS), required: true, index: true },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    timeframeDays: { type: Number, default: 0 },
    format: { type: String, default: 'json' },
    chatIds: { type: [String], default: [] },
    totalCollections: { type: Number, default: 0 },
    totalRecords: { type: Number, default: 0 },
    totalFiles: { type: Number, default: 0 },
    summary: { type: Object, default: {} },
    error: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

backupRunSchema.index({ createdAt: -1 });

module.exports = {
  BackupRun: mongoose.model('BackupRun', backupRunSchema),
  BACKUP_RUN_STATUS,
  BACKUP_RUN_SOURCE,
};
