import React from "react";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";
import ReportingSubmissionCard from "./ReportingSubmissionCard";

function getSubmissionReviewStatus(submission) {
  const normalizedStatus = String(submission?.reviewStatus || "").trim().toLowerCase();

  if (normalizedStatus === "checked" || normalizedStatus === "rejected") {
    return normalizedStatus;
  }

  return "submitted";
}

function getSubmissionReviewLabel(submission, copy) {
  const reviewStatus = getSubmissionReviewStatus(submission);

  if (reviewStatus === "checked") {
    return copy.reviewStatuses.checked;
  }

  if (reviewStatus === "rejected") {
    return copy.reviewStatuses.rejected;
  }

  return copy.reviewStatuses.submitted;
}

function getSubmissionReviewTone(submission) {
  const reviewStatus = getSubmissionReviewStatus(submission);

  if (reviewStatus === "checked") {
    return "is-resolved";
  }

  if (reviewStatus === "rejected") {
    return "is-error";
  }

  return "is-submitted";
}

function ReviewStat({ label, value, tone }) {
  return (
    <div className={`reporting-review-stat${tone ? ` ${tone}` : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function ReportingReviewPanel({
  canReview,
  canOpenComposer,
  canGenerateAiEmail,
  canSendReportingEmail,
  submissions,
  selectedSubmission,
  selectedReviewerId,
  onSelectReviewer,
  onOpenComposer,
  selectedSubmissionEmailEntryCount,
  selectedSubmissionEmailEntries,
  actionBusy,
  rejectBusy,
  rejectModalReporterId,
  getImageSource,
  isImageLoading,
  onOpenDrivePreview,
  onOpenImage,
  onMarkChecked,
  onReverseChecked,
  onOpenReject,
  formatDateTime,
  formatShortDate,
  formatBytes,
}) {
  const { copy } = useReportingUiCopy();
  const safeSubmissions = Array.isArray(submissions) ? submissions : [];
  const checkedCount = safeSubmissions.filter(
    (submission) => getSubmissionReviewStatus(submission) === "checked"
  ).length;
  const rejectedCount = safeSubmissions.filter(
    (submission) => getSubmissionReviewStatus(submission) === "rejected"
  ).length;
  const pendingCount = safeSubmissions.length - checkedCount - rejectedCount;

  if (!canReview && !canOpenComposer && !selectedSubmissionEmailEntryCount) {
    return null;
  }

  const emailActionLabel = canGenerateAiEmail
    ? copy.evidencePanel.openAiEmail
    : canSendReportingEmail
      ? copy.evidencePanel.openEmailComposer
      : copy.evidencePanel.openEmail;

  return (
    <section className="reporter-form-card reporting-review-panel">
      <div className="reporting-simple-panel-header">
        <div className="reporting-simple-panel-copy">
          <h3>{canReview ? copy.reviewPanel.reviewAndEmail : copy.reviewPanel.email}</h3>
        </div>
        <div className="reporting-simple-panel-actions">
          {selectedSubmissionEmailEntryCount ? (
            <span className="reporter-workspace-badge is-open">
              {copy.reviewPanel.emailCount(selectedSubmissionEmailEntryCount)}
            </span>
          ) : null}
          {canOpenComposer ? (
            <button
              type="button"
              className="management-button-secondary reporting-compact-action"
              onClick={onOpenComposer}
            >
              {emailActionLabel}
            </button>
          ) : null}
        </div>
      </div>

      {canReview ? (
        safeSubmissions.length ? (
          <div className="reporting-review-layout">
            <aside className="reporting-review-sidebar">
              <div className="reporting-review-stats">
                <ReviewStat label={copy.reviewPanel.submissions} value={safeSubmissions.length} tone="is-open" />
                <ReviewStat label={copy.reviewPanel.pending} value={pendingCount} tone="is-warning" />
                <ReviewStat label={copy.reviewPanel.checked} value={checkedCount} tone="is-success" />
                <ReviewStat label={copy.reviewPanel.rejected} value={rejectedCount} tone="is-error" />
              </div>

              <div className="reporting-review-selector-list">
                {safeSubmissions.map((submission) => {
                  const reporterId = submission?.reporterId?._id || "";
                  const isActive = String(reporterId) === String(selectedReviewerId || "");
                  const reviewStatus = getSubmissionReviewStatus(submission);
                  const evidenceNames = (submission?.images || [])
                    .map((image) => String(image?.name || "").trim())
                    .filter(Boolean);

                  return (
                    <button
                      key={submission._id}
                      type="button"
                      className={`reporting-review-selector-item${isActive ? " is-active" : ""}`}
                      onClick={() => onSelectReviewer(reporterId)}
                    >
                      <div className="reporting-review-selector-item-top">
                        <strong>{submission?.reporterId?.fullName || copy.common.unknownUser}</strong>
                        <span className={`reporter-workspace-badge ${getSubmissionReviewTone(submission)}`}>
                          {getSubmissionReviewLabel(submission, copy)}
                        </span>
                      </div>
                      <span>
                        {copy.reviewPanel.imageCount(submission?.images?.length || 0)}
                      </span>
                      {evidenceNames.length ? (
                        <div className="reporting-review-selector-files">
                       
                           
                        </div>
                      ) : null}
                      <span>{formatShortDate(submission?.updatedAt || submission?.createdAt)}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="reporting-review-main">
              {selectedSubmission ? (
                <ReportingSubmissionCard
                  submission={selectedSubmission}
                  canReview={canReview}
                  busy={Boolean(
                    actionBusy === `mark-${selectedSubmission?.reporterId?._id}` ||
                      actionBusy === `unmark-${selectedSubmission?.reporterId?._id}`
                  )}
                  rejectBusy={
                    rejectBusy &&
                    String(rejectModalReporterId || "") ===
                      String(selectedSubmission?.reporterId?._id || "")
                  }
                  getImageSource={getImageSource}
                  isImageLoading={isImageLoading}
                  onOpenDrivePreview={onOpenDrivePreview}
                  onOpenImage={onOpenImage}
                  onMarkChecked={onMarkChecked}
                  onReverseChecked={onReverseChecked}
                  onOpenReject={onOpenReject}
                  emailEntries={selectedSubmissionEmailEntries}
                  formatDateTime={formatDateTime}
                  formatShortDate={formatShortDate}
                  formatBytes={formatBytes}
                />
              ) : (
                <div className="reporting-workspace-empty">{copy.reviewPanel.selectSubmission}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="reporting-workspace-empty">
            {copy.reviewPanel.noEvidenceSubmitted}
          </div>
        )
      ) : null}
    </section>
  );
}
