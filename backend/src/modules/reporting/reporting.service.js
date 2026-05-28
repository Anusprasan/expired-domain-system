import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs";
import JSZip from "jszip";
import Brand from "../brands/brand.model.js";
import Report from "./report.model.js";
import Submission from "./submission.model.js";
import ReportingWorkflow from "./workflow.model.js";
import ReportingSmtpProfile from "./reportingSmtpProfile.model.js";
import ReportingEmailEntry from "./reportingEmailEntry.model.js";
import User from "../users/user.model.js";
import { isAdminUser } from "../users/user.service.js";
import { sendMail } from "../../app/utils/mailer.js";
import { decryptSecretValue, encryptSecretValue } from "../../app/utils/secureValue.js";
import {
  REPORTING_EVIDENCE_DELETE_CONFIRMATION_TEXT,
  REPORTING_EVIDENCE_MIN_CLEANUP_DAYS,
  REPORTING_ISSUE_TYPES,
  REPORTING_STATUSES,
  REPORTING_WORKFLOW_DEFAULTS,
} from "./reporting.constants.js";

const reportPopulate = [
  { path: "brandId", select: "brandName cssClassName backgroundCss textColor" },
  { path: "createdBy", select: "fullName email" },
  { path: "claims.userId", select: "fullName email" },
  { path: "claims.reviewedBy", select: "fullName email" },
  { path: "claims.taskUpdatedBy", select: "fullName email" },
  { path: "claimedByIds", select: "fullName email" },
];

const submissionPopulate = [
  { path: "reporterId", select: "fullName email" },
  { path: "reviewedBy", select: "fullName email" },
];

const reportingSmtpProfilePopulate = [
  { path: "brandId", select: "brandName" },
  { path: "createdBy", select: "fullName email" },
  { path: "updatedBy", select: "fullName email" },
  { path: "lastTestedBy", select: "fullName email" },
];

const reportingEmailEntryPopulate = [
  { path: "authorId", select: "fullName email" },
  { path: "smtpProfileId", select: "name from user" },
];

const REPORTING_SMTP_PROFILE_PRIVILEGE = "MANAGE_REPORTING_SMTP_PROFILES";
const REPORTING_AI_GENERATE_PRIVILEGE = "GENERATE_REPORTING_AI_EMAIL";
const REPORTING_EMAIL_SEND_PRIVILEGE = "SEND_REPORTING_EMAIL";
const REPORTING_LANGUAGE_OPTIONS = ["english", "indonesian"];
const SIMPLE_REPORTING_ACTIVE_STATUSES = ["in_progress", "reported", "submitted"];
const MAX_REPORTING_EVIDENCE_IMAGE_COUNT = 20;
const MAX_REPORTING_EVIDENCE_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_REPORTING_EVIDENCE_TOTAL_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_REPORTING_EVIDENCE_DELETION_HISTORY = 500;
const REPORTING_EVIDENCE_MIN_CLEANUP_MS =
  REPORTING_EVIDENCE_MIN_CLEANUP_DAYS * 24 * 60 * 60 * 1000;

function getUserPrivilegeKeys(user) {
  return user?.groupId?.privilegeIds?.map((item) => item.key) || [];
}

function canViewAllReportingEvidence(user) {
  const privilegeKeys = getUserPrivilegeKeys(user);
  return privilegeKeys.includes("ADMIN_ACCESS") || privilegeKeys.includes("VIEW_REPORTING_ADMIN_REVIEW");
}

function canManageReportingSmtpProfiles(user) {
  const privilegeKeys = getUserPrivilegeKeys(user);
  return privilegeKeys.includes("ADMIN_ACCESS") || privilegeKeys.includes(REPORTING_SMTP_PROFILE_PRIVILEGE);
}

function canGenerateReportingAiEmail(user) {
  const privilegeKeys = getUserPrivilegeKeys(user);
  return privilegeKeys.includes("ADMIN_ACCESS") || privilegeKeys.includes(REPORTING_AI_GENERATE_PRIVILEGE);
}

function canSendReportingEmail(user) {
  const privilegeKeys = getUserPrivilegeKeys(user);
  return privilegeKeys.includes("ADMIN_ACCESS") || privilegeKeys.includes(REPORTING_EMAIL_SEND_PRIVILEGE);
}

function canManageOwnReportingSmtpProfiles(user) {
  return canSendReportingEmail(user) || canManageReportingSmtpProfiles(user);
}

function normalizeString(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeUrl(url) {
  const value = normalizeString(url);

  if (!value) {
    throw new Error("URL is required");
  }

  try {
    const parsed = new URL(value);
    return parsed.toString();
  } catch {
    throw new Error("URL must be a valid absolute URL");
  }
}

function normalizeDriveLink(value) {
  const link = normalizeUrl(value);

  if (!/drive\.google\.com/i.test(link)) {
    throw new Error("Drive link must point to Google Drive");
  }

  return link;
}

function normalizeOptionalDriveLink(value) {
  const normalizedValue = normalizeString(value);
  return normalizedValue ? normalizeDriveLink(normalizedValue) : "";
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateInputValue(value, { endOfDay = false } = {}) {
  const normalizedValue = normalizeString(value);
  let date = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    date = new Date(`${normalizedValue}T00:00:00`);
  } else {
    date = normalizeDateValue(value);
  }

  if (!date) {
    return null;
  }

  const normalizedDate = new Date(date.getTime());

  if (endOfDay) {
    normalizedDate.setHours(23, 59, 59, 999);
  } else {
    normalizedDate.setHours(0, 0, 0, 0);
  }

  return normalizedDate;
}

function formatDateInputValue(value) {
  const date = normalizeDateValue(value);

  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeReportingLanguage(value, fallback = "english") {
  const normalizedValue = normalizeString(value).toLowerCase();

  if (!normalizedValue) {
    return fallback;
  }

  if (!REPORTING_LANGUAGE_OPTIONS.includes(normalizedValue)) {
    throw new Error("Reporting language is invalid");
  }

  return normalizedValue;
}

function normalizeInteger(value, fallback = null) {
  if (value === "" || value === null || value === undefined) {
    return fallback;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error("Port must be a positive integer");
  }

  return parsedValue;
}

function normalizeMultilineText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeHtmlEmailBody(value) {
  return String(value || "").trim();
}

function normalizeEmailList(value, fieldLabel = "Recipient email") {
  const emailAddresses = String(value || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!emailAddresses.length) {
    throw new Error(`${fieldLabel} is required`);
  }

  const invalidEmailAddress = emailAddresses.find(
    (item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)
  );

  if (invalidEmailAddress) {
    throw new Error(`Invalid email address: ${invalidEmailAddress}`);
  }

  return emailAddresses;
}

function normalizeOptionalEmailList(value, fieldLabel = "Recipient email") {
  if (!normalizeString(value)) {
    return [];
  }

  return normalizeEmailList(value, fieldLabel);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDomainFromUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    throw new Error("URL must be a valid absolute URL");
  }
}

function validateIssueType(issueType) {
  if (!REPORTING_ISSUE_TYPES.includes(issueType)) {
    throw new Error("Invalid issue type");
  }
}

function getIssueTypeLabel(issueType) {
  const labels = {
    cloaking: "Cloaking",
    brand_phishing: "Brand Phishing",
    death_phishing: "Death Phishing",
    stray_domain: "Stray Domain",
  };

  return labels[issueType] || issueType;
}

function getIssueTypeDescription(issueType) {
  if (issueType === "brand_phishing") {
    return "Potential brand impersonation or phishing activity";
  }

  if (issueType === "death_phishing") {
    return "Potential phishing or malicious abuse requiring urgent review";
  }

  if (issueType === "stray_domain") {
    return "Potential misuse of a stray or unauthorized domain";
  }

  return "Potential cloaking, deceptive, or abusive content";
}

function getIssueTypePromptGuidance(issueType) {
  if (issueType === "brand_phishing") {
    return [
      "Primary scenario focus: suspected brand impersonation or phishing activity involving unauthorized brand use.",
      "Writing emphasis: harmful phishing methods, copied or cloned brand content, fake affiliation, credential/payment risk, and urgent abuse review or takedown.",
      "If the notes mention copied content, cloned pages, impersonation, or stolen brand materials, reflect that clearly and professionally in the body.",
      "Where appropriate, mention general legal and policy exposure such as phishing, fraud, consumer protection, trademark misuse, copyright concerns, and provider acceptable use violations, but do not invent statute numbers or fake law names.",
      "Do not reduce this to a generic cloaking complaint unless the facts or notes clearly mention cloaking too.",
    ];
  }

  if (issueType === "death_phishing") {
    return [
      "Primary scenario focus: urgent phishing or malicious abuse that may require fast visibility removal, investigation, or cleanup.",
      "Writing emphasis: urgency, malicious risk, residual exposure, danger to users, and a request for prompt investigation or remediation.",
      "Where appropriate, mention general legal and policy exposure such as fraud, phishing, malicious distribution, user harm, consumer protection, and provider abuse-policy violations, but do not invent statute numbers or fake law names.",
      "Do not describe the page as currently live unless the provided facts or notes clearly support that.",
    ];
  }

  if (issueType === "stray_domain") {
    return [
      "Primary scenario focus: stray or unauthorized domain use that may confuse users, support gambling or illegal betting activity, or misuse brand association.",
      "Writing emphasis: suspicious domain ownership or hosting, harmful gambling or betting content if the notes support it, misleading affiliation, and a request to investigate unauthorized use.",
      "If the notes mention Indonesia or other jurisdictions, you may mention regulatory or legal restrictions in those jurisdictions in cautious language, but do not invent statute numbers or unsupported country-specific claims.",
      "Where appropriate, mention general legal and policy exposure such as gambling restrictions, illegal betting concerns, harmful-content rules, consumer risk, and hosting-provider acceptable use violations.",
      "Do not overstate phishing unless the facts or notes explicitly support phishing behavior.",
    ];
  }

  return [
    "Primary scenario focus: cloaking, misleading redirects, spam, harmful attack content, gambling, or deceptive content presentation.",
    "Writing emphasis: harmful cloaking methods, deceptive rendering, misleading redirects, potential user harm, and policy review by the abuse team.",
    "Where appropriate, mention general legal and policy exposure such as deceptive practices, unauthorized redirects, harmful or malicious content, consumer protection concerns, and provider acceptable use violations, but do not invent statute numbers or fake law names.",
    "Do not frame this as brand impersonation unless the facts or notes explicitly support brand misuse.",
  ];
}

function getWorkflowPromptContext(issueType) {
  const workflow = REPORTING_WORKFLOW_DEFAULTS.find((item) => item.issueType === issueType);

  if (!workflow) {
    return [];
  }

  const lines = [];

  if (workflow.title) {
    lines.push(`Workflow title: ${workflow.title}`);
  }

  if (workflow.summary) {
    lines.push(`Workflow summary: ${workflow.summary}`);
  }

  if (workflow.note) {
    lines.push(`Workflow note: ${workflow.note}`);
  }

  if (Array.isArray(workflow.steps) && workflow.steps.length) {
    lines.push(`Workflow steps: ${workflow.steps.join(" | ")}`);
  }

  return lines;
}

function getReportingStatusLabel(status) {
  const labels = {
    open: "Open Queue",
    in_progress: "In Progress",
    reported: "Reported",
    submitted: "Submitted",
    resolved: "Resolved",
  };

  return labels[status] || status;
}

function getReportingSettingsDefaults() {
  const smtp = {
    host: normalizeString(process.env.MAIL_HOST),
    port: normalizeInteger(process.env.MAIL_PORT, 587),
    user: normalizeString(process.env.MAIL_USER),
    from: normalizeString(process.env.MAIL_FROM),
  };

  return {
    smtp,
    hasDefaultSmtpPassword: Boolean(normalizeString(process.env.MAIL_PASS)),
  };
}

function hasAvailableDefaultSmtp(defaults = getReportingSettingsDefaults()) {
  return Boolean(
    defaults.smtp.host &&
      defaults.smtp.port &&
      defaults.smtp.user &&
      defaults.smtp.from &&
      defaults.hasDefaultSmtpPassword
  );
}

async function getUserWithReportingSettings(userId) {
  const user = await User.findById(userId).select(
    "+reportingSettings.smtp.passEncrypted +reportingSettings.geminiApiKeyEncrypted"
  );

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

function resolveUserCustomSmtp(user) {
  const reportingSettings = user?.reportingSettings || {};
  const smtpSettings = reportingSettings.smtp || {};
  const customSmtp = {
    host: normalizeString(smtpSettings.host),
    port: smtpSettings.port || null,
    user: normalizeString(smtpSettings.user),
    pass: decryptSecretValue(smtpSettings.passEncrypted),
    from: normalizeString(smtpSettings.from),
    usingDefault: false,
    sourceType: "user_custom",
    sourceLabel: "My Custom SMTP",
  };

  return {
    ...customSmtp,
    isReady: Boolean(
      customSmtp.host &&
        customSmtp.port &&
        customSmtp.user &&
        customSmtp.from &&
        customSmtp.pass
    ),
  };
}

function resolveGeminiSettings(user) {
  const reportingSettings = user?.reportingSettings || {};

  return {
    apiKey: decryptSecretValue(reportingSettings.geminiApiKeyEncrypted),
    model: normalizeString(process.env.GEMINI_MODEL) || "gemini-2.5-flash",
    language: normalizeReportingLanguage(reportingSettings.language, "english"),
  };
}

function serializeReportingSettings(user, sharedMeta = {}) {
  const defaults = getReportingSettingsDefaults();
  const reportingSettings = user?.reportingSettings || {};
  const smtpSettings = reportingSettings.smtp || {};
  const useDefaultSmtp = smtpSettings.useDefault !== false;
  const customSmtp = resolveUserCustomSmtp(user);

  return {
    smtp: {
      useDefault: useDefaultSmtp,
      host: normalizeString(smtpSettings.host),
      port: smtpSettings.port || null,
      user: normalizeString(smtpSettings.user),
      from: normalizeString(smtpSettings.from),
      hasStoredPassword: Boolean(normalizeString(smtpSettings.passEncrypted)),
    },
    customSmtp: {
      host: customSmtp.host,
      port: customSmtp.port,
      user: customSmtp.user,
      from: customSmtp.from,
      hasStoredPassword: Boolean(normalizeString(smtpSettings.passEncrypted)),
      isReady: customSmtp.isReady,
    },
    gemini: {
      hasStoredApiKey: Boolean(normalizeString(reportingSettings.geminiApiKeyEncrypted)),
    },
    language: normalizeReportingLanguage(reportingSettings.language, "english"),
    serverSmtp: {
      isAvailable: hasAvailableDefaultSmtp(defaults),
      host: defaults.smtp.host,
      port: defaults.smtp.port,
      user: defaults.smtp.user,
      from: defaults.smtp.from,
    },
    sharedSmtp: {
      availableCount: Number(sharedMeta.availableCount || 0),
      globalDefaultName: normalizeString(sharedMeta.globalDefaultName),
      brandLinkedCount: Number(sharedMeta.brandLinkedCount || 0),
    },
    updatedAt: reportingSettings.updatedAt || null,
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isStructuredFactLine(line) {
  return /^[A-Za-z][A-Za-z0-9 /()#&.-]{1,60}:\s+\S/.test(String(line || "").trim());
}

function formatStructuredFactLine(line) {
  const normalizedLine = String(line || "").trim();
  const separatorIndex = normalizedLine.indexOf(":");

  if (separatorIndex === -1) {
    return escapeHtml(normalizedLine);
  }

  const label = normalizedLine.slice(0, separatorIndex + 1);
  const value = normalizedLine.slice(separatorIndex + 1).trim();

  return `<strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}`;
}

function isUnorderedListLine(line) {
  return /^[-*]\s+/.test(String(line || "").trim());
}

function isOrderedListLine(line) {
  return /^\d+\.\s+/.test(String(line || "").trim());
}

function toEmailHtml(body) {
  return normalizeMultilineText(body)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length && lines.every(isUnorderedListLine)) {
        return `<ul>${lines
          .map((line) => `<li>${escapeHtml(line.replace(/^[-*]\s+/, ""))}</li>`)
          .join("")}</ul>`;
      }

      if (lines.length && lines.every(isOrderedListLine)) {
        return `<ol>${lines
          .map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s+/, ""))}</li>`)
          .join("")}</ol>`;
      }

      if (lines.length && lines.every(isStructuredFactLine)) {
        return `<p>${lines.map((line) => formatStructuredFactLine(line)).join("<br />")}</p>`;
      }

      return `<p>${lines.map((line) => escapeHtml(line)).join("<br />")}</p>`;
    })
    .join("");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getBase64MimeExtension(contentType) {
  const normalizedType = String(contentType || "").toLowerCase();

  if (normalizedType === "image/jpeg") return "jpg";
  if (normalizedType === "image/png") return "png";
  if (normalizedType === "image/gif") return "gif";
  if (normalizedType === "image/webp") return "webp";
  if (normalizedType === "image/svg+xml") return "svg";
  if (normalizedType === "application/pdf") return "pdf";

  const [, subtype] = normalizedType.split("/");
  return subtype || "bin";
}

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:([^;]+);base64,([\s\S]+)$/i);

  if (!match) {
    throw new Error("Invalid attachment data");
  }

  return {
    contentType: match[1],
    contentBase64: match[2],
  };
}

function normalizeAttachmentPayload(attachments = []) {
  if (!Array.isArray(attachments)) {
    throw new Error("Attachments must be an array");
  }

  return attachments
    .filter(Boolean)
    .map((attachment, index) => {
      const filename =
        normalizeString(attachment?.name) ||
        `attachment-${index + 1}.${getBase64MimeExtension(attachment?.contentType)}`;
      const contentType = normalizeString(attachment?.contentType) || "application/octet-stream";
      const contentBase64 = String(attachment?.contentBase64 || "").trim();

      if (!contentBase64) {
        throw new Error(`Attachment ${filename} is missing content`);
      }

      return {
        filename,
        contentType,
        content: Buffer.from(contentBase64, "base64"),
      };
    });
}

function normalizeAttachmentHistoryPayload(attachments = []) {
  if (!Array.isArray(attachments)) {
    throw new Error("Attachments must be an array");
  }

  return attachments
    .filter(Boolean)
    .map((attachment, index) => {
      const name =
        normalizeString(attachment?.name) ||
        `attachment-${index + 1}.${getBase64MimeExtension(attachment?.contentType)}`;
      const contentType = normalizeString(attachment?.contentType) || "application/octet-stream";
      const contentBase64 = String(attachment?.contentBase64 || "").trim();

      if (!contentBase64) {
        throw new Error(`Attachment ${name} is missing content`);
      }

      return {
        id:
          normalizeString(attachment?.id) ||
          `attachment-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        contentType,
        size: Number(attachment?.size) || Buffer.from(contentBase64, "base64").length,
        contentBase64,
      };
    });
}

function normalizeEvidenceImagePayload(images = [], existingImages = []) {
  if (!Array.isArray(images)) {
    throw new Error("Evidence images must be an array");
  }

  if (images.length > MAX_REPORTING_EVIDENCE_IMAGE_COUNT) {
    throw new Error(`You can upload up to ${MAX_REPORTING_EVIDENCE_IMAGE_COUNT} evidence images`);
  }

  const existingImageMap = new Map(
    (Array.isArray(existingImages) ? existingImages : [])
      .map((image) => [normalizeString(image?.id), image])
      .filter(([imageId]) => imageId)
  );
  let totalSize = 0;
  const usedNames = new Set();

  const buildUniqueEvidenceName = (requestedName, fallbackName) => {
    const rawName = normalizeString(requestedName) || normalizeString(fallbackName) || "evidence-image";
    const safeName = rawName.slice(0, 220);
    const dotIndex = safeName.lastIndexOf(".");
    const hasExtension = dotIndex > 0 && dotIndex < safeName.length - 1;
    const baseName = hasExtension ? safeName.slice(0, dotIndex).trim() : safeName.trim();
    const extension = hasExtension ? safeName.slice(dotIndex).trim() : "";
    const normalizedBaseName = baseName || "evidence-image";

    let candidate = `${normalizedBaseName}${extension}`;
    let suffix = 2;

    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${normalizedBaseName}-${suffix}${extension}`;
      suffix += 1;
    }

    usedNames.add(candidate.toLowerCase());
    return candidate;
  };

  return images
    .filter(Boolean)
    .map((image, index) => {
      const requestedId = normalizeString(image?.id);
      const existingImage = requestedId ? existingImageMap.get(requestedId) : null;
      const fallbackName = `evidence-image-${index + 1}.${getBase64MimeExtension(
        image?.contentType || existingImage?.contentType
      )}`;
      const name = buildUniqueEvidenceName(
        normalizeString(image?.name) || normalizeString(existingImage?.name),
        fallbackName
      );
      const contentType = (
        normalizeString(existingImage?.contentType) ||
        normalizeString(image?.contentType) ||
        "image/png"
      ).toLowerCase();
      const contentBase64 = String(image?.contentBase64 || "").trim();
      const storedContentBase64 = String(existingImage?.contentBase64 || "").trim();
      const uploadedAt = existingImage
        ? normalizeDateValue(existingImage?.uploadedAt) || normalizeDateValue(image?.uploadedAt)
        : normalizeDateValue(image?.uploadedAt) || new Date();

      if (!contentBase64 && !storedContentBase64) {
        throw new Error(`Image ${name} is missing content`);
      }

      if (!contentType.startsWith("image/")) {
        throw new Error(`Image ${name} must be a valid image file`);
      }

      const size =
        Number(existingImage?.size) ||
        Number(image?.size) ||
        (contentBase64 ? Buffer.from(contentBase64, "base64").length : 0);

      if (size > MAX_REPORTING_EVIDENCE_IMAGE_SIZE_BYTES) {
        throw new Error(`${name} is too large. Max size is 2 MB`);
      }

      totalSize += size;

      if (totalSize > MAX_REPORTING_EVIDENCE_TOTAL_SIZE_BYTES) {
        throw new Error("Total evidence image size is too large. Keep uploads under 8 MB");
      }

      return {
        id:
          requestedId ||
          normalizeString(existingImage?.id) ||
          `evidence-image-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        contentType,
        size,
        uploadedAt,
        contentBase64: contentBase64 ? encryptSecretValue(contentBase64) : storedContentBase64,
      };
    });
}

function readStoredEvidenceImageContent(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  try {
    return decryptSecretValue(normalizedValue);
  } catch {
    return normalizedValue;
  }
}

function findSubmissionImageOrThrow(submission, imageId) {
  const normalizedImageId = normalizeString(imageId);

  if (!normalizedImageId) {
    throw new Error("Image not found");
  }

  const image = (submission?.images || []).find(
    (item) => normalizeString(item?.id) === normalizedImageId
  );

  if (!image) {
    throw new Error("Image not found");
  }

  return image;
}

function getEvidenceImageUploadedAt(image, fallbackDate = null) {
  return normalizeDateValue(image?.uploadedAt) || normalizeDateValue(fallbackDate);
}

function sumEvidenceImageBytes(images = []) {
  return (Array.isArray(images) ? images : []).reduce(
    (total, image) => total + Math.max(0, Number(image?.size) || 0),
    0
  );
}

function getEvidenceCleanupEligibilityCutoff(now = new Date()) {
  const baseDate = normalizeDateValue(now) || new Date();
  const cutoffDate = new Date(baseDate.getTime() - REPORTING_EVIDENCE_MIN_CLEANUP_MS);
  cutoffDate.setHours(23, 59, 59, 999);
  return cutoffDate;
}

function resolveEvidenceCleanupCutoff(deleteBefore, now = new Date()) {
  const latestAllowedDate = getEvidenceCleanupEligibilityCutoff(now);
  const selectedDate = normalizeDateInputValue(deleteBefore, { endOfDay: true });

  if (!selectedDate) {
    return latestAllowedDate;
  }

  if (selectedDate.getTime() > latestAllowedDate.getTime()) {
    throw new Error(
      `Cleanup date must be at least ${REPORTING_EVIDENCE_MIN_CLEANUP_DAYS} days in the past`
    );
  }

  return selectedDate;
}

function getStaleEvidenceImages(submission, { now = new Date(), cutoff = null } = {}) {
  const fallbackDate = submission?.createdAt || submission?.updatedAt || null;
  const effectiveCutoff = normalizeDateValue(cutoff) || getEvidenceCleanupEligibilityCutoff(now);

  return (Array.isArray(submission?.images) ? submission.images : [])
    .map((image) => ({
      image,
      uploadedAt: getEvidenceImageUploadedAt(image, fallbackDate),
    }))
    .filter(
      ({ uploadedAt }) => uploadedAt && uploadedAt.getTime() <= effectiveCutoff.getTime()
    );
}

function getEvidenceRetentionMetadata(submission, now = new Date()) {
  const cleanupCutoff = getEvidenceCleanupEligibilityCutoff(now);
  const staleImages = getStaleEvidenceImages(submission, {
    now,
    cutoff: cleanupCutoff,
  });
  const oldestStaleImageAt = staleImages.reduce((oldestDate, entry) => {
    if (!oldestDate || entry.uploadedAt.getTime() < oldestDate.getTime()) {
      return entry.uploadedAt;
    }

    return oldestDate;
  }, null);
  const totalImages = Array.isArray(submission?.images) ? submission.images : [];
  const staleImageBytes = staleImages.reduce(
    (total, entry) => total + Math.max(0, Number(entry?.image?.size) || 0),
    0
  );

  return {
    hasStaleImages: staleImages.length > 0,
    staleImageCount: staleImages.length,
    staleImageBytes,
    totalImageCount: totalImages.length,
    totalImageBytes: sumEvidenceImageBytes(totalImages),
    thresholdDays: REPORTING_EVIDENCE_MIN_CLEANUP_DAYS,
    staleBefore: cleanupCutoff,
    staleBeforeInput: formatDateInputValue(cleanupCutoff),
    oldestStaleImageAt,
  };
}

function buildDeletedEvidenceHistoryEntry(entry, adminUser, reason, cleanupCutoff) {
  const adminId = normalizeObjectIdOrNull(adminUser?._id, "Admin");
  const adminName = normalizeString(adminUser?.fullName) || normalizeString(adminUser?.email) || "Admin";

  return {
    id: normalizeString(entry?.image?.id) || `deleted-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: normalizeString(entry?.image?.name) || "Unknown image",
    contentType: normalizeString(entry?.image?.contentType) || "image/png",
    size: Math.max(0, Number(entry?.image?.size) || 0),
    uploadedAt: entry?.uploadedAt || null,
    deletedAt: new Date(),
    deletedById: adminId || null,
    deletedByName: adminName,
    deletionReason: normalizeString(reason) || "cleanup",
    cleanupCutoff: normalizeDateValue(cleanupCutoff) || null,
  };
}

function appendDeletedEvidenceHistory(submission, deletedEntries = [], adminUser, reason, cleanupCutoff) {
  if (!submission) {
    return;
  }

  const currentHistory = Array.isArray(submission.deletedImages) ? submission.deletedImages : [];
  const nextEntries = deletedEntries
    .filter(Boolean)
    .map((entry) => buildDeletedEvidenceHistoryEntry(entry, adminUser, reason, cleanupCutoff));

  if (!nextEntries.length) {
    return;
  }

  const combined = [...nextEntries, ...currentHistory];
  submission.deletedImages = combined.slice(0, MAX_REPORTING_EVIDENCE_DELETION_HISTORY);
}

function resolveEvidenceStorageSummaryCutoff(deleteBefore, now = new Date()) {
  return normalizeDateInputValue(deleteBefore, { endOfDay: true }) || getEvidenceCleanupEligibilityCutoff(now);
}

function buildSubmissionEvidenceImageEntries(submission, { cutoff = null } = {}) {
  const fallbackDate = submission?.createdAt || submission?.updatedAt || null;
  const effectiveCutoff = normalizeDateValue(cutoff);

  return (Array.isArray(submission?.images) ? submission.images : [])
    .map((image) => ({
      submission,
      image,
      uploadedAt: getEvidenceImageUploadedAt(image, fallbackDate),
    }))
    .filter(({ uploadedAt }) => {
      if (!uploadedAt) {
        return false;
      }

      if (!effectiveCutoff) {
        return true;
      }

      return uploadedAt.getTime() <= effectiveCutoff.getTime();
    });
}

function collectEvidenceImageEntries(submissions = [], { cutoff = null } = {}) {
  return (Array.isArray(submissions) ? submissions : []).flatMap((submission) =>
    buildSubmissionEvidenceImageEntries(submission, { cutoff })
  );
}

function summarizeEvidenceImageEntries(entries = []) {
  const submissionIdSet = new Set();
  const reportIdSet = new Set();
  let oldestImageAt = null;
  let newestImageAt = null;
  let imageBytes = 0;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const submissionId = normalizeString(entry?.submission?._id);
    const reportId = normalizeString(entry?.submission?.reportId?._id || entry?.submission?.reportId);
    const uploadedAt = normalizeDateValue(entry?.uploadedAt);

    if (submissionId) {
      submissionIdSet.add(submissionId);
    }

    if (reportId) {
      reportIdSet.add(reportId);
    }

    imageBytes += Math.max(0, Number(entry?.image?.size) || 0);

    if (uploadedAt) {
      if (!oldestImageAt || uploadedAt.getTime() < oldestImageAt.getTime()) {
        oldestImageAt = uploadedAt;
      }

      if (!newestImageAt || uploadedAt.getTime() > newestImageAt.getTime()) {
        newestImageAt = uploadedAt;
      }
    }
  }

  return {
    imageCount: Array.isArray(entries) ? entries.length : 0,
    imageBytes,
    submissionCount: submissionIdSet.size,
    reportCount: reportIdSet.size,
    oldestImageAt,
    newestImageAt,
  };
}

function sanitizeArchiveFileNameSegment(value, fallback = "evidence-image") {
  const sanitizedValue = normalizeString(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\.+$/g, "")
    .trim();

  return sanitizedValue || fallback;
}

function buildUniqueArchiveEntryName(name, usedNames, fallbackExtension = "bin") {
  const sanitizedName = sanitizeArchiveFileNameSegment(name, `evidence-image.${fallbackExtension}`);
  const dotIndex = sanitizedName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? sanitizedName.slice(0, dotIndex) : sanitizedName;
  const extension = dotIndex > 0 ? sanitizedName.slice(dotIndex) : `.${fallbackExtension}`;
  let candidateName = `${baseName}${extension}`;
  let suffix = 1;

  while (usedNames.has(candidateName.toLowerCase())) {
    candidateName = `${baseName}-${suffix}${extension}`;
    suffix += 1;
  }

  usedNames.add(candidateName.toLowerCase());
  return candidateName;
}

async function verifyReportingAdminPassword(userId, password) {
  const normalizedPassword = String(password || "");

  if (!normalizedPassword) {
    throw new Error("Admin password is required");
  }

  const storedUser = await User.findById(userId).select("passwordHash");

  if (!storedUser?.passwordHash) {
    throw new Error("Admin account could not be verified");
  }

  const isMatch = await bcrypt.compare(normalizedPassword, storedUser.passwordHash);

  if (!isMatch) {
    throw new Error("Admin password is incorrect");
  }
}

function verifyReportingCleanupConfirmation(value) {
  if (normalizeString(value).toUpperCase() !== REPORTING_EVIDENCE_DELETE_CONFIRMATION_TEXT) {
    throw new Error(`Type ${REPORTING_EVIDENCE_DELETE_CONFIRMATION_TEXT} to confirm image cleanup`);
  }
}

function replaceInlineImagesWithCid(html) {
  let inlineImageIndex = 0;
  const inlineAttachments = [];

  const processedHtml = String(html || "").replace(
    /<img\b([^>]*?)src=(['"])(data:[^'"]+)\2([^>]*)>/gi,
    (match, beforeSrc, quote, dataUrl, afterSrc) => {
      const { contentType, contentBase64 } = parseDataUrl(dataUrl);
      inlineImageIndex += 1;
      const cid = `reporting-inline-${Date.now()}-${inlineImageIndex}@200m.local`;
      const extension = getBase64MimeExtension(contentType);

      inlineAttachments.push({
        filename: `inline-image-${inlineImageIndex}.${extension}`,
        contentType,
        content: Buffer.from(contentBase64, "base64"),
        cid,
        contentDisposition: "inline",
      });

      return `<img${beforeSrc}src=${quote}cid:${cid}${quote}${afterSrc}>`;
    }
  );

  return {
    html: processedHtml,
    attachments: inlineAttachments,
  };
}

function buildStyledEmailHtml(bodyHtml) {
  const content = normalizeHtmlEmailBody(bodyHtml) || "<p></p>";

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body {
            margin: 0;
            padding: 0;
            background: #eef2f7;
            font-family: Arial, Helvetica, sans-serif;
            color: #142033;
          }
          .mail-shell {
            width: 100%;
            padding: 32px 16px;
            box-sizing: border-box;
          }
          .mail-card {
            max-width: 760px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #d7dfeb;
            border-radius: 18px;
            overflow: hidden;
            box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
          }
          .mail-header {
            padding: 20px 24px;
            background: linear-gradient(135deg, #38476d 0%, #22314f 100%);
            color: #ffffff;
          }
          .mail-header strong {
            display: block;
            font-size: 15px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
          .mail-header span {
            display: block;
            margin-top: 6px;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.78);
          }
          .mail-body {
            padding: 26px 24px 30px;
            font-size: 15px;
            line-height: 1.7;
            color: #172033;
          }
          .mail-body p {
            margin: 0 0 16px;
          }
          .mail-body h1,
          .mail-body h2,
          .mail-body h3 {
            margin: 0 0 12px;
            line-height: 1.3;
            color: #111827;
          }
          .mail-body h1 {
            font-size: 28px;
          }
          .mail-body h2 {
            font-size: 24px;
          }
          .mail-body h3 {
            font-size: 20px;
          }
          .mail-body ul,
          .mail-body ol {
            margin: 0 0 16px 24px;
            padding: 0;
          }
          .mail-body li {
            margin-bottom: 8px;
          }
          .mail-body a {
            color: #1d4ed8;
            text-decoration: underline;
          }
          .mail-body img {
            display: block;
            max-width: 100%;
            height: auto;
            margin: 16px 0;
            border-radius: 12px;
          }
          .mail-body blockquote {
            margin: 0 0 16px;
            padding: 12px 16px;
            border-left: 4px solid #93c5fd;
            background: #eff6ff;
            color: #1e3a8a;
          }
          .mail-body .ql-align-center {
            text-align: center;
          }
          .mail-body .ql-align-right {
            text-align: right;
          }
          .mail-body .ql-align-justify {
            text-align: justify;
          }
        </style>
      </head>
      <body>
        <div class="mail-shell">
          <div class="mail-card">
           
            <div class="mail-body">${content}</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

function parseGeneratedEmailResponse(text) {
  const normalizedText = String(text || "").trim();

  if (!normalizedText) {
    throw new Error("AI response was empty");
  }

  try {
    const parsed = JSON.parse(normalizedText);
    return {
      subject: normalizeString(parsed.subject),
      body: normalizeMultilineText(parsed.body),
      bodyHtml: normalizeHtmlEmailBody(parsed.bodyHtml),
    };
  } catch {
    const subjectMatch = normalizedText.match(/subject\s*:\s*(.+)/i);
    const bodyMatch = normalizedText.match(/body\s*:\s*([\s\S]+)/i);
    const bodyHtmlMatch = normalizedText.match(/bodyHtml\s*:\s*([\s\S]+)/i);

    return {
      subject: normalizeString(subjectMatch?.[1]),
      body: normalizeMultilineText(bodyMatch?.[1]),
      bodyHtml: normalizeHtmlEmailBody(bodyHtmlMatch?.[1]),
    };
  }
}

function normalizeObjectIdOrNull(value, fieldLabel = "Identifier") {
  const normalizedValue = normalizeString(value);

  if (!normalizedValue) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(normalizedValue)) {
    throw new Error(`${fieldLabel} is invalid`);
  }

  return normalizedValue;
}

function serializeReportingSmtpProfileForManager(profile, viewerUserId = null) {
  const profileObject = typeof profile?.toObject === "function" ? profile.toObject() : profile;
  const { passEncrypted, ...safeProfile } = profileObject || {};
  const ownerUserId = safeProfile?.ownerUserId?._id?.toString() || safeProfile?.ownerUserId?.toString() || null;

  return {
    ...safeProfile,
    brandId: safeProfile?.brandId || null,
    hasStoredPassword: Boolean(passEncrypted),
    ownerUserId,
    profileScope: normalizeString(safeProfile?.profileScope) || "shared",
    isOwnedByCurrentUser: Boolean(viewerUserId && ownerUserId === String(viewerUserId)),
  };
}

function serializeSharedSmtpProfileOption(profile, reportBrandId) {
  const profileObject = typeof profile?.toObject === "function" ? profile.toObject() : profile;
  const profileBrandId = String(profileObject?.brandId?._id || profileObject?.brandId || "");
  const isBrandProfile = Boolean(profileBrandId);
  const isBrandMatch = isBrandProfile && profileBrandId === String(reportBrandId || "");
  const labelParts = [profileObject?.name || "Shared SMTP"];

  if (isBrandMatch && profileObject?.brandId?.brandName) {
    labelParts.push(`(${profileObject.brandId.brandName})`);
  }

  return {
    key: `admin:${profileObject._id}`,
    sourceType: "admin_profile",
    profileId: profileObject._id.toString(),
    label: labelParts.join(" "),
    helper: isBrandMatch
      ? "Brand-linked shared SMTP"
      : profileObject?.isGlobalDefault
        ? "Global shared SMTP"
        : "Shared SMTP profile",
    host: profileObject?.host || "",
    user: profileObject?.user || "",
    from: profileObject?.from || "",
    brandId: profileObject?.brandId?._id?.toString() || null,
    brandName: profileObject?.brandId?.brandName || "",
    isBrandDefault: Boolean(profileObject?.isBrandDefault && isBrandMatch),
    isGlobalDefault: Boolean(profileObject?.isGlobalDefault),
    isAvailable: Boolean(profileObject?.isActive),
  };
}

function selectRecommendedSharedSmtpProfile(profiles, brandId) {
  const normalizedBrandId = String(brandId || "");
  const brandDefaultProfile =
    profiles.find((profile) =>
      profile.isActive &&
      profile.isBrandDefault &&
      String(profile.brandId?._id || profile.brandId || "") === normalizedBrandId
    ) || null;

  if (brandDefaultProfile) {
    return brandDefaultProfile;
  }

  return profiles.find((profile) => profile.isActive && profile.isGlobalDefault) || null;
}

async function loadAccessibleSharedSmtpProfilesForBrand(brandId, { includeSecret = false } = {}) {
  const normalizedBrandId = normalizeObjectIdOrNull(brandId, "Brand");
  const query = ReportingSmtpProfile.find({
    profileScope: { $in: ["shared", null] },
    isActive: true,
    $or: [
      { brandId: null },
      ...(normalizedBrandId ? [{ brandId: normalizedBrandId }] : []),
    ],
  })
    .populate(reportingSmtpProfilePopulate)
    .sort({ isBrandDefault: -1, isGlobalDefault: -1, updatedAt: -1, createdAt: -1 });

  if (includeSecret) {
    query.select("+passEncrypted");
  }

  return query;
}

async function loadUserOwnedSmtpProfiles(userId, { includeSecret = false, onlyActive = false } = {}) {
  const normalizedUserId = normalizeObjectIdOrNull(userId, "User");

  if (!normalizedUserId) {
    return [];
  }

  const query = ReportingSmtpProfile.find({
    profileScope: "personal",
    ownerUserId: normalizedUserId,
    ...(onlyActive ? { isActive: true } : {}),
  })
    .populate(reportingSmtpProfilePopulate)
    .sort({ isActive: -1, updatedAt: -1, createdAt: -1 });

  if (includeSecret) {
    query.select("+passEncrypted");
  }

  return query;
}

async function getSharedSmtpProfileOrThrow(profileId, { includeSecret = false } = {}) {
  const normalizedProfileId = normalizeObjectIdOrNull(profileId, "SMTP profile");

  if (!normalizedProfileId) {
    throw new Error("SMTP profile is required");
  }

  const query = ReportingSmtpProfile.findOne({
    _id: normalizedProfileId,
    profileScope: { $in: ["shared", null] },
  }).populate(reportingSmtpProfilePopulate);

  if (includeSecret) {
    query.select("+passEncrypted");
  }

  const profile = await query;

  if (!profile) {
    throw new Error("SMTP profile not found");
  }

  return profile;
}

async function getOwnedSmtpProfileOrThrow(profileId, ownerUserId, { includeSecret = false } = {}) {
  const normalizedProfileId = normalizeObjectIdOrNull(profileId, "SMTP profile");
  const normalizedOwnerUserId = normalizeObjectIdOrNull(ownerUserId, "User");

  if (!normalizedProfileId) {
    throw new Error("SMTP profile is required");
  }

  const query = ReportingSmtpProfile.findOne({
    _id: normalizedProfileId,
    profileScope: "personal",
    ownerUserId: normalizedOwnerUserId,
  }).populate(reportingSmtpProfilePopulate);

  if (includeSecret) {
    query.select("+passEncrypted");
  }

  const profile = await query;

  if (!profile) {
    throw new Error("SMTP profile not found");
  }

  return profile;
}

async function ensureBrandDefaultUniqueness({ profileId = null, brandId = null, isBrandDefault = false }) {
  if (!brandId || !isBrandDefault) {
    return;
  }

  await ReportingSmtpProfile.updateMany(
    {
      profileScope: { $in: ["shared", null] },
      _id: profileId ? { $ne: profileId } : { $exists: true },
      brandId,
      isBrandDefault: true,
    },
    { $set: { isBrandDefault: false } }
  );
}

async function ensureGlobalDefaultUniqueness({ profileId = null, isGlobalDefault = false }) {
  if (!isGlobalDefault) {
    return;
  }

  await ReportingSmtpProfile.updateMany(
    {
      profileScope: { $in: ["shared", null] },
      _id: profileId ? { $ne: profileId } : { $exists: true },
      isGlobalDefault: true,
    },
    { $set: { isGlobalDefault: false } }
  );
}

function buildReportingMailSourceCatalog({ report, sharedProfiles = [], ownedProfiles = [] }) {
  const sharedOptions = sharedProfiles.map((profile) =>
    serializeSharedSmtpProfileOption(profile, report?.brandId?._id || report?.brandId)
  );
  const ownedOptions = ownedProfiles.map((profile) => serializeOwnedSmtpProfileOption(profile));
  const options = [...sharedOptions, ...ownedOptions];
  const activeOwnedProfile = ownedProfiles.find((profile) => profile.isActive) || null;

  const recommendedSharedProfile = selectRecommendedSharedSmtpProfile(
    sharedProfiles,
    report?.brandId?._id || report?.brandId
  );
  const recommendedOption =
    (recommendedSharedProfile && {
      key: `admin:${recommendedSharedProfile._id}`,
      sourceType: "admin_profile",
      profileId: recommendedSharedProfile._id.toString(),
      label: recommendedSharedProfile.name,
    }) ||
    (activeOwnedProfile && {
      key: `mine:${activeOwnedProfile._id}`,
      sourceType: "user_profile",
      profileId: activeOwnedProfile._id.toString(),
      label: activeOwnedProfile.name,
    }) || {
      key: "",
      sourceType: "",
      profileId: null,
      label: "",
    };

  return {
    options,
    recommendedOption,
  };
}

async function resolveRequestedMailSource({ report, storedUser, requestedSourceType, requestedProfileId }) {
  const normalizedRequestedSourceType = normalizeString(requestedSourceType) || "";
  const requestedSharedProfiles = await loadAccessibleSharedSmtpProfilesForBrand(report.brandId?._id || report.brandId, {
    includeSecret: normalizedRequestedSourceType === "admin_profile",
  });
  const ownedProfiles = await loadUserOwnedSmtpProfiles(storedUser?._id, {
    includeSecret: normalizedRequestedSourceType === "user_profile",
    onlyActive: true,
  });
  const mailSourceCatalog = buildReportingMailSourceCatalog({
    report,
    sharedProfiles: requestedSharedProfiles,
    ownedProfiles,
  });

  if (normalizedRequestedSourceType === "user_profile") {
    const requestedProfile = ownedProfiles.find(
      (profile) => String(profile._id) === String(requestedProfileId || "")
    );

    if (!requestedProfile) {
      throw new Error("Selected personal SMTP profile is not available for this user");
    }

    const decryptedPassword = decryptSecretValue(requestedProfile.passEncrypted);

    if (!decryptedPassword) {
      throw new Error("Selected personal SMTP profile is missing its saved password");
    }

    return {
      host: normalizeString(requestedProfile.host),
      port: requestedProfile.port || null,
      user: normalizeString(requestedProfile.user),
      pass: decryptedPassword,
      from: normalizeString(requestedProfile.from),
      usingDefault: false,
      sourceType: "user_profile",
      sourceLabel: requestedProfile.name,
      profileId: requestedProfile._id.toString(),
    };
  }

  if (normalizedRequestedSourceType === "admin_profile") {
    const requestedProfile = requestedSharedProfiles.find(
      (profile) => String(profile._id) === String(requestedProfileId || "")
    );

    if (!requestedProfile) {
      throw new Error("Selected shared SMTP profile is not available for this report");
    }

    const decryptedPassword = decryptSecretValue(requestedProfile.passEncrypted);

    if (!decryptedPassword) {
      throw new Error("Selected shared SMTP profile is missing its password");
    }

    return {
      host: normalizeString(requestedProfile.host),
      port: requestedProfile.port || null,
      user: normalizeString(requestedProfile.user),
      pass: decryptedPassword,
      from: normalizeString(requestedProfile.from),
      usingDefault: false,
      sourceType: "admin_profile",
      sourceLabel: requestedProfile.name,
      profileId: requestedProfile._id.toString(),
    };
  }

  if (mailSourceCatalog.recommendedOption?.sourceType === "admin_profile") {
    return resolveRequestedMailSource({
      report,
      storedUser,
      requestedSourceType: "admin_profile",
      requestedProfileId: mailSourceCatalog.recommendedOption.profileId,
    });
  }

  if (mailSourceCatalog.recommendedOption?.sourceType === "user_profile") {
    return resolveRequestedMailSource({
      report,
      storedUser,
      requestedSourceType: "user_profile",
      requestedProfileId: mailSourceCatalog.recommendedOption.profileId,
    });
  }

  throw new Error("No available SMTP profile is configured for this report");
}

async function resolveReportingMailSourceDisplayInfo({
  report,
  user,
  requestedSourceType,
  requestedProfileId,
  mailSourceKey,
}) {
  const sharedProfiles = await loadAccessibleSharedSmtpProfilesForBrand(report.brandId?._id || report.brandId);
  const ownedProfiles = await loadUserOwnedSmtpProfiles(user?._id, { onlyActive: true });
  const mailSourceCatalog = buildReportingMailSourceCatalog({
    report,
    sharedProfiles,
    ownedProfiles,
  });
  const normalizedMailSourceKey = normalizeString(mailSourceKey);
  const normalizedRequestedProfileId = String(requestedProfileId || "");
  const selectedOption =
    mailSourceCatalog.options.find((option) => option.key === normalizedMailSourceKey) ||
    mailSourceCatalog.options.find(
      (option) =>
        option.sourceType === normalizeString(requestedSourceType) &&
        String(option.profileId || "") === normalizedRequestedProfileId
    ) ||
    mailSourceCatalog.options.find((option) => option.key === mailSourceCatalog.recommendedOption?.key) ||
    null;

  return {
    mailSourceKey: selectedOption?.key || "",
    smtpSourceType: selectedOption?.sourceType || "",
    smtpProfileId: selectedOption?.profileId || null,
    sourceLabel: selectedOption?.label || "",
    from: selectedOption?.from || selectedOption?.user || "",
  };
}

function serializeOwnedSmtpProfileOption(profile) {
  const profileObject = typeof profile?.toObject === "function" ? profile.toObject() : profile;

  return {
    key: `mine:${profileObject._id}`,
    sourceType: "user_profile",
    profileId: profileObject._id.toString(),
    label: profileObject?.name || "My SMTP Profile",
    helper: "Your personal SMTP profile",
    host: profileObject?.host || "",
    user: profileObject?.user || "",
    from: profileObject?.from || "",
    brandId: null,
    brandName: "",
    isBrandDefault: false,
    isGlobalDefault: false,
    isAvailable: Boolean(profileObject?.isActive),
  };
}

function normalizeReportingEmailComposerPayload(payload, { requireRecipients = false } = {}) {
  const to = requireRecipients
    ? normalizeEmailList(payload?.to, "Recipient email")
    : normalizeOptionalEmailList(payload?.to, "Recipient email");
  const cc = normalizeOptionalEmailList(payload?.cc, "CC email");
  const bcc = normalizeOptionalEmailList(payload?.bcc, "BCC email");
  const subject = normalizeString(payload?.subject);
  const bodyHtml = normalizeHtmlEmailBody(payload?.bodyHtml);
  const bodyText = normalizeMultilineText(payload?.bodyText) || stripHtml(bodyHtml);
  const fallbackPlainBody = normalizeMultilineText(payload?.body);

  return {
    draftId: normalizeObjectIdOrNull(payload?.draftId, "Draft"),
    to,
    cc,
    bcc,
    subject,
    bodyHtml,
    bodyText,
    fallbackPlainBody,
    additionalNotes: normalizeMultilineText(payload?.additionalNotes),
    generatedSubject: normalizeString(payload?.generatedSubject),
    generatedBody: normalizeMultilineText(payload?.generatedBody),
    generatedBodyHtml: normalizeHtmlEmailBody(payload?.generatedBodyHtml),
    attachments: normalizeAttachmentHistoryPayload(payload?.attachments || []),
    mailSourceKey: normalizeString(payload?.mailSourceKey),
    smtpSourceType: normalizeString(payload?.smtpSourceType),
    smtpProfileId: normalizeObjectIdOrNull(payload?.smtpProfileId, "SMTP profile"),
  };
}

function buildReportingEmailEntryPayload({
  reportId,
  authorId,
  composerPayload,
  mailSourceMeta = {},
  status = "draft",
  sentAt = null,
  lastError = "",
}) {
  return {
    reportId,
    authorId,
    status,
    mailSourceKey: mailSourceMeta.mailSourceKey || composerPayload.mailSourceKey || "",
    smtpSourceType: mailSourceMeta.smtpSourceType || composerPayload.smtpSourceType || "",
    smtpProfileId: mailSourceMeta.smtpProfileId || composerPayload.smtpProfileId || null,
    sourceLabel: mailSourceMeta.sourceLabel || "",
    from: mailSourceMeta.from || "",
    to: composerPayload.to,
    cc: composerPayload.cc,
    bcc: composerPayload.bcc,
    subject: composerPayload.subject,
    bodyHtml: composerPayload.bodyHtml,
    bodyText: composerPayload.bodyText || composerPayload.fallbackPlainBody,
    additionalNotes: composerPayload.additionalNotes,
    generatedSubject: composerPayload.generatedSubject,
    generatedBody: composerPayload.generatedBody,
    generatedBodyHtml: composerPayload.generatedBodyHtml,
    attachments: composerPayload.attachments,
    sentAt,
    lastError,
  };
}

async function getEditableReportingDraftOrNull(draftId, reportId, userId) {
  const normalizedDraftId = normalizeObjectIdOrNull(draftId, "Draft");

  if (!normalizedDraftId) {
    return null;
  }

  const draft = await ReportingEmailEntry.findOne({
    _id: normalizedDraftId,
    reportId,
    authorId: userId,
    status: "draft",
  });

  return draft || null;
}

function humanizeMailSendError(error) {
  const rawMessage = normalizeString(error?.response || error?.message || "Failed to send email");
  const normalizedMessage = rawMessage.toLowerCase();

  if (
    normalizedMessage.includes("gmail-smtp-in.l.google.com") &&
    (normalizedMessage.includes("not authorized") || normalizedMessage.includes("notauthorizederror"))
  ) {
    return "Gmail rejected this message because the sending server IP is not authorized for direct delivery. Use a valid authenticated SMTP relay for that profile or ask the mail provider to route outbound mail through its approved smarthost.";
  }

  return rawMessage || "Failed to send email";
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) {
    throw new Error("Workflow steps must be an array");
  }

  return steps
    .map((step) => normalizeString(step))
    .filter(Boolean);
}

function normalizeWorkflowLinks(links) {
  if (!Array.isArray(links)) {
    throw new Error("Workflow links must be an array");
  }

  return links
    .map((link) => ({
      label: normalizeString(link?.label),
      href: normalizeString(link?.href),
    }))
    .filter((link) => link.label && link.href);
}

async function ensureReportingWorkflowsSeeded() {
  const existingWorkflows = await ReportingWorkflow.find().select("issueType").lean();
  const existingIssueTypes = new Set(existingWorkflows.map((workflow) => workflow.issueType));

  const missingDefaults = REPORTING_WORKFLOW_DEFAULTS.filter(
    (workflow) => !existingIssueTypes.has(workflow.issueType)
  );

  if (!missingDefaults.length) {
    return;
  }

  await ReportingWorkflow.insertMany(missingDefaults, { ordered: false });
}

function validateStatus(status) {
  if (!REPORTING_STATUSES.includes(status) || status === "open") {
    throw new Error("Invalid reporting status");
  }
}

function buildClaimedByList(reportObject) {
  const claimUsers = (reportObject.claims || [])
    .map((claim) => claim.userId)
    .filter(Boolean);

  if (claimUsers.length) {
    return claimUsers;
  }

  return (reportObject.claimedByIds || []).filter(Boolean);
}

function getCurrentUserClaim(reportObject, userId) {
  const explicitClaim =
    (reportObject.claims || []).find((claim) => String(claim.userId?._id || claim.userId) === String(userId)) || null;

  if (explicitClaim) {
    return explicitClaim;
  }

  const hasLegacyClaim = (reportObject.claimedByIds || []).some(
    (claimedUser) => String(claimedUser?._id || claimedUser) === String(userId)
  );

  return hasLegacyClaim
    ? {
        userId,
        status: "in_progress",
      }
    : null;
}

function compareClaimDatesDescending(left, right) {
  return new Date(right?.updatedAt || right?.claimedAt || 0).getTime() -
    new Date(left?.updatedAt || left?.claimedAt || 0).getTime();
}

function getSimpleActiveClaim(reportObject) {
  const activeClaims = [...(reportObject?.claims || [])]
    .filter((claim) => SIMPLE_REPORTING_ACTIVE_STATUSES.includes(claim?.status))
    .sort(compareClaimDatesDescending);

  return activeClaims[0] || null;
}

function getLatestResolvedClaim(reportObject) {
  const resolvedClaims = [...(reportObject?.claims || [])]
    .filter((claim) => claim?.status === "resolved")
    .sort(compareClaimDatesDescending);

  return resolvedClaims[0] || null;
}

function getSimpleAssignedClaim(reportObject) {
  return getSimpleActiveClaim(reportObject) || getLatestResolvedClaim(reportObject);
}

function getAggregateReportStatusFromClaims(reportObject) {
  const claims = Array.isArray(reportObject?.claims) ? reportObject.claims : [];

  if (
    claims.some(
      (claim) =>
        (claim?.status === "submitted" || claim?.status === "reported") && !Boolean(claim?.isChecked)
    )
  ) {
    return "submitted";
  }

  if (claims.some((claim) => claim?.status === "in_progress")) {
    return "in_progress";
  }

  if (claims.some((claim) => claim?.status === "resolved" || claim?.isChecked)) {
    return "resolved";
  }

  return "open";
}

function syncReportStatusFromClaims(report) {
  report.status = getAggregateReportStatusFromClaims(report);
}

function getReportRelevantUserIds(reportObject) {
  const relevantIds = new Set();

  if (reportObject?.createdBy) {
    relevantIds.add(String(reportObject.createdBy?._id || reportObject.createdBy));
  }

  const assignedClaim = getSimpleAssignedClaim(reportObject);

  if (assignedClaim?.userId) {
    relevantIds.add(String(assignedClaim.userId?._id || assignedClaim.userId));
  }

  if (assignedClaim?.reviewedBy) {
    relevantIds.add(String(assignedClaim.reviewedBy?._id || assignedClaim.reviewedBy));
  }

  return relevantIds;
}

function buildDuplicateMetadataMap(reports = []) {
  const urlGroups = new Map();

  reports.forEach((report) => {
    const reportObject = typeof report?.toObject === "function" ? report.toObject() : report;

    if (!reportObject?.url || reportObject?.isDeleted === true) {
      return;
    }

    const urlKey = reportObject.url;
    const currentGroup = urlGroups.get(urlKey) || [];
    currentGroup.push(reportObject);
    urlGroups.set(urlKey, currentGroup);
  });

  const metadataMap = new Map();

  urlGroups.forEach((group) => {
    const sortedGroup = [...group].sort(
      (left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0)
    );

    sortedGroup.forEach((reportObject, index) => {
      metadataMap.set(String(reportObject._id), {
        duplicateSequence: index + 1,
        duplicateTotal: sortedGroup.length,
      });
    });
  });

  return metadataMap;
}

async function buildDuplicateMetadataMapForUrls(urls = []) {
  const normalizedUrls = [...new Set(urls.map((url) => normalizeString(url)).filter(Boolean))];

  if (!normalizedUrls.length) {
    return new Map();
  }

  const relatedReports = await Report.find({
    url: { $in: normalizedUrls },
    isDeleted: { $ne: true },
  }).select("_id url createdAt isDeleted");

  return buildDuplicateMetadataMap(relatedReports);
}

function serializeReportForUser(report, viewer, duplicateMetadata = null) {
  const reportObject = typeof report.toObject === "function" ? report.toObject() : report;
  const viewerUser = viewer && typeof viewer === "object" ? viewer : null;
  const currentUserId = String(viewerUser?._id || viewer || "");
  const canViewAdminMeta = canViewAllReportingEvidence(viewerUser);
  const currentUserClaim = getCurrentUserClaim(reportObject, currentUserId);
  const claimedByUsers = buildClaimedByList(reportObject);
  const assignedClaim = getSimpleAssignedClaim(reportObject);
  const duplicateSequence = Number(duplicateMetadata?.duplicateSequence || reportObject?.duplicateSequence || 1);
  const duplicateTotal = Number(duplicateMetadata?.duplicateTotal || reportObject?.duplicateTotal || 1);
  const assignedUser = assignedClaim?.userId
    ? {
        _id: assignedClaim.userId._id?.toString() || assignedClaim.userId?.toString() || "",
        fullName: assignedClaim.userId.fullName || "Unknown user",
        email: assignedClaim.userId.email || "",
      }
    : null;
  const reviewedBy = assignedClaim?.reviewedBy
    ? {
        _id: assignedClaim.reviewedBy._id?.toString() || assignedClaim.reviewedBy?.toString() || "",
        fullName: assignedClaim.reviewedBy.fullName || "Unknown user",
        email: assignedClaim.reviewedBy.email || "",
      }
    : null;
  const simpleStatus = reportObject?.status || assignedClaim?.status || "open";
  const createdById = String(reportObject?.createdBy?._id || reportObject?.createdBy || "");
  const assignedUserId = String(assignedUser?._id || "");
  const serializedReport = {
    ...reportObject,
    claimedByIds: claimedByUsers,
    currentUserClaim,
    userStatus: currentUserClaim?.status || "open",
    assignedUser,
    simpleStatus,
    isAssignedToMe: Boolean(assignedUserId && assignedUserId === currentUserId),
    isCreatedByMe: Boolean(createdById && createdById === currentUserId),
    reviewedAt: assignedClaim?.reviewedAt || null,
    reviewedBy,
    isChecked: Boolean(assignedClaim?.isChecked),
    duplicateSequence,
    duplicateTotal,
  };

  if (!canViewAdminMeta) {
    delete serializedReport.createdBy;
    delete serializedReport.claims;
    delete serializedReport.claimedByIds;
    delete serializedReport.status;
    delete serializedReport.reviewedAt;
    delete serializedReport.reviewedBy;
  }

  return serializedReport;
}

function canAccessReportingComposer(report, user) {
  const reportObject = typeof report?.toObject === "function" ? report.toObject() : report;
  const currentUserClaim = getCurrentUserClaim(reportObject, user?._id);
  const hasEvidenceBackedClaim = ["submitted", "resolved"].includes(
    normalizeString(currentUserClaim?.status)
  );

  return Boolean(
    (canGenerateReportingAiEmail(user) || canSendReportingEmail(user)) &&
      (canViewAllReportingEvidence(user) || hasEvidenceBackedClaim) &&
      reportObject?.isDeleted !== true
  );
}

function canViewReportingEmailActivity(report, user) {
  return canAccessReportingComposer(report, user) || canViewAllReportingEvidence(user);
}

function canViewReportingSubmissions(report, user) {
  if (canViewAllReportingEvidence(user)) {
    return true;
  }

  const reportObject = typeof report?.toObject === "function" ? report.toObject() : report;
  return getReportRelevantUserIds(reportObject).has(String(user?._id || ""));
}

async function loadReportingEmailEntriesForReport(reportId) {
  return ReportingEmailEntry.find({ reportId })
    .populate(reportingEmailEntryPopulate)
    .sort({ updatedAt: -1, createdAt: -1 });
}

function serializeReportingEmailEntry(entry, user, { isAdminViewer = false } = {}) {
  const entryObject = typeof entry?.toObject === "function" ? entry.toObject() : entry;
  const authorId = String(entryObject?.authorId?._id || entryObject?.authorId || "");
  const isAuthor = authorId === String(user?._id || "");
  const canSeeEntry = isAuthor || isAdminViewer;

  if (!canSeeEntry) {
    return null;
  }

  return {
    _id: entryObject?._id?.toString() || "",
    status: entryObject?.status || "draft",
    mailSourceKey: normalizeString(entryObject?.mailSourceKey),
    smtpSourceType: normalizeString(entryObject?.smtpSourceType),
    smtpProfileId: entryObject?.smtpProfileId?._id?.toString() || entryObject?.smtpProfileId?.toString() || null,
    sourceLabel: normalizeString(entryObject?.sourceLabel),
    from: normalizeString(entryObject?.from),
    to: Array.isArray(entryObject?.to) ? entryObject.to.filter(Boolean) : [],
    cc: Array.isArray(entryObject?.cc) ? entryObject.cc.filter(Boolean) : [],
    bcc:
      isAuthor || isAdminViewer
        ? Array.isArray(entryObject?.bcc)
          ? entryObject.bcc.filter(Boolean)
          : []
        : [],
    subject: normalizeString(entryObject?.subject),
    bodyHtml: normalizeHtmlEmailBody(entryObject?.bodyHtml),
    bodyText: normalizeMultilineText(entryObject?.bodyText),
    additionalNotes: normalizeMultilineText(entryObject?.additionalNotes),
    generatedSubject: normalizeString(entryObject?.generatedSubject),
    generatedBody: normalizeMultilineText(entryObject?.generatedBody),
    generatedBodyHtml: normalizeHtmlEmailBody(entryObject?.generatedBodyHtml),
    attachments: Array.isArray(entryObject?.attachments)
      ? entryObject.attachments.map((attachment) => ({
          id: normalizeString(attachment?.id),
          name: normalizeString(attachment?.name),
          contentType: normalizeString(attachment?.contentType) || "application/octet-stream",
          size: Number(attachment?.size) || 0,
          contentBase64: String(attachment?.contentBase64 || ""),
        }))
      : [],
    author: entryObject?.authorId
      ? {
          _id: entryObject.authorId._id?.toString() || authorId,
          fullName: entryObject.authorId.fullName || "Unknown user",
          email: entryObject.authorId.email || "",
        }
      : null,
    sentAt: entryObject?.sentAt || null,
    lastError: normalizeString(entryObject?.lastError),
    createdAt: entryObject?.createdAt || null,
    updatedAt: entryObject?.updatedAt || null,
    isAuthor,
    isDraftEditable: Boolean(entryObject?.status === "draft" && isAuthor),
  };
}

function serializeReportingEmailActivity(entries, report, user) {
  const isAdminViewer = canViewAllReportingEvidence(user);
  const serializedEntries = entries
    .map((entry) => serializeReportingEmailEntry(entry, user, { isAdminViewer }))
    .filter(Boolean);
  const currentUserDraft =
    serializedEntries.find((entry) => entry.status === "draft" && entry.isAuthor) || null;

  return {
    entries: serializedEntries,
    currentUserDraft,
  };
}

function serializeReportingSubmission(submission, { includeRetention = false, now = new Date() } = {}) {
  const submissionObject = typeof submission?.toObject === "function" ? submission.toObject() : submission;
  const retention = includeRetention ? getEvidenceRetentionMetadata(submissionObject, now) : null;

  return {
    _id: submissionObject?._id?.toString() || "",
    reportId: submissionObject?.reportId?._id?.toString() || submissionObject?.reportId?.toString() || "",
    reporterId: submissionObject?.reporterId
      ? {
          _id:
            submissionObject.reporterId._id?.toString() ||
            submissionObject.reporterId?.toString() ||
            "",
          fullName: submissionObject.reporterId.fullName || "Unknown user",
          email: submissionObject.reporterId.email || "",
        }
      : null,
    driveLink: normalizeString(submissionObject?.driveLink),
    reportedTo: normalizeString(submissionObject?.reportedTo),
    notes: normalizeString(submissionObject?.notes),
    didDdos: Boolean(submissionObject?.didDdos),
    reviewStatus: normalizeString(submissionObject?.reviewStatus) || "submitted",
    reviewComment: normalizeString(submissionObject?.reviewComment),
    reviewedAt: submissionObject?.reviewedAt || null,
    reviewedBy: submissionObject?.reviewedBy
      ? {
          _id:
            submissionObject.reviewedBy._id?.toString() ||
            submissionObject.reviewedBy?.toString() ||
            "",
          fullName: submissionObject.reviewedBy.fullName || "Unknown user",
          email: submissionObject.reviewedBy.email || "",
        }
      : null,
    images: Array.isArray(submissionObject?.images)
      ? submissionObject.images.map((image) => ({
          id: normalizeString(image?.id),
          name: normalizeString(image?.name),
          contentType: normalizeString(image?.contentType) || "image/png",
          size: Number(image?.size) || 0,
          uploadedAt: getEvidenceImageUploadedAt(
            image,
            submissionObject?.createdAt || submissionObject?.updatedAt || null
          ),
        }))
      : [],
    deletedImages: Array.isArray(submissionObject?.deletedImages)
      ? submissionObject.deletedImages
          .map((image) => ({
            id: normalizeString(image?.id),
            name: normalizeString(image?.name),
            contentType: normalizeString(image?.contentType) || "image/png",
            size: Number(image?.size) || 0,
            uploadedAt: normalizeDateValue(image?.uploadedAt) || null,
            deletedAt: normalizeDateValue(image?.deletedAt) || null,
            deletedById: normalizeString(image?.deletedById),
            deletedByName: normalizeString(image?.deletedByName) || "Admin",
            deletionReason: normalizeString(image?.deletionReason) || "cleanup",
            cleanupCutoff: normalizeDateValue(image?.cleanupCutoff) || null,
          }))
          .sort((left, right) => {
            const leftTime = normalizeDateValue(left?.deletedAt)?.getTime?.() || 0;
            const rightTime = normalizeDateValue(right?.deletedAt)?.getTime?.() || 0;
            return rightTime - leftTime;
          })
      : [],
    retention: includeRetention
      ? {
          hasStaleImages: Boolean(retention?.hasStaleImages),
          staleImageCount: Number(retention?.staleImageCount) || 0,
          staleImageBytes: Number(retention?.staleImageBytes) || 0,
          totalImageCount: Number(retention?.totalImageCount) || 0,
          totalImageBytes: Number(retention?.totalImageBytes) || 0,
          thresholdDays: Number(retention?.thresholdDays) || REPORTING_EVIDENCE_MIN_CLEANUP_DAYS,
          staleBefore: retention?.staleBefore || null,
          staleBeforeInput: retention?.staleBeforeInput || "",
          oldestStaleImageAt: retention?.oldestStaleImageAt || null,
        }
      : null,
    createdAt: submissionObject?.createdAt || null,
    updatedAt: submissionObject?.updatedAt || null,
  };
}

function getMineFilter(userId) {
  return {
    $or: [
      { claims: { $elemMatch: { userId } } },
      { claimedByIds: userId },
    ],
  };
}

function getExcludeClaimedByMeFilter(userId, isAdmin = false) {
  const baseFilter = {
    $and: [
      { claims: { $not: { $elemMatch: { userId } } } },
      { claimedByIds: { $nin: [userId] } },
    ],
  };

  if (!isAdmin) {
    baseFilter.$and.push({ isDeleted: { $ne: true } });
  }

  return baseFilter;
}

async function migrateLegacyClaims(report) {
  const hasClaims = Array.isArray(report.claims) && report.claims.length > 0;
  const legacyClaimedByIds = Array.isArray(report.claimedByIds) ? report.claimedByIds : [];
  let changed = false;

  if (!hasClaims && legacyClaimedByIds.length) {
    report.claims = legacyClaimedByIds.map((userId) => ({
      userId,
      status: "in_progress",
      claimedAt: report.updatedAt || report.createdAt || new Date(),
      updatedAt: report.updatedAt || report.createdAt || new Date(),
    }));
    report.claimedByIds = [];
    changed = true;
  }

  for (const claim of report.claims || []) {
    if (claim.status === "resolved" && !claim.isChecked) {
      claim.status = "submitted";
      changed = true;
    }
  }

  const submissionStatusCandidates = (report.claims || []).filter(
    (claim) => (claim.status === "reported" || claim.status === "resolved") && !claim.isChecked
  );

  if (submissionStatusCandidates.length) {
    const reporterIdsWithEvidence = await Submission.distinct("reporterId", {
      reportId: report._id,
      reporterId: {
        $in: submissionStatusCandidates.map((claim) => claim.userId._id || claim.userId),
      },
    });
    const reporterIdSet = new Set(reporterIdsWithEvidence.map((item) => String(item)));

    for (const claim of submissionStatusCandidates) {
      if (reporterIdSet.has(String(claim.userId._id || claim.userId)) && claim.status !== "submitted") {
        claim.status = "submitted";
        changed = true;
      }
    }
  }

  if (changed) {
    await report.save();
    await report.populate(reportPopulate);
  }

  return report;
}

async function ensureBrandExists(brandId) {
  if (!mongoose.Types.ObjectId.isValid(String(brandId || ""))) {
    throw new Error("Valid brand is required");
  }

  const brand = await Brand.findById(brandId).select("brandName");

  if (!brand) {
    throw new Error("Brand not found");
  }

  return brand;
}

async function ensureOptionalBrand(brandId) {
  const normalizedBrandId = normalizeObjectIdOrNull(brandId, "Brand");

  if (!normalizedBrandId) {
    return null;
  }

  return ensureBrandExists(normalizedBrandId);
}

async function getReportOrThrow(id) {
  if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
    throw new Error("Report not found");
  }

  const report = await Report.findById(id);

  if (!report) {
    throw new Error("Report not found");
  }

  return report;
}

async function getAccessibleReportForUser(reportId, user) {
  let report = await Report.findById(reportId).populate(reportPopulate);

  if (!report) {
    throw new Error("Report not found");
  }

  report = await migrateLegacyClaims(report);

  if (report.isDeleted && !isAdminUser(user)) {
    const hasClaimed = report.claims.some(
      (claim) => String(claim.userId?._id || claim.userId) === String(user._id)
    );

    if (!hasClaimed) {
      throw new Error("Report not found");
    }
  }

  return report;
}

export async function getReportingOverviewService(user) {
  const isAdmin = isAdminUser(user);
  const [openCount, inProgressCount, reportedCount, submittedCount, resolvedCount, myWorkCount, mySubmissionCount] = await Promise.all([
    Report.countDocuments(getExcludeClaimedByMeFilter(user._id, isAdmin)),
    Report.countDocuments({ claims: { $elemMatch: { userId: user._id, status: "in_progress" } } }),
    Report.countDocuments({ claims: { $elemMatch: { userId: user._id, status: "reported" } } }),
    Report.countDocuments({ claims: { $elemMatch: { userId: user._id, status: "submitted" } } }),
    Report.countDocuments({ claims: { $elemMatch: { userId: user._id, status: "resolved" } } }),
    Report.countDocuments(getMineFilter(user._id)),
    Submission.countDocuments({ reporterId: user._id }),
  ]);

  return {
    openCount,
    inProgressCount,
    reportedCount,
    submittedCount,
    resolvedCount,
    myWorkCount,
    mySubmissionCount,
  };
}

export async function getReportingWorkflowsService() {
  await ensureReportingWorkflowsSeeded();

  const workflows = await ReportingWorkflow.find().sort({ createdAt: 1, title: 1 });
  const workflowOrder = new Map(REPORTING_ISSUE_TYPES.map((issueType, index) => [issueType, index]));

  return workflows.sort(
    (left, right) => (workflowOrder.get(left.issueType) ?? 999) - (workflowOrder.get(right.issueType) ?? 999)
  );
}

export async function updateReportingWorkflowService(issueType, payload) {
  validateIssueType(issueType);
  await ensureReportingWorkflowsSeeded();

  const workflow = await ReportingWorkflow.findOne({ issueType });

  if (!workflow) {
    throw new Error("Workflow not found");
  }

  workflow.title = normalizeString(payload.title) || workflow.title;
  workflow.guideTitle = normalizeString(payload.guideTitle) || workflow.guideTitle;
  workflow.tone = normalizeString(payload.tone) || workflow.tone;
  workflow.label = normalizeString(payload.label);
  workflow.note = normalizeString(payload.note);
  workflow.summary = normalizeString(payload.summary);
  workflow.badge = normalizeString(payload.badge);
  workflow.steps = normalizeSteps(payload.steps || []);
  workflow.links = normalizeWorkflowLinks(payload.links || []);

  await workflow.save();

  return workflow;
}

async function normalizeReportingSmtpProfilePayload(
  payload,
  existingProfile = null,
  { allowSharedFields = true } = {}
) {
  const brand = allowSharedFields ? await ensureOptionalBrand(payload?.brandId) : null;
  const name = normalizeString(payload?.name);
  const host = normalizeString(payload?.host);
  const port = normalizeInteger(payload?.port, null);
  const user = normalizeString(payload?.user);
  const from = normalizeString(payload?.from);
  const password = String(payload?.pass || "").trim();
  const isBrandDefault = allowSharedFields ? normalizeBoolean(payload?.isBrandDefault) : false;
  const isGlobalDefault = allowSharedFields ? normalizeBoolean(payload?.isGlobalDefault) : false;
  const isActive =
    payload?.isActive === undefined
      ? existingProfile?.isActive !== false
      : normalizeBoolean(payload?.isActive);

  if (!name) {
    throw new Error("SMTP profile name is required");
  }

  if (!host || !port || !user || !from) {
    throw new Error("SMTP host, port, user, and from address are required");
  }

  if (!password && !existingProfile?.passEncrypted) {
    throw new Error("SMTP password is required");
  }

  if (allowSharedFields) {
    if (brand && isGlobalDefault) {
      throw new Error("A brand-linked SMTP profile cannot also be the global default");
    }

    if (!brand && isBrandDefault) {
      throw new Error("Select a brand before marking this profile as the brand default");
    }

    if (!isActive && (isBrandDefault || isGlobalDefault)) {
      throw new Error("Inactive SMTP profiles cannot be marked as default");
    }
  } else if (payload?.brandId || payload?.isBrandDefault || payload?.isGlobalDefault) {
    throw new Error("Personal SMTP profiles cannot use shared-brand default settings");
  }

  return {
    brand,
    name,
    host,
    port,
    user,
    from,
    password,
    isBrandDefault,
    isGlobalDefault,
    isActive,
  };
}

export async function getReportingUserSettingsService(user) {
  const storedUser = await getUserWithReportingSettings(user._id);
  const [availableCount, brandLinkedCount, globalDefaultProfile] = await Promise.all([
    ReportingSmtpProfile.countDocuments({ profileScope: { $in: ["shared", null] }, isActive: true }),
    ReportingSmtpProfile.countDocuments({
      profileScope: { $in: ["shared", null] },
      isActive: true,
      brandId: { $ne: null },
    }),
    ReportingSmtpProfile.findOne({
      profileScope: { $in: ["shared", null] },
      isActive: true,
      isGlobalDefault: true,
    }).select("name"),
  ]);

  return serializeReportingSettings(storedUser, {
    availableCount,
    brandLinkedCount,
    globalDefaultName: globalDefaultProfile?.name || "",
  });
}

export async function getReportingEvidenceStorageSummaryService(query, adminUser) {
  if (!canViewAllReportingEvidence(adminUser) && !isAdminUser(adminUser)) {
    throw new Error("You do not have access to reporting evidence storage");
  }

  const now = new Date();
  const minimumAgeCutoff = getEvidenceCleanupEligibilityCutoff(now);
  const selectedCutoff = resolveEvidenceStorageSummaryCutoff(query?.deleteBefore, now);
  const submissions = await Submission.find({
    "images.0": { $exists: true },
  }).select("images reportId reporterId createdAt updatedAt");

  const allEntries = collectEvidenceImageEntries(submissions);
  const olderThanMinimumEntries = collectEvidenceImageEntries(submissions, {
    cutoff: minimumAgeCutoff,
  });
  const selectedEntries = collectEvidenceImageEntries(submissions, {
    cutoff: selectedCutoff,
  });
  const totalSummary = summarizeEvidenceImageEntries(allEntries);
  const minimumSummary = summarizeEvidenceImageEntries(olderThanMinimumEntries);
  const selectedSummary = summarizeEvidenceImageEntries(selectedEntries);

  return {
    totalImageCount: totalSummary.imageCount,
    totalImageBytes: totalSummary.imageBytes,
    totalSubmissionCount: totalSummary.submissionCount,
    thresholdDays: REPORTING_EVIDENCE_MIN_CLEANUP_DAYS,
    olderThanThresholdCount: minimumSummary.imageCount,
    olderThanThresholdBytes: minimumSummary.imageBytes,
    olderThanThresholdSubmissionCount: minimumSummary.submissionCount,
    olderThanThresholdDate: minimumAgeCutoff,
    olderThanThresholdDateInput: formatDateInputValue(minimumAgeCutoff),
    selectedDate: selectedCutoff,
    selectedDateInput: formatDateInputValue(selectedCutoff),
    selectedImageCount: selectedSummary.imageCount,
    selectedImageBytes: selectedSummary.imageBytes,
    selectedSubmissionCount: selectedSummary.submissionCount,
    oldestSelectedImageAt: selectedSummary.oldestImageAt,
    newestSelectedImageAt: selectedSummary.newestImageAt,
  };
}

export async function updateReportingUserSettingsService(payload, user) {
  const storedUser = await getUserWithReportingSettings(user._id);
  const useDefaultSmtp =
    payload?.useDefaultSmtp === undefined
      ? storedUser.reportingSettings?.smtp?.useDefault !== false
      : normalizeBoolean(payload?.useDefaultSmtp);
  const nextHost = normalizeString(payload?.smtpHost);
  const nextPort = normalizeInteger(payload?.smtpPort, null);
  const nextUser = normalizeString(payload?.smtpUser);
  const nextFrom = normalizeString(payload?.smtpFrom);
  const nextPassword = String(payload?.smtpPass || "").trim();
  const nextGeminiApiKey = String(payload?.geminiApiKey || "").trim();
  const nextLanguage = normalizeReportingLanguage(
    payload?.language,
    normalizeReportingLanguage(storedUser.reportingSettings?.language, "english")
  );
  const hasAnyCustomSmtpInput = Boolean(nextHost || nextPort || nextUser || nextFrom || nextPassword);
  const existingEncryptedSmtpPassword =
    storedUser.reportingSettings?.smtp?.passEncrypted || "";

  storedUser.reportingSettings = storedUser.reportingSettings || {};
  storedUser.reportingSettings.smtp = storedUser.reportingSettings.smtp || {};

  storedUser.reportingSettings.smtp.useDefault = useDefaultSmtp;
  storedUser.reportingSettings.smtp.host = nextHost;
  storedUser.reportingSettings.smtp.port = nextPort;
  storedUser.reportingSettings.smtp.user = nextUser;
  storedUser.reportingSettings.smtp.from = nextFrom;

  if (!useDefaultSmtp || hasAnyCustomSmtpInput) {
    if (!nextHost || !nextPort || !nextUser || !nextFrom) {
      throw new Error("Custom SMTP host, port, user, and from address are required");
    }

    if (!nextPassword && !existingEncryptedSmtpPassword) {
      throw new Error("Custom SMTP password is required");
    }
  }

  if (nextPassword) {
    storedUser.reportingSettings.smtp.passEncrypted = encryptSecretValue(nextPassword);
  }

  if (nextGeminiApiKey) {
    storedUser.reportingSettings.geminiApiKeyEncrypted = encryptSecretValue(nextGeminiApiKey);
  }

  storedUser.reportingSettings.language = nextLanguage;
  storedUser.reportingSettings.updatedAt = new Date();
  await storedUser.save();

  const [availableCount, brandLinkedCount, globalDefaultProfile] = await Promise.all([
    ReportingSmtpProfile.countDocuments({ profileScope: { $in: ["shared", null] }, isActive: true }),
    ReportingSmtpProfile.countDocuments({
      profileScope: { $in: ["shared", null] },
      isActive: true,
      brandId: { $ne: null },
    }),
    ReportingSmtpProfile.findOne({
      profileScope: { $in: ["shared", null] },
      isActive: true,
      isGlobalDefault: true,
    }).select("name"),
  ]);

  return serializeReportingSettings(storedUser, {
    availableCount,
    brandLinkedCount,
    globalDefaultName: globalDefaultProfile?.name || "",
  });
}

export async function getReportingMailProfilesAdminService(user) {
  if (!canManageReportingSmtpProfiles(user)) {
    throw new Error("You do not have permission to manage reporting SMTP profiles");
  }

  const [profiles, brands] = await Promise.all([
    ReportingSmtpProfile.find({ profileScope: { $in: ["shared", null] } })
      .select("+passEncrypted")
      .populate(reportingSmtpProfilePopulate)
      .sort({ isActive: -1, brandId: 1, isBrandDefault: -1, isGlobalDefault: -1, updatedAt: -1, createdAt: -1 }),
    Brand.find().select("brandName").sort({ brandName: 1 }).lean(),
  ]);

  return {
    profiles: profiles.map((profile) => serializeReportingSmtpProfileForManager(profile, user?._id)),
    brands,
  };
}

export async function getReportingMailProfilesMineService(user) {
  if (!canManageOwnReportingSmtpProfiles(user)) {
    throw new Error("You do not have permission to manage personal reporting SMTP profiles");
  }

  const profiles = await loadUserOwnedSmtpProfiles(user._id, { includeSecret: true });

  return {
    profiles: profiles.map((profile) => serializeReportingSmtpProfileForManager(profile, user?._id)),
  };
}

export async function createReportingMyMailProfileService(payload, user) {
  if (!canManageOwnReportingSmtpProfiles(user)) {
    throw new Error("You do not have permission to manage personal reporting SMTP profiles");
  }

  const normalizedPayload = await normalizeReportingSmtpProfilePayload(payload, null, {
    allowSharedFields: false,
  });

  const profile = await ReportingSmtpProfile.create({
    profileScope: "personal",
    ownerUserId: user._id,
    name: normalizedPayload.name,
    brandId: null,
    host: normalizedPayload.host,
    port: normalizedPayload.port,
    user: normalizedPayload.user,
    passEncrypted: encryptSecretValue(normalizedPayload.password),
    from: normalizedPayload.from,
    isBrandDefault: false,
    isGlobalDefault: false,
    isActive: normalizedPayload.isActive,
    createdBy: user._id,
    updatedBy: user._id,
  });

  return serializeReportingSmtpProfileForManager(
    await getOwnedSmtpProfileOrThrow(profile._id, user._id, { includeSecret: true }),
    user?._id
  );
}

export async function updateReportingMyMailProfileService(profileId, payload, user) {
  if (!canManageOwnReportingSmtpProfiles(user)) {
    throw new Error("You do not have permission to manage personal reporting SMTP profiles");
  }

  const profile = await getOwnedSmtpProfileOrThrow(profileId, user._id, { includeSecret: true });
  const normalizedPayload = await normalizeReportingSmtpProfilePayload(payload, profile, {
    allowSharedFields: false,
  });

  profile.name = normalizedPayload.name;
  profile.host = normalizedPayload.host;
  profile.port = normalizedPayload.port;
  profile.user = normalizedPayload.user;
  profile.from = normalizedPayload.from;
  profile.isActive = normalizedPayload.isActive;
  profile.updatedBy = user._id;

  if (normalizedPayload.password) {
    profile.passEncrypted = encryptSecretValue(normalizedPayload.password);
  }

  await profile.save();

  return serializeReportingSmtpProfileForManager(
    await getOwnedSmtpProfileOrThrow(profile._id, user._id, { includeSecret: true }),
    user?._id
  );
}

export async function deleteReportingMyMailProfileService(profileId, user) {
  if (!canManageOwnReportingSmtpProfiles(user)) {
    throw new Error("You do not have permission to manage personal reporting SMTP profiles");
  }

  const profile = await getOwnedSmtpProfileOrThrow(profileId, user._id);
  await profile.deleteOne();
  return profile;
}

export async function sendReportingMyMailProfileTestService(profileId, payload, user) {
  if (!canManageOwnReportingSmtpProfiles(user)) {
    throw new Error("You do not have permission to manage personal reporting SMTP profiles");
  }

  const profile = await getOwnedSmtpProfileOrThrow(profileId, user._id, { includeSecret: true });
  const recipients = normalizeEmailList(payload?.to, "Test recipient email");
  const decryptedPassword = decryptSecretValue(profile.passEncrypted);

  if (!decryptedPassword) {
    throw new Error("This SMTP profile is missing its saved password");
  }

  const subject = `Reporting SMTP Test - ${profile.name}`;
  const html = buildStyledEmailHtml(`
    <p>This is a test email for your personal reporting SMTP profile <strong>${escapeHtml(profile.name)}</strong>.</p>
    <p>Host: ${escapeHtml(profile.host)}</p>
    <p>From: ${escapeHtml(profile.from)}</p>
    <p>Sent by: ${escapeHtml(user.fullName || user.email || "Reporting User")}</p>
  `);

  await sendMail({
    host: normalizeString(profile.host),
    port: profile.port || null,
    user: normalizeString(profile.user),
    pass: decryptedPassword,
    from: normalizeString(profile.from),
    to: recipients.join(", "),
    subject,
    text: `This is a test email for the reporting SMTP profile ${profile.name}.`,
    html,
  });

  profile.lastTestedAt = new Date();
  profile.lastTestedBy = user._id;
  profile.updatedBy = user._id;
  await profile.save();

  return {
    profileId: profile._id.toString(),
    name: profile.name,
    to: recipients,
  };
}

export async function createReportingMailProfileService(payload, user) {
  if (!canManageReportingSmtpProfiles(user)) {
    throw new Error("You do not have permission to manage reporting SMTP profiles");
  }

  const normalizedPayload = await normalizeReportingSmtpProfilePayload(payload);

  await ensureBrandDefaultUniqueness({
    brandId: normalizedPayload.brand?._id || null,
    isBrandDefault: normalizedPayload.isBrandDefault,
  });
  await ensureGlobalDefaultUniqueness({
    isGlobalDefault: normalizedPayload.isGlobalDefault,
  });

  const profile = await ReportingSmtpProfile.create({
    profileScope: "shared",
    ownerUserId: null,
    name: normalizedPayload.name,
    brandId: normalizedPayload.brand?._id || null,
    host: normalizedPayload.host,
    port: normalizedPayload.port,
    user: normalizedPayload.user,
    passEncrypted: encryptSecretValue(normalizedPayload.password),
    from: normalizedPayload.from,
    isBrandDefault: normalizedPayload.isBrandDefault,
    isGlobalDefault: normalizedPayload.isGlobalDefault,
    isActive: normalizedPayload.isActive,
    createdBy: user._id,
    updatedBy: user._id,
  });

  return serializeReportingSmtpProfileForManager(
    await getSharedSmtpProfileOrThrow(profile._id, { includeSecret: true }),
    user?._id
  );
}

export async function updateReportingMailProfileService(profileId, payload, user) {
  if (!canManageReportingSmtpProfiles(user)) {
    throw new Error("You do not have permission to manage reporting SMTP profiles");
  }

  const profile = await getSharedSmtpProfileOrThrow(profileId, { includeSecret: true });
  const normalizedPayload = await normalizeReportingSmtpProfilePayload(payload, profile);

  profile.name = normalizedPayload.name;
  profile.brandId = normalizedPayload.brand?._id || null;
  profile.host = normalizedPayload.host;
  profile.port = normalizedPayload.port;
  profile.user = normalizedPayload.user;
  profile.from = normalizedPayload.from;
  profile.isBrandDefault = normalizedPayload.isBrandDefault;
  profile.isGlobalDefault = normalizedPayload.isGlobalDefault;
  profile.isActive = normalizedPayload.isActive;
  profile.updatedBy = user._id;

  if (normalizedPayload.password) {
    profile.passEncrypted = encryptSecretValue(normalizedPayload.password);
  }

  await ensureBrandDefaultUniqueness({
    profileId: profile._id,
    brandId: profile.brandId,
    isBrandDefault: profile.isBrandDefault,
  });
  await ensureGlobalDefaultUniqueness({
    profileId: profile._id,
    isGlobalDefault: profile.isGlobalDefault,
  });

  await profile.save();

  return serializeReportingSmtpProfileForManager(
    await getSharedSmtpProfileOrThrow(profile._id, { includeSecret: true }),
    user?._id
  );
}

export async function deleteReportingMailProfileService(profileId, user) {
  if (!canManageReportingSmtpProfiles(user)) {
    throw new Error("You do not have permission to manage reporting SMTP profiles");
  }

  const profile = await getSharedSmtpProfileOrThrow(profileId);
  await profile.deleteOne();
  return profile;
}

export async function sendReportingMailProfileTestService(profileId, payload, user) {
  if (!canManageReportingSmtpProfiles(user)) {
    throw new Error("You do not have permission to manage reporting SMTP profiles");
  }

  const profile = await getSharedSmtpProfileOrThrow(profileId, { includeSecret: true });
  const recipients = normalizeEmailList(payload?.to, "Test recipient email");
  const decryptedPassword = decryptSecretValue(profile.passEncrypted);

  if (!decryptedPassword) {
    throw new Error("This SMTP profile is missing its saved password");
  }

  const subject = `Reporting SMTP Test - ${profile.name}`;
  const html = buildStyledEmailHtml(`
    <p>This is a test email for the reporting SMTP profile <strong>${escapeHtml(profile.name)}</strong>.</p>
    <p>Host: ${escapeHtml(profile.host)}</p>
    <p>From: ${escapeHtml(profile.from)}</p>
    <p>Sent by: ${escapeHtml(user.fullName || user.email || "Reporting Admin")}</p>
  `);

  await sendMail({
    host: normalizeString(profile.host),
    port: profile.port || null,
    user: normalizeString(profile.user),
    pass: decryptedPassword,
    from: normalizeString(profile.from),
    to: recipients.join(", "),
    subject,
    text: `This is a test email for the reporting SMTP profile ${profile.name}.`,
    html,
  });

  profile.lastTestedAt = new Date();
  profile.lastTestedBy = user._id;
  profile.updatedBy = user._id;
  await profile.save();

  return {
    profileId: profile._id.toString(),
    name: profile.name,
    to: recipients,
  };
}

export async function generateReportingEmailService(reportId, payload, user) {
  const storedUser = await getUserWithReportingSettings(user._id);
  const geminiSettings = resolveGeminiSettings(storedUser);
  const report = await getAccessibleReportForUser(reportId, user);

  if (!canAccessReportingComposer(report, user)) {
    throw new Error("Open a task you created, submitted, or can review before using the AI email composer");
  }

  const reportObject = serializeReportForUser(report, user);
  const brandName = report.brandId?.brandName || "Unknown brand";
  const issueTypeLabel = getIssueTypeLabel(report.issueType);
  const additionalNotes = normalizeMultilineText(payload?.additionalNotes);
  const issueTypePromptGuidance = getIssueTypePromptGuidance(report.issueType);
  const workflowPromptContext = getWorkflowPromptContext(report.issueType);
  const outputLanguageInstruction =
    geminiSettings.language === "indonesian"
      ? "Write the subject, plain-text body, and HTML body in professional Bahasa Indonesia."
      : "Write the subject, plain-text body, and HTML body in professional English.";

  if (!geminiSettings.apiKey) {
    throw new Error("Add a Gemini API key in Reporting settings before generating AI email content");
  }

  const ai = new GoogleGenAI({
    apiKey: geminiSettings.apiKey,
  });

  const prompt = [
    "You write professional abuse-report emails for a brand protection team.",
    "Return valid JSON with exactly three keys: subject, body, and bodyHtml.",
    "The body must be a plain-text version of the email body.",
    "The bodyHtml must be a semantic HTML fragment for the email body only.",
    "Do not return Markdown.",
    "Do not return a full HTML document, only the email body fragment.",
    outputLanguageInstruction,
    "Do not include inline CSS, script tags, style tags, html tags, body tags, or head tags.",
    "Allowed bodyHtml tags include p, br, strong, em, ul, ol, li, h2, h3, blockquote, and a.",
    "Write like a real human escalation email to a hosting provider or abuse desk.",
    "Keep the tone formal, cautious, credible, and actionable.",
    "Do not invent evidence. Use wording like appears, may, potential where appropriate.",
    "Do not invent law names, legal sections, regulatory citations, or country-specific findings that are not supported by the provided facts or reporter notes.",
    "Do not include email-client metadata such as date, from, to, tags, or internal UI labels in the body.",
    "Mention the reported URL, brand, issue type, current status, and the action requested.",
    "Use formatting when helpful: bold key facts, readable paragraph spacing, and bullets for compact evidence or request points.",
    "Use a short heading or subheading only if it improves clarity.",
    "Priority rules for writing:",
    "1. Reporter additional notes are highest-priority guidance for tone, greeting, emphasis, team naming, and requested action.",
    "2. Core report facts such as URL, brand, issue type, status, and notes must remain accurate and cannot be changed.",
    "3. Issue-type guidance must shape the final complaint so the message matches the actual report type.",
    "4. If reporter additional notes conflict with core report facts, keep the facts accurate and only use the notes where they still fit.",
    "5. If reporter additional notes ask for a longer copy-paste complaint, produce a fuller long-form email with more detail, while staying professional and believable.",
    additionalNotes
      ? "Reporter additional notes were provided. Treat them as important instructions and weave them into the subject and body wherever they fit the verified facts."
      : "No reporter additional notes were provided, so rely on the verified report facts and issue-type guidance.",
    "Issue-type writing guidance:",
    ...issueTypePromptGuidance,
    "Use this body structure:",
    "1. A natural greeting such as Dear Abuse Team, or a more specific team name if the reporter notes suggest one.",
    "2. A short opening paragraph explaining the concern.",
    "3. A compact fact section using labeled lines such as Reported URL:, Brand/Keyword involved:, and Issue:.",
    "4. One or two short paragraphs describing the suspected abuse, risk, and why it should be reviewed.",
    "5. If the notes request stronger legal framing, add one concise paragraph about likely legal, regulatory, or policy exposure using cautious generic wording only.",
    "6. A clear request for investigation or takedown if it violates policy.",
    "7. A realistic closing with Best regards, followed by a professional signature that can use the reporter name and reporter email when available.",
    "Use blank lines between sections so the email formats cleanly in the UI.",
    "Keep the email focused and believable. Default range is about 180 to 320 words, but if the reporter notes clearly ask for a longer copy-paste legal-style complaint, you may expand to roughly 350 to 650 words.",
    "",
    `Reported URL: ${report.url}`,
    `Brand: ${brandName}`,
    `Issue type: ${issueTypeLabel}`,
    `Issue summary: ${getIssueTypeDescription(report.issueType)}`,
    `Google rank: ${report.googleRank}`,
    `DDOS required: ${report.hasDdos ? "Yes" : "No"}`,
    `Internal notes: ${normalizeMultilineText(report.notes) || "None provided"}`,
    ...workflowPromptContext,
    `Reporter name: ${user.fullName || "Reporting Specialist"}`,
    `Reporter email: ${user.email || "Not available"}`,
    `Additional notes from reporter: ${additionalNotes || "None provided"}`,
  ].join("\n");

  const response = await ai.models.generateContent({
    model: geminiSettings.model,
    contents: prompt,
    config: {
      temperature: 0.5,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          subject: { type: "string" },
          body: { type: "string" },
          bodyHtml: { type: "string" },
        },
        required: ["subject", "body", "bodyHtml"],
      },
    },
  });

  const parsedEmail = parseGeneratedEmailResponse(response.text);

  if (!parsedEmail.subject || (!parsedEmail.body && !parsedEmail.bodyHtml)) {
    throw new Error("AI could not generate a complete email subject and body");
  }

  const normalizedBodyHtml = parsedEmail.bodyHtml || toEmailHtml(parsedEmail.body);
  const normalizedBodyText = parsedEmail.body || stripHtml(normalizedBodyHtml);

  return {
    subject: parsedEmail.subject,
    body: normalizedBodyText,
    bodyHtml: normalizedBodyHtml,
  };
}

export async function saveReportingEmailDraftService(reportId, payload, user) {
  const report = await getAccessibleReportForUser(reportId, user);

  if (!canAccessReportingComposer(report, user)) {
    throw new Error("Open a task you created, submitted, or can review before saving an email draft");
  }

  const composerPayload = normalizeReportingEmailComposerPayload(payload, { requireRecipients: false });
  const mailSourceMeta = await resolveReportingMailSourceDisplayInfo({
    report,
    user,
    requestedSourceType: composerPayload.smtpSourceType,
    requestedProfileId: composerPayload.smtpProfileId,
    mailSourceKey: composerPayload.mailSourceKey,
  });
  const draftPayload = buildReportingEmailEntryPayload({
    reportId: report._id,
    authorId: user._id,
    composerPayload,
    mailSourceMeta,
    status: "draft",
  });

  let draft =
    (await getEditableReportingDraftOrNull(composerPayload.draftId, report._id, user._id)) ||
    (await ReportingEmailEntry.findOne({
      reportId: report._id,
      authorId: user._id,
      status: "draft",
    }).sort({ updatedAt: -1 }));

  if (draft) {
    Object.assign(draft, draftPayload);
    await draft.save();
  } else {
    draft = await ReportingEmailEntry.create(draftPayload);
  }

  await draft.populate(reportingEmailEntryPopulate);

  return {
    draft: serializeReportingEmailEntry(draft, user, { isAdminViewer: true }),
  };
}

export async function sendReportingEmailService(reportId, payload, user) {
  const storedUser = await getUserWithReportingSettings(user._id);
  const report = await getAccessibleReportForUser(reportId, user);
  const composerPayload = normalizeReportingEmailComposerPayload(payload, { requireRecipients: true });
  const subject = composerPayload.subject;
  const composerHtml = composerPayload.bodyHtml || toEmailHtml(composerPayload.fallbackPlainBody);
  const finalTextBody = composerPayload.bodyText || composerPayload.fallbackPlainBody || "HTML email content included.";
  const normalizedAttachments = normalizeAttachmentPayload(composerPayload.attachments);

  if (!canAccessReportingComposer(report, user)) {
    throw new Error("Open a task you created, submitted, or can review before sending email from the composer");
  }

  const resolvedMailSource = await resolveRequestedMailSource({
    report,
    storedUser,
    requestedSourceType: composerPayload.smtpSourceType,
    requestedProfileId: composerPayload.smtpProfileId,
  });
  const sendEntryPayload = buildReportingEmailEntryPayload({
    reportId: report._id,
    authorId: user._id,
    composerPayload: {
      ...composerPayload,
      bodyHtml: composerHtml,
      bodyText: finalTextBody,
    },
    mailSourceMeta: {
      mailSourceKey: composerPayload.mailSourceKey,
      smtpSourceType: resolvedMailSource.sourceType,
      smtpProfileId: resolvedMailSource.profileId || composerPayload.smtpProfileId,
      sourceLabel: resolvedMailSource.sourceLabel,
      from: resolvedMailSource.from,
    },
    status: "sent",
    sentAt: new Date(),
  });
  const draftEntry = await getEditableReportingDraftOrNull(composerPayload.draftId, report._id, user._id);

  if (!subject) {
    throw new Error("Email subject is required");
  }

  if (!composerHtml || !finalTextBody) {
    throw new Error("Email body is required");
  }

  if (!resolvedMailSource.host || !resolvedMailSource.port || !resolvedMailSource.user) {
    throw new Error("Selected SMTP profile is not fully configured");
  }

  if (!resolvedMailSource.pass) {
    throw new Error("Selected SMTP profile is missing its password");
  }

  if (!resolvedMailSource.from) {
    throw new Error("Selected SMTP profile is missing its from address");
  }

  const processedInlineImages = replaceInlineImagesWithCid(composerHtml);
  const styledHtml = buildStyledEmailHtml(processedInlineImages.html);

  try {
    await sendMail({
      host: resolvedMailSource.host,
      port: resolvedMailSource.port,
      user: resolvedMailSource.user,
      pass: resolvedMailSource.pass,
      from: resolvedMailSource.from,
      to: composerPayload.to.join(", "),
      cc: composerPayload.cc.length ? composerPayload.cc.join(", ") : undefined,
      bcc: composerPayload.bcc.length ? composerPayload.bcc.join(", ") : undefined,
      subject,
      text: finalTextBody,
      html: styledHtml,
      attachments: [...processedInlineImages.attachments, ...normalizedAttachments],
    });
  } catch (error) {
    const errorMessage = humanizeMailSendError(error);

    await ReportingEmailEntry.create(
      buildReportingEmailEntryPayload({
        reportId: report._id,
        authorId: user._id,
        composerPayload: {
          ...composerPayload,
          bodyHtml: composerHtml,
          bodyText: finalTextBody,
        },
        mailSourceMeta: {
          mailSourceKey: composerPayload.mailSourceKey,
          smtpSourceType: resolvedMailSource.sourceType,
          smtpProfileId: resolvedMailSource.profileId || composerPayload.smtpProfileId,
          sourceLabel: resolvedMailSource.sourceLabel,
          from: resolvedMailSource.from,
        },
        status: "failed",
        lastError: errorMessage,
      })
    );

    throw new Error(errorMessage);
  }

  let sentEntry = null;

  if (draftEntry) {
    Object.assign(draftEntry, sendEntryPayload);
    await draftEntry.save();
    sentEntry = draftEntry;
  } else {
    sentEntry = await ReportingEmailEntry.create(sendEntryPayload);
  }

  await sentEntry.populate(reportingEmailEntryPopulate);

  return {
    reportId: report._id.toString(),
    url: report.url,
    to: composerPayload.to,
    cc: composerPayload.cc,
    bcc: composerPayload.bcc,
    subject,
    sourceLabel: resolvedMailSource.sourceLabel,
    sourceType: resolvedMailSource.sourceType,
    emailEntryId: sentEntry._id.toString(),
  };
}

export async function getReportingReportsService(query, user) {
  const isAdmin = isAdminUser(user);
  const filters = {};
  const andFilters = [];

  if (query.issueType) {
    validateIssueType(query.issueType);
    filters.issueType = query.issueType;
  }

  if (query.brandId && mongoose.Types.ObjectId.isValid(query.brandId)) {
    filters.brandId = query.brandId;
  }

  if (query.mine === "true") {
    andFilters.push(getMineFilter(user._id));
  }

  if (query.excludeClaimedByMe === "true") {
    andFilters.push(getExcludeClaimedByMeFilter(user._id, isAdmin));
  }

  if (query.userStatus) {
    if (query.userStatus === "open") {
      andFilters.push(getExcludeClaimedByMeFilter(user._id, isAdmin));
    } else {
      validateStatus(query.userStatus);
      andFilters.push({ claims: { $elemMatch: { userId: user._id, status: query.userStatus } } });
    }
  }

  if (query.search) {
    const search = normalizeString(query.search);
    andFilters.push({
      $or: [
        { url: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
      ],
    });
  }

  const queryFilters = andFilters.length ? { ...filters, $and: andFilters } : filters;
  const reports = await Report.find(queryFilters)
    .populate(reportPopulate)
    .sort({ createdAt: -1 });
  const normalizedReports = await Promise.all(reports.map((report) => migrateLegacyClaims(report)));

  // Filter out deleted reports for non-admin users who haven't claimed them
  const filteredReports = normalizedReports.filter((report) => {
    if (!report.isDeleted) return true;
    if (isAdminUser(user)) return true;
    // Check if user has claimed this report
    return report.claims.some((claim) => String(claim.userId._id || claim.userId) === String(user._id));
  });

  const duplicateMetadataMap = await buildDuplicateMetadataMapForUrls(
    filteredReports.map((report) => report.url)
  );

  return filteredReports.map((report) =>
    serializeReportForUser(report, user, duplicateMetadataMap.get(String(report._id)))
  );
}

export async function getReportingReportDetailService(reportId, user) {
  let report = await Report.findById(reportId).populate(reportPopulate);

  if (!report) {
    throw new Error("Report not found");
  }

  report = await migrateLegacyClaims(report);

  // Check if deleted and user should not see it
  if (report.isDeleted) {
    const isAdmin = isAdminUser(user);
    const hasClaimed = report.claims.some((claim) => String(claim.userId._id || claim.userId) === String(user._id));
    if (!isAdmin && !hasClaimed) {
      throw new Error("Report not found");
    }
  }

  const canSeeAllSubmissions = canViewAllReportingEvidence(user);
  const submissionFilter = canSeeAllSubmissions
    ? { reportId }
    : { reportId, reporterId: user._id };
  const submissions = await Submission.find(submissionFilter)
    .populate(submissionPopulate)
    .sort({ createdAt: -1 });

  const duplicateReports = await Report.find({
    url: report.url,
    isDeleted: { $ne: true },
  }).sort({ createdAt: 1 });
  const duplicateMetadataMap = buildDuplicateMetadataMap(duplicateReports);
  const serializedReport = serializeReportForUser(
    report,
    user,
    duplicateMetadataMap.get(String(report._id))
  );
  let mailSources = { options: [], recommendedOption: { key: "", sourceType: "", profileId: null, label: "" } };
  let emailActivity = { entries: [], currentUserDraft: null };

  if (canSendReportingEmail(user) && canAccessReportingComposer(report, user)) {
    const [sharedProfiles, ownedProfiles] = await Promise.all([
      loadAccessibleSharedSmtpProfilesForBrand(report.brandId?._id || report.brandId),
      loadUserOwnedSmtpProfiles(user._id, { onlyActive: true }),
    ]);
    mailSources = buildReportingMailSourceCatalog({
      report,
      sharedProfiles,
      ownedProfiles,
    });
  }

  if (canViewReportingEmailActivity(report, user)) {
    const emailEntries = await loadReportingEmailEntriesForReport(report._id);
    emailActivity = serializeReportingEmailActivity(emailEntries, report, user);
  }

  return {
    report: {
      ...serializedReport,
      mailSources,
      emailActivity,
    },
    submissions: submissions.map((submission) =>
      serializeReportingSubmission(submission, {
        includeRetention: canViewAllReportingEvidence(user),
      })
    ),
  };
}

export async function createReportingReportService(payload, user) {
  const brand = await ensureBrandExists(payload.brandId);
  validateIssueType(payload.issueType);

  const normalizedUrlValue = normalizeUrl(payload.url);

  // Only check for duplicates if not confirming duplicate creation
  if (payload.confirmDuplicate !== true) {
    const existingSameUrl = await Report.findOne({
      url: normalizedUrlValue,
      isDeleted: { $ne: true },
    });

    if (existingSameUrl) {
      throw new Error("CONFIRM_DUPLICATE_URL");
    }
  }

  const googleRank = Number(payload.googleRank);
  if (!Number.isInteger(googleRank) || googleRank < 1) {
    throw new Error("Google rank must be a positive integer");
  }

  let notes = normalizeString(payload.notes);

  const reportData = {
    brandId: brand._id,
    issueType: payload.issueType,
    url: normalizedUrlValue,
    googleRank,
    hasDdos: normalizeBoolean(payload.hasDdos),
    notes,
    createdBy: user._id,
  };

  const report = await Report.create(reportData);

  return Report.findById(report._id).populate(reportPopulate);
}

export async function updateReportingTaskService(reportId, payload, actorUser) {
  let report = await Report.findById(reportId).populate(reportPopulate);

  if (!report) {
    throw new Error("Report not found");
  }

  let changed = false;

  if (payload.brandId !== undefined) {
    const brand = await ensureBrandExists(payload.brandId);
    if (String(report.brandId?._id || report.brandId) !== String(brand._id)) {
      report.brandId = brand._id;
      changed = true;
    }
  }

  if (payload.issueType !== undefined) {
    validateIssueType(payload.issueType);
    if (report.issueType !== payload.issueType) {
      report.issueType = payload.issueType;
      changed = true;
    }
  }

  if (payload.url !== undefined) {
    const nextUrl = normalizeUrl(payload.url);
    if (report.url !== nextUrl) {
      // Only check for duplicates if not confirming duplicate creation
      if (payload.confirmDuplicate !== true) {
        const existingSameUrl = await Report.findOne({
          _id: { $ne: reportId },
          url: nextUrl,
          isDeleted: { $ne: true },
        });

        if (existingSameUrl) {
          throw new Error("CONFIRM_DUPLICATE_URL");
        }
      }

      report.url = nextUrl;
      changed = true;
    }
  }

  if (payload.googleRank !== undefined) {
    const googleRank = Number(payload.googleRank);

    if (!Number.isInteger(googleRank) || googleRank < 1) {
      throw new Error("Google rank must be a positive integer");
    }

    if (report.googleRank !== googleRank) {
      report.googleRank = googleRank;
      changed = true;
    }
  }

  if (payload.hasDdos !== undefined) {
    const hasDdos = normalizeBoolean(payload.hasDdos);
    if (report.hasDdos !== hasDdos) {
      report.hasDdos = hasDdos;
      changed = true;
    }
  }

  if (payload.notes !== undefined) {
    let notes = normalizeString(payload.notes);
    
    if (report.notes !== notes) {
      report.notes = notes;
      changed = true;
    }
  }

  if (changed) {
    for (const claim of report.claims || []) {
      const isEditorClaim = String(claim.userId?._id || claim.userId) === String(actorUser?._id || "");
      const isActiveClaim = ["in_progress", "reported", "submitted"].includes(claim.status);

      if (!isEditorClaim && isActiveClaim) {
        claim.hasTaskUpdate = true;
        claim.taskUpdatedAt = new Date();
        claim.taskUpdatedBy = actorUser?._id || null;
      }
    }
  }

  await report.save();
  await report.populate(reportPopulate);

  return report;
}

export async function deleteReportingTaskService(reportId, user) {
  let report = await Report.findById(reportId).populate(reportPopulate);

  if (!report) {
    throw new Error("Report not found");
  }

  report = await migrateLegacyClaims(report);

  const claimedUsers = report.claims || [];
  const hasProtectedClaims = claimedUsers.some((claim) =>
    ["reported", "submitted", "resolved"].includes(claim.status)
  );

  // Only check for protected claims if user is not admin
  if (!isAdminUser(user) && hasProtectedClaims) {
    throw new Error("This reporting task cannot be deleted because work has already progressed beyond In Progress");
  }

  // Mark as deleted instead of actually deleting
  report.isDeleted = true;
  await report.save();

  return report;
}

export async function claimReportingReportService(reportId, user) {
  let report = await getReportOrThrow(reportId);
  report = await migrateLegacyClaims(report);

  // Check if deleted and user is not admin
  if (report.isDeleted && !isAdminUser(user)) {
    throw new Error("This report is no longer available");
  }

  const activeClaim = getSimpleActiveClaim(report);

  if (activeClaim) {
    const activeClaimUserId = String(activeClaim.userId?._id || activeClaim.userId);

    if (activeClaimUserId === String(user._id)) {
      const populatedReport = await Report.findById(report._id).populate(reportPopulate);
      return serializeReportForUser(populatedReport, user);
    }

    throw new Error(
      `This task is already selected by ${activeClaim.userId?.fullName || "another user"}`
    );
  }

  report.claims.push({
    userId: user._id,
    status: "in_progress",
    claimedAt: new Date(),
    updatedAt: new Date(),
    isChecked: false,
    reviewedAt: null,
      reviewedBy: null,
  });
  syncReportStatusFromClaims(report);
  await report.save();

  const populatedReport = await Report.findById(report._id).populate(reportPopulate);
  return serializeReportForUser(populatedReport, user);
}

export async function unclaimReportingReportService(reportId, user) {
  let report = await getReportOrThrow(reportId);
  report = await migrateLegacyClaims(report);

  const currentClaim = report.claims.find(
    (claim) => String(claim.userId._id || claim.userId) === String(user._id)
  );

  if (!currentClaim) {
    throw new Error("You have not selected this task");
  }

  if (["submitted", "resolved"].includes(currentClaim.status)) {
    throw new Error("Submitted or checked tasks cannot be released");
  }

  const evidenceCount = await Submission.countDocuments({
    reportId: report._id,
    reporterId: user._id,
  });

  if (evidenceCount) {
    throw new Error("Tasks with evidence cannot be released");
  }

  report.claims = report.claims.filter(
    (claim) => String(claim.userId._id || claim.userId) !== String(user._id)
  );
  report.claimedByIds = (report.claimedByIds || []).filter(
    (claimedUserId) => String(claimedUserId) !== String(user._id)
  );
  syncReportStatusFromClaims(report);

  await report.save();

  const populatedReport = await Report.findById(report._id).populate(reportPopulate);
  return serializeReportForUser(populatedReport, user);
}

export async function updateReportingReportStatusService(reportId, status, user) {
  validateStatus(status);

  if (!["in_progress", "reported"].includes(status)) {
    throw new Error("Only In Progress or Reported can be set manually");
  }

  let report = await getReportOrThrow(reportId);
  report = await migrateLegacyClaims(report);

  const claim = report.claims.find((item) => String(item.userId) === String(user._id));

  if (!claim) {
    throw new Error("Claim the report before updating your status");
  }

  if (claim.status === "resolved") {
    throw new Error("Resolved reports cannot be updated");
  }

  claim.status = status;
  claim.updatedAt = new Date();
  claim.hasTaskUpdate = false;
  claim.taskUpdatedAt = null;
  claim.taskUpdatedBy = null;
  syncReportStatusFromClaims(report);
  await report.save();

  const populatedReport = await Report.findById(report._id).populate(reportPopulate);
  return serializeReportForUser(populatedReport, user);
}

export async function createReportingSubmissionService(reportId, payload, user) {
  let report = await getReportOrThrow(reportId);
  report = await migrateLegacyClaims(report);

  const normalizedDriveLink = normalizeOptionalDriveLink(payload.driveLink);
  const normalizedImages = normalizeEvidenceImagePayload(payload.images || [], []);

  if (!normalizedDriveLink && !normalizedImages.length) {
    throw new Error("Add a Google Drive link or at least one image");
  }

  let submission = await Submission.findOne({ reportId: report._id, reporterId: user._id });

  if (!submission) {
    submission = await Submission.create({
      reportId: report._id,
      reporterId: user._id,
      driveLink: normalizedDriveLink,
      images: normalizedImages,
      notes: normalizeString(payload.notes),
      didDdos: normalizeBoolean(payload.didDdos),
      reviewStatus: "submitted",
      reviewComment: "",
      reviewedAt: null,
      reviewedBy: null,
    });
  } else {
    submission.driveLink = normalizedDriveLink;
    submission.images = normalizedImages;
    submission.notes = normalizeString(payload.notes);
    submission.didDdos = normalizeBoolean(payload.didDdos);
    submission.reviewStatus = "submitted";
    submission.reviewComment = "";
    submission.reviewedAt = null;
    submission.reviewedBy = null;
    await submission.save();
  }

  let reporterClaim = report.claims.find(
    (claim) => String(claim.userId?._id || claim.userId) === String(user._id)
  );

  if (!reporterClaim) {
    report.claims.push({
      userId: user._id,
      status: "submitted",
      claimedAt: new Date(),
      updatedAt: new Date(),
      isChecked: false,
      reviewedAt: null,
      reviewedBy: null,
      hasTaskUpdate: false,
      taskUpdatedAt: null,
      taskUpdatedBy: null,
    });
    reporterClaim = report.claims[report.claims.length - 1];
  }

  reporterClaim.status = "submitted";
  reporterClaim.updatedAt = new Date();
  reporterClaim.isChecked = false;
  reporterClaim.reviewedAt = null;
  reporterClaim.reviewedBy = null;
  reporterClaim.hasTaskUpdate = false;
  reporterClaim.taskUpdatedAt = null;
  reporterClaim.taskUpdatedBy = null;
  syncReportStatusFromClaims(report);

  await report.save();

  return serializeReportingSubmission(
    await Submission.findById(submission._id).populate(submissionPopulate)
  );
}

export async function updateReportingSubmissionService(reportId, submissionId, payload, user) {
  let report = await getReportOrThrow(reportId);
  report = await migrateLegacyClaims(report);

  if (!mongoose.Types.ObjectId.isValid(String(submissionId || ""))) {
    throw new Error("Submission not found");
  }

  const submission = await Submission.findOne({
    _id: submissionId,
    reportId: report._id,
    reporterId: user._id,
  });

  if (!submission) {
    throw new Error("Submission not found");
  }

  const claim = report.claims.find(
    (item) => String(item.userId?._id || item.userId) === String(user._id)
  );

  if (claim?.isChecked || submission.reviewStatus === "checked") {
    throw new Error("Checked evidence can no longer be edited");
  }

  const normalizedDriveLink = normalizeOptionalDriveLink(payload.driveLink);
  const normalizedImages = normalizeEvidenceImagePayload(payload.images || [], submission.images || []);

  if (!normalizedDriveLink && !normalizedImages.length) {
    throw new Error("Add a Google Drive link or at least one image");
  }

  submission.driveLink = normalizedDriveLink;
  submission.images = normalizedImages;
  submission.notes = normalizeString(payload.notes);
  submission.didDdos = normalizeBoolean(payload.didDdos);
  submission.reviewStatus = "submitted";
  submission.reviewComment = "";
  submission.reviewedAt = null;
  submission.reviewedBy = null;
  await submission.save();

  let reporterClaim = claim;

  if (!reporterClaim) {
    report.claims.push({
      userId: user._id,
      status: "submitted",
      claimedAt: new Date(),
      updatedAt: new Date(),
      isChecked: false,
      reviewedAt: null,
      reviewedBy: null,
      hasTaskUpdate: false,
      taskUpdatedAt: null,
      taskUpdatedBy: null,
    });
    reporterClaim = report.claims[report.claims.length - 1];
  }

  reporterClaim.status = "submitted";
  reporterClaim.updatedAt = new Date();
  reporterClaim.isChecked = false;
  reporterClaim.reviewedAt = null;
  reporterClaim.reviewedBy = null;
  reporterClaim.hasTaskUpdate = false;
  reporterClaim.taskUpdatedAt = null;
  reporterClaim.taskUpdatedBy = null;
  syncReportStatusFromClaims(report);
  await report.save();

  return serializeReportingSubmission(
    await Submission.findById(submission._id).populate(submissionPopulate)
  );
}

export async function deleteReportingSubmissionService(reportId, submissionId, user) {
  let report = await getReportOrThrow(reportId);
  report = await migrateLegacyClaims(report);

  if (!mongoose.Types.ObjectId.isValid(String(submissionId || ""))) {
    throw new Error("Submission not found");
  }

  const submission = await Submission.findOne({
    _id: submissionId,
    reportId: report._id,
    reporterId: user._id,
  });

  if (!submission) {
    throw new Error("Submission not found");
  }

  if (submission.reviewStatus === "checked") {
    throw new Error("Checked evidence cannot be deleted");
  }

  await submission.deleteOne();

  report.claims = (report.claims || []).filter(
    (claim) => String(claim.userId?._id || claim.userId) !== String(user._id)
  );
  report.claimedByIds = (report.claimedByIds || []).filter(
    (claimedUserId) => String(claimedUserId) !== String(user._id)
  );
  syncReportStatusFromClaims(report);
  await report.save();

  return { _id: submissionId };
}

export async function getReportingSubmissionImageService(reportId, submissionId, imageId, user) {
  const report = await getAccessibleReportForUser(reportId, user);

  if (!mongoose.Types.ObjectId.isValid(String(submissionId || ""))) {
    throw new Error("Submission not found");
  }

  const submissionFilter = {
    _id: submissionId,
    reportId: report._id,
  };

  if (!canViewAllReportingEvidence(user)) {
    submissionFilter.reporterId = user._id;
  }

  const submission = await Submission.findOne(submissionFilter).select("images reporterId");

  if (!submission) {
    const error = new Error("Submission not found");
    error.statusCode = 404;
    throw error;
  }

  const image = findSubmissionImageOrThrow(submission, imageId);
  const contentBase64 = readStoredEvidenceImageContent(image?.contentBase64);

  if (!contentBase64) {
    throw new Error("Image content not found");
  }

  return {
    name: normalizeString(image?.name) || "evidence-image",
    contentType: normalizeString(image?.contentType) || "image/png",
    size: Number(image?.size) || 0,
    content: Buffer.from(contentBase64, "base64"),
  };
}

export async function cleanupReportingEvidenceStorageService(payload, adminUser) {
  if (!canViewAllReportingEvidence(adminUser) && !isAdminUser(adminUser)) {
    throw new Error("You do not have access to manage reporting evidence images");
  }

  const cleanupCutoff = resolveEvidenceStorageSummaryCutoff(payload?.deleteBefore, new Date());
  const submissions = await Submission.find({
    "images.0": { $exists: true },
  }).populate([
    { path: "reportId", select: "url" },
    { path: "reporterId", select: "fullName email" },
  ]);
  const matchingEntries = collectEvidenceImageEntries(submissions, {
    cutoff: cleanupCutoff,
  });

  if (!matchingEntries.length) {
    throw new Error(
      `No evidence images on or before ${formatDateInputValue(cleanupCutoff)} were found for cleanup`
    );
  }

  await verifyReportingAdminPassword(adminUser._id, payload?.adminPassword);
  verifyReportingCleanupConfirmation(payload?.confirmationText);

  const zip = new JSZip();
  const usedNamesByFolder = new Map();
  const archivedImages = [];
  const deletedBytes = matchingEntries.reduce(
    (total, entry) => total + Math.max(0, Number(entry?.image?.size) || 0),
    0
  );
  const imagesBySubmissionId = new Map();

  for (const entry of matchingEntries) {
    const submission = entry.submission;
    const report = submission?.reportId || null;
    const reporter = submission?.reporterId || null;
    const submissionId = normalizeString(submission?._id);
    const reportFolderName = sanitizeArchiveFileNameSegment(
      normalizeString(report?.url) || `report-${normalizeString(report?._id) || "unknown"}`,
      `report-${normalizeString(report?._id) || "unknown"}`
    );
    const reporterFolderName = sanitizeArchiveFileNameSegment(
      normalizeString(reporter?.fullName) ||
        normalizeString(reporter?.email) ||
        `reporter-${normalizeString(reporter?._id) || "unknown"}`,
      `reporter-${normalizeString(reporter?._id) || "unknown"}`
    );
    const submissionFolderName = sanitizeArchiveFileNameSegment(
      `submission-${submissionId || "unknown"}`,
      "submission"
    );
    const folderPath = `${reportFolderName}/${reporterFolderName}/${submissionFolderName}`;
    const folderUsedNames = usedNamesByFolder.get(folderPath) || new Set();
    const contentBase64 = readStoredEvidenceImageContent(entry?.image?.contentBase64);

    if (!contentBase64) {
      throw new Error(
        `Image ${normalizeString(entry?.image?.name) || "unknown"} content could not be exported`
      );
    }

    usedNamesByFolder.set(folderPath, folderUsedNames);

    const archiveName = buildUniqueArchiveEntryName(
      normalizeString(entry?.image?.name) ||
        `evidence-image.${getBase64MimeExtension(entry?.image?.contentType)}`,
      folderUsedNames,
      getBase64MimeExtension(entry?.image?.contentType)
    );

    zip.file(`${folderPath}/${archiveName}`, Buffer.from(contentBase64, "base64"), {
      binary: true,
    });

    archivedImages.push({
      id: normalizeString(entry?.image?.id),
      name: normalizeString(entry?.image?.name),
      archivePath: `${folderPath}/${archiveName}`,
      contentType: normalizeString(entry?.image?.contentType) || "image/png",
      size: Number(entry?.image?.size) || 0,
      uploadedAt: entry.uploadedAt || null,
      reportId: normalizeString(report?._id),
      reportUrl: normalizeString(report?.url),
      submissionId,
      reporter: {
        id: normalizeString(reporter?._id),
        fullName: normalizeString(reporter?.fullName),
        email: normalizeString(reporter?.email),
      },
    });

    if (!imagesBySubmissionId.has(submissionId)) {
      imagesBySubmissionId.set(submissionId, []);
    }

    imagesBySubmissionId.get(submissionId).push(entry);
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        defaultMinimumAgeDays: REPORTING_EVIDENCE_MIN_CLEANUP_DAYS,
        cleanupCutoff,
        deletedImages: archivedImages,
      },
      null,
      2
    )
  );

  const archiveBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  let affectedSubmissionCount = 0;

  for (const submission of submissions) {
    const submissionId = normalizeString(submission?._id);
    const deletionEntries = imagesBySubmissionId.get(submissionId);

    if (!Array.isArray(deletionEntries) || !deletionEntries.length) {
      continue;
    }

    const deleteIdSet = new Set(
      deletionEntries
        .map((entry) => normalizeString(entry?.image?.id))
        .filter(Boolean)
    );

    submission.images = (submission.images || []).filter(
      (image) => !deleteIdSet.has(normalizeString(image?.id))
    );
    appendDeletedEvidenceHistory(
      submission,
      deletionEntries,
      adminUser,
      "global_cleanup",
      cleanupCutoff
    );
    await submission.save();
    affectedSubmissionCount += 1;
  }

  const archiveDate = new Date().toISOString().slice(0, 10);

  return {
    fileName: `reporting-evidence-cleanup-global-${archiveDate}.zip`,
    deletedCount: archivedImages.length,
    deletedBytes,
    affectedSubmissionCount,
    cleanupCutoff,
    content: archiveBuffer,
  };
}

export async function deleteReportingSubmissionOldImagesService(
  reportId,
  submissionId,
  payload,
  adminUser
) {
  if (!canViewAllReportingEvidence(adminUser) && !isAdminUser(adminUser)) {
    throw new Error("You do not have access to manage old evidence images");
  }

  const report = await getReportOrThrow(reportId);

  if (!mongoose.Types.ObjectId.isValid(String(submissionId || ""))) {
    throw new Error("Submission not found");
  }

  const submission = await Submission.findOne({
    _id: submissionId,
    reportId: report._id,
  }).populate(submissionPopulate);

  if (!submission) {
    const error = new Error("Submission not found");
    error.statusCode = 404;
    throw error;
  }

  const cleanupCutoff = resolveEvidenceCleanupCutoff(payload?.deleteBefore, new Date());
  const staleImages = getStaleEvidenceImages(submission, {
    cutoff: cleanupCutoff,
  });

  if (!staleImages.length) {
    throw new Error(
      `No evidence images older than ${formatDateInputValue(cleanupCutoff)} were found for cleanup`
    );
  }

  await verifyReportingAdminPassword(adminUser._id, payload?.adminPassword);
  verifyReportingCleanupConfirmation(payload?.confirmationText);

  const zip = new JSZip();
  const imagesFolder = zip.folder("images");
  const usedNames = new Set();
  const archivedImages = [];
  const deletedBytes = staleImages.reduce(
    (total, entry) => total + Math.max(0, Number(entry?.image?.size) || 0),
    0
  );

  for (const [index, entry] of staleImages.entries()) {
    const image = entry.image;
    const contentBase64 = readStoredEvidenceImageContent(image?.contentBase64);

    if (!contentBase64) {
      throw new Error(`Image ${normalizeString(image?.name) || index + 1} content could not be exported`);
    }

    const archiveName = buildUniqueArchiveEntryName(
      normalizeString(image?.name) || `evidence-image-${index + 1}.${getBase64MimeExtension(image?.contentType)}`,
      usedNames,
      getBase64MimeExtension(image?.contentType)
    );

    imagesFolder.file(archiveName, Buffer.from(contentBase64, "base64"), {
      binary: true,
    });

    archivedImages.push({
      id: normalizeString(image?.id),
      name: normalizeString(image?.name),
      archiveName,
      contentType: normalizeString(image?.contentType) || "image/png",
      size: Number(image?.size) || 0,
      uploadedAt: entry.uploadedAt || null,
    });
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        minimumAgeDays: REPORTING_EVIDENCE_MIN_CLEANUP_DAYS,
        cleanupCutoff,
        reportId: report._id?.toString() || "",
        reportUrl: normalizeString(report?.url),
        submissionId: submission._id?.toString() || "",
        reporter: {
          id:
            submission.reporterId?._id?.toString() ||
            submission.reporterId?.toString() ||
            "",
          fullName: submission.reporterId?.fullName || "Unknown user",
          email: submission.reporterId?.email || "",
        },
        deletedImages: archivedImages,
      },
      null,
      2
    )
  );

  const archiveBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const staleImageIdSet = new Set(
    staleImages.map(({ image }) => normalizeString(image?.id)).filter(Boolean)
  );

  submission.images = (submission.images || []).filter(
    (image) => !staleImageIdSet.has(normalizeString(image?.id))
  );
  appendDeletedEvidenceHistory(
    submission,
    staleImages,
    adminUser,
    "submission_cleanup",
    cleanupCutoff
  );
  await submission.save();

  const archiveDate = new Date().toISOString().slice(0, 10);
  const archiveFileName = `reporting-evidence-cleanup-${sanitizeArchiveFileNameSegment(
    submission._id?.toString() || "submission",
    "submission"
  )}-${archiveDate}.zip`;

  return {
    fileName: archiveFileName,
    deletedCount: staleImageIdSet.size,
    deletedBytes,
    cleanupCutoff,
    content: archiveBuffer,
  };
}

export async function rejectReportingClaimService(reportId, reporterId, payload, adminUser) {
  let report = await getReportOrThrow(reportId);
  report = await migrateLegacyClaims(report);

  if (!mongoose.Types.ObjectId.isValid(String(reporterId || ""))) {
    throw new Error("Reporter not found");
  }

  const rejectionComment = normalizeString(payload?.comment);

  if (!rejectionComment) {
    throw new Error("Rejection comment is required");
  }

  const submission = await Submission.findOne({
    reportId: report._id,
    reporterId,
  });

  if (!submission) {
    throw new Error("No evidence submission found for this reporter");
  }

  let claim = report.claims.find(
    (item) => String(item.userId?._id || item.userId) === String(reporterId)
  );

  if (!claim) {
    report.claims.push({
      userId: reporterId,
      status: "submitted",
      claimedAt: new Date(),
      updatedAt: new Date(),
      isChecked: false,
      reviewedAt: null,
      reviewedBy: null,
      hasTaskUpdate: false,
      taskUpdatedAt: null,
      taskUpdatedBy: null,
    });
    claim = report.claims[report.claims.length - 1];
  }

  submission.reviewStatus = "rejected";
  submission.reviewComment = rejectionComment;
  submission.reviewedAt = new Date();
  submission.reviewedBy = adminUser._id;
  await submission.save();

  claim.status = "submitted";
  claim.isChecked = false;
  claim.reviewedAt = submission.reviewedAt;
  claim.reviewedBy = adminUser._id;
  claim.updatedAt = new Date();
  syncReportStatusFromClaims(report);
  await report.save();

  return serializeReportingSubmission(
    await Submission.findById(submission._id).populate(submissionPopulate)
  );
}

export async function markReportingClaimCheckedService(reportId, reporterId, adminUser) {
  let report = await getReportOrThrow(reportId);
  report = await migrateLegacyClaims(report);

  if (!mongoose.Types.ObjectId.isValid(String(reporterId || ""))) {
    throw new Error("Reporter not found");
  }

  const submissionCount = await Submission.countDocuments({
    reportId: report._id,
    reporterId,
  });

  if (!submissionCount) {
    throw new Error("No evidence submission found for this reporter");
  }

  const submission = await Submission.findOne({
    reportId: report._id,
    reporterId,
  });

  let claim = report.claims.find(
    (item) => String(item.userId?._id || item.userId) === String(reporterId)
  );

  if (!claim) {
    report.claims.push({
      userId: reporterId,
      status: "submitted",
      claimedAt: new Date(),
      updatedAt: new Date(),
      isChecked: false,
      reviewedAt: null,
      reviewedBy: null,
      hasTaskUpdate: false,
      taskUpdatedAt: null,
      taskUpdatedBy: null,
    });
    claim = report.claims[report.claims.length - 1];
  }

  if (claim.status !== "submitted") {
    throw new Error("Only submitted evidence can be marked as checked");
  }

  claim.status = "resolved";
  claim.isChecked = true;
  claim.reviewedAt = new Date();
  claim.reviewedBy = adminUser._id;
  claim.updatedAt = new Date();
  if (submission) {
    submission.reviewStatus = "checked";
    submission.reviewComment = "";
    submission.reviewedAt = claim.reviewedAt;
    submission.reviewedBy = adminUser._id;
    await submission.save();
  }
  syncReportStatusFromClaims(report);
  await report.save();

  const populatedReport = await Report.findById(report._id).populate(reportPopulate);
  return serializeReportForUser(populatedReport, adminUser);
}

export async function reverseReportingClaimCheckedService(reportId, reporterId, adminUser) {
  let report = await getReportOrThrow(reportId);
  report = await migrateLegacyClaims(report);

  if (!mongoose.Types.ObjectId.isValid(String(reporterId || ""))) {
    throw new Error("Reporter not found");
  }

  const claim = report.claims.find(
    (item) => String(item.userId?._id || item.userId) === String(reporterId)
  );

  if (!claim) {
    throw new Error("Evidence review record not found");
  }

  if (!claim.isChecked || claim.status !== "resolved") {
    throw new Error("Only checked submissions can be reversed");
  }

  claim.status = "submitted";
  claim.isChecked = false;
  claim.reviewedAt = null;
  claim.reviewedBy = null;
  claim.updatedAt = new Date();
  const submission = await Submission.findOne({
    reportId: report._id,
    reporterId,
  });

  if (submission) {
    submission.reviewStatus = "submitted";
    submission.reviewComment = "";
    submission.reviewedAt = null;
    submission.reviewedBy = null;
    await submission.save();
  }

  syncReportStatusFromClaims(report);
  await report.save();

  const populatedReport = await Report.findById(report._id).populate(reportPopulate);
  return serializeReportForUser(populatedReport, adminUser);
}

export async function getReportingTaskTrackingService() {
  const reports = await Report.find({ isDeleted: false })
    .populate([
      { path: "brandId", select: "brandName cssClassName backgroundCss textColor" },
      { path: "claimedByIds", select: "fullName email" },
    ])
    .sort({ createdAt: -1 })
    .lean();

  if (!reports.length) return [];

  const reportIds = reports.map((r) => r._id);
  const submissions = await Submission.find({ reportId: { $in: reportIds } })
    .select("reportId reporterId driveLink images didDdos")
    .lean();

  // Key: "reportId:reporterId" → submission
  const submissionByReporterMap = new Map();
  for (const sub of submissions) {
    const key = `${String(sub.reportId)}:${String(sub.reporterId)}`;
    submissionByReporterMap.set(key, sub);
  }

  return reports.map((report) => {
    const reportIdStr = String(report._id);

    const assignedStaff = (report.claimedByIds || []).map((u) => {
      const sub = submissionByReporterMap.get(`${reportIdStr}:${String(u._id)}`);
      const evidenceUploaded = sub
        ? sub.images?.length > 0 || String(sub.driveLink || "").trim() !== ""
        : false;
      return {
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        evidenceUploaded,
        didDdos: sub?.didDdos === true,
      };
    });

    const evidenceUploaded = assignedStaff.some((s) => s.evidenceUploaded);
    const didDdos = assignedStaff.some((s) => s.didDdos);

    return {
      _id: report._id,
      brand: report.brandId
        ? {
            brandName: report.brandId.brandName,
            cssClassName: report.brandId.cssClassName,
            backgroundCss: report.brandId.backgroundCss,
            textColor: report.brandId.textColor,
          }
        : null,
      url: report.url,
      issueType: report.issueType,
      status: report.status,
      hasDdos: report.hasDdos,
      assignedStaff,
      evidenceUploaded,
      didDdos,
      createdAt: report.createdAt,
    };
  });
}
