import React, { useEffect, useId, useMemo, useState } from "react";
import { getReportingEmailStatusLabel } from "../constants/reportingLanguage";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";
import ReportingEmailActivityModal from "./ReportingEmailActivityModal";

function getStatusTone(status) {
  if (status === "sent") {
    return "is-resolved";
  }

  if (status === "failed") {
    return "is-error";
  }

  return "is-open";
}

export default function ReportingEmailActivitySection({
  title,
  subtitle = "",
  entries,
  formatDateTime,
}) {
  const { copy, language } = useReportingUiCopy();
  const selectId = useId();
  const safeEntries = Array.isArray(entries) ? entries : [];
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  useEffect(() => {
    if (!safeEntries.length) {
      setSelectedEntryId("");
      setIsViewerOpen(false);
      return;
    }

    setSelectedEntryId((currentId) => {
      const hasCurrentEntry = safeEntries.some(
        (entry) => String(entry?._id || "") === String(currentId || "")
      );

      if (hasCurrentEntry) {
        return currentId || "";
      }

      return safeEntries[0]?._id || "";
    });
  }, [safeEntries]);

  const selectedEntry = useMemo(
    () =>
      safeEntries.find((entry) => String(entry?._id || "") === String(selectedEntryId || "")) ||
      safeEntries[0] ||
      null,
    [safeEntries, selectedEntryId]
  );

  if (!selectedEntry) {
    return null;
  }

  const hasMultiple = safeEntries.length > 1;

  return (
    <>
      <section>
        <div>
          <div className="reporting-simple-panel-copy">
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="reporting-simple-panel-actions">
            <span className="reporter-workspace-badge is-open">
              {copy.emailActivity.itemCount(safeEntries.length)}
            </span>
            {hasMultiple ? (
              <button
                type="button"
                className="management-button-secondary reporting-compact-action"
                onClick={() => setIsViewerOpen(true)}
              >
                {copy.emailActivity.fullView}
              </button>
            ) : null}
          </div>
        </div>

        {hasMultiple ? (
          <div className="management-field reporting-email-activity-select-field">
            <label htmlFor={selectId}>{copy.emailActivity.chooseEmail}</label>
            <select
              id={selectId}
              value={selectedEntryId}
              onChange={(event) => setSelectedEntryId(event.target.value)}
            >
              {safeEntries.map((entry) => (
                <option key={entry._id} value={entry._id}>
                  {getReportingEmailStatusLabel(entry.status, language)} |{" "}
                  {entry.subject || copy.common.noSubject}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <button
          type="button"
          className={`reporting-email-quick-entry reporting-email-activity-trigger is-${
            selectedEntry.status || "draft"
          }`}
          onClick={() => setIsViewerOpen(true)}
        >
          <div className="reporting-email-quick-entry-main">
            <strong className="reporting-email-quick-entry-title">
              {selectedEntry.subject || copy.common.noSubject}
            </strong>
            <p className="reporting-email-quick-entry-meta">
              {selectedEntry.author?.fullName || copy.common.unknownAuthor} |{" "}
              {selectedEntry.sourceLabel || copy.common.noSmtpSource}
            </p>
          </div>
          <div className="reporting-email-quick-entry-side">
            <span>
              <span className={`reporter-workspace-badge ${getStatusTone(selectedEntry.status)}`}>
                {getReportingEmailStatusLabel(selectedEntry.status, language)}
              </span>
              <span className={`reporter-workspace-badge ${getStatusTone(selectedEntry.status)}`}>
                {hasMultiple ? copy.emailActivity.openSelected : copy.emailActivity.openEmail}
              </span>
            </span>

            <span>
              {formatDateTime(
                selectedEntry.sentAt || selectedEntry.updatedAt || selectedEntry.createdAt
              )}
            </span>
          </div>
        </button>
      </section>

      <ReportingEmailActivityModal
        isOpen={isViewerOpen}
        title={title || copy.emailActivity.title}
        entries={safeEntries}
        initialEntryId={selectedEntryId}
        onClose={() => setIsViewerOpen(false)}
        formatDateTime={formatDateTime}
      />
    </>
  );
}
