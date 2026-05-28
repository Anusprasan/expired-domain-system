import React, { useEffect, useMemo, useState } from "react";
import { getReportingEmailStatusLabel } from "../constants/reportingLanguage";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToHtml(value, emptyHtml) {
  const sections = String(value || "")
    .trim()
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!sections.length) {
    return emptyHtml;
  }

  return sections
    .map((item) => `<p>${escapeHtml(item).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function getEmailBodyHtml(entry, emptyHtml) {
  const html = String(entry?.bodyHtml || "").trim();

  if (html) {
    return html;
  }

  return plainTextToHtml(entry?.bodyText, emptyHtml);
}

function getStatusTone(status) {
  if (status === "sent") {
    return "is-resolved";
  }

  if (status === "failed") {
    return "is-error";
  }

  return "is-open";
}

function formatRecipientList(values = [], emptyLabel = "None") {
  const safeValues = Array.isArray(values) ? values.filter(Boolean) : [];
  return safeValues.length ? safeValues.join(", ") : emptyLabel;
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

function EmailMetaItem({ label, value }) {
  return (
    <p>
      <strong>{label}</strong>
      <br />
      {value}
    </p>
  );
}

export default function ReportingEmailActivityModal({
  isOpen,
  title,
  entries,
  initialEntryId,
  onClose,
  formatDateTime,
}) {
  const { copy, language, locale } = useReportingUiCopy();
  const safeEntries = Array.isArray(entries) ? entries : [];
  const hasSidebar = safeEntries.length > 1;
  const [activeEntryId, setActiveEntryId] = useState(initialEntryId || "");
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveEntryId((currentId) => {
      if (safeEntries.some((entry) => String(entry?._id || "") === String(initialEntryId || ""))) {
        return initialEntryId || "";
      }

      if (safeEntries.some((entry) => String(entry?._id || "") === String(currentId || ""))) {
        return currentId || "";
      }

      return safeEntries[0]?._id || "";
    });
  }, [initialEntryId, isOpen, safeEntries]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setShowDetails(false);
  }, [activeEntryId, isOpen]);

  const activeEntry = useMemo(
    () =>
      safeEntries.find((entry) => String(entry?._id || "") === String(activeEntryId || "")) ||
      safeEntries[0] ||
      null,
    [activeEntryId, safeEntries]
  );

  if (!isOpen || !activeEntry) {
    return null;
  }

  const activityTime = formatDateTime(
    activeEntry.sentAt || activeEntry.updatedAt || activeEntry.createdAt
  );
  const compactRecipientSummary = formatRecipientList(
    activeEntry.to,
    copy.common.noRecipients
  );
  const emptyEmailBodyHtml = `<p>${copy.emailActivity.noEmailBody}</p>`;

  return (
    <div
      className="workflow-modal-backdrop reporting-email-viewer-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="workflow-modal-shell reporting-email-viewer-shell reporting-email-viewer-shell-full"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reporting-email-viewer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="workflow-modal-header reporter-task-modal-header reporting-email-viewer-header">
          <div className="workflow-modal-titleblock">
            <h3 id="reporting-email-viewer-title">
              {title || copy.emailActivity.modalTitleFallback}
            </h3>
            <p>
              {safeEntries.length === 1
                ? copy.emailActivity.modalSingleDescription
                : copy.emailActivity.modalMultiDescription(safeEntries.length)}
            </p>
          </div>
          <button
            type="button"
            className="management-button-secondary workflow-modal-close"
            onClick={onClose}
          >
            {copy.common.close}
          </button>
        </div>

        <div
          className={`reporting-email-viewer-body${
            hasSidebar ? " has-sidebar" : " is-single-entry"
          }`}
        >
          {hasSidebar ? (
            <aside className="reporting-email-viewer-sidebar">
              <div className="reporting-email-history-list">
                {safeEntries.map((entry) => {
                  const isActive = String(entry?._id || "") === String(activeEntry?._id || "");

                  return (
                    <button
                      key={entry._id}
                      type="button"
                      className={`reporting-email-quick-entry is-${
                        entry.status || "draft"
                      }${isActive ? " is-selected" : ""}`}
                      onClick={() => setActiveEntryId(entry._id || "")}
                    >
                      <div className="reporting-email-quick-entry-main">
                        <strong className="reporting-email-quick-entry-title">
                          {entry.subject || copy.common.noSubject}
                        </strong>
                        <p className="reporting-email-quick-entry-meta">
                          {entry.author?.fullName || copy.common.unknownAuthor} |{" "}
                          {entry.sourceLabel || copy.common.noSmtpSource}
                        </p>
                        <p className="reporting-email-quick-entry-preview">
                          {(entry.bodyText || "").slice(0, 140) ||
                            copy.emailActivity.noPreviewAvailable}
                        </p>
                      </div>
                      <div className="reporting-email-quick-entry-side">
                        <span className={`reporter-workspace-badge ${getStatusTone(entry.status)}`}>
                          {getReportingEmailStatusLabel(entry.status, language)}
                        </span>
                        <span>{formatDateTime(entry.sentAt || entry.updatedAt || entry.createdAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
          ) : null}

          <section className="reporting-email-viewer-content">
            <article
              className={`reporting-email-entry reporting-email-viewer-entry is-${
                activeEntry.status || "draft"
              } is-expanded`}
            >
              <div className="reporting-email-entry-expanded reporting-email-viewer-entry-expanded">
                <div className="reporting-email-entry-header">
                  <div className="reporting-email-entry-copy">
                    <div className="reporting-email-entry-badges">
                      <span className={`reporter-workspace-badge ${getStatusTone(activeEntry.status)}`}>
                        {getReportingEmailStatusLabel(activeEntry.status, language)}
                      </span>
                      {activeEntry.sourceLabel ? (
                        <span className="reporter-workspace-badge is-progress">
                          {activeEntry.sourceLabel}
                        </span>
                      ) : null}
                      {activeEntry.isAuthor ? (
                        <span className="reporter-workspace-badge is-open">
                          {copy.emailActivity.myEmail}
                        </span>
                      ) : null}
                    </div>
                    <h4>{activeEntry.subject || copy.common.noSubject}</h4>
                    <p className="reporting-email-entry-summary">
                      {activeEntry.author?.fullName || copy.common.unknownAuthor} | {activityTime}
                    </p>
                    <p className="reporting-email-entry-preview">
                      <strong>{copy.emailActivity.toLabel}</strong> {compactRecipientSummary}
                    </p>
                  </div>

                  <div className="reporting-email-entry-toggle-meta">
                    <span>{formatDateTime(activeEntry.updatedAt || activeEntry.createdAt)}</span>
                    <button
                      type="button"
                      className="management-button-secondary reporting-email-entry-detail-toggle"
                      onClick={() => setShowDetails((current) => !current)}
                      aria-expanded={showDetails}
                    >
                      <span>
                        {showDetails
                          ? copy.emailActivity.hideDetails
                          : copy.emailActivity.showDetails}
                      </span>
                      <span className="reporting-email-entry-chevron" aria-hidden="true">
                        {showDetails ? "-" : "+"}
                      </span>
                    </button>
                  </div>
                </div>

                {showDetails ? (
                  <div className="reporting-email-entry-meta">
                    <EmailMetaItem
                      label={copy.emailActivity.from}
                      value={activeEntry.from || copy.common.notAvailable}
                    />
                    <EmailMetaItem
                      label={copy.emailActivity.to}
                      value={formatRecipientList(activeEntry.to, copy.common.noRecipients)}
                    />
                    <EmailMetaItem
                      label={copy.emailActivity.cc}
                      value={formatRecipientList(activeEntry.cc, copy.common.none)}
                    />
                    <EmailMetaItem
                      label={copy.emailActivity.bcc}
                      value={formatRecipientList(activeEntry.bcc, copy.common.none)}
                    />
                    <EmailMetaItem
                      label={copy.emailActivity.author}
                      value={
                        activeEntry.author?.fullName ||
                        activeEntry.author?.email ||
                        copy.common.unknownAuthor
                      }
                    />
                    <EmailMetaItem label={copy.emailActivity.sent} value={activityTime} />
                  </div>
                ) : null}

                {activeEntry.lastError ? (
                  <div className="reporting-email-entry-error">{activeEntry.lastError}</div>
                ) : null}

                {showDetails && activeEntry.additionalNotes ? (
                  <div className="reporting-review-feedback">
                    <span>{copy.emailActivity.additionalNotes}</span>
                    <strong>{copy.emailActivity.savedWithThisEmail}</strong>
                    <p>{activeEntry.additionalNotes}</p>
                  </div>
                ) : null}

                {showDetails && activeEntry.attachments?.length ? (
                  <div className="reporting-email-entry-attachments">
                    {activeEntry.attachments.map((attachment) => (
                      <span
                        key={attachment.id || attachment.name}
                        className="reporting-review-file-chip"
                      >
                        {attachment.name} | {formatBytes(attachment.size, locale, copy.common.bytesZero)}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div
                  className="reporting-email-viewer-render"
                  dangerouslySetInnerHTML={{
                    __html: getEmailBodyHtml(activeEntry, emptyEmailBodyHtml),
                  }}
                />
              </div>
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}
