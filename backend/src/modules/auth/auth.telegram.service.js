import User from "../users/user.model.js";
import { decryptSecretValue, encryptSecretValue } from "../../app/utils/secureValue.js";
import { isAdminUser } from "../users/user.service.js";

const TELEGRAM_TEST_TIMEOUT_MS = 10_000;
const TELEGRAM_BOT_SELECT_FIELDS = [
  "status",
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
].join(" ");

const populateUserGroup = {
  path: "groupId",
  populate: { path: "privilegeIds" },
};

function normalizeString(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "true" || value === 1 || value === "1";
}

function filterActiveTelegramBots(bots = []) {
  return (bots || []).filter(
    (bot) => Boolean(bot?.isActive && String(bot?.chatId || "").trim() && bot?.botTokenEncrypted)
  );
}

async function findUserWithTelegramBots(userId) {
  return User.findById(userId)
    .select(TELEGRAM_BOT_SELECT_FIELDS)
    .populate(populateUserGroup);
}

export async function getAuthenticatedUserTelegramVerificationState({ userId }) {
  const user = await findUserWithTelegramBots(userId);

  if (!user || user.status !== "active" || !isAdminUser(user)) {
    return {
      telegramAvailable: false,
    };
  }

  return {
    telegramAvailable: filterActiveTelegramBots(user.telegramBots || []).length > 0,
  };
}

export function canManageTelegramBots(user) {
  return isAdminUser(user);
}

export function sanitizeTelegramBot(bot) {
  if (!bot) {
    return null;
  }

  return {
    _id: bot._id,
    id: bot._id,
    name: bot.name,
    botUsername: bot.botUsername || "",
    chatId: bot.chatId,
    isActive: Boolean(bot.isActive),
    hasStoredToken: Boolean(bot.botTokenEncrypted),
    lastTestAt: bot.lastTestAt || null,
    lastTestStatus: bot.lastTestStatus || "never",
    lastTestMessage: bot.lastTestMessage || "",
    updatedAt: bot.updatedAt || null,
  };
}

export function normalizeTelegramBotPayload(payload = {}, { requireToken = false } = {}) {
  const name = normalizeString(payload.name);
  const botUsername = normalizeString(payload.botUsername).replace(/^@+/, "");
  const chatId = String(payload.chatId || "").trim();
  const botToken = String(payload.botToken || "").trim();
  const isActive = normalizeBoolean(payload.isActive, true);

  if (!name) {
    throw new Error("Bot name is required");
  }

  if (!chatId) {
    throw new Error("Chat ID is required");
  }

  if (requireToken && !botToken) {
    throw new Error("Bot token is required");
  }

  return {
    name,
    botUsername,
    chatId,
    botToken,
    isActive,
  };
}

export async function sendTelegramMessage({ botToken, chatId, text }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_TEST_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.description || "Telegram request failed");
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function addAuthenticatedUserTelegramBot({ userId, payload }) {
  const user = await findUserWithTelegramBots(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (!canManageTelegramBots(user)) {
    throw new Error("Administrator access is required");
  }

  const normalizedPayload = normalizeTelegramBotPayload(payload, { requireToken: true });

  user.telegramBots.push({
    name: normalizedPayload.name,
    botUsername: normalizedPayload.botUsername,
    botTokenEncrypted: encryptSecretValue(normalizedPayload.botToken),
    chatId: normalizedPayload.chatId,
    isActive: normalizedPayload.isActive,
    lastTestAt: null,
    lastTestStatus: "never",
    lastTestMessage: "",
    updatedAt: new Date(),
  });

  await user.save();

  const createdBot = user.telegramBots[user.telegramBots.length - 1];
  return sanitizeTelegramBot(createdBot);
}

export async function updateAuthenticatedUserTelegramBot({ userId, botId, payload }) {
  const user = await findUserWithTelegramBots(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (!canManageTelegramBots(user)) {
    throw new Error("Administrator access is required");
  }

  const bot = user.telegramBots.id(botId);

  if (!bot) {
    throw new Error("Telegram bot not found");
  }

  const normalizedPayload = normalizeTelegramBotPayload(payload, { requireToken: false });

  if (!normalizedPayload.botToken && !bot.botTokenEncrypted) {
    throw new Error("Bot token is required");
  }

  bot.name = normalizedPayload.name;
  bot.botUsername = normalizedPayload.botUsername;
  bot.chatId = normalizedPayload.chatId;
  bot.isActive = normalizedPayload.isActive;
  bot.updatedAt = new Date();

  if (normalizedPayload.botToken) {
    bot.botTokenEncrypted = encryptSecretValue(normalizedPayload.botToken);
  }

  await user.save();

  return sanitizeTelegramBot(bot);
}

export async function deleteAuthenticatedUserTelegramBot({ userId, botId }) {
  const user = await findUserWithTelegramBots(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (!canManageTelegramBots(user)) {
    throw new Error("Administrator access is required");
  }

  const bot = user.telegramBots.id(botId);

  if (!bot) {
    throw new Error("Telegram bot not found");
  }

  const deletedBot = sanitizeTelegramBot(bot);
  user.telegramBots.pull(botId);
  await user.save();

  return deletedBot;
}

export async function testAuthenticatedUserTelegramBot({ userId, botId }) {
  const user = await findUserWithTelegramBots(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (!canManageTelegramBots(user)) {
    throw new Error("Administrator access is required");
  }

  const bot = user.telegramBots.id(botId);

  if (!bot) {
    throw new Error("Telegram bot not found");
  }

  const botToken = decryptSecretValue(bot.botTokenEncrypted);

  if (!botToken) {
    throw new Error("Stored bot token is unavailable");
  }

  try {
    await sendTelegramMessage({
      botToken,
      chatId: bot.chatId,
      text: `200M Web App test message\nBot: ${bot.name}\nTime: ${new Date().toISOString()}`,
    });

    bot.lastTestAt = new Date();
    bot.lastTestStatus = "success";
    bot.lastTestMessage = "Test message sent successfully";
    bot.updatedAt = new Date();
    await user.save();

    return sanitizeTelegramBot(bot);
  } catch (error) {
    bot.lastTestAt = new Date();
    bot.lastTestStatus = "failed";
    bot.lastTestMessage = error.message || "Failed to send test message";
    bot.updatedAt = new Date();
    await user.save();
    throw new Error(bot.lastTestMessage);
  }
}

export async function sendAuthenticatedUserVerificationCodeToTelegram({
  userId,
  text,
  missingBotsMessage = "Add at least one active Telegram bot in Profile before requesting a code",
  failedMessage = "Failed to send verification code to active Telegram bots",
}) {
  const requestingUser = await findUserWithTelegramBots(userId);

  if (!requestingUser || requestingUser.status !== "active") {
    throw new Error("User account is not active for import verification");
  }
  if (!isAdminUser(requestingUser)) {
    throw new Error(missingBotsMessage);
  }

  const requesterBots = filterActiveTelegramBots(requestingUser.telegramBots || []);
  const activeBots = requesterBots;

  if (!activeBots.length) {
    throw new Error(missingBotsMessage);
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const bot of activeBots) {
    const botToken = decryptSecretValue(bot.botTokenEncrypted);

    if (!botToken) {
      failedCount += 1;
      continue;
    }

    try {
      await sendTelegramMessage({
        botToken,
        chatId: bot.chatId,
        text,
      });
      sentCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  if (!sentCount) {
    throw new Error(failedMessage);
  }

  return {
    sentCount,
    failedCount,
  };
}

export async function sendMoneySiteImportVerificationCodeToTelegram({
  userId,
  text,
}) {
  return sendAuthenticatedUserVerificationCodeToTelegram({
    userId,
    text,
    missingBotsMessage:
      "Add at least one active Telegram bot in Profile before importing money sites",
    failedMessage: "Failed to send verification code to active Telegram bots",
  });
}

export async function sendMoneySiteDeleteAllVerificationCodeToTelegram({
  userId,
  text,
}) {
  return sendAuthenticatedUserVerificationCodeToTelegram({
    userId,
    text,
    missingBotsMessage:
      "Add at least one active Telegram bot in Profile before deleting money sites",
    failedMessage: "Failed to send delete verification code to active Telegram bots",
  });
}
