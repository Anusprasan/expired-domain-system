import express from "express";
import {
  getLPServers,
  createLPServer,
  updateLPServer,
  deleteLPServer,
  exportLPServersCsv,
  getLPServerPassword,
  importLPServersCsv,
  previewLPServersCsvImport,
} from "./lpServer.controller.js";

import {
  requireAuth,
  requireAnyPrivilege,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();
const LP_SERVER_VIEW_PRIVILEGES = [
  "VIEW_LP_SERVERS_DETAILS",
  "CREATE_LP_SERVERS_DETAILS",
  "EDIT_LP_SERVERS_DETAILS",
  "DELETE_LP_SERVERS_DETAILS",
  "IMPORT_LP_SERVERS_DETAILS",
  "EXPORT_LP_SERVERS_DETAILS",
  "ADMIN_ACCESS",
];

router.use(requireAuth);

// VIEW (User + Admin)
router.get(
  "/",
  requireAnyPrivilege(LP_SERVER_VIEW_PRIVILEGES),
  getLPServers
);

router.get("/export", requirePrivilege("EXPORT_LP_SERVERS_DETAILS"), exportLPServersCsv);
router.get("/:id/password", requireAnyPrivilege(LP_SERVER_VIEW_PRIVILEGES), getLPServerPassword);

// CREATE (Admin)
router.post(
  "/",
  requirePrivilege("CREATE_LP_SERVERS_DETAILS"),
  createLPServer
);

router.post(
  "/import/preview",
  requirePrivilege("IMPORT_LP_SERVERS_DETAILS"),
  previewLPServersCsvImport
);

router.post(
  "/import",
  requirePrivilege("IMPORT_LP_SERVERS_DETAILS"),
  importLPServersCsv
);

// UPDATE (Admin)
router.put(
  "/:id",
  requirePrivilege("EDIT_LP_SERVERS_DETAILS"),
  updateLPServer
);

// DELETE (Admin - soft delete)
router.delete(
  "/:id",
  requirePrivilege("DELETE_LP_SERVERS_DETAILS"),
  deleteLPServer
);

export default router;
