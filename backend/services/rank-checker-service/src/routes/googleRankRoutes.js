const express = require('express');

const createGoogleRankRoutes = (googleRankController) => {
  const router = express.Router();

  router.get('/availability', googleRankController.getAvailability);
  router.post('/check', googleRankController.check);
  router.post('/auto-run/start', googleRankController.startAutoRun);
  router.get('/auto-run/:runId', googleRankController.getAutoRun);
  router.post('/auto-run/:runId/stop', googleRankController.stopAutoRun);

  return router;
};

module.exports = createGoogleRankRoutes;
