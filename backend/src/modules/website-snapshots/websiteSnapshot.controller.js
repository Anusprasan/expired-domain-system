import { createActivityLog } from "../activity-logs/activityLog.service.js";
import {
  checkWebsiteSnapshotArchiveStatusService,
  deleteWebsiteSnapshotHistoryService,
  downloadWebsiteSnapshotService,
  listWebsiteSnapshotHistoryService,
  listWebsiteSnapshotViewStatesService,
  recordWebsiteSnapshotDownloadHistory,
  recordWebsiteSnapshotSearchHistory,
  searchWebsiteSnapshotsService,
  setWebsiteSnapshotViewStateService,
} from "./websiteSnapshot.service.js";

function safeCreateWebsiteSnapshotActivityLog(payload) {
  return createActivityLog(payload).catch((error) => {
    console.error("Failed to write website snapshot activity log:", error.message);
  });
}

function safeRecordWebsiteSnapshotHistory(task) {
  return task().catch((error) => {
    console.error("Failed to write website snapshot history:", error.message);
  });
}

function buildActivityBase(req, overrides = {}) {
  return {
    actorUser: req.user,
    module: "website-snapshots",
    category: "data",
    httpMethod: req.method,
    routePath: req.originalUrl,
    statusCode: 200,
    durationMs: 0,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    ...overrides,
  };
}

function getDownloadFileNameHeader(fileName) {
  const encodedFileName = encodeURIComponent(fileName);
  return `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`;
}

export const searchWebsiteSnapshots = async (req, res) => {
  try {
    const result = await searchWebsiteSnapshotsService({
      url: req.query.url,
      scope: req.query.scope,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      limit: req.query.limit,
    });

    await safeRecordWebsiteSnapshotHistory(() =>
      recordWebsiteSnapshotSearchHistory({
        actorUser: req.user,
        req,
        requestedUrl: req.query.url,
        result,
        
      })
    );

    await safeCreateWebsiteSnapshotActivityLog(
      buildActivityBase(req, {
        action: "website-snapshot.search",
        targetType: "website",
        targetId: result.query?.url,
        targetLabel: result.query?.url,
        summary: "Searched historical website snapshots",
        details: `Found ${result.summary?.totalSnapshots || 0} archived snapshot(s).`,
        metadata: {
          ...result.query,
          totalSnapshots: result.summary?.totalSnapshots || 0,
        },
      })
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code || "WEBSITE_SNAPSHOT_SEARCH_FAILED",
    });
  }
};

export const listWebsiteSnapshotHistory = async (req, res) => {
  try {
    const result = await listWebsiteSnapshotHistoryService({
      type: req.query.type,
      limit: req.query.limit,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code || "WEBSITE_SNAPSHOT_HISTORY_FAILED",
    });
  }
};

export const deleteWebsiteSnapshotHistory = async (req, res) => {
  try {
    const result = await deleteWebsiteSnapshotHistoryService(req.params.historyId);

    await safeCreateWebsiteSnapshotActivityLog(
      buildActivityBase(req, {
        action: "website-snapshot.history.delete",
        targetType: "website-snapshot-history",
        targetId: req.params.historyId,
        targetLabel: result.item?.normalizedUrl || result.item?.requestedUrl,
        summary: "Deleted website snapshot history record",
        details: "Removed a saved website snapshot search/download history record.",
        metadata: {
          type: result.item?.type,
          requestedUrl: result.item?.requestedUrl,
          selectedTimestamp: result.item?.selectedTimestamp,
        },
      })
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code || "WEBSITE_SNAPSHOT_HISTORY_DELETE_FAILED",
    });
  }
};

export const listWebsiteSnapshotViewStates = async (req, res) => {
  try {
    const result = await listWebsiteSnapshotViewStatesService({
      snapshots: req.body?.snapshots,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code || "WEBSITE_SNAPSHOT_VIEW_STATES_FAILED",
    });
  }
};

export const setWebsiteSnapshotViewState = async (req, res) => {
  try {
    const result = await setWebsiteSnapshotViewStateService(
      {
        timestamp: req.body?.timestamp,
        originalUrl: req.body?.originalUrl,
        viewed: req.body?.viewed,
      },
      req.user
    );

    await safeCreateWebsiteSnapshotActivityLog(
      buildActivityBase(req, {
        action: result.viewed
          ? "website-snapshot.viewed.mark"
          : "website-snapshot.viewed.redo",
        targetType: "website-snapshot",
        targetId: result.snapshotKey,
        targetLabel: req.body?.originalUrl,
        summary: result.viewed
          ? "Marked website snapshot as viewed"
          : "Cleared website snapshot viewed mark",
        details: result.viewed
          ? "Saved viewed state for a website snapshot capture."
          : "Removed viewed state for a website snapshot capture.",
        metadata: {
          timestamp: req.body?.timestamp,
          originalUrl: req.body?.originalUrl,
          viewed: result.viewed,
        },
      })
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code || "WEBSITE_SNAPSHOT_VIEW_STATE_SAVE_FAILED",
    });
  }
};

export const checkWebsiteSnapshotArchiveStatus = async (req, res) => {
  try {
    const result = await checkWebsiteSnapshotArchiveStatusService({
      url: req.query.url,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 503).json({
      success: false,
      message: error.message,
      code: error.code || "WAYBACK_STATUS_CHECK_FAILED",
    });
  }
};

export const downloadWebsiteSnapshot = async (req, res) => {
  try {
    const result = await downloadWebsiteSnapshotService({
      url: req.body?.url,
      originalUrl: req.body?.originalUrl,
      timestamp: req.body?.timestamp,
      includeAssets: req.body?.includeAssets,
    });

    await safeRecordWebsiteSnapshotHistory(() =>
      recordWebsiteSnapshotDownloadHistory({
        actorUser: req.user,
        req,
        requestedUrl: req.body?.url,
        payload: req.body,
        result,
      })
    );

    await safeCreateWebsiteSnapshotActivityLog(
      buildActivityBase(req, {
        action: "website-snapshot.download",
        targetType: "website-snapshot",
        targetId: req.body?.timestamp,
        targetLabel: req.body?.originalUrl || req.body?.url,
        summary: "Downloaded historical website snapshot ZIP",
        details: `Downloaded ${result.manifest.downloadedAssets.length} asset(s); ${result.manifest.skippedAssets.length} skipped.`,
        metadata: {
          originalUrl: result.manifest.originalUrl,
          timestamp: result.manifest.timestamp,
          downloadedAssets: result.manifest.downloadedAssets.length,
          skippedAssets: result.manifest.skippedAssets.length,
        },
      })
    );

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", getDownloadFileNameHeader(result.fileName));
    res.setHeader("Content-Length", result.archiveBuffer.length);
    return res.end(result.archiveBuffer);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      code: error.code || "WEBSITE_SNAPSHOT_DOWNLOAD_FAILED",
    });
  }
};
