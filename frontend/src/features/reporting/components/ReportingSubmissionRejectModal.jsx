import React from "react";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";

export default function ReportingSubmissionRejectModal({
  isOpen,
  submission,
  value,
  busy,
  error,
  onChange,
  onClose,
  onSubmit,
}) {
  const { copy } = useReportingUiCopy();

  if (!isOpen || !submission) {
    return null;
  }

  return (
    <div className="workflow-modal-backdrop" role="presentation">
      <div
        className="workflow-modal-shell reporting-review-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reporting-reject-modal-title"
      >
        <div className="workflow-modal-header reporter-task-modal-header">
          <div className="workflow-modal-titleblock">
            <h3 id="reporting-reject-modal-title">{copy.rejectModal.title}</h3>
            <p>
              {copy.rejectModal.description(submission?.reporterId?.fullName)}
            </p>
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
          <form className="reporter-form-card reporting-evidence-form" onSubmit={onSubmit}>
            {error ? <p className="management-error">{error}</p> : null}

            <div className="management-field">
              <label htmlFor="reporting-reject-comment">{copy.rejectModal.comment}</label>
              <textarea
                id="reporting-reject-comment"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={copy.rejectModal.placeholder}
                required
              />
            </div>

            <div className="management-actions">
              <button type="submit" className="management-button" disabled={busy}>
                {busy ? copy.common.saving : copy.rejectModal.submit}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
