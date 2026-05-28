const fs = require("fs");
const path = require("path");

const TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_BATCH_SUMMARY_LIMIT = 20;
const INDONESIA_TIME_ZONE = "Asia/Jakarta";

function getPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

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

function formatStatus(value) {
  const status = Number(value || 0);
  return status ? String(status) : "Unavailable";
}

function formatTelegramSequence(value) {
  const sequence = Number(value || 0);

  return sequence > 0 ? `Short link Telegram #${sequence}` : "";
}

function buildErrorMessage(link = {}, check = {}) {
  const isStatusCodeAlert = Boolean(check.telegramNotifyAsStatusCode);
  const lines = [
    formatTelegramSequence(check.telegramMessageNumber),
    isStatusCodeAlert
      ? "Short link checker status code alert"
      : check.verificationName
        ? `Short link checker ${check.verificationName}`
        : "Short link checker error",
    check.telegramNotifyReason ? `Alert: ${check.telegramNotifyReason}` : "",
    link.title ? `Name: ${link.title}` : "",
    link.brandName ? `Brand: ${link.brandName}` : "",
    link.moneySiteDomain ? `Money site: ${link.moneySiteDomain}` : "",
    `Short link: ${link.shortUrl || check.shortUrl || "-"}`,
    `Short-link status: ${formatStatus(check.exactStatusCode)}`,
    `Final status: ${formatStatus(check.finalStatusCode)}`,
    check.finalUrl ? `Final URL: ${check.finalUrl}` : "",
    check.verificationReason && !isStatusCodeAlert ? `Detected: ${check.verificationReason}` : "",
    check.error ? `Error: ${check.error}` : "",
    check.checkedAt ? `Checked: ${formatJakartaDateTime(check.checkedAt)}` : "",
  ].filter(Boolean);

  return truncateText(lines.join("\n"), TELEGRAM_MESSAGE_LIMIT);
}

function buildErrorCaption(link = {}, check = {}) {
  return truncateText(buildErrorMessage(link, check), TELEGRAM_CAPTION_LIMIT);
}

function buildBatchErrorSummary({ batch = {}, items = [] } = {}) {
  const errorItems = Array.isArray(items)
    ? items.filter((item) => item?.telegramNotifyReason || item?.status === "error" || item?.telegramAlertMatched?.length)
    : [];

  if (!errorItems.length) {
    return "Short link batch check completed. No alerts found.";
  }

  const lines = [
    formatTelegramSequence(batch.telegramMessageNumber),
    "Short link batch check summary",
    `Source: ${batch.source || "manual"}`,
    `Scan mode: ${batch.scanMode || "capture"}`,
    `Total links: ${Number(batch.totalCount || items.length || 0)}`,
    `Alerts: ${errorItems.length}`,
    batch.finishedAt ? `Finished: ${formatJakartaDateTime(batch.finishedAt)}` : "",
  ].filter(Boolean);
  const errorLines = errorItems.slice(0, TELEGRAM_BATCH_SUMMARY_LIMIT).map((check, index) => {
    const statusParts = [
      `short ${formatStatus(check.exactStatusCode)}`,
      `final ${formatStatus(check.finalStatusCode)}`,
    ];
    const matchedCodes = Array.isArray(check.telegramAlertMatched) && check.telegramAlertMatched.length
      ? ` | matched ${check.telegramAlertMatched.join(", ")}`
      : "";
    const reason = check.telegramNotifyReason ? ` | ${truncateText(check.telegramNotifyReason, 80)}` : "";
    const suffix = check.error ? ` | ${truncateText(check.error, 120)}` : "";

    return `${index + 1}. ${check.shortUrl || "-"} | ${statusParts.join(" | ")}${matchedCodes}${reason}${suffix}`;
  });

  if (errorLines.length) {
    lines.push("", "Alert links:", ...errorLines);
  }

  if (errorItems.length > TELEGRAM_BATCH_SUMMARY_LIMIT) {
    lines.push(`...and ${errorItems.length - TELEGRAM_BATCH_SUMMARY_LIMIT} more alerts.`);
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
    signal: AbortSignal.timeout(getPositiveInteger(process.env.SHORT_LINK_TELEGRAM_TIMEOUT_MS, 30000)),
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
    signal: AbortSignal.timeout(getPositiveInteger(process.env.SHORT_LINK_TELEGRAM_TIMEOUT_MS, 30000)),
  });

  await parseTelegramResponse(response);
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

async function notifyShortLinkError({ telegram = {}, link = {}, check = {}, imagePath = "" }) {
  if (!telegram.enabled || !telegram.botToken || !telegram.chatId) {
    return null;
  }

  if (imagePath && fs.existsSync(imagePath)) {
    const fileName = `${link.title || link.moneySiteDomain || "short-link"}-${check.checkedAt || Date.now()}.png`
      .replace(/[^a-z0-9.-]+/gi, "-")
      .replace(/^-+|-+$/g, "");

    return {
      ...(await sendTelegramScreenshot({
        botToken: telegram.botToken,
        chatId: telegram.chatId,
        imagePath,
        fileName: fileName || path.basename(imagePath),
        caption: buildErrorCaption(link, check),
      })),
      sentAt: new Date().toISOString(),
    };
  }

  return {
    ...(await sendTelegramMessage({
      botToken: telegram.botToken,
      chatId: telegram.chatId,
      text: buildErrorMessage(link, check),
    })),
    sentAt: new Date().toISOString(),
  };
}

async function notifyShortLinkBatchSummary({ telegram = {}, batch = {}, items = [] }) {
  if (!telegram.enabled || !telegram.botToken || !telegram.chatId) {
    return null;
  }

  const hasErrors = Array.isArray(items) && items.some((item) => (
    item?.telegramNotifyReason || item?.status === "error" || item?.telegramAlertMatched?.length
  ));

  if (!hasErrors) {
    return null;
  }

  return {
    ...(await sendTelegramMessage({
      botToken: telegram.botToken,
      chatId: telegram.chatId,
      text: buildBatchErrorSummary({ batch, items }),
    })),
    sentAt: new Date().toISOString(),
  };
}

module.exports = {
  notifyShortLinkBatchSummary,
  notifyShortLinkError,
};
