import { createActivityLog } from "../activity-logs/activityLog.service.js";
import {
  createDatabaseBackupService,
  deleteDatabaseBackupService,
  executeDatabaseRestoreService,
  getDatabaseBackupDownloadInfoService,
  getDatabaseBackupTelegramSettingsService,
  listDatabaseBackupsService,
  prepareDatabaseRestoreService,
  requestDatabaseRestoreVerificationCodeService,
  sendDatabaseBackupToTelegramService,
  testDatabaseBackupTelegramSettingsService,
  updateDatabaseBackupTelegramSettingsService,
} from "./databaseBackup.service.js";

function safeCreateDatabaseBackupActivityLog(payload) {
  return createActivityLog(payload).catch((error) => {
    console.error("Failed to write database backup activity log:", error.message);
  });
}

function buildLogPayload(req, overrides = {}) {
  return {
    actorUser: req.user,
    module: "database-backups",
    category: "data",
    httpMethod: req.method,
    routePath: req.originalUrl,
    statusCode: 200,
    durationMs: 0,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: overrides.metadata || {},
    ...overrides,
  };
}

export const listDatabaseBackups = async (req, res) => {
  try {
    const data = await listDatabaseBackupsService();

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const exportDatabaseBackup = async (req, res) => {
  try {
    const backup = await createDatabaseBackupService({
      actorUser: req.user,
    });

    await safeCreateDatabaseBackupActivityLog(
      buildLogPayload(req, {
        action: "database-backup.export",
        targetType: "database-backup",
        targetId: backup.id,
        targetLabel: backup.slug,
        summary: "Created full database backup",
        details: `Created ${backup.type} backup ${backup.slug}`,
        metadata: {
          backupType: backup.type,
          fileSizeBytes: backup.fileSizeBytes,
        },
      })
    );

    return res.status(201).json({
      success: true,
      data: backup,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const downloadDatabaseBackup = async (req, res) => {
  try {
    const data = await getDatabaseBackupDownloadInfoService(req.params.backupId);

    await safeCreateDatabaseBackupActivityLog(
      buildLogPayload(req, {
        action: "database-backup.download",
        targetType: "database-backup",
        targetId: data.record.id,
        targetLabel: data.record.slug,
        summary: "Downloaded database backup archive",
        details: `Downloaded backup archive ${data.record.slug}`,
        metadata: {
          backupType: data.record.type,
          fileSizeBytes: data.record.fileSizeBytes,
        },
      })
    );

    return res.download(data.archiveFilePath, data.record.downloadFileName);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteDatabaseBackup = async (req, res) => {
  try {
    const deletedBackup = await deleteDatabaseBackupService(req.params.backupId);

    await safeCreateDatabaseBackupActivityLog(
      buildLogPayload(req, {
        action: "database-backup.delete",
        targetType: "database-backup",
        targetId: deletedBackup.id,
        targetLabel: deletedBackup.slug,
        summary: "Deleted database backup",
        details: `Deleted backup archive ${deletedBackup.slug}`,
        metadata: {
          backupType: deletedBackup.type,
          fileSizeBytes: deletedBackup.fileSizeBytes,
        },
      })
    );

    return res.json({
      success: true,
      data: deletedBackup,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const sendDatabaseBackupToTelegram = async (req, res) => {
  try {
    const data = await sendDatabaseBackupToTelegramService({
      backupId: req.params.backupId,
      actorUser: req.user,
    });

    await safeCreateDatabaseBackupActivityLog(
      buildLogPayload(req, {
        action: "database-backup.telegram.send",
        targetType: "database-backup",
        targetId: data.backup.id,
        targetLabel: data.backup.slug,
        summary: "Sent database backup archive to Telegram",
        details: `Sent backup ${data.backup.slug} to ${data.sentCount} Telegram chat(s)`,
        metadata: {
          backupType: data.backup.type,
          fileSizeBytes: data.backup.fileSizeBytes,
          sentCount: data.sentCount,
          failedCount: data.failedCount,
        },
      })
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getDatabaseBackupTelegramSettings = async (req, res) => {
  try {
    const data = await getDatabaseBackupTelegramSettingsService();

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateDatabaseBackupTelegramSettings = async (req, res) => {
  try {
    const data = await updateDatabaseBackupTelegramSettingsService(req.body || {});

    await safeCreateDatabaseBackupActivityLog(
      buildLogPayload(req, {
        category: "settings",
        action: "database-backup.telegram.update",
        targetType: "module-settings",
        targetId: "database-backups-telegram",
        targetLabel: "Database backup Telegram settings",
        summary: "Updated database backup Telegram settings",
        details: data.telegram.enabled
          ? "Restore verification Telegram bot is enabled"
          : "Restore verification Telegram bot is disabled",
        metadata: {
          enabled: data.telegram.enabled,
          chatCount: data.telegram.chatIds.length,
        },
      })
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const testDatabaseBackupTelegramSettings = async (req, res) => {
  try {
    const data = await testDatabaseBackupTelegramSettingsService(req.body || {});

    await safeCreateDatabaseBackupActivityLog(
      buildLogPayload(req, {
        category: "settings",
        action: "database-backup.telegram.test",
        targetType: "module-settings",
        targetId: "database-backups-telegram",
        targetLabel: "Database backup Telegram settings",
        summary: "Sent database backup Telegram test message",
        details: `Telegram test sent to ${data.sentCount} chat(s)`,
        metadata: {
          sentCount: data.sentCount,
          failedCount: data.failedCount,
        },
      })
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const requestDatabaseRestoreVerificationCode = async (req, res) => {
  try {
    const data = await requestDatabaseRestoreVerificationCodeService({
      backupId: req.params.backupId,
      actorUser: req.user,
    });

    await safeCreateDatabaseBackupActivityLog(
      buildLogPayload(req, {
        action: "database-backup.restore.request-code",
        targetType: "database-backup",
        targetId: data.backup.id,
        targetLabel: data.backup.slug,
        summary: "Requested Telegram restore verification code",
        details: `Requested restore code for backup ${data.backup.slug}`,
        metadata: {
          expiresAt: data.expiresAt,
          sentCount: data.sentCount,
          failedCount: data.failedCount,
        },
      })
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const prepareDatabaseRestore = async (req, res) => {
  try {
    const data = await prepareDatabaseRestoreService({
      backupId: req.params.backupId,
      verificationCode: req.body?.verificationCode,
      actorUser: req.user,
    });

    await safeCreateDatabaseBackupActivityLog(
      buildLogPayload(req, {
        action: "database-backup.restore.prepare",
        targetType: "database-backup",
        targetId: data.selectedBackup.id,
        targetLabel: data.selectedBackup.slug,
        summary: "Prepared database restore and created safety backup",
        details:
          `Prepared restore from ${data.selectedBackup.slug} and created safety backup ${data.safetyBackup.slug}`,
        metadata: {
          selectedBackupId: data.selectedBackup.id,
          safetyBackupId: data.safetyBackup.id,
          restoreExpiresAt: data.restoreExpiresAt,
        },
      })
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const executeDatabaseRestore = async (req, res) => {
  try {
    const data = await executeDatabaseRestoreService({
      restoreToken: req.body?.restoreToken,
      actorUser: req.user,
    });

    await safeCreateDatabaseBackupActivityLog(
      buildLogPayload(req, {
        action: "database-backup.restore.execute",
        targetType: "database-backup",
        targetId: data.selectedBackup.id,
        targetLabel: data.selectedBackup.slug,
        summary: "Restored database backup",
        details:
          `Restored backup ${data.selectedBackup.slug} after creating safety backup ${data.safetyBackup.slug}`,
        metadata: {
          selectedBackupId: data.selectedBackup.id,
          safetyBackupId: data.safetyBackup.id,
          restoredAt: data.restoredAt,
        },
      })
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
