import React from "react";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";
import ReportingEmailActivitySection from "./ReportingEmailActivitySection";

function SummaryItem({ label, value }) {
  return (
    <div className="reporting-task-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

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

export default function ReportingSubmissionCard({
  submission,
  canReview,
  emailEntries,
  busy,
  rejectBusy,
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

  if (!submission) {
    return null;
  }

  const reviewStatus = getSubmissionReviewStatus(submission);
  const isChecked = reviewStatus === "checked";
  const reviewActorName = submission?.reviewedBy?.fullName || submission?.reviewedBy?.email || "";
  const preparedImages = (submission?.images || []).map((image) => ({
    ...image,
    submissionId: submission?._id || "",
    source: getImageSource(
      {
        ...image,
        submissionId: submission?._id || "",
      },
      submission?._id || ""
    ),
    isLoading: isImageLoading(
      {
        ...image,
        submissionId: submission?._id || "",
      },
      submission?._id || ""
    ),
  }));
  const readyImages = preparedImages.filter((image) => Boolean(image.source));
  const evidenceToneClass = isChecked ? " is-checked" : reviewStatus === "rejected" ? " is-rejected" : "";
  const safeEmailEntries = Array.isArray(emailEntries) ? emailEntries : [];
  const deletedImages = Array.isArray(submission?.deletedImages) ? submission.deletedImages : [];
  const totalImageBytes =
    Number(submission?.retention?.totalImageBytes || 0) ||
    preparedImages.reduce((total, image) => total + Math.max(0, Number(image?.size) || 0), 0);

  return (
    <article className="reporter-form-card reporting-submission-card">
      <div className="reporting-review-card-top">
        <div className="reporting-review-card-copy">
          <span className="reporter-detail-eyebrow">{copy.submissionCard.selectedSubmission}</span>
          <h4>{submission?.reporterId?.fullName || copy.common.unknownUser}</h4>
          <p>{formatDateTime(submission?.updatedAt || submission?.createdAt)}</p>
        </div>

        <div className="reporting-review-card-side">
          <div className="reporter-detail-status">
            <span className={`reporter-workspace-badge ${getSubmissionReviewTone(submission)}`}>
              {getSubmissionReviewLabel(submission, copy)}
            </span>
            {reviewActorName ? (
              <span className="reporter-workspace-badge is-open">{reviewActorName}</span>
            ) : null}
          </div>

          {canReview ? (
            <div className="reporter-detail-actions">
              {isChecked ? (
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => onReverseChecked(submission?.reporterId?._id)}
                  disabled={busy}
                >
                  {busy ? copy.submissionCard.updating : copy.submissionCard.markUnchecked}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="management-button-secondary"
                    onClick={() => onOpenReject(submission)}
                    disabled={busy || rejectBusy}
                  >
                    {rejectBusy ? copy.submissionCard.rejecting : copy.submissionCard.reject}
                  </button>
                  <button
                    type="button"
                    className="management-button"
                    onClick={() => onMarkChecked(submission?.reporterId?._id)}
                    disabled={busy || rejectBusy}
                  >
                    {busy ? copy.submissionCard.updating : copy.submissionCard.markChecked}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="reporting-task-summary-grid">
        <SummaryItem
          label={copy.submissionCard.images}
          value={copy.submissionCard.imageCount(preparedImages.length)}
        />
        <SummaryItem label={copy.submissionCard.storage} value={formatBytes(totalImageBytes)} />
        {deletedImages.length ? (
          <SummaryItem
            label={copy.submissionCard.deletedImages}
            value={copy.submissionCard.deletedImageCount(deletedImages.length)}
          />
        ) : null}
        <SummaryItem
          label={copy.submissionCard.updated}
          value={formatShortDate(submission?.updatedAt || submission?.createdAt)}
        />
        <SummaryItem
          label={copy.common.ddos}
          value={submission?.didDdos ? copy.submissionCard.completed : copy.submissionCard.notMarked}
        />
        {submission?.reviewedAt ? (
          <SummaryItem label={copy.submissionCard.reviewed} value={formatShortDate(submission.reviewedAt)} />
        ) : null}
      </div>

      {submission?.reviewStatus === "rejected" && submission?.reviewComment ? (
        <div className="reporting-review-feedback is-rejected">
          <span>{copy.submissionCard.reviewerComment}</span>
          <strong>{copy.submissionCard.evidenceRejected}</strong>
          <p>{submission.reviewComment}</p>
        </div>
      ) : null}

      {submission?.driveLink ? (
        <div className="reporter-detail-card">
          <span>{copy.submissionCard.driveLink}</span>
          <strong>{submission.driveLink}</strong>
          <div className="reporting-inline-actions">
            <button
              type="button"
              className="management-button-secondary"
              onClick={() => onOpenDrivePreview(submission)}
            >
              {copy.submissionCard.previewDrive}
            </button>
            <a
              className="management-button-secondary reporting-inline-link"
              href={submission.driveLink}
              target="_blank"
              rel="noreferrer"
            >
              {copy.common.openLink}
            </a>
          </div>
        </div>
      ) : null}

      {submission?.notes ? (
        <div className="reporting-task-note">
          <span>{copy.submissionCard.evidenceNotes}</span>
          <p>{submission.notes}</p>
        </div>
      ) : null}

      {deletedImages.length ? (
        <div className="reporting-task-note reporting-task-note-warning">
          <span>{copy.submissionCard.deletedEvidenceHistory}</span>
          <div className="reporting-deleted-evidence-list">
            {deletedImages.slice(0, 8).map((image) => (
              <div key={`${image.id}-${image.deletedAt || "unknown"}`}>
                <strong>{image.name || copy.submissionCard.unnamedImage}</strong>
                <p>
                  {copy.submissionCard.deletedBy(
                    image.deletedByName,
                    formatDateTime(image.deletedAt),
                    formatBytes(image.size || 0)
                  )}
                </p>
              </div>
            ))}
            {deletedImages.length > 8 ? (
              <p>{copy.submissionCard.moreDeletedRecords(deletedImages.length - 8)}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      

      <div className="reporting-evidence-gallery">
        <div className="reporting-evidence-gallery-header">
          <strong>{copy.submissionCard.images}</strong>
          <div className="reporting-inline-actions">
            <span>
              {copy.submissionCard.imageCount(preparedImages.length)}
            </span>
            {readyImages.length ? (
              <button
                type="button"
                className="management-button-secondary reporting-compact-action"
                    onClick={() =>
                      onOpenImage(
                        readyImages[0],
                        submission?._id || "",
                        preparedImages,
                        `${submission?.reporterId?.fullName || copy.common.unknownReporter} ${copy.submissionCard.images}`
                      )
                    }
                  >
                  {copy.submissionCard.openGallery}
                </button>
              ) : null}
            </div>
        </div>

        {preparedImages.length ? (
          <div className="reporting-evidence-image-grid">
            {preparedImages.map((image) => (
              <article key={image.id} className="reporting-evidence-image-card">
                <div className="reporting-evidence-image-frame">
                  {image.source ? (
                    <img src={image.source} alt={image.name} loading="lazy" />
                  ) : (
                    <span>
                      {image.isLoading
                        ? copy.submissionCard.loadingPreview
                        : copy.submissionCard.previewUnavailable}
                    </span>
                  )}
                </div>
                <div className="reporting-evidence-image-meta">
                  <strong>{image.name}</strong>
                  <span>{formatBytes(image.size)}</span>
                </div>
                <div className="reporting-inline-actions">
                  <button
                    type="button"
                    className="management-button-secondary"
                    onClick={() =>
                      onOpenImage(
                        image,
                        submission?._id || "",
                        preparedImages,
                        `${submission?.reporterId?.fullName || copy.common.unknownReporter} ${copy.submissionCard.images}`
                      )
                    }
                    disabled={!image.source}
                  >
                    {copy.common.view}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="reporting-workspace-empty">
            {copy.submissionCard.noImagesUploaded}
          </div>
        )}
      </div>

      {safeEmailEntries.length ? (
        <ReportingEmailActivitySection
          title={copy.submissionCard.emailTitle}
          entries={safeEmailEntries}
          formatDateTime={formatDateTime}
        />
      ) : null}
    </article>
  );
}
