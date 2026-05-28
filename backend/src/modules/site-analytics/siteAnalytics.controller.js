import { createActivityLog } from "../activity-logs/activityLog.service.js";
import {
  blockTrackedSiteAnalyticsUrl,
  buildSiteAnalyticsTrackerScript,
  clearTrackedSiteAnalyticsUrlStats,
  collectPublicSiteAnalyticsEvent,
  deleteTrackedSiteAnalyticsUrl,
  getSiteAnalyticsDetail,
  getTransparentGifBuffer,
  listSiteAnalyticsSummary,
  parseCollectorPayload,
  unblockTrackedSiteAnalyticsUrl,
} from "./siteAnalytics.service.js";

function safeCreateSiteAnalyticsActivityLog(payload) {
  return createActivityLog(payload).catch((error) => {
    console.error("Failed to write site analytics activity log:", error.message);
  });
}

function buildSiteAnalyticsLogPayload(req, result, overrides = {}) {
  const mainUrl = result?.mainUrl || req.body?.mainUrl || "";
  const pageTitle = String(req.body?.pageTitle || "").trim();

  return {
    actorUser: req.user,
    module: "site-analytics",
    category: "data",
    targetType: "url",
    targetId: mainUrl,
    targetLabel: pageTitle || mainUrl,
    httpMethod: req.method,
    routePath: req.originalUrl,
    statusCode: 200,
    durationMs: 0,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      mainUrl,
      pageTitle,
      ...overrides.metadata,
    },
    ...overrides,
  };
}

export const serveSiteAnalyticsTrackerScript = async (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return res.send(buildSiteAnalyticsTrackerScript());
};

export const collectSiteAnalyticsEvent = async (req, res) => {
  try {
    await collectPublicSiteAnalyticsEvent({
      payload: parseCollectorPayload(req.body),
      req,
      fallbackSource: "script",
    });
  } catch (error) {
    console.warn(`[site-analytics] collect failed: ${error.message}`);
  }

  return res.status(204).end();
};

export const collectSiteAnalyticsPixelEvent = async (req, res) => {
  try {
    await collectPublicSiteAnalyticsEvent({
      payload: req.query,
      req,
      fallbackSource: "amp",
    });
  } catch (error) {
    console.warn(`[site-analytics] pixel failed: ${error.message}`);
  }

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return res.end(getTransparentGifBuffer());
};

export const getSiteAnalyticsSummary = async (req, res) => {
  try {
    const result = await listSiteAnalyticsSummary({
      search: req.query.search,
      traffic: req.query.traffic,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getTrackedSiteAnalyticsDetail = async (req, res) => {
  try {
    const result = await getSiteAnalyticsDetail({
      mainUrl: req.query.mainUrl,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const blockTrackedSiteAnalyticsUrlAction = async (req, res) => {
  try {
    const result = await blockTrackedSiteAnalyticsUrl({
      mainUrl: req.body?.mainUrl,
      pageTitle: req.body?.pageTitle,
    });

    await safeCreateSiteAnalyticsActivityLog(
      buildSiteAnalyticsLogPayload(req, result, {
        action: "site-analytics.url.block",
        summary: "Blocked tracked URL from future analytics collection",
        details: "Future page views and click events for this tracked URL will be ignored.",
        metadata: {
          isBlocked: true,
        },
      })
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const unblockTrackedSiteAnalyticsUrlAction = async (req, res) => {
  try {
    const result = await unblockTrackedSiteAnalyticsUrl({
      mainUrl: req.body?.mainUrl,
    });

    await safeCreateSiteAnalyticsActivityLog(
      buildSiteAnalyticsLogPayload(req, result, {
        action: "site-analytics.url.unblock",
        summary: "Restored analytics collection for tracked URL",
        details: "New page views and click events can be collected again for this tracked URL.",
        metadata: {
          isBlocked: false,
          ruleRemoved: Boolean(result?.removed),
        },
      })
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const clearTrackedSiteAnalyticsUrlStatsAction = async (req, res) => {
  try {
    const result = await clearTrackedSiteAnalyticsUrlStats({
      mainUrl: req.body?.mainUrl,
    });

    await safeCreateSiteAnalyticsActivityLog(
      buildSiteAnalyticsLogPayload(req, result, {
        action: "site-analytics.url.clear-stats",
        summary: "Cleared saved analytics stats for tracked URL",
        details: `Removed ${Number(result?.deletedEvents || 0)} saved analytics event(s).`,
        metadata: {
          deletedEvents: Number(result?.deletedEvents || 0),
        },
      })
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteTrackedSiteAnalyticsUrlAction = async (req, res) => {
  try {
    const result = await deleteTrackedSiteAnalyticsUrl({
      mainUrl: req.body?.mainUrl,
    });

    await safeCreateSiteAnalyticsActivityLog(
      buildSiteAnalyticsLogPayload(req, result, {
        action: "site-analytics.url.delete",
        summary: "Deleted tracked URL analytics record",
        details:
          `Removed ${Number(result?.deletedEvents || 0)} event(s)` +
          ` and ${Number(result?.removedBlockedRule || 0)} block rule(s).`,
        metadata: {
          deletedEvents: Number(result?.deletedEvents || 0),
          removedBlockedRule: Number(result?.removedBlockedRule || 0),
        },
      })
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
