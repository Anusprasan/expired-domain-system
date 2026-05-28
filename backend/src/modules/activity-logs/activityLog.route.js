import express from "express";
import { getActivityLogs, recordPageVisit } from "./activityLog.controller.js";
import { requireAnyPrivilege, requireAuth } from "../../app/middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  requireAnyPrivilege(["VIEW_SYSTEM_AUDIT_LOGS", "VIEW_OWN_AUDIT_LOGS", "ADMIN_ACCESS"]),
  getActivityLogs
);

router.post("/page-visits", recordPageVisit);

export default router;
