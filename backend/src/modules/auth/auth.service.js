import bcrypt from "bcryptjs";
import "../privileges/privilege.model.js";
import User from "../users/user.model.js";
import { isAdminUser } from "../users/user.service.js";
import ActivityLog from "../activity-logs/activityLog.model.js";
import { generateToken } from "../../app/utils/jwt.js";
import { MONEY_SITE_ACCESS_PRIVILEGES } from "../money-sites/moneySite.constants.js";
import { canManageTelegramBots, sanitizeTelegramBot } from "./auth.telegram.service.js";

const populateUserGroup = {
  path: "groupId",
  populate: { path: "privilegeIds" },
};

function getPrivilegeKeys(user) {
  return user?.groupId?.privilegeIds?.map((item) => item.key) || [];
}

function hasAnyPrivilege(user, privilegeKeys = []) {
  if (isAdminUser(user)) {
    return true;
  }

  const userPrivilegeKeys = getPrivilegeKeys(user);
  return privilegeKeys.some((privilegeKey) => userPrivilegeKeys.includes(privilegeKey));
}

function normalizePreferredLanguage(value) {
  return value === "indonesian" ? "indonesian" : "english";
}

function serializeAuthenticatedUser(user, lastLoginAt = null, extra = {}) {
  const preferredLanguage = normalizePreferredLanguage(
    user?.preferredLanguage || user?.moneySiteLanguage
  );

  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    status: user.status,
    preferredLanguage,
    lastLoginAt,
    group: user.groupId
      ? {
          id: user.groupId._id,
          name: user.groupId.name,
          privileges: user.groupId.privilegeIds,
        }
      : null,
    ...extra,
  };
}

export const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() }).populate(populateUserGroup);

  if (!user) {
    throw new Error("Invalid credentials");
  }

  if (user.status !== "active") {
    throw new Error("User account is inactive");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);

  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = generateToken({
    userId: user._id,
    email: user.email,
  });

  return { user, token };
};

export async function getAuthenticatedUserProfile(userId) {
  const user = await User.findById(userId)
    .select([
      "fullName",
      "email",
      "status",
      "preferredLanguage",
      "moneySiteLanguage",
      "groupId",
      "telegramBots._id",
      "telegramBots.name",
      "telegramBots.botUsername",
      "telegramBots.chatId",
      "telegramBots.isActive",
      "telegramBots.lastTestAt",
      "telegramBots.lastTestStatus",
      "telegramBots.lastTestMessage",
      "telegramBots.updatedAt",
      "+telegramBots.botTokenEncrypted",
    ].join(" "))
    .populate(populateUserGroup);

  if (!user) {
    throw new Error("User not found");
  }

  const lastLogin = await ActivityLog.findOne({
    actorUserId: user._id,
    action: "auth.login",
  })
    .sort({ occurredAt: -1 })
    .select("occurredAt");

  const canManageMoneySiteAlerts = hasAnyPrivilege(
    user,
    MONEY_SITE_ACCESS_PRIVILEGES.filter((privilegeKey) => privilegeKey !== "ADMIN_ACCESS")
  );
  const canManageProfileTelegramBots = canManageTelegramBots(user);

  return serializeAuthenticatedUser(user, lastLogin?.occurredAt || null, {
    canManageMoneySiteAlerts,
    canManageTelegramBots: canManageProfileTelegramBots,
    telegramBots: canManageProfileTelegramBots
      ? (user.telegramBots || []).map((bot) => sanitizeTelegramBot(bot)).filter(Boolean)
      : [],
  });
}

export async function updateAuthenticatedUserProfile({
  userId,
  fullName,
  preferredLanguage,
}) {
  const formattedName = String(fullName || "").trim().replace(/\s+/g, " ");

  if (!formattedName) {
    throw new Error("Username is required");
  }

  const user = await User.findById(userId).populate(populateUserGroup);

  if (!user) {
    throw new Error("User not found");
  }

  user.fullName = formattedName;
  if (preferredLanguage !== undefined) {
    const normalizedPreferredLanguage = normalizePreferredLanguage(preferredLanguage);
    user.preferredLanguage = normalizedPreferredLanguage;
    user.moneySiteLanguage = normalizedPreferredLanguage;
  }
  await user.save();

  return serializeAuthenticatedUser(user);
}

export async function changeAuthenticatedUserPassword({
  userId,
  currentPassword,
  newPassword,
}) {
  if (!currentPassword || !newPassword) {
    throw new Error("Current password and new password are required");
  }

  if (String(newPassword).length < 6) {
    throw new Error("New password must be at least 6 characters");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!isMatch) {
    throw new Error("Current password is incorrect");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
}
export { serializeAuthenticatedUser };
