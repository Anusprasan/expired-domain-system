import express from "express";
import {
  adminResetUserPassword,
  clearAllPasswordResetRequests,
  clearPasswordResetRequest,
  getPendingResetRequests,
  requestPasswordReset,
  resetPasswordWithToken,
} from "./passwordReset.controller.js";
import {
  requireAuth,
  requirePrivilege,
} from "../../app/middleware/auth.middleware.js";

const router = express.Router();

router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPasswordWithToken);

router.get(
  "/requests",
  requireAuth,
  requirePrivilege("RESET_OTHER_USER_PASSWORDS"),
  getPendingResetRequests
);

router.post(
  "/requests/:id/admin-reset",
  requireAuth,
  requirePrivilege("RESET_OTHER_USER_PASSWORDS"),
  adminResetUserPassword
);

router.post(
  "/requests/:id/clear",
  requireAuth,
  requirePrivilege("RESET_OTHER_USER_PASSWORDS"),
  clearPasswordResetRequest
);

router.post(
  "/requests/clear-all",
  requireAuth,
  requirePrivilege("RESET_OTHER_USER_PASSWORDS"),
  clearAllPasswordResetRequests
);

export default router;
