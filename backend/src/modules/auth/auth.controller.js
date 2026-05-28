import { createActivityLog } from "../activity-logs/activityLog.service.js";
import {
  changeAuthenticatedUserPassword,
  getAuthenticatedUserProfile,
  loginUser,
  serializeAuthenticatedUser,
  updateAuthenticatedUserProfile,
} from "./auth.service.js";

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await loginUser({ email, password });

    await createActivityLog({
      actorUser: result.user,
      module: "auth",
      category: "auth",
      action: "auth.login",
      targetType: "session",
      targetId: result.user._id,
      targetLabel: result.user.email,
      summary: "Logged into the system",
      httpMethod: req.method,
      routePath: req.originalUrl,
      statusCode: 200,
      durationMs: 0,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      success: true,
      message: "Login successful",
      data: {
        token: result.token,
        user: serializeAuthenticatedUser(result.user),
      },
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

export const me = async (req, res) => {
  return res.json({
    success: true,
    data: serializeAuthenticatedUser(req.user),
  });
};

export const getProfile = async (req, res) => {
  try {
    const profile = await getAuthenticatedUserProfile(req.user._id);

    return res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const profile = await updateAuthenticatedUserProfile({
      userId: req.user._id,
      fullName: req.body.fullName,
      preferredLanguage: req.body.preferredLanguage ?? req.body.moneySiteLanguage,
    });

    await createActivityLog({
      actorUser: req.user,
      module: "auth",
      category: "profile",
      action: "auth.profile.update-name",
      targetType: "user",
      targetId: req.user._id,
      targetLabel: req.user.email,
      summary: "Updated profile settings",
      httpMethod: req.method,
      routePath: req.originalUrl,
      statusCode: 200,
      durationMs: 0,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      success: true,
      message: "Profile updated successfully",
      data: profile,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const changeMyPassword = async (req, res) => {
  try {
    await changeAuthenticatedUserPassword({
      userId: req.user._id,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });

    await createActivityLog({
      actorUser: req.user,
      module: "auth",
      category: "profile",
      action: "auth.profile.change-password",
      targetType: "user",
      targetId: req.user._id,
      targetLabel: req.user.email,
      summary: "Changed account password",
      httpMethod: req.method,
      routePath: req.originalUrl,
      statusCode: 200,
      durationMs: 0,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
