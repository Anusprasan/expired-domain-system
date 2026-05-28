import express from "express";
import {
  deleteDatabaseBackup,
  downloadDatabaseBackup,
  executeDatabaseRestore,
  exportDatabaseBackup,
  getDatabaseBackupTelegramSettings,
  listDatabaseBackups,
  prepareDatabaseRestore,
  requestDatabaseRestoreVerificationCode,
  sendDatabaseBackupToTelegram,
  testDatabaseBackupTelegramSettings,
  updateDatabaseBackupTelegramSettings,
} from "./databaseBackup.controller.js";
import {
  requireAdminAccess,
  requireAnyPrivilege,
  requireAuth,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();

const DATABASE_BACKUP_ACCESS_PRIVILEGES = [
  "VIEW_DATABASE_BACKUPS",
  "EXPORT_DATABASE_BACKUPS",
  "MANAGE_DATABASE_BACKUPS",
  "RESTORE_DATABASE_BACKUPS",
  "SEND_DATABASE_BACKUPS_TELEGRAM",
];
const DATABASE_BACKUP_DOWNLOAD_PRIVILEGES = [
  "EXPORT_DATABASE_BACKUPS",
  "RESTORE_DATABASE_BACKUPS",
];

router.get(
  "/",
  requireAuth,
  requireAnyPrivilege(DATABASE_BACKUP_ACCESS_PRIVILEGES),
  listDatabaseBackups
);
router.post(
  "/export",
  requireAuth,
  requireAnyPrivilege(["EXPORT_DATABASE_BACKUPS"]),
  exportDatabaseBackup
);
router.delete(
  "/:backupId",
  requireAuth,
  requireAnyPrivilege(["MANAGE_DATABASE_BACKUPS"]),
  deleteDatabaseBackup
);
router.post(
  "/:backupId/telegram/send",
  requireAuth,
  requireAnyPrivilege(["SEND_DATABASE_BACKUPS_TELEGRAM"]),
  sendDatabaseBackupToTelegram
);
router.get(
  "/telegram",
  requireAuth,
  requireAdminAccess,
  getDatabaseBackupTelegramSettings
);
router.put(
  "/telegram",
  requireAuth,
  requireAdminAccess,
  updateDatabaseBackupTelegramSettings
);
router.post(
  "/telegram/test",
  requireAuth,
  requireAdminAccess,
  testDatabaseBackupTelegramSettings
);
router.post(
  "/restore/execute",
  requireAuth,
  requireAnyPrivilege(["RESTORE_DATABASE_BACKUPS"]),
  executeDatabaseRestore
);
router.get(
  "/:backupId/download",
  requireAuth,
  requireAnyPrivilege(DATABASE_BACKUP_DOWNLOAD_PRIVILEGES),
  downloadDatabaseBackup
);
router.post(
  "/:backupId/restore/request-code",
  requireAuth,
  requireAnyPrivilege(["RESTORE_DATABASE_BACKUPS"]),
  requestDatabaseRestoreVerificationCode
);
router.post(
  "/:backupId/restore/prepare",
  requireAuth,
  requireAnyPrivilege(["RESTORE_DATABASE_BACKUPS"]),
  prepareDatabaseRestore
);

export default router;
