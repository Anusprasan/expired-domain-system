import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "../users/user.model.js";
import PasswordResetRequest from "./passwordReset.model.js";
import { sendMail } from "../../app/utils/mailer.js";

const SELF_SERVICE_RESET_PRIVILEGES = [
  "ADMIN_ACCESS",
];

const RESET_REVIEW_PRIVILEGES = [
  "ADMIN_ACCESS",
  "RESET_OTHER_USER_PASSWORDS",
];

const hasSelfServiceResetAccess = (user) => {
  const keys = user?.groupId?.privilegeIds?.map((p) => p.key) || [];
  return SELF_SERVICE_RESET_PRIVILEGES.some((key) => keys.includes(key));
};

const canReviewResetRequests = (user) => {
  const keys = user?.groupId?.privilegeIds?.map((p) => p.key) || [];
  return RESET_REVIEW_PRIVILEGES.some((key) => keys.includes(key));
};

export const requestPasswordResetService = async ({ email }) => {
  const user = await User.findOne({ email: email.toLowerCase() }).populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });

  const safeResponse = {
    safeMessage:
      "If the email exists in the system, the password reset flow has been initiated.",
  };

  if (!user || user.status !== "active") {
    return safeResponse;
  }

  const isPrivileged = hasSelfServiceResetAccess(user);

  // EXPIRE OLD TOKENS
  await PasswordResetRequest.updateMany(
    {
      userId: user._id,
      requestType: "self-reset",
      status: "pending",
    },
    {
      $set: {
        status: "expired",
        token: null,
      },
    }
  );

  if (isPrivileged) {
    const rawToken = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    await PasswordResetRequest.create({
      userId: user._id,
      email: user.email,
      requestType: "self-reset",
      status: "pending",
      token: tokenHash,
      expiresAt,
    });

    const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;

    console.log("Password reset link:", resetLink);

    await sendMail({
      to: user.email,
      subject: "200M Password Reset",
      text: `Use this link to reset your password: ${resetLink}`,
      html: `
        <p>Hello ${user.fullName},</p>
        <p>You requested a password reset.</p>
        <p><a href="${resetLink}">Reset Password</a></p>
        <p>This link expires in 30 minutes.</p>
      `,
    });

    return safeResponse;
  }

  // NORMAL USER FLOW

  await PasswordResetRequest.create({
    userId: user._id,
    email: user.email,
    requestType: "admin-reset-request",
    status: "pending",
  });

  const admins = await User.find({ status: "active" }).populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });

  const notifiableAdmins = admins.filter((a) =>
    canReviewResetRequests(a)
  );

  for (const admin of notifiableAdmins) {
    try {
      await sendMail({
        to: admin.email,
        subject: "Password Reset Approval Required",
        text: `${user.fullName} requested a password reset.`,
        html: `
          <p>${user.fullName} (${user.email}) requested a password reset.</p>
          <p>Please review this request in the admin panel.</p>
        `,
      });
    } catch (err) {
      console.error("Admin email failed:", err.message);
    }
  }

  return safeResponse;
};

export const resetPasswordWithTokenService = async ({
  token,
  newPassword,
}) => {
  if (!token || typeof token !== "string") {
    throw new Error("Reset token is required");
  }

  if (!newPassword || typeof newPassword !== "string") {
    throw new Error("New password is required");
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const resetRequest = await PasswordResetRequest.findOne({
    token: tokenHash,
    requestType: "self-reset",
    status: "pending",
  });

  if (!resetRequest) {
    throw new Error("Invalid reset token");
  }

  if (!resetRequest.expiresAt || resetRequest.expiresAt < new Date()) {
    resetRequest.status = "expired";
    await resetRequest.save();
    throw new Error("Reset token has expired");
  }

  const user = await User.findById(resetRequest.userId);

  if (!user) {
    throw new Error("User not found");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  resetRequest.status = "completed";
  resetRequest.token = null;

  await resetRequest.save();

  return { success: true };
};

export const getPendingResetRequestsService = async () => {
  return PasswordResetRequest.find({
    requestType: "admin-reset-request",
    status: "pending",
  })
    .populate("userId", "fullName email status")
    .sort({ createdAt: -1 });
};

export const clearPasswordResetRequestService = async ({
  requestId,
  adminUserId,
  adminNotes,
}) => {
  const resetRequest = await PasswordResetRequest.findById(requestId);

  if (!resetRequest) {
    throw new Error("Password reset request not found");
  }

  if (resetRequest.requestType !== "admin-reset-request") {
    throw new Error("Invalid request type");
  }

  if (resetRequest.status !== "pending") {
    throw new Error("Password reset request is not pending");
  }

  resetRequest.status = "rejected";
  resetRequest.approvedBy = adminUserId;
  resetRequest.adminNotes = adminNotes?.trim() || "Notification cleared by admin";

  await resetRequest.save();

  return { success: true };
};

export const clearAllPasswordResetRequestsService = async ({
  adminUserId,
  adminNotes,
}) => {
  const pendingRequests = await PasswordResetRequest.find({
    requestType: "admin-reset-request",
    status: "pending",
  });

  if (!pendingRequests.length) {
    return { success: true, clearedCount: 0 };
  }

  await PasswordResetRequest.updateMany(
    {
      requestType: "admin-reset-request",
      status: "pending",
    },
    {
      $set: {
        status: "rejected",
        approvedBy: adminUserId,
        adminNotes: adminNotes?.trim() || "Notifications cleared by admin",
      },
    }
  );

  return { success: true, clearedCount: pendingRequests.length };
};

export const adminResetUserPasswordService = async ({
  requestId,
  adminUserId,
  newPassword,
  adminNotes,
}) => {
  const resetRequest = await PasswordResetRequest.findById(requestId);

  if (!resetRequest) {
    throw new Error("Password reset request not found");
  }

  if (resetRequest.requestType !== "admin-reset-request") {
    throw new Error("Invalid request type");
  }

  if (resetRequest.status !== "pending") {
    throw new Error("Password reset request is not pending");
  }

  const user = await User.findById(resetRequest.userId);

  if (!user) {
    throw new Error("User not found");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  resetRequest.status = "completed";
  resetRequest.approvedBy = adminUserId;
  resetRequest.adminNotes = adminNotes || "";

  await resetRequest.save();

  await PasswordResetRequest.updateMany(
    {
      _id: { $ne: resetRequest._id },
      userId: resetRequest.userId,
      requestType: "admin-reset-request",
      status: "pending",
    },
    {
      $set: {
        status: "rejected",
        approvedBy: adminUserId,
        adminNotes: "Closed automatically after admin password reset",
      },
    }
  );

  return { success: true };
};
