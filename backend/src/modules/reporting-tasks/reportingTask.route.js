import express from "express";
import {
  acceptReportingTask,
  createReportingTaskFromTelegram,
  createReportingTask,
  deleteReportingTask,
  getReportingTaskEvidenceImage,
  getReportingTaskStaff,
  getReportingTasks,
  submitReportingTaskDdosEvidence,
  submitReportingTaskEvidence,
  updateReportingTask,
} from "./reportingTask.controller.js";
import {
  requireAnyPrivilege,
  requireAuth,
  requireAuthFromHeaderOrQuery,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";
import {
  handleUploadError,
  reportingEvidenceUpload,
} from "../../app/middleware/imageUpload.middleware.js";

const router = express.Router();
const TASK_READ_PRIVILEGES  = ["READ_REPORTING_TASKS", "ADD_REPORTING_TASKS", "RECEIVE_REPORTING_TASKS"];
const TASK_TRACK_PRIVILEGES = ["ADD_REPORTING_TASKS", "READ_REPORTING_TASKS", "TRACK_REPORTING_TASKS"];

router.get(
  "/:id/evidence-images/:imageId",
  requireAuthFromHeaderOrQuery,
  getReportingTaskEvidenceImage
);

router.post("/telegram/:botId", createReportingTaskFromTelegram);

router.use(requireAuth);

router.get("/",         requireAnyPrivilege(TASK_READ_PRIVILEGES),   getReportingTasks);
router.get("/staff",    requireAnyPrivilege(TASK_TRACK_PRIVILEGES),   getReportingTaskStaff);
router.post("/",        requirePrivilege("ADD_REPORTING_TASKS"),      createReportingTask);
router.patch("/:id",    updateReportingTask);
router.delete("/:id",   deleteReportingTask);
router.patch("/:id/accept",      requirePrivilege("RECEIVE_REPORTING_TASKS"), acceptReportingTask);
router.post(
  "/:id/evidence",
  requirePrivilege("RECEIVE_REPORTING_TASKS"),
  reportingEvidenceUpload,
  handleUploadError,
  submitReportingTaskEvidence
);
router.post(
  "/:id/ddos-evidence",
  requirePrivilege("DO_DDOS_REPORTING_TASKS"),
  reportingEvidenceUpload,
  handleUploadError,
  submitReportingTaskDdosEvidence
);

export default router;
