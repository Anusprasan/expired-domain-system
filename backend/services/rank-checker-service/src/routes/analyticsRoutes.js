const express = require('express');
const { getRankingHistory, getRecentAutoChecks, getGoogleRankOverview } = require('../controllers/analyticsController');

const router = express.Router();

router.get('/brands/:brandId/ranking-history', getRankingHistory);
router.get('/brands/:brandId/recent-auto-checks', getRecentAutoChecks);
router.get('/google-rank/brands/:brandId/overview', getGoogleRankOverview);

module.exports = router;
