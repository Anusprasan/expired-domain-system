import express from "express";
import {
  checkWebsiteSnapshotArchiveStatus,
  deleteWebsiteSnapshotHistory,
  downloadWebsiteSnapshot,
  listWebsiteSnapshotHistory,
  listWebsiteSnapshotViewStates,
  searchWebsiteSnapshots,
  setWebsiteSnapshotViewState,
} from "./websiteSnapshot.controller.js";
import {
  requireAnyPrivilege,
  requireAuth,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();

const WEBSITE_SNAPSHOT_ACCESS_PRIVILEGES = [
  "VIEW_WEBSITE_SNAPSHOTS",
  "DOWNLOAD_WEBSITE_SNAPSHOTS",
  "MANAGE_WEBSITE_SNAPSHOTS",
];

router.get(
  "/history",
  requireAuth,
  requireAnyPrivilege(WEBSITE_SNAPSHOT_ACCESS_PRIVILEGES),
  listWebsiteSnapshotHistory
);

router.delete(
  "/history/:historyId",
  requireAuth,
  requirePrivilege("MANAGE_WEBSITE_SNAPSHOTS"),
  deleteWebsiteSnapshotHistory
);

router.get(
  "/archive-status",
  requireAuth,
  requireAnyPrivilege(WEBSITE_SNAPSHOT_ACCESS_PRIVILEGES),
  checkWebsiteSnapshotArchiveStatus
);

router.post(
  "/view-states",
  requireAuth,
  requireAnyPrivilege(WEBSITE_SNAPSHOT_ACCESS_PRIVILEGES),
  listWebsiteSnapshotViewStates
);

router.post(
  "/view-state",
  requireAuth,
  requireAnyPrivilege(WEBSITE_SNAPSHOT_ACCESS_PRIVILEGES),
  setWebsiteSnapshotViewState
);

router.get(
  "/",
  requireAuth,
  requireAnyPrivilege(WEBSITE_SNAPSHOT_ACCESS_PRIVILEGES),
  searchWebsiteSnapshots
);

router.post(
  "/download",
  requireAuth,
  requirePrivilege("DOWNLOAD_WEBSITE_SNAPSHOTS"),
  downloadWebsiteSnapshot
);

export default router;
