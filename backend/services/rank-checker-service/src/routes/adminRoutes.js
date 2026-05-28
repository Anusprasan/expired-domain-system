const express = require('express');
const {
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
} = require('../controllers/adminController');

const router = express.Router();

router.get('/settings', getAdminSettings);
router.get('/auto-check-status', getAutoCheckStatus);
router.patch('/settings/schedule', updateSchedule);
router.patch('/settings/backup', updateBackupSettings);
router.patch('/settings/notifications', updateNotificationSettings);
router.post('/settings/keys', addApiKey);
router.patch('/settings/keys/:keyId', updateApiKey);
router.delete('/settings/keys/:keyId', deleteApiKey);
router.post('/settings/google-rank-keys', addGoogleRankApiKey);
router.patch('/settings/google-rank-keys/:keyId', updateGoogleRankApiKey);
router.delete('/settings/google-rank-keys/:keyId', deleteGoogleRankApiKey);
router.get('/dashboard', getAdminDashboard);
router.get('/domain-logs', getDomainActivityLogs);
router.get('/auto-check-logs', getAutoCheckLogs);
router.get('/auto-check-logs/:logId', getAutoCheckLogDetail);
router.post('/run-now', runAutoNow);
router.post('/backup/run-now', runBackupNow);
router.post('/backup/test-telegram', testBackupTelegram);
router.post('/notifications/test-telegram', testNotificationTelegram);
router.post('/stop-run', stopAutoRun);

module.exports = router;
