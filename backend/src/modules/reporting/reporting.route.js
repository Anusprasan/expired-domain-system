import express from "express";
import {
  cleanupReportingEvidenceStorage,
  claimReportingReport,
  createReportingReport,
  createReportingMailProfile,
  createReportingMyMailProfile,
  createReportingSubmission,
  deleteReportingSubmissionOldImages,
  deleteReportingSubmission,
  deleteReportingMailProfile,
  deleteReportingMyMailProfile,
  deleteReportingTask,
  generateReportingEmail,
  getReportingMailProfilesAdmin,
  getReportingMailProfilesMine,
  getReportingEvidenceStorageSummary,
  getReportingTaskTracking,
  getReportingWorkflows,
  getReportingOverview,
  getReportingReportDetail,
  getReportingReports,
  getReportingSubmissionImage,
  getReportingUserSettings,
  markReportingClaimChecked,
  rejectReportingClaim,
  reverseReportingClaimChecked,
  saveReportingEmailDraft,
  sendReportingMailProfileTest,
  sendReportingMyMailProfileTest,
  sendReportingEmail,
  unclaimReportingReport,
  updateReportingMailProfile,
  updateReportingMyMailProfile,
  updateReportingTask,
  updateReportingSubmission,
  updateReportingUserSettings,
  updateReportingWorkflow,
  updateReportingReportStatus,
} from "./reporting.controller.js";
import {
  requireAnyPrivilege,
  requireAuth,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();
const REPORTING_WORKFLOW_ACCESS_PRIVILEGES = [
  "ADD_REPORTING_URLS",
  "VIEW_REPORTING_PROGRESS",
  "DO_REPORTING",
  "GENERATE_REPORTING_AI_EMAIL",
  "SEND_REPORTING_EMAIL",
  "VIEW_REPORTING_ADMIN_REVIEW",
  "EDIT_REPORTING_WORKFLOWS",
  "EDIT_REPORTING_TASKS",
  "DELETE_REPORTING_TASKS",
  "MANAGE_REPORTING_SMTP_PROFILES",
];
const REPORTING_WORKSPACE_ACCESS_PRIVILEGES = REPORTING_WORKFLOW_ACCESS_PRIVILEGES;

router.use(requireAuth);

router.get(
  "/workflows",
  requireAnyPrivilege(REPORTING_WORKFLOW_ACCESS_PRIVILEGES),
  getReportingWorkflows
);
router.get(
  "/overview",
  requireAnyPrivilege(REPORTING_WORKSPACE_ACCESS_PRIVILEGES),
  getReportingOverview
);
router.get(
  "/settings",
  requirePrivilege("GENERATE_REPORTING_AI_EMAIL"),
  getReportingUserSettings
);
router.patch(
  "/settings",
  requirePrivilege("GENERATE_REPORTING_AI_EMAIL"),
  updateReportingUserSettings
);
router.get(
  "/task-tracking",
  requirePrivilege("VIEW_REPORTING_ADMIN_REVIEW"),
  getReportingTaskTracking
);
router.get(
  "/evidence-storage",
  requirePrivilege("VIEW_REPORTING_ADMIN_REVIEW"),
  getReportingEvidenceStorageSummary
);
router.post(
  "/evidence-storage/cleanup",
  requirePrivilege("VIEW_REPORTING_ADMIN_REVIEW"),
  cleanupReportingEvidenceStorage
);
router.get(
  "/mail-profiles/admin",
  requirePrivilege("MANAGE_REPORTING_SMTP_PROFILES"),
  getReportingMailProfilesAdmin
);
router.post(
  "/mail-profiles/admin",
  requirePrivilege("MANAGE_REPORTING_SMTP_PROFILES"),
  createReportingMailProfile
);
router.patch(
  "/mail-profiles/admin/:profileId",
  requirePrivilege("MANAGE_REPORTING_SMTP_PROFILES"),
  updateReportingMailProfile
);
router.delete(
  "/mail-profiles/admin/:profileId",
  requirePrivilege("MANAGE_REPORTING_SMTP_PROFILES"),
  deleteReportingMailProfile
);
router.post(
  "/mail-profiles/admin/:profileId/test",
  requirePrivilege("MANAGE_REPORTING_SMTP_PROFILES"),
  sendReportingMailProfileTest
);
router.get(
  "/mail-profiles/mine",
  requirePrivilege("SEND_REPORTING_EMAIL"),
  getReportingMailProfilesMine
);
router.post(
  "/mail-profiles/mine",
  requirePrivilege("SEND_REPORTING_EMAIL"),
  createReportingMyMailProfile
);
router.patch(
  "/mail-profiles/mine/:profileId",
  requirePrivilege("SEND_REPORTING_EMAIL"),
  updateReportingMyMailProfile
);
router.delete(
  "/mail-profiles/mine/:profileId",
  requirePrivilege("SEND_REPORTING_EMAIL"),
  deleteReportingMyMailProfile
);
router.post(
  "/mail-profiles/mine/:profileId/test",
  requirePrivilege("SEND_REPORTING_EMAIL"),
  sendReportingMyMailProfileTest
);
router.get(
  "/reports",
  requireAnyPrivilege(REPORTING_WORKSPACE_ACCESS_PRIVILEGES),
  getReportingReports
);
router.get(
  "/reports/:id",
  requireAnyPrivilege(REPORTING_WORKSPACE_ACCESS_PRIVILEGES),
  getReportingReportDetail
);
router.get(
  "/reports/:id/submissions/:submissionId/images/:imageId",
  requireAnyPrivilege(REPORTING_WORKSPACE_ACCESS_PRIVILEGES),
  getReportingSubmissionImage
);
router.post(
  "/reports/:id/submissions/:submissionId/images/cleanup-old",
  requirePrivilege("VIEW_REPORTING_ADMIN_REVIEW"),
  deleteReportingSubmissionOldImages
);
router.post("/reports", requirePrivilege("ADD_REPORTING_URLS"), createReportingReport);
router.patch("/reports/:id", requirePrivilege("EDIT_REPORTING_TASKS"), updateReportingTask);
router.delete("/reports/:id", requirePrivilege("DELETE_REPORTING_TASKS"), deleteReportingTask);
router.patch("/reports/:id/claim", requirePrivilege("DO_REPORTING"), claimReportingReport);
router.patch("/reports/:id/unclaim", requirePrivilege("DO_REPORTING"), unclaimReportingReport);
router.patch("/reports/:id/status", requirePrivilege("DO_REPORTING"), updateReportingReportStatus);
router.post("/reports/:id/ai/generate", requirePrivilege("GENERATE_REPORTING_AI_EMAIL"), generateReportingEmail);
router.post(
  "/reports/:id/ai/draft",
  requireAnyPrivilege(["GENERATE_REPORTING_AI_EMAIL", "SEND_REPORTING_EMAIL"]),
  saveReportingEmailDraft
);
router.post("/reports/:id/ai/send", requirePrivilege("SEND_REPORTING_EMAIL"), sendReportingEmail);
router.post("/reports/:id/submissions", requirePrivilege("DO_REPORTING"), createReportingSubmission);
router.patch("/reports/:id/submissions/:submissionId", requirePrivilege("DO_REPORTING"), updateReportingSubmission);
router.delete("/reports/:id/submissions/:submissionId", requirePrivilege("DO_REPORTING"), deleteReportingSubmission);
router.patch(
  "/reports/:id/claims/:reporterId/check",
  requirePrivilege("VIEW_REPORTING_ADMIN_REVIEW"),
  markReportingClaimChecked
);
router.patch(
  "/reports/:id/claims/:reporterId/reject",
  requirePrivilege("VIEW_REPORTING_ADMIN_REVIEW"),
  rejectReportingClaim
);
router.patch(
  "/reports/:id/claims/:reporterId/uncheck",
  requirePrivilege("VIEW_REPORTING_ADMIN_REVIEW"),
  reverseReportingClaimChecked
);
router.patch("/workflows/:issueType", requirePrivilege("EDIT_REPORTING_WORKFLOWS"), updateReportingWorkflow);

export default router;
