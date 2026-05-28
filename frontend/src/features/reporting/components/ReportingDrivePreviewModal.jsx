import React, { useState } from "react";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";

function formatDrivePreviewDate(value, locale, fallback) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleString(locale);
}

export function getGoogleDrivePreviewConfig(driveLink) {
  const normalizedLink = String(driveLink || "").trim();

  if (!normalizedLink) {
    return null;
  }

  try {
    const url = new URL(normalizedLink);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (!["drive.google.com", "docs.google.com"].includes(host)) {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    const foldersIndex = segments.findIndex((segment) => segment === "folders");

    if (foldersIndex >= 0 && segments[foldersIndex + 1]) {
      const folderId = segments[foldersIndex + 1];

      return {
        kind: "folder",
        embedUrl: `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#grid`,
        openUrl: normalizedLink,
      };
    }

    const dIndex = segments.findIndex((segment) => segment === "d");

    if (dIndex >= 0 && segments[dIndex + 1]) {
      const fileId = segments[dIndex + 1];

      return {
        kind: "file",
        embedUrl: `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`,
        openUrl: normalizedLink,
      };
    }

    const sharedId = url.searchParams.get("id");

    if (sharedId) {
      return {
        kind: "file",
        embedUrl: `https://drive.google.com/file/d/${encodeURIComponent(sharedId)}/preview`,
        openUrl: normalizedLink,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export default function ReportingDrivePreviewModal({ preview, onClose }) {
  const { copy, locale } = useReportingUiCopy();
  const [isLargePreview, setIsLargePreview] = useState(preview.kind === "file");

  const handleOpenInDrive = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.open(preview.openUrl, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(preview.openUrl);
    } catch {
      // Ignore clipboard errors to avoid interrupting the review flow.
    }
  };

  return (
    <div className="workflow-modal-backdrop reporting-drive-preview-backdrop" role="presentation">
      <div
        className={`workflow-modal-shell reporting-drive-preview-shell${isLargePreview ? " is-large-preview" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reporting-drive-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="workflow-modal-header reporting-drive-preview-header">
          <div className="workflow-modal-titleblock">
            <h3 id="reporting-drive-preview-title">{preview.title}</h3>
            <p>
              {preview.kind === "folder"
                ? copy.drivePreview.folderDescription
                : copy.drivePreview.fileDescription}
            </p>
          </div>
          <div className="reporting-drive-preview-actions">
            <button
              type="button"
              className="action-btn view-btn"
              onClick={() => setIsLargePreview((currentValue) => !currentValue)}
            >
              {isLargePreview ? copy.drivePreview.normalView : copy.drivePreview.largeView}
            </button>
            <button type="button" className="action-btn view-btn" onClick={handleOpenInDrive}>
              {copy.drivePreview.openInDrive}
            </button>
            <button type="button" className="action-btn copy-btn" onClick={handleCopyLink}>
              {copy.drivePreview.copyLink}
            </button>
            <button type="button" className="action-btn copy-btn" onClick={onClose}>
              {copy.common.close}
            </button>
          </div>
        </div>

        <div className={`reporting-drive-preview-body${isLargePreview ? " is-large-preview" : ""}`}>
          <aside className={`reporting-drive-preview-sidebar${isLargePreview ? " is-large-preview" : ""}`}>
            <div className="reporter-detail-card">
              <span>{copy.drivePreview.previewType}</span>
              <strong>
                {preview.kind === "folder"
                  ? copy.drivePreview.driveFolder
                  : copy.drivePreview.driveFile}
              </strong>
              <p>
                {preview.kind === "folder"
                  ? copy.drivePreview.folderHelp
                  : copy.drivePreview.fileHelp}
              </p>
            </div>

            <div className="reporter-detail-card">
              <span>{copy.drivePreview.reporter}</span>
              <strong>{preview.reporterName || copy.common.unknownReporter}</strong>
              <p>
                {formatDrivePreviewDate(
                  preview.createdAt,
                  locale,
                  copy.drivePreview.submittedTimeUnavailable
                )}
              </p>
            </div>

            <div className="reporter-detail-card">
              <span>{copy.drivePreview.googleDriveLink}</span>
              <a href={preview.openUrl} target="_blank" rel="noreferrer">
                {preview.openUrl}
              </a>
            </div>

            {preview.notes ? (
              <div className="reporter-detail-card">
                <span>{copy.drivePreview.submissionNotes}</span>
                <p>{preview.notes}</p>
              </div>
            ) : null}

            {preview.hasDdosNote ? (
              <div className="reporter-detail-card">
                <span>{copy.drivePreview.ddosStatus}</span>
                <strong>
                  {preview.didDdos
                    ? copy.drivePreview.ddosCompleted
                    : copy.drivePreview.ddosNotCompleted}
                </strong>
              </div>
            ) : null}
          </aside>

          <section className={`reporting-drive-preview-content${isLargePreview ? " is-large-preview" : ""}`}>
            <div className={`reporting-drive-preview-frame${isLargePreview ? " is-large-preview" : ""}`}>
              <div className="reporting-drive-preview-frame-toolbar">
                <span className="reporting-drive-preview-frame-label">
                  {preview.kind === "folder"
                    ? copy.drivePreview.galleryPreview
                    : copy.drivePreview.largeFilePreview}
                </span>
                <button
                  type="button"
                  className="action-btn view-btn"
                  onClick={() => setIsLargePreview((currentValue) => !currentValue)}
                >
                  {isLargePreview
                    ? copy.drivePreview.exitLargeView
                    : copy.drivePreview.openLargeView}
                </button>
              </div>
              <iframe
                src={preview.embedUrl}
                title={preview.title}
                loading="lazy"
                allow="autoplay"
                referrerPolicy="no-referrer"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
