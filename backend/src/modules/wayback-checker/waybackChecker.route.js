import express from "express";
import {
  createWaybackBatch,
  getWaybackBatch,
  listWaybackBatches,
  listWaybackResults,
  submitWaybackDomainResult,
  takeWaybackDomain,
} from "./waybackChecker.controller.js";
import {
  requireAnyPrivilege,
  requireAuth,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();
const WAYBACK_ACCESS_PRIVILEGES = [
  "VIEW_WAYBACK_CHECKER",
  "DO_WAYBACK_CHECKER",
  "VIEW_EXPIRED_DOMAINS",
];

router.use(requireAuth, requireAnyPrivilege(WAYBACK_ACCESS_PRIVILEGES));

router.get("/batches", listWaybackBatches);
router.post("/batches", createWaybackBatch);
router.get("/batches/:batchNumber", getWaybackBatch);
router.get("/batches/:batchNumber/results", listWaybackResults);
router.post("/domains/:domainId/take", takeWaybackDomain);
router.post("/domains/:domainId/result", submitWaybackDomainResult);

export default router;
