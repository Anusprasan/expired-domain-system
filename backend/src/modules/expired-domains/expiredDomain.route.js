import express from "express";
import {
  getExpiredDomainBatch,
  getExpiredDomainProcessSubBatchDomains,
  getExpiredDomainProcessSubBatches,
  getExpiredDomains,
  moveExpiredDomainBatchToProcess,
  patchExpiredDomainProcessSubBatchStatus,
  uploadExpiredDomains,
  postExpiredDomain,
  removeExpiredDomain,
} from "./expiredDomain.controller.js";
import { requireAuth, requirePrivilege } from "../../app/middleware/auth.middleware.js";

const router = express.Router();

router.get("/", requireAuth, requirePrivilege("VIEW_EXPIRED_DOMAINS"), getExpiredDomains);
router.get(
  "/process/sub-batches",
  requireAuth,
  requirePrivilege("VIEW_EXPIRED_DOMAINS"),
  getExpiredDomainProcessSubBatches
);
router.get(
  "/process/sub-batches/:batchNumber/:subBatchNumber/domains",
  requireAuth,
  requirePrivilege("VIEW_EXPIRED_DOMAINS"),
  getExpiredDomainProcessSubBatchDomains
);
router.patch(
  "/process/sub-batches/:batchNumber/:subBatchNumber/status",
  requireAuth,
  requirePrivilege("VIEW_EXPIRED_DOMAINS"),
  patchExpiredDomainProcessSubBatchStatus
);
router.get("/batch/current", requireAuth, requirePrivilege("IMPORT_EXPIRED_DOMAINS"), getExpiredDomainBatch);
router.post("/import", requireAuth, requirePrivilege("IMPORT_EXPIRED_DOMAINS"), uploadExpiredDomains);
router.post(
  "/batch/move-to-process",
  requireAuth,
  requirePrivilege("IMPORT_EXPIRED_DOMAINS"),
  moveExpiredDomainBatchToProcess
);
router.post("/", requireAuth, requirePrivilege("CREATE_EXPIRED_DOMAINS"), postExpiredDomain);
router.delete("/:id", requireAuth, requirePrivilege("DELETE_EXPIRED_DOMAINS"), removeExpiredDomain);

export default router;
