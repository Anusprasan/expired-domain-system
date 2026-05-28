import express from "express";
import {
  blockTrackedSiteAnalyticsUrlAction,
  clearTrackedSiteAnalyticsUrlStatsAction,
  collectSiteAnalyticsEvent,
  collectSiteAnalyticsPixelEvent,
  deleteTrackedSiteAnalyticsUrlAction,
  getSiteAnalyticsSummary,
  getTrackedSiteAnalyticsDetail,
  serveSiteAnalyticsTrackerScript,
  unblockTrackedSiteAnalyticsUrlAction,
} from "./siteAnalytics.controller.js";
import {
  requireAuth,
  requireAnyPrivilege,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();

router.get("/tracker.js", serveSiteAnalyticsTrackerScript);
router.get("/pixel.gif", collectSiteAnalyticsPixelEvent);
router.post("/collect", express.text({ type: "*/*", limit: "256kb" }), collectSiteAnalyticsEvent);

router.get(
  "/",
  requireAuth,
  requireAnyPrivilege(["VIEW_SITE_ANALYTICS", "MANAGE_SITE_ANALYTICS"]),
  getSiteAnalyticsSummary
);
router.get(
  "/detail",
  requireAuth,
  requireAnyPrivilege(["VIEW_SITE_ANALYTICS", "MANAGE_SITE_ANALYTICS"]),
  getTrackedSiteAnalyticsDetail
);
router.post(
  "/url/block",
  requireAuth,
  requirePrivilege("MANAGE_SITE_ANALYTICS"),
  blockTrackedSiteAnalyticsUrlAction
);
router.post(
  "/url/unblock",
  requireAuth,
  requirePrivilege("MANAGE_SITE_ANALYTICS"),
  unblockTrackedSiteAnalyticsUrlAction
);
router.post(
  "/url/clear",
  requireAuth,
  requirePrivilege("MANAGE_SITE_ANALYTICS"),
  clearTrackedSiteAnalyticsUrlStatsAction
);
router.post(
  "/url/delete",
  requireAuth,
  requirePrivilege("MANAGE_SITE_ANALYTICS"),
  deleteTrackedSiteAnalyticsUrlAction
);

export default router;
