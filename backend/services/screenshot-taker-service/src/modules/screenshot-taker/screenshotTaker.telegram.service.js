const fs = require("fs");
const path = require("path");
const { getCaptureTelegramImagePath } = require("./screenshotTaker.service");

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_MESSAGE_LIMIT = 4096;
const INDONESIA_TIME_ZONE = "Asia/Jakarta";

function formatJakartaDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: INDONESIA_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function cleanCaptureErrorPart(value) {
  let text = String(value || "").trim();

  if (!text) {
    return "";
  }

  let previousText = "";

  while (text && text !== previousText) {
    previousText = text;
    text = text
      .replace(/^HTTP fallback failed:\s*/i, "")
      .replace(/^DOM fallback failed:\s*/i, "")
      .replace(/^Navigation failed:\s*/i, "")
      .trim();
  }

  return text.replace(/\s+/g, " ");
}

function compactCaptureError(value) {
  const uniqueMessages = [];

  String(value || "Screenshot capture failed")
    .split("|")
    .map(cleanCaptureErrorPart)
    .filter(Boolean)
    .forEach((message) => {
      if (!uniqueMessages.includes(message)) {
        uniqueMessages.push(message);
      }
    });

  return truncateText(uniqueMessages.join(" | ") || "Screenshot capture failed", 280);
}

function formatBatchProgress(capture = {}) {
  const index = Number(capture.telegramMessageNumber || capture.batchIndex || 0);
  const total = Number(capture.batchTotal || 0);

  if (!index) {
    return "";
  }

  return total && index <= total ? `Screenshot ${index} of ${total}` : `Screenshot ${index}`;
}

function buildBatchStartMessage(batch = {}) {
  const lines = [
    "New scheduled screenshot scan cycle started",
    batch.cycleNumber ? `Cycle: #${batch.cycleNumber}` : "",
    `Websites: ${Number(batch.totalCount || 0)}`,
    batch.parallelCaptures ? `Parallel captures: ${batch.parallelCaptures}` : "",
    batch.queuedAt ? `Started: ${formatJakartaDateTime(batch.queuedAt)}` : "",
  ].filter(Boolean);

  return truncateText(lines.join("\n"), TELEGRAM_MESSAGE_LIMIT);
}

function buildCaption(site = {}, capture = {}) {
  const progress = formatBatchProgress(capture);
  const lines = [
    progress,
    "Scheduled screenshot captured",
    site.brandName ? `Brand: ${site.brandName}` : "",
    site.domain ? `Domain: ${site.domain}` : "",
    capture.finalUrl ? `URL: ${capture.finalUrl}` : site.url ? `URL: ${site.url}` : "",
    capture.capturedAt ? `Captured: ${formatJakartaDateTime(capture.capturedAt)}` : "",
  ].filter(Boolean);

  return truncateText(lines.join("\n"), TELEGRAM_CAPTION_LIMIT);
}

function buildFailureMessage(site = {}, capture = {}) {
  const progress = formatBatchProgress(capture);
  const lines = [
    progress,
    "Scheduled screenshot failed",
    site.brandName ? `Brand: ${site.brandName}` : "",
    site.domain ? `Domain: ${site.domain}` : "",
    site.url ? `URL: ${site.url}` : "",
    `Error: ${compactCaptureError(capture.error)}`,
    capture.capturedAt ? `Time: ${formatJakartaDateTime(capture.capturedAt)}` : "",
  ].filter(Boolean);

  return truncateText(lines.join("\n"), TELEGRAM_MESSAGE_LIMIT);
}

function buildBatchErrorSummary(batch = {}) {
  const errors = Array.isArray(batch.errors) ? batch.errors : [];

  if (!errors.length) {
    return "";
  }

  const visibleErrors = errors.slice(0, 20);
  const lines = [
    "Scheduled screenshot scan finished with errors",
    `Failed: ${errors.length} of ${batch.totalCount || errors.length}`,
    "",
    ...visibleErrors.map((item, index) => (
      `${index + 1}. ${item.domain || item.url || "Unknown site"} - ${compactCaptureError(item.error)}`
    )),
  ];

  if (errors.length > visibleErrors.length) {
    lines.push(`...and ${errors.length - visibleErrors.length} more failed sites.`);
  }

  return truncateText(lines.join("\n"), TELEGRAM_MESSAGE_LIMIT);
}

async function parseTelegramResponse(response) {
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok === false) {
    const message = payload?.description || response.statusText || "Telegram request failed";
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

async function sendTelegramMessage({ botToken, chatId, text }) {
  const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: truncateText(text, TELEGRAM_MESSAGE_LIMIT),
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(Number(process.env.SCREENSHOT_TELEGRAM_TIMEOUT_MS || 30000)),
  });

  await parseTelegramResponse(response);

  return { method: "message" };
}

async function sendTelegramFile({ botToken, chatId, method, fileField, fileBuffer, fileName, caption }) {
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: "image/png" });

  formData.set("chat_id", chatId);
  formData.set("caption", caption);
  formData.set(fileField, blob, fileName);

  const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(Number(process.env.SCREENSHOT_TELEGRAM_TIMEOUT_MS || 30000)),
  });

  return parseTelegramResponse(response);
}

async function sendTelegramScreenshot({ botToken, chatId, imagePath, fileName, caption }) {
  const fileBuffer = fs.readFileSync(imagePath);

  try {
    await sendTelegramFile({
      botToken,
      chatId,
      method: "sendPhoto",
      fileField: "photo",
      fileBuffer,
      fileName,
      caption,
    });

    return { method: "photo" };
  } catch (photoError) {
    await sendTelegramFile({
      botToken,
      chatId,
      method: "sendDocument",
      fileField: "document",
      fileBuffer,
      fileName,
      caption,
    });

    return { method: "document", fallbackReason: photoError.message || "" };
  }
}

async function notifyScheduledBatchStarted({ schedule = {}, batch = {} }) {
  const telegram = schedule.telegram || {};
  const message = buildBatchStartMessage(batch);

  if (!telegram.enabled || !telegram.botToken || !telegram.chatId || !message) {
    return null;
  }

  return {
    ...(await sendTelegramMessage({
      botToken: telegram.botToken,
      chatId: telegram.chatId,
      text: message,
    })),
    sentAt: new Date().toISOString(),
  };
}

async function notifyScheduledCapture({ schedule = {}, site = {}, capture = {} }) {
  const telegram = schedule.telegram || {};

  if (!telegram.enabled || !telegram.botToken || !telegram.chatId) {
    return null;
  }

  if (capture.status !== "success") {
    return {
      ...(await sendTelegramMessage({
        botToken: telegram.botToken,
        chatId: telegram.chatId,
        text: buildFailureMessage(site, capture),
      })),
      sentAt: new Date().toISOString(),
    };
  }

  const imagePath = getCaptureTelegramImagePath(capture.id);
  const fileName = `${site.brandName || site.domain || "screenshot"}-${capture.capturedAt || Date.now()}.png`
    .replace(/[^a-z0-9.-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  const caption = buildCaption(site, capture);
  const result = await sendTelegramScreenshot({
    botToken: telegram.botToken,
    chatId: telegram.chatId,
    imagePath,
    fileName: fileName || path.basename(imagePath),
    caption,
  });

  return {
    ...result,
    sentAt: new Date().toISOString(),
  };
}

async function notifyScheduledBatchSummary({ schedule = {}, batch = {} }) {
  const telegram = schedule.telegram || {};
  const message = buildBatchErrorSummary(batch);

  if (!telegram.enabled || !telegram.botToken || !telegram.chatId || !message) {
    return null;
  }

  return {
    ...(await sendTelegramMessage({
      botToken: telegram.botToken,
      chatId: telegram.chatId,
      text: message,
    })),
    sentAt: new Date().toISOString(),
  };
}

module.exports = {
  notifyScheduledBatchStarted,
  notifyScheduledCapture,
  notifyScheduledBatchSummary,
};
