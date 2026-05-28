import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { hasPrivilege } from "../../../shared/utils/permissions";
import { useGlobalDateFilter } from "../../../shared/context/GlobalDateContext";
import { useReporting } from "../hooks/useReporting";
import { useReportingEvidenceImages } from "../hooks/useReportingEvidenceImages";
import {
  getReportingIssueLabel,
  getReportingTaskStatusLabel,
} from "../constants/reportingLanguage";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";
import {
  generateReportingEmailApi,
  saveReportingEmailDraftApi,
  sendReportingEmailApi,
} from "../api/reportingApi";
import ReportingAiEmailModal from "./ReportingAiEmailModal";
import ReportingEvidenceModal from "./ReportingEvidenceModal";
import ReportingEvidencePanel from "./ReportingEvidencePanel";
import ReportingEvidenceGalleryModal from "./ReportingEvidenceGalleryModal";
import ReportingDrivePreviewModal, {
  getGoogleDrivePreviewConfig,
} from "./ReportingDrivePreviewModal";
import ReportingReviewPanel from "./ReportingReviewPanel";
import ReportingReviewReportSwitcher from "./ReportingReviewReportSwitcher";
import ReportingSubmissionRejectModal from "./ReportingSubmissionRejectModal";

const WORKSPACE_QUERY = {};
const ISSUE_VALUES = ["cloaking", "brand_phishing", "death_phishing", "stray_domain"];
const EVIDENCE_IMAGE_MAX_COUNT = 20;
const EVIDENCE_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const EVIDENCE_IMAGE_TOTAL_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const EVIDENCE_DRAFT_DB_NAME = "reporting-evidence-drafts";
const EVIDENCE_DRAFT_STORE_NAME = "drafts";
const EVIDENCE_DRAFT_VERSION = 1;
const EVIDENCE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const EMPTY_TASK_FORM = {
  brandId: "",
  issueType: ISSUE_VALUES[0],
  url: "",
  googleRank: "1",
  hasDdos: false,
  notes: "",
};
const EMPTY_EVIDENCE_FORM = {
  driveLink: "",
  notes: "",
  didDdos: false,
  images: [],
};
const EMPTY_EMAIL_FORM = {
  draftId: "",
  mailSourceKey: "",
  smtpSourceType: "",
  smtpProfileId: null,
  recipientEmail: "",
  ccEmail: "",
  bccEmail: "",
  subject: "",
  bodyHtml: "",
  bodyText: "",
  additionalNotes: "",
  generatedSubject: "",
  generatedBody: "",
  generatedBodyHtml: "",
  attachments: [],
};

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getIssueLabel(issueType, language) {
  return getReportingIssueLabel(issueType, language);
}

function getStatusLabel(status, language) {
  return getReportingTaskStatusLabel(status, language);
}

function getStatusTone(status) {
  if (status === "resolved") {
    return "is-resolved";
  }

  if (status === "submitted" || status === "reported") {
    return "is-submitted";
  }

  if (status === "in_progress") {
    return "is-progress";
  }

  return "is-open";
}

function getSubmissionReviewStatus(submission) {
  const normalizedStatus = String(submission?.reviewStatus || "").trim().toLowerCase();

  if (normalizedStatus === "checked" || normalizedStatus === "rejected") {
    return normalizedStatus;
  }

  return "submitted";
}

function formatDateTime(value, locale, fallback) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleString(locale);
}

function formatShortDate(value, locale, fallback) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getDateStart(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function getDateEnd(value) {
  const date = getDateStart(value);
  if (!date) {
    return null;
  }

  date.setHours(23, 59, 59, 999);
  return date;
}

function getItemDate(item, dateField = "createdAt") {
  const date = new Date(item?.[dateField]);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function matchesDate(item, fromDate, toDate, dateField = "createdAt") {
  const time = getItemDate(item, dateField)?.getTime();
  if (!time) {
    return false;
  }

  const start = getDateStart(fromDate);
  if (start && time < start.getTime()) {
    return false;
  }

  const end = getDateEnd(toDate);
  if (end && time > end.getTime()) {
    return false;
  }

  return true;
}

function matchesSingleDate(item, selectedDate, dateField = "createdAt") {
  const time = getItemDate(item, dateField)?.getTime();
  const start = getDateStart(selectedDate)?.getTime();
  const end = getDateEnd(selectedDate)?.getTime();

  if (!time || !start || !end) {
    return false;
  }

  return time >= start && time <= end;
}

function formatBytes(value, locale, zeroLabel) {
  const size = Number(value || 0);

  if (!size) {
    return zeroLabel;
  }

  if (size < 1024) {
    return `${size.toLocaleString(locale)} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} KB`;
  }

  return `${(size / (1024 * 1024)).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} MB`;
}

async function copyTextToClipboard(text, uiCopy) {
  const value = String(text || "");

  if (!value) {
    throw new Error(uiCopy.workspace.evidenceDraft.nothingToCopy);
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error(uiCopy.workspace.evidenceDraft.clipboardUnavailable);
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "readonly");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

function readFileAsDataUrl(file, uiCopy) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error(uiCopy.workspace.evidenceDraft.failedToReadFile(file.name)));
    reader.readAsDataURL(file);
  });
}

function parseDataUrl(dataUrl, uiCopy) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,([\s\S]+)$/i);

  if (!match) {
    throw new Error(uiCopy.workspace.evidenceDraft.unsupportedImageFormat);
  }

  return {
    contentType: match[1],
    contentBase64: match[2],
  };
}

function getEvidenceDraftIndexedDb() {
  if (typeof window !== "undefined" && window.indexedDB) {
    return window.indexedDB;
  }

  if (typeof indexedDB !== "undefined") {
    return indexedDB;
  }

  return null;
}

function openEvidenceDraftDb() {
  return new Promise((resolve, reject) => {
    const indexedDb = getEvidenceDraftIndexedDb();

    if (!indexedDb) {
      resolve(null);
      return;
    }

    const request = indexedDb.open(EVIDENCE_DRAFT_DB_NAME, EVIDENCE_DRAFT_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(EVIDENCE_DRAFT_STORE_NAME)) {
        database.createObjectStore(EVIDENCE_DRAFT_STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open evidence draft storage"));
  });
}

async function readEvidenceDraft(key) {
  if (!key) {
    return null;
  }

  const database = await openEvidenceDraftDb();

  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EVIDENCE_DRAFT_STORE_NAME, "readonly");
    const store = transaction.objectStore(EVIDENCE_DRAFT_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Failed to read evidence draft"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error || new Error("Failed to read evidence draft"));
    transaction.onabort = () => reject(transaction.error || new Error("Failed to read evidence draft"));
  });
}

async function writeEvidenceDraft(key, payload) {
  if (!key) {
    return null;
  }

  const database = await openEvidenceDraftDb();

  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EVIDENCE_DRAFT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(EVIDENCE_DRAFT_STORE_NAME);
    const now = Date.now();
    const record = {
      key,
      payload,
      savedAt: now,
      expiresAt: now + EVIDENCE_DRAFT_TTL_MS,
    };
    const request = store.put(record);

    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error || new Error("Failed to save evidence draft"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error || new Error("Failed to save evidence draft"));
    transaction.onabort = () => reject(transaction.error || new Error("Failed to save evidence draft"));
  });
}

async function deleteEvidenceDraft(key) {
  if (!key) {
    return null;
  }

  const database = await openEvidenceDraftDb();

  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EVIDENCE_DRAFT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(EVIDENCE_DRAFT_STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error("Failed to delete evidence draft"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error || new Error("Failed to delete evidence draft"));
    transaction.onabort = () => reject(transaction.error || new Error("Failed to delete evidence draft"));
  });
}

async function cleanupExpiredEvidenceDrafts() {
  const database = await openEvidenceDraftDb();

  if (!database) {
    return 0;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EVIDENCE_DRAFT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(EVIDENCE_DRAFT_STORE_NAME);
    const request = store.openCursor();
    const now = Date.now();
    let deletedCount = 0;

    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor) {
        resolve(deletedCount);
        return;
      }

      const expiresAt = Number(cursor.value?.expiresAt || 0);

      if (expiresAt && expiresAt <= now) {
        deletedCount += 1;
        cursor.delete();
      }

      cursor.continue();
    };

    request.onerror = () =>
      reject(request.error || new Error("Failed to clear expired evidence drafts"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () =>
      reject(transaction.error || new Error("Failed to clear expired evidence drafts"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("Failed to clear expired evidence drafts"));
  });
}

function buildEvidenceDraftStorageKey(reportId, userId, submissionId = "") {
  const normalizedReportId = String(reportId || "").trim();
  const normalizedUserId = String(userId || "").trim();
  const normalizedSubmissionId = String(submissionId || "").trim() || "draft";

  if (!normalizedReportId || !normalizedUserId) {
    return "";
  }

  return `${normalizedReportId}:${normalizedUserId}:${normalizedSubmissionId}`;
}

async function serializeEvidenceDraftForm(form = {}) {
  const images = await Promise.all(
    (Array.isArray(form.images) ? form.images : []).map(async (image) => ({
      id: image?.id || "",
      name: image?.name || "",
      originalName: image?.originalName || image?.name || "",
      nameEdited: Boolean(image?.nameEdited),
      size: Number(image?.size || 0),
      contentType: image?.contentType || image?.file?.type || "image/png",
      submissionId: image?.submissionId || "",
      fileBlob: image?.file instanceof File ? image.file : null,
      fileLastModified:
        image?.file instanceof File ? Number(image.file.lastModified || Date.now()) : 0,
    }))
  );

  return {
    driveLink: String(form.driveLink || ""),
    notes: String(form.notes || ""),
    didDdos: Boolean(form.didDdos),
    images,
  };
}

function hasMeaningfulEvidenceDraft(form = {}) {
  return Boolean(
    String(form.driveLink || "").trim() ||
      String(form.notes || "").trim() ||
      form.didDdos ||
      (Array.isArray(form.images) && form.images.length)
  );
}

function buildEvidenceDraftSignature(form = {}) {
  return JSON.stringify({
    driveLink: String(form.driveLink || ""),
    notes: String(form.notes || ""),
    didDdos: Boolean(form.didDdos),
    images: (Array.isArray(form.images) ? form.images : []).map((image) => ({
      id: image?.id || "",
      name: image?.name || "",
      originalName: image?.originalName || "",
      nameEdited: Boolean(image?.nameEdited),
      size: Number(image?.size || 0),
      contentType: image?.contentType || "",
      submissionId: image?.submissionId || "",
      fileName: image?.file?.name || "",
      fileLastModified: Number(image?.file?.lastModified || 0),
    })),
  });
}

function hydrateEvidenceDraftForm(storedRecord, fallbackForm = EMPTY_EVIDENCE_FORM) {
  const draftData = storedRecord?.payload || storedRecord || {};
  const hydratedImages = (Array.isArray(draftData.images) ? draftData.images : []).map((image) => {
    const fileBlob = image?.fileBlob instanceof Blob ? image.fileBlob : null;
    const fileName = String(image?.name || image?.originalName || "").trim() || "pasted-image.png";
    const file =
      fileBlob && typeof File !== "undefined"
        ? new File([fileBlob], fileName, {
            type: image?.contentType || fileBlob.type || "image/png",
            lastModified: Number(image?.fileLastModified || Date.now()),
          })
        : null;

    return {
      ...image,
      file,
      previewUrl: file && typeof URL !== "undefined" ? URL.createObjectURL(file) : "",
    };
  });

  return {
    ...fallbackForm,
    driveLink: String(draftData.driveLink || fallbackForm.driveLink || ""),
    notes: String(draftData.notes || fallbackForm.notes || ""),
    didDdos: Boolean(
      draftData.didDdos !== undefined ? draftData.didDdos : fallbackForm.didDdos
    ),
    images: hydratedImages,
  };
}

function getTaskFormFromReport(report) {
  return {
    brandId: report?.brandId?._id || "",
    issueType: report?.issueType || ISSUE_VALUES[0],
    url: report?.url || "",
    googleRank: String(report?.googleRank || 1),
    hasDdos: Boolean(report?.hasDdos),
    notes: report?.notes || "",
  };
}

function getEvidenceFormFromSubmission(submission) {
  if (!submission) {
    return { ...EMPTY_EVIDENCE_FORM };
  }

  return {
    driveLink: submission.driveLink || "",
    notes: submission.notes || "",
    didDdos: Boolean(submission.didDdos),
    images: Array.isArray(submission.images)
      ? submission.images.map((image) => ({
          ...image,
          originalName: image?.name || "",
          nameEdited: false,
          submissionId: submission._id || "",
          previewUrl: "",
        }))
      : [],
  };
}

function getDefaultMailSource(report) {
  const recommendedOption = report?.mailSources?.recommendedOption;

  if (recommendedOption?.key) {
    return {
      mailSourceKey: recommendedOption.key,
      smtpSourceType: recommendedOption.sourceType || "",
      smtpProfileId: recommendedOption.profileId || null,
    };
  }

  const firstAvailableOption = (report?.mailSources?.options || []).find((option) => option.isAvailable);

  if (!firstAvailableOption) {
    return {
      mailSourceKey: "",
      smtpSourceType: "",
      smtpProfileId: null,
    };
  }

  return {
    mailSourceKey: firstAvailableOption.key,
    smtpSourceType: firstAvailableOption.sourceType || "",
    smtpProfileId: firstAvailableOption.profileId || null,
  };
}

function getEmailFormForReport(report) {
  const draft = report?.emailActivity?.currentUserDraft;
  const fallbackMailSource = getDefaultMailSource(report);

  return {
    draftId: draft?._id || "",
    mailSourceKey: draft?.mailSourceKey || fallbackMailSource.mailSourceKey,
    smtpSourceType: draft?.smtpSourceType || fallbackMailSource.smtpSourceType,
    smtpProfileId: draft?.smtpProfileId || fallbackMailSource.smtpProfileId,
    recipientEmail: Array.isArray(draft?.to) ? draft.to.join(", ") : "",
    ccEmail: Array.isArray(draft?.cc) ? draft.cc.join(", ") : "",
    bccEmail: Array.isArray(draft?.bcc) ? draft.bcc.join(", ") : "",
    subject: draft?.subject || draft?.generatedSubject || "",
    bodyHtml: draft?.bodyHtml || draft?.generatedBodyHtml || "",
    bodyText: draft?.bodyText || draft?.generatedBody || "",
    additionalNotes: draft?.additionalNotes || "",
    generatedSubject: draft?.generatedSubject || "",
    generatedBody: draft?.generatedBody || "",
    generatedBodyHtml: draft?.generatedBodyHtml || "",
    attachments: Array.isArray(draft?.attachments) ? draft.attachments : [],
  };
}

function buildTaskDuplicatePrompt(url, uiCopy) {
  return uiCopy.workspace.taskForm.duplicatePrompt(url);
}

function getClaimForReporter(report, reporterId) {
  return (report?.claims || []).find(
    (claim) => String(claim?.userId?._id || claim?.userId || "") === String(reporterId || "")
  );
}

function matchesEmailEntryAuthor(entry, person) {
  const entryAuthorId = String(entry?.author?._id || "");
  const entryAuthorEmail = normalizeText(entry?.author?.email).toLowerCase();
  const personId = String(person?._id || "");
  const personEmail = normalizeText(person?.email).toLowerCase();

  return Boolean(
    (entryAuthorId && personId && entryAuthorId === personId) ||
      (entryAuthorEmail && personEmail && entryAuthorEmail === personEmail)
  );
}

function revokeEvidenceImagePreview(image) {
  if (typeof image?.previewUrl === "string" && image.previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

function revokeEvidenceImagePreviews(images = []) {
  (images || []).forEach((image) => {
    revokeEvidenceImagePreview(image);
  });
}

function validateEvidenceImages(images, uiCopy) {
  if (images.length > EVIDENCE_IMAGE_MAX_COUNT) {
    throw new Error(uiCopy.workspace.evidenceDraft.maxImagesError(EVIDENCE_IMAGE_MAX_COUNT));
  }

  const totalSize = images.reduce((sum, image) => sum + Number(image?.size || 0), 0);

  if (totalSize > EVIDENCE_IMAGE_TOTAL_MAX_SIZE_BYTES) {
    throw new Error(uiCopy.workspace.evidenceDraft.totalSizeError);
  }
}

async function buildEvidenceImages(files, currentImages = [], uiCopy) {
  const nextImages = [...currentImages];
  const createdImages = [];

  try {
    for (const [index, file] of files.entries()) {
      if (!file.type.startsWith("image/")) {
        throw new Error(uiCopy.workspace.evidenceDraft.notImageFile(file.name));
      }

      if (file.size > EVIDENCE_IMAGE_MAX_SIZE_BYTES) {
        throw new Error(uiCopy.workspace.evidenceDraft.maxFileSizeError(file.name));
      }

      const fallbackExtension =
        String(file.type || "")
          .split("/")
          .pop()
          ?.replace(/[^a-z0-9]/gi, "")
          .toLowerCase() || "png";
      const fileName =
        String(file.name || "").trim() ||
        `pasted-image-${Date.now()}-${index + 1}.${fallbackExtension}`;

      const nextImage = {
        id: `evidence-image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        name: fileName,
        originalName: fileName,
        nameEdited: false,
        size: file.size,
        contentType: file.type || "image/png",
        file,
        previewUrl: typeof URL !== "undefined" ? URL.createObjectURL(file) : "",
        submissionId: "",
      };

      createdImages.push(nextImage);
      nextImages.push(nextImage);
    }

    validateEvidenceImages(nextImages, uiCopy);
    return nextImages;
  } catch (error) {
    revokeEvidenceImagePreviews(createdImages);
    throw error;
  }
}

async function buildEvidencePayloadImages(images = [], uiCopy, onProgress = () => {}) {
  const safeImages = Array.isArray(images) ? images : [];
  const localImages = safeImages.filter((image) => image?.file instanceof File);
  const localImageCount = localImages.length;
  let processedLocalImages = 0;
  const payloadImages = [];

  for (const image of safeImages) {
    if (image?.file instanceof File) {
      const dataUrl = await readFileAsDataUrl(image.file, uiCopy);
      const { contentType, contentBase64 } = parseDataUrl(dataUrl, uiCopy);
      processedLocalImages += 1;

      if (localImageCount) {
        onProgress(Math.max(5, Math.round((processedLocalImages / localImageCount) * 25)));
      }

      payloadImages.push({
        id: image.id,
        name: image.name,
        size: image.size,
        contentType,
        contentBase64,
      });
      continue;
    }

    payloadImages.push({
      id: image.id,
      name: image.name,
      size: image.size,
      contentType: image.contentType,
    });
  }

  return payloadImages;
}

function TaskSummaryItem({ label, value }) {
  return (
    <div className="reporting-task-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TaskFormCard({
  brands,
  form,
  busy,
  error,
  onChange,
  onSubmit,
  onCancel,
  isEditing,
  showHeader = true,
}) {
  const { copy, language } = useReportingUiCopy();
  const issueOptions = useMemo(
    () =>
      ISSUE_VALUES.map((value) => ({
        value,
        label: getIssueLabel(value, language),
      })),
    [language]
  );

  return (
    <form className="reporter-form-card reporting-simple-form-card" onSubmit={onSubmit}>
      {showHeader ? (
        <div className="reporter-form-card-header">
          <div>
            <h3>
              {isEditing ? copy.workspace.taskForm.editTitle : copy.workspace.taskForm.createTitle}
            </h3>
            <p>{copy.workspace.taskForm.cardDescription}</p>
          </div>
        </div>
      ) : null}

      {error ? <p className="management-error">{error}</p> : null}

      <div className="management-fields">
        <div className="management-field-grid">
          <div className="management-field">
            <label htmlFor="reporting-task-brand">{copy.workspace.taskForm.brand}</label>
            <select
              id="reporting-task-brand"
              value={form.brandId}
              onChange={(event) => onChange("brandId", event.target.value)}
              required
            >
              <option value="">{copy.workspace.taskForm.selectBrand}</option>
              {brands.map((brand) => (
                <option key={brand._id} value={brand._id}>
                  {brand.brandName}
                </option>
              ))}
            </select>
          </div>

          <div className="management-field">
            <label htmlFor="reporting-task-issue-type">{copy.workspace.taskForm.issueType}</label>
            <select
              id="reporting-task-issue-type"
              value={form.issueType}
              onChange={(event) => onChange("issueType", event.target.value)}
              required
            >
              {issueOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="management-field-grid">
          <div className="management-field">
            <label htmlFor="reporting-task-url">{copy.workspace.taskForm.url}</label>
            <input
              id="reporting-task-url"
              type="url"
              value={form.url}
              onChange={(event) => onChange("url", event.target.value)}
              placeholder="https://example.com"
              required
            />
          </div>

          <div className="management-field">
            <label htmlFor="reporting-task-rank">{copy.workspace.taskForm.googleRank}</label>
            <input
              id="reporting-task-rank"
              type="number"
              min="1"
              step="1"
              value={form.googleRank}
              onChange={(event) => onChange("googleRank", event.target.value)}
              required
            />
          </div>
        </div>

        <div className="management-field">
          <label htmlFor="reporting-task-notes">{copy.workspace.taskForm.notes}</label>
          <textarea
            id="reporting-task-notes"
            value={form.notes}
            onChange={(event) => onChange("notes", event.target.value)}
            placeholder={copy.workspace.taskForm.notesPlaceholder}
          />
        </div>

        <label className="management-checkbox" htmlFor="reporting-task-ddos">
          <input
            id="reporting-task-ddos"
            type="checkbox"
            checked={Boolean(form.hasDdos)}
            onChange={(event) => onChange("hasDdos", event.target.checked)}
          />
          <span>
            <strong>{copy.workspace.taskForm.ddosRequired}</strong>
            <small>{copy.workspace.taskForm.ddosRequiredHelp}</small>
          </span>
        </label>
      </div>

      <div className="management-actions">
        {isEditing ? (
          <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
            {copy.common.cancel}
          </button>
        ) : null}
        <button type="submit" className="management-button" disabled={busy}>
          {busy
            ? copy.common.saving
            : isEditing
              ? copy.workspace.taskForm.saveTask
              : copy.workspace.taskForm.createTask}
        </button>
      </div>
    </form>
  );
}

function TaskFormModal({
  isOpen,
  busy,
  brands,
  form,
  error,
  onChange,
  onSubmit,
  onClose,
  isEditing,
}) {
  const { copy } = useReportingUiCopy();

  if (!isOpen) {
    return null;
  }

  return (
    <div className="workflow-modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="workflow-modal-shell reporter-task-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reporting-task-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="workflow-modal-header reporter-task-modal-header">
          <div className="workflow-modal-titleblock">
            <h3 id="reporting-task-modal-title">
              {isEditing
                ? copy.workspace.taskForm.modalEditTitle
                : copy.workspace.taskForm.modalCreateTitle}
            </h3>
            <p>{copy.workspace.taskForm.modalDescription}</p>
          </div>
          <button
            type="button"
            className="management-button-secondary workflow-modal-close"
            onClick={onClose}
            disabled={busy}
          >
            {copy.common.close}
          </button>
        </div>

        <div className="reporter-task-modal-body">
          <TaskFormCard
            brands={brands}
            form={form}
            busy={busy}
            error={error}
            onChange={onChange}
            onSubmit={onSubmit}
            onCancel={onClose}
            isEditing={isEditing}
            showHeader={false}
          />
        </div>
      </div>
    </div>
  );
}

export default function ReporterWorkspace({ mode = "workspace", fixedReportId = "" }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { copy, language, locale } = useReportingUiCopy();
  const { useRange, singleDate, fromDate, toDate, summaryLabel } = useGlobalDateFilter();
  const isReviewMode = mode === "review";
  const canCreateTasks = hasPrivilege(user, "ADD_REPORTING_URLS");
  const canDoReporting = hasPrivilege(user, "DO_REPORTING");
  const canReviewEvidence = hasPrivilege(user, "VIEW_REPORTING_ADMIN_REVIEW");
  const canEditTasks = hasPrivilege(user, "EDIT_REPORTING_TASKS");
  const canDeleteTasks = hasPrivilege(user, "DELETE_REPORTING_TASKS");
  const canGenerateAiEmail = hasPrivilege(user, "GENERATE_REPORTING_AI_EMAIL");
  const canSendReportingEmail = hasPrivilege(user, "SEND_REPORTING_EMAIL");
  const {
    brands,
    reports,
    selectedReport,
    submissions,
    loading,
    detailLoading,
    error,
    loadDetail,
    createReport,
    updateTask,
    deleteTask,
    deleteSubmission,
    markClaimChecked,
    rejectClaim,
    reverseClaimChecked,
    updateSubmission,
    submitEvidence,
  } = useReporting(WORKSPACE_QUERY, { loadBrands: !isReviewMode });
  const evidenceInputRef = useRef(null);
  const evidenceFormRef = useRef(EMPTY_EVIDENCE_FORM);
  const evidenceDraftLoadIdRef = useRef(0);
  const evidenceDraftSaveTimeoutRef = useRef(null);
  const lastEvidenceDraftSignatureRef = useRef("");
  const [search, setSearch] = useState("");
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [taskSuccess, setTaskSuccess] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [evidenceForm, setEvidenceForm] = useState(EMPTY_EVIDENCE_FORM);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceSuccess, setEvidenceSuccess] = useState("");
  const [evidenceUploadProgress, setEvidenceUploadProgress] = useState(0);
  const [evidenceUploadPhase, setEvidenceUploadPhase] = useState("");
  const [isEvidenceDropActive, setIsEvidenceDropActive] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [drivePreview, setDrivePreview] = useState(null);
  const [galleryState, setGalleryState] = useState({
    isOpen: false,
    title: "",
    images: [],
    activeIndex: 0,
  });
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [emailForm, setEmailForm] = useState(EMPTY_EMAIL_FORM);
  const [emailBusyAction, setEmailBusyAction] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [rejectModalState, setRejectModalState] = useState({
    isOpen: false,
    submission: null,
  });
  const [rejectComment, setRejectComment] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const formatDateTimeValue = useCallback(
    (value) => formatDateTime(value, locale, copy.common.notAvailable),
    [copy.common.notAvailable, locale]
  );
  const formatShortDateValue = useCallback(
    (value) => formatShortDate(value, locale, copy.common.notAvailable),
    [copy.common.notAvailable, locale]
  );
  const formatBytesValue = useCallback(
    (value) => formatBytes(value, locale, copy.common.bytesZero),
    [copy.common.bytesZero, locale]
  );

  useEffect(() => {
    if (!actionSuccess || !/copied/i.test(actionSuccess)) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setActionSuccess("");
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [actionSuccess]);

  useEffect(() => {
    if (!brands.length) {
      return;
    }

    setTaskForm((currentForm) => {
      if (currentForm.brandId) {
        return currentForm;
      }

      return {
        ...currentForm,
        brandId: brands[0]._id,
      };
    });
  }, [brands]);

  const baseFilteredReports = useMemo(() => {
    const normalizedSearch = normalizeText(search).toLowerCase();

    return reports.filter((report) => {
      const matchesGlobalDate = useRange
        ? matchesDate(report, fromDate, toDate || fromDate, "createdAt")
        : matchesSingleDate(report, singleDate, "createdAt");

      if (!matchesGlobalDate) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        report?.url,
        report?.notes,
        report?.brandId?.brandName,
        report?.assignedUser?.fullName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [fromDate, reports, search, singleDate, toDate, useRange]);

  const filteredReports = baseFilteredReports;

  const filteredReportIds = filteredReports.map((report) => report._id).join("|");
  const selectedReportId = selectedReport?._id || "";

  useEffect(() => {
    if (isReviewMode) {
      return;
    }

    if (loading || detailLoading || !filteredReports.length) {
      return;
    }

    if (selectedReportId && filteredReports.some((report) => report._id === selectedReportId)) {
      return;
    }

    void loadDetail(filteredReports[0]._id);
  }, [detailLoading, filteredReportIds, filteredReports, isReviewMode, loadDetail, loading, selectedReportId]);

  useEffect(() => {
    if (!isReviewMode || loading || detailLoading) {
      return;
    }

    if (!filteredReports.length) {
      return;
    }

    const normalizedFixedReportId = String(fixedReportId || "");
    const hasMatchingFilteredReport = filteredReports.some(
      (report) => String(report?._id || "") === normalizedFixedReportId
    );

    if (!hasMatchingFilteredReport) {
      navigate(`/reporting/review/${filteredReports[0]._id}`, { replace: true });
      return;
    }

    if (String(selectedReport?._id || "") === normalizedFixedReportId) {
      return;
    }

    void loadDetail(normalizedFixedReportId);
  }, [
    detailLoading,
    filteredReportIds,
    filteredReports,
    fixedReportId,
    isReviewMode,
    loadDetail,
    loading,
    navigate,
    selectedReport?._id,
  ]);

  const activeReport =
    selectedReport && filteredReports.some((report) => report._id === selectedReport._id)
      ? selectedReport
      : null;
  const { getImageSource, isImageLoading } = useReportingEvidenceImages(
    activeReport?._id || "",
    submissions
  );

  const mySubmission =
    submissions.find((submission) => {
      const reporterId = String(submission?.reporterId?._id || "");
      const reporterEmail = normalizeText(submission?.reporterId?.email).toLowerCase();
      const currentUserId = String(user?._id || "");
      const currentUserEmail = normalizeText(user?.email).toLowerCase();

      return Boolean(
        (reporterId && currentUserId && reporterId === currentUserId) ||
          (reporterEmail && currentUserEmail && reporterEmail === currentUserEmail)
      );
    }) || null;
  const evidenceDraftKey = useMemo(
    () => buildEvidenceDraftStorageKey(activeReport?._id, user?._id, mySubmission?._id),
    [activeReport?._id, mySubmission?._id, user?._id]
  );

  useEffect(() => {
    evidenceFormRef.current = evidenceForm;
  }, [evidenceForm]);

  const loadStoredEvidenceDraft = useCallback(
    async (baseForm) => {
      if (!evidenceDraftKey) {
        return baseForm;
      }

      const requestId = evidenceDraftLoadIdRef.current + 1;
      evidenceDraftLoadIdRef.current = requestId;

      try {
        await cleanupExpiredEvidenceDrafts();
        const storedDraft = await readEvidenceDraft(evidenceDraftKey);

        if (!storedDraft || evidenceDraftLoadIdRef.current !== requestId) {
          return baseForm;
        }

        const hydratedForm = hydrateEvidenceDraftForm(storedDraft, baseForm);
        lastEvidenceDraftSignatureRef.current = buildEvidenceDraftSignature(hydratedForm);
        return hydratedForm;
      } catch {
        return baseForm;
      }
    },
    [evidenceDraftKey]
  );

  const persistCurrentEvidenceDraft = useCallback(async () => {
    if (!evidenceDraftKey) {
      return;
    }

    try {
      const currentForm = evidenceFormRef.current;
      const nextSignature = buildEvidenceDraftSignature(currentForm);

      if (nextSignature === lastEvidenceDraftSignatureRef.current) {
        return;
      }

      if (!hasMeaningfulEvidenceDraft(currentForm)) {
        await deleteEvidenceDraft(evidenceDraftKey);
        lastEvidenceDraftSignatureRef.current = nextSignature;
        return;
      }

      const serializedDraft = await serializeEvidenceDraftForm(currentForm);
      await writeEvidenceDraft(evidenceDraftKey, serializedDraft);
      lastEvidenceDraftSignatureRef.current = nextSignature;
    } catch {
      // Ignore local draft persistence failures
    }
  }, [evidenceDraftKey]);

  useEffect(() => {
    setEvidenceForm((currentForm) => {
      revokeEvidenceImagePreviews(currentForm.images);
      return getEvidenceFormFromSubmission(mySubmission);
    });
    setEvidenceError("");
    setEvidenceSuccess("");
    setEvidenceUploadProgress(0);
    setEvidenceUploadPhase("");
    setIsEvidenceDropActive(false);
    setShowEvidenceModal(false);
    setGalleryState({
      isOpen: false,
      title: "",
      images: [],
      activeIndex: 0,
    });
    setRejectModalState({
      isOpen: false,
      submission: null,
    });
    setRejectComment("");
    setRejectError("");
    setRejectBusy(false);
    lastEvidenceDraftSignatureRef.current = "";
  }, [activeReport?._id, mySubmission?._id]);

  useEffect(() => {
    void cleanupExpiredEvidenceDrafts();
  }, []);

  useEffect(() => {
    if (!showEvidenceModal || !evidenceDraftKey) {
      return undefined;
    }

    if (evidenceDraftSaveTimeoutRef.current) {
      window.clearTimeout(evidenceDraftSaveTimeoutRef.current);
    }

    evidenceDraftSaveTimeoutRef.current = window.setTimeout(() => {
      void persistCurrentEvidenceDraft();
    }, 500);

    return () => {
      if (evidenceDraftSaveTimeoutRef.current) {
        window.clearTimeout(evidenceDraftSaveTimeoutRef.current);
        evidenceDraftSaveTimeoutRef.current = null;
      }
    };
  }, [evidenceDraftKey, evidenceForm, persistCurrentEvidenceDraft, showEvidenceModal]);

  useEffect(() => {
    if (!canReviewEvidence) {
      setSelectedReviewerId("");
      return;
    }

    setSelectedReviewerId((currentReviewerId) => {
      const hasCurrentSelection = submissions.some(
        (submission) =>
          String(submission?.reporterId?._id || "") === String(currentReviewerId || "")
      );

      if (hasCurrentSelection) {
        return currentReviewerId;
      }

      return submissions[0]?.reporterId?._id || "";
    });
  }, [canReviewEvidence, submissions]);

  const totalCount = filteredReports.length;
  const currentClaim = getClaimForReporter(activeReport, user?._id) || null;
  const currentClaimIsChecked = Boolean(
    currentClaim?.isChecked || mySubmission?.reviewStatus === "checked"
  );
  const canEditEvidence = Boolean(
    canDoReporting &&
      activeReport &&
      !currentClaimIsChecked
  );
  const canOpenComposer = Boolean(
    activeReport &&
      (canGenerateAiEmail || canSendReportingEmail) &&
      (canReviewEvidence || Boolean(mySubmission))
  );
  const allEmailEntries = Array.isArray(activeReport?.emailActivity?.entries)
    ? activeReport.emailActivity.entries
    : [];
  const myEmailEntries = allEmailEntries.filter((entry) => matchesEmailEntryAuthor(entry, user));
  const emailEntryCount = myEmailEntries.length;
  const taskSummaryItems = activeReport
    ? [
        {
          key: "brand",
          label: copy.workspace.summaryLabels.brand,
          value: activeReport.brandId?.brandName || copy.common.unknownBrand,
        },
        {
          key: "issue",
          label: copy.workspace.summaryLabels.issue,
          value: getIssueLabel(activeReport.issueType, language),
        },
        {
          key: "rank",
          label: copy.workspace.summaryLabels.rank,
          value: `#${activeReport.googleRank || "-"}`,
        },
        
        
      ]
    : [];
  const showReviewSection = Boolean(activeReport && canReviewEvidence);
  const reviewerLaunchLabels = useMemo(() => {
    if (!showReviewSection) {
      return [];
    }

    const safeSubmissions = Array.isArray(submissions) ? submissions : [];

    if (!safeSubmissions.length) {
      return [{ key: "empty", label: copy.workspace.reviewLaunch.noSubmissions, tone: "is-open" }];
    }

    const checkedCount = safeSubmissions.filter(
      (submission) => getSubmissionReviewStatus(submission) === "checked"
    ).length;
    const needsCheckCount = safeSubmissions.filter(
      (submission) => getSubmissionReviewStatus(submission) === "rejected"
    ).length;
    const pendingCount = Math.max(0, safeSubmissions.length - checkedCount - needsCheckCount);

    const labels = [];

    if (pendingCount > 0) {
      labels.push({
        key: "pending",
        label: copy.workspace.reviewLaunch.pending(pendingCount),
        tone: "is-progress",
      });
    }

    if (needsCheckCount > 0) {
      labels.push({
        key: "needs-check",
        label: copy.workspace.reviewLaunch.needsCheck(needsCheckCount),
        tone: "is-error",
      });
    }

    if (!pendingCount && !needsCheckCount) {
      labels.push({
        key: "done",
        label: copy.workspace.reviewLaunch.allDone,
        tone: "is-resolved",
      });
    }

    return labels;
  }, [copy.workspace.reviewLaunch, showReviewSection, submissions]);
  const selectedReviewSubmission =
    submissions.find(
      (submission) =>
        String(submission?.reporterId?._id || "") === String(selectedReviewerId || "")
    ) || submissions[0] || null;
  const selectedSubmissionEmailEntries = allEmailEntries.filter(
    (entry) => matchesEmailEntryAuthor(entry, selectedReviewSubmission?.reporterId)
  );
  const selectedSubmissionEmailEntryCount = selectedSubmissionEmailEntries.length;
  const myEvidenceImages = (mySubmission?.images || [])
    .map((image) => ({
      ...image,
      submissionId: mySubmission?._id || "",
      source: getImageSource(
        {
          ...image,
          submissionId: mySubmission?._id || "",
        },
        mySubmission?._id || ""
      ),
      isLoading: isImageLoading(
        {
          ...image,
          submissionId: mySubmission?._id || "",
        },
        mySubmission?._id || ""
      ),
    }))
    .filter(Boolean);

  const handleSelectReport = (reportId) => {
    if (!reportId) {
      return;
    }

    setActionError("");
    setActionSuccess("");
    setTaskError("");
    setTaskSuccess("");

    if (isReviewMode) {
      navigate(`/reporting/review/${reportId}`);
      return;
    }

    void loadDetail(reportId);
  };

  const resetTaskComposer = () => {
    setIsEditingTask(false);
    setShowTaskForm(false);
    setTaskError("");
    setTaskSuccess("");
    setTaskForm({
      ...EMPTY_TASK_FORM,
      brandId: brands[0]?._id || "",
    });
  };

  const resetEvidenceComposer = () => {
    void persistCurrentEvidenceDraft();
    setShowEvidenceModal(false);
    setEvidenceForm((currentForm) => {
      revokeEvidenceImagePreviews(currentForm.images);
      return getEvidenceFormFromSubmission(mySubmission);
    });
    setEvidenceError("");
    setEvidenceSuccess("");
    setEvidenceUploadProgress(0);
    setEvidenceUploadPhase("");
    setIsEvidenceDropActive(false);
  };

  const openEvidenceComposer = async () => {
    const baseForm = getEvidenceFormFromSubmission(mySubmission);
    const hydratedForm = await loadStoredEvidenceDraft(baseForm);

    setEvidenceForm((currentForm) => {
      revokeEvidenceImagePreviews(currentForm.images);
      return hydratedForm;
    });
    setEvidenceError("");
    setEvidenceSuccess("");
    setEvidenceUploadProgress(0);
    setEvidenceUploadPhase("");
    setIsEvidenceDropActive(false);
    setShowEvidenceModal(true);
  };

  const handleCopyReportUrl = async () => {
    if (!activeReport?.url) {
      return;
    }

    setActionError("");

    try {
      await copyTextToClipboard(activeReport.url, copy);
      setActionSuccess(copy.workspace.composer.reportUrlCopied);
    } catch (copyError) {
      setActionError(copyError?.message || copy.workspace.composer.reportUrlCopyError);
    }
  };

  const handleCopyReportDetails = async () => {
    if (!activeReport) {
      return;
    }

    const detailText = [
      `URL: ${activeReport.url || ""}`,
      `${copy.workspace.summaryLabels.brand}: ${
        activeReport.brandId?.brandName || copy.common.unknownBrand
      }`,
      `${copy.workspace.taskForm.issueType}: ${getIssueLabel(activeReport.issueType, language)}`,
      `${copy.workspace.taskForm.googleRank}: #${activeReport.googleRank || "-"}`,
    ].join("\n");

    setActionError("");

    try {
      await copyTextToClipboard(detailText, copy);
      setActionSuccess(copy.workspace.composer.taskDetailsCopied);
    } catch (copyError) {
      setActionError(copyError?.message || copy.workspace.composer.taskDetailsCopyError);
    }
  };

  const handleTaskFormChange = (field, value) => {
    setTaskError("");
    setTaskSuccess("");
    setTaskForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleTaskSubmit = async (event) => {
    event.preventDefault();
    setTaskBusy(true);
    setTaskError("");
    setTaskSuccess("");

    const payload = {
      brandId: taskForm.brandId,
      issueType: taskForm.issueType,
      url: taskForm.url,
      googleRank: taskForm.googleRank,
      hasDdos: taskForm.hasDdos,
      notes: taskForm.notes,
    };

    const saveTask = async (confirmDuplicate = false) => {
      const nextPayload = confirmDuplicate ? { ...payload, confirmDuplicate: true } : payload;

      if (isEditingTask && activeReport) {
        return updateTask(activeReport._id, nextPayload);
      }

      return createReport(nextPayload);
    };

    try {
      await saveTask(false);
      setTaskSuccess(
        isEditingTask
          ? copy.workspace.taskForm.updateSuccess
          : copy.workspace.taskForm.createSuccess
      );
      if (isEditingTask) {
        setIsEditingTask(false);
      } else {
        setTaskForm({
          ...EMPTY_TASK_FORM,
          brandId: brands[0]?._id || "",
        });
      }
      setShowTaskForm(false);
    } catch (taskSaveError) {
      const message =
        taskSaveError?.response?.data?.message ||
        taskSaveError?.message ||
        copy.workspace.taskForm.saveError;

      if (message === "CONFIRM_DUPLICATE_URL") {
        const confirmed =
          typeof window !== "undefined"
            ? window.confirm(buildTaskDuplicatePrompt(payload.url, copy))
            : false;

        if (!confirmed) {
          setTaskError(copy.workspace.taskForm.duplicateCancelled);
          setTaskBusy(false);
          return;
        }

        try {
          await saveTask(true);
          setTaskSuccess(
            isEditingTask
              ? copy.workspace.taskForm.updateSuccess
              : copy.workspace.taskForm.createSuccess
          );
          if (isEditingTask) {
            setIsEditingTask(false);
          } else {
            setTaskForm({
              ...EMPTY_TASK_FORM,
              brandId: brands[0]?._id || "",
            });
          }
          setShowTaskForm(false);
        } catch (duplicateSaveError) {
          setTaskError(
              duplicateSaveError?.response?.data?.message ||
              duplicateSaveError?.message ||
              copy.workspace.taskForm.saveError
          );
        }
        setTaskBusy(false);
        return;
      }

      setTaskError(message);
    }

    setTaskBusy(false);
  };

  const handleStartEdit = () => {
    if (!activeReport) {
      return;
    }

    setTaskError("");
    setTaskSuccess("");
    setActionError("");
    setActionSuccess("");
    setIsEditingTask(true);
    setShowTaskForm(true);
    setTaskForm(getTaskFormFromReport(activeReport));
  };

  const handleDeleteTask = async () => {
    if (!activeReport) {
      return;
    }

    const confirmed =
      typeof window !== "undefined"
        ? window.confirm(copy.workspace.taskForm.deleteConfirm(activeReport.url))
        : false;

    if (!confirmed) {
      return;
    }

    setActionBusy("delete-task");
    setActionError("");
    setActionSuccess("");

    try {
      await deleteTask(activeReport._id);
      setActionSuccess(copy.workspace.taskForm.deleteSuccess);
      resetTaskComposer();
    } catch (taskDeleteError) {
      setActionError(
        taskDeleteError?.response?.data?.message ||
          taskDeleteError?.message ||
          copy.workspace.taskForm.deleteError
      );
    }

    setActionBusy("");
  };

  const handleEvidenceFormChange = (field, value) => {
    setEvidenceError("");
    setEvidenceSuccess("");
    setEvidenceForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleAddEvidenceFiles = useCallback(async (files) => {
    if (!files.length) {
      return;
    }

    try {
      const nextImages = await buildEvidenceImages(
        files,
        evidenceFormRef.current.images || [],
        copy
      );
      setEvidenceForm((currentForm) => ({
        ...currentForm,
        images: nextImages,
      }));
      setEvidenceError("");
      setEvidenceSuccess(copy.workspace.evidenceActions.imagesAdded(files.length));
    } catch (imageError) {
      setEvidenceError(imageError?.message || copy.workspace.evidenceActions.addImagesError);
    }
  }, [copy]);

  const handleEvidenceImageSelection = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    await handleAddEvidenceFiles(files);
  };

  const handleRemoveEvidenceImage = (imageId) => {
    setEvidenceError("");
    setEvidenceSuccess("");
    setEvidenceForm((currentForm) => ({
      ...currentForm,
      images: currentForm.images.filter((image) => {
        if (image.id === imageId) {
          revokeEvidenceImagePreview(image);
          return false;
        }

        return true;
      }),
    }));
  };

  const handleRenameEvidenceImage = (imageId, nextName) => {
    setEvidenceError("");
    setEvidenceSuccess("");
    setEvidenceForm((currentForm) => ({
      ...currentForm,
      images: (currentForm.images || []).map((image) => {
        if (String(image?.id || "") !== String(imageId || "")) {
          return image;
        }

        const normalizedName = String(nextName || "");
        const originalName = String(image?.originalName || image?.name || "");

        return {
          ...image,
          name: normalizedName,
          nameEdited: normalizedName.trim() !== originalName.trim(),
        };
      }),
    }));
  };

  const handleEvidenceDrop = async (event) => {
    event.preventDefault();
    setIsEvidenceDropActive(false);
    await handleAddEvidenceFiles(Array.from(event.dataTransfer?.files || []));
  };

  const handleEvidencePaste = useCallback(
    async (event) => {
      if (!showEvidenceModal || evidenceBusy) {
        return;
      }

      const clipboardItems = Array.from(event.clipboardData?.items || []);
      const imageFiles = clipboardItems
        .filter((item) => item?.kind === "file" && String(item.type || "").startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter(Boolean);

      if (!imageFiles.length) {
        return;
      }

      event.preventDefault();
      await handleAddEvidenceFiles(imageFiles);
      setEvidenceSuccess(copy.workspace.evidenceActions.pastedImagesAdded(imageFiles.length));
    },
    [copy, evidenceBusy, handleAddEvidenceFiles, showEvidenceModal]
  );

  useEffect(() => {
    if (!showEvidenceModal) {
      return undefined;
    }

    const onPaste = (event) => {
      void handleEvidencePaste(event);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleEvidencePaste, showEvidenceModal]);

  const handleEvidenceSubmit = async (event) => {
    event.preventDefault();

    if (!activeReport) {
      return;
    }

    setEvidenceBusy(true);
    setEvidenceError("");
    setEvidenceSuccess("");
    setEvidenceUploadProgress(0);
    setEvidenceUploadPhase(copy.workspace.evidenceActions.preparingImages);
    setActionError("");
    setActionSuccess("");

    try {
      validateEvidenceImages(evidenceForm.images || [], copy);
      const payloadImages = await buildEvidencePayloadImages(
        evidenceForm.images || [],
        copy,
        (progress) => {
          setEvidenceUploadProgress(progress);
        }
      );
      setEvidenceUploadPhase(copy.workspace.evidenceActions.uploadingEvidence);
      const payload = {
        driveLink: evidenceForm.driveLink,
        notes: evidenceForm.notes,
        didDdos: evidenceForm.didDdos,
        images: payloadImages,
      };
      const requestOptions = {
        onUploadProgress: (progressEvent) => {
          const total = Number(progressEvent?.total || 0);
          const loaded = Number(progressEvent?.loaded || 0);

          if (total > 0) {
            setEvidenceUploadProgress(25 + Math.round((loaded / total) * 75));
          } else if (loaded > 0) {
            setEvidenceUploadProgress(85);
          }
        },
      };

      if (mySubmission?._id) {
        await updateSubmission(activeReport._id, mySubmission._id, payload, requestOptions);
        setActionSuccess(copy.workspace.evidenceActions.updateSuccess);
      } else {
        await submitEvidence(activeReport._id, payload, requestOptions);
        setActionSuccess(copy.workspace.evidenceActions.submitSuccess);
      }
      await deleteEvidenceDraft(evidenceDraftKey);
      lastEvidenceDraftSignatureRef.current = "";
      setEvidenceUploadProgress(100);
      setEvidenceUploadPhase(copy.workspace.evidenceActions.uploadComplete);
      setShowEvidenceModal(false);
      setIsEvidenceDropActive(false);
    } catch (submissionError) {
      setEvidenceUploadProgress(0);
      setEvidenceUploadPhase("");
      setEvidenceError(
        submissionError?.response?.data?.message ||
          submissionError?.message ||
          copy.workspace.evidenceActions.saveError
      );
    }

    setEvidenceBusy(false);
  };

  const handleDeleteSubmission = async () => {
    if (!activeReport?._id || !mySubmission?._id) {
      return;
    }

    const confirmed = window.confirm(copy.workspace.evidenceActions.deleteConfirm);

    if (!confirmed) {
      return;
    }

    setActionBusy("delete-submission");
    setActionError("");
    setActionSuccess("");

    try {
      await deleteSubmission(activeReport._id, mySubmission._id);
      await deleteEvidenceDraft(evidenceDraftKey);
      lastEvidenceDraftSignatureRef.current = "";
      resetEvidenceComposer();
      setActionSuccess(copy.workspace.evidenceActions.deleteSuccess);
    } catch (deleteError) {
      setActionError(
        deleteError?.response?.data?.message ||
          deleteError?.message ||
          copy.workspace.evidenceActions.deleteError
      );
    }

    setActionBusy("");
  };

  const handleOpenEvidenceImage = (
    image,
    submissionId = "",
    images = [],
    title = copy.evidenceModal.images
  ) => {
    const galleryImages = (images || [])
      .map((galleryImage) => {
        const source =
          galleryImage?.source ||
          getImageSource(
            {
              ...galleryImage,
              submissionId: galleryImage?.submissionId || submissionId,
            },
            submissionId
          );

        return source
          ? {
              ...galleryImage,
              source,
            }
          : null;
      })
      .filter(Boolean);

    if (!galleryImages.length) {
      return;
    }

    const activeIndex = Math.max(
      0,
      galleryImages.findIndex(
        (galleryImage) => String(galleryImage?.id || "") === String(image?.id || "")
      )
    );

    setGalleryState({
      isOpen: true,
      title,
      images: galleryImages,
      activeIndex,
    });
  };

  const handleOpenRejectModal = (submission) => {
    setRejectModalState({
      isOpen: true,
      submission,
    });
    setRejectComment(submission?.reviewStatus === "rejected" ? submission?.reviewComment || "" : "");
    setRejectError("");
  };

  const handleRejectSubmission = async (event) => {
    event.preventDefault();

    const reporterId = rejectModalState.submission?.reporterId?._id;

    if (!activeReport?._id || !reporterId) {
      return;
    }

    setRejectBusy(true);
    setRejectError("");

    try {
      await rejectClaim(activeReport._id, reporterId, { comment: rejectComment });
      setRejectModalState({
        isOpen: false,
        submission: null,
      });
      setRejectComment("");
      setActionSuccess(copy.workspace.evidenceActions.rejectSuccess);
    } catch (rejectActionError) {
      setRejectError(
        rejectActionError?.response?.data?.message ||
          rejectActionError?.message ||
          copy.workspace.evidenceActions.rejectError
      );
    }

    setRejectBusy(false);
  };

  const handleOpenDrivePreview = (submission) => {
    const previewConfig = getGoogleDrivePreviewConfig(submission?.driveLink);

    if (!previewConfig) {
      if (submission?.driveLink && typeof window !== "undefined") {
        window.open(submission.driveLink, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setDrivePreview({
      ...previewConfig,
      title: copy.workspace.evidenceActions.drivePreviewTitle(activeReport?.brandId?.brandName),
      reporterName: submission?.reporterId?.fullName || "",
      createdAt: submission?.createdAt,
      notes: submission?.notes || "",
      didDdos: submission?.didDdos,
      hasDdosNote: true,
    });
  };

  const handleMarkChecked = async (reporterId) => {
    if (!activeReport || !reporterId) {
      return;
    }

    setActionBusy(`mark-${reporterId}`);
    setActionError("");
    setActionSuccess("");

    try {
      await markClaimChecked(activeReport._id, reporterId);
      setActionSuccess(copy.workspace.evidenceActions.markCheckedSuccess);
    } catch (reviewError) {
      setActionError(
        reviewError?.response?.data?.message ||
          reviewError?.message ||
          copy.workspace.evidenceActions.markCheckedError
      );
    }

    setActionBusy("");
  };

  const handleReverseChecked = async (reporterId) => {
    if (!activeReport || !reporterId) {
      return;
    }

    setActionBusy(`unmark-${reporterId}`);
    setActionError("");
    setActionSuccess("");

    try {
      await reverseClaimChecked(activeReport._id, reporterId);
      setActionSuccess(copy.workspace.evidenceActions.reverseCheckedSuccess);
    } catch (reviewError) {
      setActionError(
        reviewError?.response?.data?.message ||
          reviewError?.message ||
          copy.workspace.evidenceActions.reverseCheckedError
      );
    }

    setActionBusy("");
  };

  const handleOpenEmailComposer = () => {
    if (!activeReport) {
      return;
    }

    setEmailError("");
    setEmailSuccess("");
    setEmailForm(getEmailFormForReport(activeReport));
    setIsAiModalOpen(true);
  };

  const handleEmailFormChange = (field, value) => {
    setEmailError("");
    setEmailSuccess("");
    setEmailForm((currentForm) => {
      if (field === "mailSourceKey") {
        const selectedOption =
          activeReport?.mailSources?.options?.find((option) => option.key === value) || null;

        return {
          ...currentForm,
          mailSourceKey: value,
          smtpSourceType: selectedOption?.sourceType || "",
          smtpProfileId: selectedOption?.profileId || null,
        };
      }

      return {
        ...currentForm,
        [field]: value,
      };
    });
  };

  const buildComposerPayload = () => ({
    draftId: emailForm.draftId || undefined,
    to: emailForm.recipientEmail,
    cc: emailForm.ccEmail,
    bcc: emailForm.bccEmail,
    subject: emailForm.subject,
    bodyHtml: emailForm.bodyHtml,
    bodyText: emailForm.bodyText,
    body: emailForm.bodyText,
    additionalNotes: emailForm.additionalNotes,
    generatedSubject: emailForm.generatedSubject,
    generatedBody: emailForm.generatedBody,
    generatedBodyHtml: emailForm.generatedBodyHtml,
    attachments: emailForm.attachments,
    mailSourceKey: emailForm.mailSourceKey,
    smtpSourceType: emailForm.smtpSourceType,
    smtpProfileId: emailForm.smtpProfileId,
  });

  const handleGenerateEmail = async () => {
    if (!activeReport) {
      return;
    }

    setEmailBusyAction("ai-generate");
    setEmailError("");
    setEmailSuccess("");

    try {
      const response = await generateReportingEmailApi(activeReport._id, {
        additionalNotes: emailForm.additionalNotes,
      });
      const generatedDraft = response?.data || {};

      setEmailForm((currentForm) => ({
        ...currentForm,
        generatedSubject: generatedDraft.subject || "",
        generatedBody: generatedDraft.body || "",
        generatedBodyHtml: generatedDraft.bodyHtml || "",
        subject: currentForm.subject || generatedDraft.subject || "",
        bodyHtml: currentForm.bodyHtml || generatedDraft.bodyHtml || "",
        bodyText: currentForm.bodyText || generatedDraft.body || "",
      }));
      setEmailSuccess(copy.workspace.emailActions.aiDraftGenerated);
    } catch (composerError) {
      setEmailError(
        composerError?.response?.data?.message ||
          composerError?.message ||
          copy.workspace.emailActions.aiDraftError
      );
    }

    setEmailBusyAction("");
  };

  const handleSaveEmailDraft = async () => {
    if (!activeReport) {
      return;
    }

    setEmailBusyAction("ai-draft");
    setEmailError("");
    setEmailSuccess("");

    try {
      const response = await saveReportingEmailDraftApi(activeReport._id, buildComposerPayload());
      const savedDraft = response?.data?.draft || null;

      if (savedDraft) {
        setEmailForm((currentForm) => ({
          ...currentForm,
          draftId: savedDraft._id || "",
          subject: savedDraft.subject || currentForm.subject,
          bodyHtml: savedDraft.bodyHtml || currentForm.bodyHtml,
          bodyText: savedDraft.bodyText || currentForm.bodyText,
          generatedSubject: savedDraft.generatedSubject || currentForm.generatedSubject,
          generatedBody: savedDraft.generatedBody || currentForm.generatedBody,
          generatedBodyHtml: savedDraft.generatedBodyHtml || currentForm.generatedBodyHtml,
          attachments: Array.isArray(savedDraft.attachments) ? savedDraft.attachments : currentForm.attachments,
        }));
      }

      if (activeReport?._id) {
        await loadDetail(activeReport._id);
      }

      setEmailSuccess(copy.workspace.emailActions.draftSaved);
    } catch (composerError) {
      setEmailError(
        composerError?.response?.data?.message ||
          composerError?.message ||
          copy.workspace.emailActions.draftSaveError
      );
    }

    setEmailBusyAction("");
  };

  const handleSendEmail = async () => {
    if (!activeReport) {
      return;
    }

    setEmailBusyAction("ai-send");
    setEmailError("");
    setEmailSuccess("");

    try {
      await sendReportingEmailApi(activeReport._id, buildComposerPayload());

      if (activeReport?._id) {
        await loadDetail(activeReport._id);
      }

      setEmailSuccess(copy.workspace.emailActions.emailSent);
    } catch (composerError) {
      setEmailError(
        composerError?.response?.data?.message ||
          composerError?.message ||
          copy.workspace.emailActions.emailSendError
      );
    }

    setEmailBusyAction("");
  };

  return (
    <section className={`reporting-workspace${isReviewMode ? " is-review-mode" : ""}`}>
      {!isReviewMode ? (
        <div className="reporting-workspace-header">
          <div className="reporting-workspace-header-left">
            <span className="reporting-workspace-eyebrow">
              {copy.workspace.globalDate(summaryLabel)}
            </span>
            <h2>{copy.workspace.title}</h2>
          </div>

          <div className="reporting-workspace-header-center">
            <div className="reporting-workspace-header-filters">
              <div className="reporting-workspace-search reporting-workspace-shared-search">
                <span className="reporting-workspace-search-icon">{copy.common.search}</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.workspace.searchPlaceholder}
                />
              </div>
            </div>
          </div>

          <div className="reporting-workspace-header-right">
            <div className="reporting-workspace-header-actions">
              <span className="reporting-workspace-total-pill">
                {copy.workspace.totalTasks(totalCount)}
              </span>
              {canCreateTasks ? (
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => {
                    setIsEditingTask(false);
                    setTaskError("");
                    setTaskSuccess("");
                    setTaskForm({
                      ...EMPTY_TASK_FORM,
                      brandId: brands[0]?._id || "",
                    });
                    setShowTaskForm(true);
                  }}
                >
                  {copy.workspace.newTask}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {error ? <p className="management-error">{error}</p> : null}
      {actionError ? <p className="management-error">{actionError}</p> : null}
      {actionSuccess ? <p className="reporting-success-banner">{actionSuccess}</p> : null}

      <TaskFormModal
        isOpen={!isReviewMode && showTaskForm && (canCreateTasks || isEditingTask)}
        busy={taskBusy}
        brands={brands}
        form={taskForm}
        error={taskError}
        onChange={handleTaskFormChange}
        onSubmit={handleTaskSubmit}
        onClose={resetTaskComposer}
        isEditing={isEditingTask}
      />

      <ReportingEvidenceModal
        isOpen={!isReviewMode && showEvidenceModal && canEditEvidence}
        form={evidenceForm}
        busy={evidenceBusy}
        error={evidenceError}
        uploadProgress={evidenceUploadProgress}
        uploadPhase={evidenceUploadPhase}
        onChange={handleEvidenceFormChange}
        onSubmit={handleEvidenceSubmit}
        onClose={resetEvidenceComposer}
        onRemoveImage={handleRemoveEvidenceImage}
        onRenameImage={handleRenameEvidenceImage}
        evidenceInputRef={evidenceInputRef}
        onEvidenceImageSelection={handleEvidenceImageSelection}
        onEvidenceDrop={handleEvidenceDrop}
        isEvidenceDropActive={isEvidenceDropActive}
        setIsEvidenceDropActive={setIsEvidenceDropActive}
        isEditing={Boolean(mySubmission)}
        maxImageCount={EVIDENCE_IMAGE_MAX_COUNT}
        maxTotalSizeBytes={EVIDENCE_IMAGE_TOTAL_MAX_SIZE_BYTES}
        formatBytes={formatBytesValue}
        getEvidenceImageSource={getImageSource}
        isImageLoading={isImageLoading}
        onOpenImage={handleOpenEvidenceImage}
      />

      {taskSuccess ? <p className="reporting-success-banner">{taskSuccess}</p> : null}

      <div className={`reporting-workspace-grid${isReviewMode ? " is-review-layout" : ""}`}>
        {!isReviewMode ? (
        <aside className="reporting-workspace-list-panel">
          <div className="reporting-workspace-list-header">
            <div className="reporting-workspace-list-title">
              <h3>{copy.workspace.listTitle}</h3>
              <p>
                {loading
                  ? copy.workspace.loadingTasks
                  : copy.workspace.tasksShown(filteredReports.length)}
              </p>
            </div>
            <span className="reporting-workspace-list-count">{filteredReports.length}</span>
          </div>

          <div className="reporting-workspace-list">
            {loading ? (
              <div className="reporting-workspace-empty">{copy.workspace.loadingTaskList}</div>
            ) : filteredReports.length ? (
              filteredReports.map((report) => (
                <button
                  key={report._id}
                  type="button"
                  className={`reporter-task-card ${getStatusTone(report.simpleStatus)}${
                    report._id === activeReport?._id ? " is-active" : ""
                  }${report.simpleStatus === "submitted" && canReviewEvidence ? " needs-attention" : ""}${
                    report.isDeleted ? " is-deleted" : ""
                  }`}
                  onClick={() => handleSelectReport(report._id)}
                >
                  <div className="reporter-task-card-header">
                    <span className={`reporter-workspace-badge ${getStatusTone(report.simpleStatus)}`}>
                      {getStatusLabel(report.simpleStatus, language)}
                    </span>
                    {report.simpleStatus === "submitted" && canReviewEvidence ? (
                      <span className="reporter-workspace-badge is-warning">
                        {copy.workspace.needsReview}
                      </span>
                    ) : null}
                  </div>

                  <div className="reporter-task-card-domain">{report.url}</div>

                  <div className="reporter-task-card-meta">
                    <span>{report.brandId?.brandName || copy.common.unknownBrand}</span>
                    <span>{getIssueLabel(report.issueType, language)}</span>
                    <span>{copy.workspace.rank(report.googleRank)}</span>
                    <span>{formatShortDateValue(report.createdAt)}</span>
                  </div>

                  {report.duplicateTotal > 1 ? (
                    <div className="reporter-task-card-footer">
                      <span className="reporter-workspace-badge is-warning">
                        {copy.workspace.duplicate(
                          report.duplicateSequence,
                          report.duplicateTotal
                        )}
                      </span>
                    </div>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="reporting-workspace-empty">
                {copy.workspace.noTasksMatch}
              </div>
            )}
          </div>
        </aside>
        ) : null}
        <section className="reporter-detail-panel">
          {isReviewMode ? (
            <ReportingReviewReportSwitcher
              reports={filteredReports}
              activeReportId={activeReport?._id || fixedReportId}
              onSelectReport={handleSelectReport}
              summaryLabel={summaryLabel}
              getStatusTone={getStatusTone}
              getStatusLabel={(status) => getStatusLabel(status, language)}
            />
          ) : null}

          {!activeReport ? (
            <div className="reporting-workspace-empty">
              {detailLoading || loading
                ? copy.workspace.loadingTaskDetails
                : isReviewMode
                  ? copy.workspace.reviewLoadError
                  : copy.workspace.noTaskAvailable}
            </div>
          ) : detailLoading ? (
            <div className="reporting-workspace-empty">{copy.workspace.loadingTaskDetails}</div>
          ) : (
            <>
              <section className="reporter-form-card reporting-focus-card">
                <div className="reporting-simple-panel-header">
                  <div className="reporting-simple-panel-copy">
                    <div className="reporting-task-link-row">
                      <h3 className="reporting-task-link-heading">
                        <button
                          type="button"
                          className="reporting-task-link-copy"
                          onClick={handleCopyReportUrl}
                          title={copy.workspace.copyUrlTitle}
                        >
                          {activeReport.url}
                        </button>
                      </h3>
                      <a
                        className="reporting-task-link-icon"
                        href={activeReport.url}
                        target="_blank"
                        rel="noreferrer"
                        title={copy.workspace.openUrlTitle}
                        aria-label={copy.workspace.openUrlTitle}
                      >
                        <HiOutlineArrowTopRightOnSquare />
                      </a>
                      <button
                        type="button"
                        className="management-button-secondary reporting-compact-action"
                        onClick={handleCopyReportDetails}
                      >
                        {copy.workspace.copyDetails}
                      </button>
                    </div>
                    <p>
                      {activeReport.brandId?.brandName || copy.common.unknownBrand} |{" "}
                      {getIssueLabel(activeReport.issueType, language)}
                    </p>
                  </div>
                  <div className="reporting-simple-panel-actions">
                    <span className={`reporter-workspace-badge ${getStatusTone(activeReport.simpleStatus)}`}>
                      {getStatusLabel(activeReport.simpleStatus, language)}
                    </span>
                    {!isReviewMode && canEditTasks ? (
                      <button type="button" className="management-button-secondary" onClick={handleStartEdit}>
                        {copy.workspace.editTask}
                      </button>
                    ) : null}
                    {!isReviewMode && canDeleteTasks ? (
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={handleDeleteTask}
                        disabled={actionBusy === "delete-task"}
                      >
                        {actionBusy === "delete-task"
                          ? copy.common.deleting
                          : copy.workspace.deleteTask}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="reporting-task-summary-grid">
                  {taskSummaryItems.map((item) => (
                    <TaskSummaryItem key={item.key} label={item.label} value={item.value} />
                  ))}
                  {canReviewEvidence ? (
                    <TaskSummaryItem
                      label={copy.workspace.status}
                      value={getStatusLabel(activeReport.simpleStatus, language)}
                    />
                  ) : null}
                  {canReviewEvidence ? (
                    <TaskSummaryItem
                      label={copy.workspace.createdBy}
                      value={
                        activeReport.createdBy?.fullName ||
                        activeReport.createdBy?.email ||
                        copy.common.unknownUser
                      }
                    />
                  ) : null}
                  <TaskSummaryItem
                    label={copy.workspace.summaryLabels.ddos}
                    value={
                      activeReport.hasDdos
                        ? copy.workspace.ddosRequired
                        : copy.workspace.ddosNotRequired
                    }
                  />
                
                </div>

                {activeReport.notes ? (
                  <div className="reporting-task-note">
                    <span>{copy.workspace.taskNote}</span>
                    <p>{activeReport.notes}</p>
                  </div>
                ) : null}
              </section>

              {!isReviewMode && showReviewSection ? (
                <section className="reporter-form-card reporting-review-launch-card">
                  <div className="reporting-simple-panel-header">
                    <div className="reporting-simple-panel-copy">
                      <h3>{copy.workspace.reviewOthersWork}</h3>
                      {reviewerLaunchLabels.length ? (
                        <div className="reporting-review-launch-labels">
                          {reviewerLaunchLabels.map((item) => (
                            <span key={item.key} className={`reporter-workspace-badge ${item.tone}`}>
                              {item.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="reporting-simple-panel-actions">
                      <a
                        className="management-button-secondary"
                        href={`/reporting/review/${activeReport._id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {copy.workspace.openReviewView}
                      </a>
                    </div>
                  </div>
                </section>
              ) : null}
              {!isReviewMode ? (
              <ReportingEvidencePanel
                canShow={Boolean(canDoReporting || mySubmission || emailEntryCount)}
                canEditEvidence={canEditEvidence}
                canOpenComposer={canOpenComposer}
                canGenerateAiEmail={canGenerateAiEmail}
                canSendReportingEmail={canSendReportingEmail}
                mySubmission={mySubmission}
                myEvidenceImages={myEvidenceImages}
                maxImageCount={EVIDENCE_IMAGE_MAX_COUNT}
                onOpenComposer={openEvidenceComposer}
                onOpenEmailComposer={handleOpenEmailComposer}
                onDeleteSubmission={handleDeleteSubmission}
                onOpenDrivePreview={handleOpenDrivePreview}
                onOpenImage={handleOpenEvidenceImage}
                isImageLoading={isImageLoading}
                actionBusy={actionBusy}
                emailEntryCount={emailEntryCount}
                emailEntries={myEmailEntries}
                formatShortDate={formatShortDateValue}
                formatDateTime={formatDateTimeValue}
                formatBytes={formatBytesValue}
              />
              ) : null}

            

              {isReviewMode && showReviewSection ? (
                <ReportingReviewPanel
                  canReview={canReviewEvidence}
                  canOpenComposer={canOpenComposer}
                  canGenerateAiEmail={canGenerateAiEmail}
                  canSendReportingEmail={canSendReportingEmail}
                  submissions={submissions}
                  selectedSubmission={selectedReviewSubmission}
                  selectedReviewerId={selectedReviewerId}
                  onSelectReviewer={setSelectedReviewerId}
                  onOpenComposer={handleOpenEmailComposer}
                  selectedSubmissionEmailEntryCount={selectedSubmissionEmailEntryCount}
                  selectedSubmissionEmailEntries={selectedSubmissionEmailEntries}
                  actionBusy={actionBusy}
                  rejectBusy={rejectBusy}
                  rejectModalReporterId={rejectModalState.submission?.reporterId?._id || ""}
                  getImageSource={getImageSource}
                  isImageLoading={isImageLoading}
                  onOpenDrivePreview={handleOpenDrivePreview}
                  onOpenImage={handleOpenEvidenceImage}
                  onMarkChecked={handleMarkChecked}
                  onReverseChecked={handleReverseChecked}
                  onOpenReject={handleOpenRejectModal}
                  formatDateTime={formatDateTimeValue}
                  formatShortDate={formatShortDateValue}
                  formatBytes={formatBytesValue}
                />
              ) : null}
            </>
          )}
        </section>
      </div>

      {isAiModalOpen && activeReport ? (
        <ReportingAiEmailModal
          report={activeReport}
          form={emailForm}
          busyAction={emailBusyAction}
          error={emailError}
          success={emailSuccess}
          canGenerateAiContent={canGenerateAiEmail}
          canSendEmail={canSendReportingEmail}
          onChange={handleEmailFormChange}
          onComposerError={setEmailError}
          onGenerate={handleGenerateEmail}
          onSaveDraft={handleSaveEmailDraft}
          onSend={handleSendEmail}
          onClose={() => setIsAiModalOpen(false)}
          getIssueLabel={(issueType) => getIssueLabel(issueType, language)}
        />
      ) : null}

      <ReportingSubmissionRejectModal
        isOpen={rejectModalState.isOpen}
        submission={rejectModalState.submission}
        value={rejectComment}
        busy={rejectBusy}
        error={rejectError}
        onChange={setRejectComment}
        onClose={() => {
          if (rejectBusy) {
            return;
          }

          setRejectModalState({
            isOpen: false,
            submission: null,
          });
          setRejectComment("");
          setRejectError("");
        }}
        onSubmit={handleRejectSubmission}
      />

      {drivePreview ? (
        <ReportingDrivePreviewModal
          preview={drivePreview}
          onClose={() => setDrivePreview(null)}
        />
      ) : null}

      <ReportingEvidenceGalleryModal
        isOpen={galleryState.isOpen}
        title={galleryState.title}
        images={galleryState.images}
        activeIndex={galleryState.activeIndex}
        onClose={() =>
          setGalleryState({
            isOpen: false,
            title: "",
            images: [],
            activeIndex: 0,
          })
        }
        onSelect={(nextIndex) =>
          setGalleryState((currentState) => ({
            ...currentState,
            activeIndex: nextIndex,
          }))
        }
      />
    </section>
  );
}
