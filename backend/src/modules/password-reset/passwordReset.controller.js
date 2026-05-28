import {
  adminResetUserPasswordService,
  clearAllPasswordResetRequestsService,
  clearPasswordResetRequestService,
  getPendingResetRequestsService,
  requestPasswordResetService,
  resetPasswordWithTokenService,
} from "./passwordReset.service.js";

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await requestPasswordResetService({ email });

    return res.json({
      success: true,
      message: result.safeMessage,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const resetPasswordWithToken = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    await resetPasswordWithTokenService({ token, newPassword });

    return res.json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getPendingResetRequests = async (req, res) => {
  const data = await getPendingResetRequestsService();
  return res.json({
    success: true,
    data,
  });
};

export const adminResetUserPassword = async (req, res) => {
  try {
    const { newPassword, adminNotes } = req.body;

    await adminResetUserPasswordService({
      requestId: req.params.id,
      adminUserId: req.user._id,
      newPassword,
      adminNotes,
    });

    return res.json({
      success: true,
      message: "User password reset successfully by admin",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const clearPasswordResetRequest = async (req, res) => {
  try {
    const { adminNotes } = req.body;

    await clearPasswordResetRequestService({
      requestId: req.params.id,
      adminUserId: req.user._id,
      adminNotes,
    });

    return res.json({
      success: true,
      message: "Password reset notification cleared",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const clearAllPasswordResetRequests = async (req, res) => {
  try {
    const { adminNotes } = req.body;

    const result = await clearAllPasswordResetRequestsService({
      adminUserId: req.user._id,
      adminNotes,
    });

    return res.json({
      success: true,
      message: "Password reset notifications cleared",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
