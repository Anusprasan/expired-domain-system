import mongoose from "mongoose";
import ReportingTask, { ISSUE_TYPES } from "./reportingTask.model.js";
import User from "../users/user.model.js";
import Brand from "../brands/brand.model.js";
import { decryptSecretValue } from "../../app/utils/secureValue.js";
import { sendTelegramMessage } from "../auth/auth.telegram.service.js";
import {
  deleteEvidenceImageFromBucket,
  getEvidenceImageFromBucket,
  uploadEvidenceImageToBucket,
} from "../../app/config/storageBucket.js";

const taskPopulate = [
  { path: "brandId", select: "brandName cssClassName backgroundCss textColor" },
  { path: "createdBy", select: "fullName email" },
  { path: "acceptedBy.userId", select: "fullName email" },
];

async function getTaskOrThrow(taskId) {
  if (!mongoose.Types.ObjectId.isValid(String(taskId || ""))) {
    throw new Error("Task not found");
  }
  const task = await ReportingTask.findOne({ _id: taskId, isDeleted: false });
  if (!task) throw new Error("Task not found");
  return task;
}

function addImageTaskContext(task) {
  if (!task) return task;
  const taskId = String(task._id);
  (task.acceptedBy || []).forEach((entry) => {
    const userId = String(entry.userId?._id || entry.userId || "");
    entry.images = (entry.images || []).map((image) => ({ ...image, taskId, userId, evidenceType: "evidence" }));
    entry.ddosImages = (entry.ddosImages || []).map((image) => ({ ...image, taskId, userId, evidenceType: "ddos" }));
  });
  return task;
}

function canViewTaskEvidence(user, task) {
  const keys = user?.groupId?.privilegeIds?.map((p) => p.key) || [];
  const groupName = user?.groupId?.name?.toLowerCase();
  const userId = String(user?._id || "");

  return (
    groupName === "admin" ||
    keys.includes("ADMIN_ACCESS") ||
    keys.includes("ADD_REPORTING_TASKS") ||
    keys.includes("READ_REPORTING_TASKS") ||
    keys.includes("TRACK_REPORTING_TASKS") ||
    String(task.createdBy) === userId ||
    task.acceptedBy?.some((entry) => String(entry.userId) === userId)
  );
}

export async function getReportingTasksService(date) {
  const query = { isDeleted: false };

  if (date) {
    // Filter tasks created on the given calendar day (UTC)
    const start = new Date(date + "T00:00:00.000Z");
    const end   = new Date(date + "T23:59:59.999Z");
    query.createdAt = { $gte: start, $lte: end };
  }

  const tasks = await ReportingTask.find(query)
    .populate(taskPopulate)
    .sort({ createdAt: -1 })
    .lean();

  return tasks.map(addImageTaskContext);
}

export async function createReportingTaskService(body, user) {
  const url = String(body.url || "").trim();
  if (!url) throw new Error("URL is required");

  const rank = Number(body.rank);
  if (!Number.isFinite(rank) || rank < 1) throw new Error("Rank must be a positive number");

  if (!body.issueType || !ISSUE_TYPES.includes(body.issueType)) {
    throw new Error(`Issue type must be one of: ${ISSUE_TYPES.join(", ")}`);
  }

  if (!body.brandId || !mongoose.Types.ObjectId.isValid(String(body.brandId))) {
    throw new Error("A valid brand is required");
  }

  const task = await ReportingTask.create({
    brandId: new mongoose.Types.ObjectId(String(body.brandId)),
    url,
    rank,
    issueType: body.issueType,
    ddosRequired: body.ddosRequired === true || body.ddosRequired === "true",
    createdBy: user._id,
    createdSource: body.createdSource === "telegram" ? "telegram" : "manual",
    telegramSource: body.telegramSource || undefined,
  });

  return addImageTaskContext(await ReportingTask.findById(task._id).populate(taskPopulate).lean());
}

const TELEGRAM_HELP_TEXT = [
  "Send a reporting task like this:",
  "Brand: BRAND_NAME",
  "URL: https://example.com",
  "Rank: 1",
  "Issue: cloaking",
  "DDoS: no",
  "",
  `Issue options: ${ISSUE_TYPES.join(", ")}`,
].join("\n");

const ISSUE_ALIASES = {
  cloaking: "cloaking",
  cloak: "cloaking",
  brandphishing: "brand_phishing",
  brand_phishing: "brand_phishing",
  "brand phishing": "brand_phishing",
  bp: "brand_phishing",
  deathphishing: "death_phishing",
  death_phishing: "death_phishing",
  "death phishing": "death_phishing",
  dp: "death_phishing",
  straydomain: "stray_domain",
  stray_domain: "stray_domain",
  "stray domain": "stray_domain",
  sd: "stray_domain",
};

const TELEGRAM_BOT_SELECT_FIELDS = [
  "status",
  "groupId",
  "telegramBots._id",
  "telegramBots.name",
  "telegramBots.chatId",
  "telegramBots.isActive",
  "+telegramBots.botTokenEncrypted",
].join(" ");

function normalizeTelegramText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeIssue(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const compact = raw.replace(/[\s-]+/g, "_");
  return ISSUE_ALIASES[raw] || ISSUE_ALIASES[compact] || ISSUE_ALIASES[normalizeKey(raw)] || "";
}

function parseTelegramBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["yes", "y", "true", "1", "required", "ddos"].includes(normalized);
}

function getTelegramMessage(update = {}) {
  return update.message || update.edited_message || update.channel_post || update.edited_channel_post || null;
}

function getTelegramTaskFields(text) {
  const cleanText = normalizeTelegramText(text).replace(/^\/(?:task|addtask)(?:@\w+)?\s*/i, "").trim();
  const fields = {};

  for (const line of cleanText.split(/\r?\n/)) {
    const match = line.match(/^\s*([a-z][a-z\s_-]{1,24})\s*[:=]\s*(.+?)\s*$/i);
    if (!match) continue;
    const key = normalizeKey(match[1]);
    const value = match[2].trim();

    if (["brand", "brandname"].includes(key)) fields.brand = value;
    if (["url", "domain", "link"].includes(key)) fields.url = value;
    if (["rank", "position"].includes(key)) fields.rank = value;
    if (["issue", "issuetype", "type"].includes(key)) fields.issueType = value;
    if (["ddos", "ddosrequired"].includes(key)) fields.ddosRequired = value;
  }

  if (!fields.url) {
    const urlMatch = cleanText.match(/https?:\/\/[^\s<>"']+/i);
    if (urlMatch) fields.url = urlMatch[0];
  }

  if (!fields.rank) {
    const rankMatch = cleanText.match(/\b(?:rank|position|#)\s*[:#-]?\s*(\d+)\b/i);
    if (rankMatch) fields.rank = rankMatch[1];
  }

  if (!fields.issueType) {
    for (const alias of Object.keys(ISSUE_ALIASES).sort((a, b) => b.length - a.length)) {
      const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+")}\\b`, "i");
      if (pattern.test(cleanText)) {
        fields.issueType = alias;
        break;
      }
    }
  }

  if (!fields.ddosRequired) {
    const ddosMatch = cleanText.match(/\bddos\b\s*[:=-]?\s*(yes|no|true|false|1|0|required)?/i);
    if (ddosMatch) fields.ddosRequired = ddosMatch[1] || "yes";
  }

  return fields;
}

function userCanCreateReportingTasks(user) {
  const keys = user?.groupId?.privilegeIds?.map((p) => p.key) || [];
  const groupName = user?.groupId?.name?.toLowerCase();
  return groupName === "admin" || keys.includes("ADMIN_ACCESS") || keys.includes("ADD_REPORTING_TASKS");
}

async function findTelegramCreator({ botId, chatId }) {
  if (!mongoose.Types.ObjectId.isValid(String(botId || ""))) {
    throw new Error("Telegram bot is not registered");
  }

  const user = await User.findOne({
    status: "active",
    telegramBots: {
      $elemMatch: {
        _id: new mongoose.Types.ObjectId(String(botId)),
        chatId: String(chatId),
        isActive: true,
      },
    },
  })
    .select(TELEGRAM_BOT_SELECT_FIELDS)
    .populate({ path: "groupId", populate: { path: "privilegeIds" } });

  if (!user) {
    throw new Error("Telegram chat is not allowed to create reporting tasks");
  }

  if (!userCanCreateReportingTasks(user)) {
    throw new Error("The Telegram bot owner cannot add reporting tasks");
  }

  const bot = user.telegramBots.id(botId);
  return { user, bot };
}

async function findTelegramBrand(brandName) {
  const normalized = normalizeTelegramText(brandName).toUpperCase();
  if (!normalized) throw new Error("Brand is required");

  const brand = await Brand.findOne({ brandName: normalized }).lean();
  if (!brand) throw new Error(`Brand not found: ${brandName}`);

  return brand;
}

async function replyToTelegram(bot, chatId, text) {
  const botToken = decryptSecretValue(bot?.botTokenEncrypted);
  if (!botToken) return;

  try {
    await sendTelegramMessage({ botToken, chatId, text });
  } catch (error) {
    console.error("[ReportingTasks] Failed to send Telegram reply:", error.message);
  }
}

export async function createReportingTaskFromTelegramService({ botId, update }) {
  const message = getTelegramMessage(update);
  const chatId = String(message?.chat?.id || "");
  const text = normalizeTelegramText(message?.text || message?.caption || "");

  if (!chatId) throw new Error("Telegram chat ID is missing");

  const { user, bot } = await findTelegramCreator({ botId, chatId });

  if (!text || /^\/(?:start|help)(?:@\w+)?\b/i.test(text)) {
    await replyToTelegram(bot, chatId, TELEGRAM_HELP_TEXT);
    return { task: null, reply: TELEGRAM_HELP_TEXT };
  }

  try {
    const fields = getTelegramTaskFields(text);
    const brand = await findTelegramBrand(fields.brand);
    const issueType = normalizeIssue(fields.issueType);

    const task = await createReportingTaskService(
      {
        brandId: brand._id,
        url: fields.url,
        rank: fields.rank,
        issueType,
        ddosRequired: parseTelegramBoolean(fields.ddosRequired),
        createdSource: "telegram",
        telegramSource: {
          chatId,
          messageId: String(message?.message_id || ""),
          botId: String(bot._id),
          botName: bot.name || "",
          messageText: text.slice(0, 1000),
        },
      },
      user
    );

    const reply = [
      "Reporting task created.",
      `Brand: ${brand.brandName}`,
      `Rank: #${task.rank}`,
      `Issue: ${task.issueType}`,
      `URL: ${task.url}`,
      task.ddosRequired ? "DDoS: required" : "DDoS: no",
    ].join("\n");

    await replyToTelegram(bot, chatId, reply);
    return { task, reply };
  } catch (error) {
    const reply = `${error.message}\n\n${TELEGRAM_HELP_TEXT}`;
    await replyToTelegram(bot, chatId, reply);
    throw error;
  }
}

export async function acceptReportingTaskService(taskId, user) {
  const task = await getTaskOrThrow(taskId);

  const alreadyAccepted = task.acceptedBy.some(
    (entry) => String(entry.userId) === String(user._id)
  );

  if (alreadyAccepted) throw new Error("You have already accepted this task");

  task.acceptedBy.push({ userId: user._id });
  await task.save();

  return addImageTaskContext(await ReportingTask.findById(task._id).populate(taskPopulate).lean());
}

const ONE_HOUR_MS    = 60 * 60 * 1000;
const SEVEN_DAYS_MS  = 7 * 24 * 60 * 60 * 1000;
const MAX_IMAGES = 10;

function parseExistingImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function normalizeExistingImage(image) {
  const id = String(image?.id || "").trim();
  const name = String(image?.name || "").trim();
  const contentType = String(image?.contentType || "image/png").trim();

  if (!id || !name) return null;

  return {
    id,
    name,
    contentType,
    size: Number(image?.size) || 0,
    contentBase64: String(image?.contentBase64 || ""),
    url: String(image?.url || ""),
    key: String(image?.key || ""),
    bucket: String(image?.bucket || ""),
    storageProvider: String(image?.storageProvider || ""),
    uploadedAt: image?.uploadedAt ? new Date(image.uploadedAt) : new Date(),
  };
}

function getRemovedBucketImages(previousImages = [], retainedImages = []) {
  const retainedKeys = new Set(retainedImages.map((image) => image.key).filter(Boolean));
  return previousImages.filter((image) => image?.key && !retainedKeys.has(image.key));
}

async function deleteBucketImages(images = []) {
  await Promise.all(
    images.map((image) =>
      deleteEvidenceImageFromBucket(image).catch((error) => {
        console.error("[ReportingTasks] Failed to delete removed evidence image:", error.message);
      })
    )
  );
}

async function normalizeEvidenceUploads({ taskId, userId, evidenceType, files = [], existingImages = [], previousImages = [] }) {
  if (existingImages.length + files.length > MAX_IMAGES) {
    throw new Error(`You can upload a maximum of ${MAX_IMAGES} images`);
  }

  const normalizedExisting = existingImages
    .map(normalizeExistingImage)
    .filter(Boolean);

  const uploadedImages = [];
  try {
    for (const [idx, file] of files.entries()) {
      const stored = await uploadEvidenceImageToBucket(file, { taskId, userId, evidenceType });
      uploadedImages.push({
        id: `${Date.now()}-${idx}`,
        name: String(file.originalname || `evidence-${idx + 1}`).trim(),
        contentType: file.mimetype,
        size: file.size,
        contentBase64: "",
        uploadedAt: new Date(),
        ...stored,
      });
    }
  } catch (error) {
    await deleteBucketImages(uploadedImages);
    throw error;
  }

  return {
    images: [...normalizedExisting, ...uploadedImages],
    removedImages: getRemovedBucketImages(previousImages, normalizedExisting),
  };
}

export async function startReportingTaskAutoCleanup() {
  const runCleanup = async () => {
    try {
      const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
      const result = await ReportingTask.updateMany(
        { createdAt: { $lt: cutoff }, isDeleted: false },
        { $set: { isDeleted: true } }
      );
      if (result.modifiedCount > 0) {
        console.log(`[ReportingTasks] Auto-removed ${result.modifiedCount} task(s) older than 7 days`);
      }
    } catch (err) {
      console.error("[ReportingTasks] Auto-cleanup error:", err.message);
    }
  };

  await runCleanup();
  setInterval(runCleanup, ONE_HOUR_MS);
}

export async function submitReportingTaskEvidenceService(taskId, body, files, user) {
  const task = await getTaskOrThrow(taskId);

  let entry = task.acceptedBy.find(
    (e) => String(e.userId) === String(user._id)
  );

  if (!entry) {
    task.acceptedBy.push({ userId: user._id });
    entry = task.acceptedBy[task.acceptedBy.length - 1];
  }

  if (entry.evidenceSubmitted) {
    const elapsed = Date.now() - new Date(entry.submittedAt).getTime();
    if (elapsed > ONE_HOUR_MS) {
      throw new Error("The 1-hour edit window has closed. Evidence can no longer be changed.");
    }
  }

  const { images, removedImages } = await normalizeEvidenceUploads({
    taskId,
    userId: user._id,
    evidenceType: "evidence",
    files,
    existingImages: parseExistingImages(body.existingImages),
    previousImages: entry.images || [],
  });

  if (images.length === 0) throw new Error("Please add at least one image as evidence");

  entry.evidenceNote = String(body.evidenceNote || "").trim();
  entry.images = images;
  if (!entry.evidenceSubmitted) entry.submittedAt = new Date();
  entry.evidenceSubmitted = true;
  await task.save();
  await deleteBucketImages(removedImages);

  return addImageTaskContext(await ReportingTask.findById(task._id).populate(taskPopulate).lean());
}

export async function submitReportingTaskDdosEvidenceService(taskId, body, files, user) {
  const task = await getTaskOrThrow(taskId);

  if (!task.ddosRequired) throw new Error("This task does not require DDoS evidence");

  let entry = task.acceptedBy.find(
    (e) => String(e.userId) === String(user._id)
  );

  if (!entry) {
    task.acceptedBy.push({ userId: user._id });
    entry = task.acceptedBy[task.acceptedBy.length - 1];
  }

  if (entry.ddosEvidenceSubmitted) {
    const elapsed = Date.now() - new Date(entry.ddosSubmittedAt).getTime();
    if (elapsed > ONE_HOUR_MS) {
      throw new Error("The 1-hour edit window has closed. DDoS evidence can no longer be changed.");
    }
  }

  const { images, removedImages } = await normalizeEvidenceUploads({
    taskId,
    userId: user._id,
    evidenceType: "ddos",
    files,
    existingImages: parseExistingImages(body.existingImages),
    previousImages: entry.ddosImages || [],
  });

  if (images.length === 0) throw new Error("Please add at least one image as evidence");

  entry.ddosNote = String(body.ddosNote || "").trim();
  entry.ddosImages = images;
  if (!entry.ddosEvidenceSubmitted) entry.ddosSubmittedAt = new Date();
  entry.ddosEvidenceSubmitted = true;
  await task.save();
  await deleteBucketImages(removedImages);

  return addImageTaskContext(await ReportingTask.findById(task._id).populate(taskPopulate).lean());
}

function isReportingTaskAdmin(user) {
  const keys = user?.groupId?.privilegeIds?.map((p) => p.key) || [];
  const groupName = user?.groupId?.name?.toLowerCase();
  return groupName === "admin" || keys.includes("ADMIN_ACCESS");
}

function canOwnerChangeTask(task, user) {
  const isCreator = String(task.createdBy) === String(user?._id);
  const noOneAccepted = !task.acceptedBy?.length;
  return isCreator && noOneAccepted;
}

export async function updateReportingTaskService(taskId, body, user) {
  const task = await getTaskOrThrow(taskId);

  if (!isReportingTaskAdmin(user) && !canOwnerChangeTask(task, user)) {
    throw new Error("You can only edit your own task before anyone accepts it");
  }

  if (body.url !== undefined) {
    const url = String(body.url || "").trim();
    if (!url) throw new Error("URL is required");
    task.url = url;
  }

  if (body.rank !== undefined) {
    const rank = Number(body.rank);
    if (!Number.isFinite(rank) || rank < 1) throw new Error("Rank must be a positive number");
    task.rank = rank;
  }

  if (body.issueType !== undefined) {
    if (!ISSUE_TYPES.includes(body.issueType)) {
      throw new Error(`Issue type must be one of: ${ISSUE_TYPES.join(", ")}`);
    }
    task.issueType = body.issueType;
  }

  if (body.brandId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(String(body.brandId))) {
      throw new Error("A valid brand is required");
    }
    task.brandId = new mongoose.Types.ObjectId(String(body.brandId));
  }

  if (body.ddosRequired !== undefined) {
    task.ddosRequired = body.ddosRequired === true || body.ddosRequired === "true";
  }

  await task.save();
  return addImageTaskContext(await ReportingTask.findById(task._id).populate(taskPopulate).lean());
}

export async function getReportingTaskEvidenceImageService(taskId, imageId, user) {
  const task = await getTaskOrThrow(taskId);

  if (!canViewTaskEvidence(user, task)) {
    throw new Error("You do not have access to this evidence image");
  }

  const entries = task.acceptedBy || [];
  for (const entry of entries) {
    const image =
      (entry.images || []).find((item) => String(item.id) === String(imageId)) ||
      (entry.ddosImages || []).find((item) => String(item.id) === String(imageId));

    if (image) {
      if (!image.key) {
        return {
          image,
          legacyBase64: image.contentBase64,
        };
      }

      return {
        image,
        object: await getEvidenceImageFromBucket(image),
      };
    }
  }

  throw new Error("Evidence image not found");
}

export async function deleteReportingTaskService(taskId, user) {
  const task = await getTaskOrThrow(taskId);

  if (!isReportingTaskAdmin(user) && !canOwnerChangeTask(task, user)) {
    throw new Error("You can only delete your own task before anyone accepts it");
  }

  task.isDeleted = true;
  await task.save();
  return { _id: task._id };
}

export async function getReportingTaskStaffService() {
  const users = await User.find({ status: "active" })
    .populate({ path: "groupId", populate: { path: "privilegeIds" } })
    .lean();

  return users
    .filter((u) =>
      u.groupId?.privilegeIds?.some((p) => p.key === "RECEIVE_REPORTING_TASKS")
    )
    .map((u) => ({ _id: u._id, fullName: u.fullName, email: u.email }));
}
