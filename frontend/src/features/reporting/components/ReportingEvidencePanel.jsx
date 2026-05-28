import React from "react";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";
import ReportingEmailActivitySection from "./ReportingEmailActivitySection";

function EvidenceSummaryItem({ label, value }) {
  return (
    <div className="reporting-task-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getReviewLabel(submission, copy) {
  if (submission?.reviewStatus === "checked") {
    return copy.evidencePanel.checked;
  }

  if (submission?.reviewStatus === "rejected") {
    return copy.evidencePanel.rejected;
  }

  return copy.evidencePanel.submitted;
}

function getReviewTone(submission) {
  if (submission?.reviewStatus === "checked") {
    return "is-resolved";
  }

  if (submission?.reviewStatus === "rejected") {
    return "is-error";
  }

  return "is-submitted";
}

export default function ReportingEvidencePanel({
  canShow,
  canEditEvidence,
  canOpenComposer,
  canGenerateAiEmail,
  canSendReportingEmail,
  mySubmission,
  myEvidenceImages,
  maxImageCount,
  onOpenComposer,
  onOpenEmailComposer,
  onDeleteSubmission,
  onOpenDrivePreview,
  onOpenImage,
  isImageLoading,
  actionBusy,
  emailEntryCount,
  emailEntries,
  formatShortDate,
  formatDateTime,
  formatBytes,
}) {
  const { copy } = useReportingUiCopy();

  if (!canShow) {
    return null;
  }

  const safeEmailEntries = Array.isArray(emailEntries) ? emailEntries : [];
  const deletedImages = Array.isArray(mySubmission?.deletedImages) ? mySubmission.deletedImages : [];
  const emailActionLabel = canGenerateAiEmail
    ? copy.evidencePanel.openAiEmail
    : canSendReportingEmail
      ? copy.evidencePanel.openEmailComposer
      : copy.evidencePanel.openEmail;
  const totalImageBytes = (Array.isArray(myEvidenceImages) ? myEvidenceImages : []).reduce(
    (total, image) => total + Math.max(0, Number(image?.size) || 0),
    0
  );

  return (
    <section className="reporter-form-card reporting-simple-step-panel">
      <div className="reporting-simple-panel-header">
        <div className="reporting-simple-panel-copy">
          <h3>{copy.evidencePanel.title}</h3>
        </div>
          <div className="reporting-simple-panel-actions">
            {mySubmission ? (
            <span className={`reporter-workspace-badge ${getReviewTone(mySubmission)}`}>
              {getReviewLabel(mySubmission, copy)}
            </span>
          ) : null}
          {canEditEvidence ? (
            <button
              type="button"
              className="management-button-secondary"
              onClick={onOpenComposer}
            >
              {mySubmission ? copy.evidencePanel.editEvidence : copy.evidencePanel.addEvidence}
            </button>
          ) : null}
          {mySubmission && canEditEvidence ? (
            <> <button
              type="button"
              className="management-button-secondary"
              onClick={onDeleteSubmission}
              disabled={actionBusy === "delete-submission"}
            >
              {actionBusy === "delete-submission"
                ? copy.common.deleting
                : copy.evidencePanel.deleteEvidence}
            </button>
            
           </>
          ) : null}
             {canOpenComposer ? (     <button
              type="button"
              className="management-button-secondary reporting-compact-action"
              onClick={onOpenEmailComposer}
            >
              {emailActionLabel}
            </button>  ) : null}
        </div>
        
    
      </div>

     

    

      {mySubmission ? (
        <>
          <div className="reporting-task-summary-grid">
            <EvidenceSummaryItem
              label={copy.evidencePanel.images}
              value={copy.evidencePanel.imageCount(myEvidenceImages.length)}
            />
            <EvidenceSummaryItem label={copy.evidencePanel.storage} value={formatBytes(totalImageBytes)} />
            {deletedImages.length ? (
              <EvidenceSummaryItem
                label={copy.evidencePanel.deletedImages}
                value={copy.evidencePanel.deletedImageCount(deletedImages.length)}
              />
            ) : null}
            <EvidenceSummaryItem
              label={copy.evidencePanel.updated}
              value={formatShortDate(mySubmission.updatedAt || mySubmission.createdAt)}
            />
            <EvidenceSummaryItem
              label={copy.common.ddos}
              value={mySubmission.didDdos ? copy.evidencePanel.completed : copy.evidencePanel.notMarked}
            />
            {mySubmission.reviewedAt ? (
              <EvidenceSummaryItem
                label={copy.evidencePanel.reviewed}
                value={formatShortDate(mySubmission.reviewedAt)}
              />
            ) : null}
          </div>

          {mySubmission.reviewStatus === "rejected" && mySubmission.reviewComment ? (
            <div className="reporting-review-feedback is-rejected">
              <span>{copy.evidencePanel.reviewerComment}</span>
              <strong>{copy.evidencePanel.updateAndSubmitAgain}</strong>
              <p>{mySubmission.reviewComment}</p>
            </div>
          ) : null}

          {mySubmission.driveLink ? (
            <div className="reporting-inline-actions">
              <button
                type="button"
                className="management-button-secondary"
                onClick={() => onOpenDrivePreview(mySubmission)}
              >
                {copy.evidencePanel.previewDrive}
              </button>
              <a
                className="management-button-secondary reporting-inline-link"
                href={mySubmission.driveLink}
                target="_blank"
                rel="noreferrer"
              >
                {copy.common.openLink}
              </a>
            </div>
          ) : null}

          {mySubmission.notes ? (
            <div className="reporting-task-note">
              <span>{copy.evidencePanel.evidenceNotes}</span>
              <p>{mySubmission.notes}</p>
            </div>
          ) : null}

          {deletedImages.length ? (
            <div className="reporting-task-note reporting-task-note-warning">
              <span>{copy.evidencePanel.deletedEvidenceHistory}</span>
              <div className="reporting-deleted-evidence-list">
                {deletedImages.slice(0, 8).map((image) => (
                  <div key={`${image.id}-${image.deletedAt || "unknown"}`}>
                    <strong>{image.name || copy.evidencePanel.unnamedImage}</strong>
                    <p>
                      {copy.evidencePanel.deletedBy(
                        image.deletedByName,
                        formatDateTime(image.deletedAt),
                        formatBytes(image.size || 0)
                      )}
                    </p>
                  </div>
                ))}
                {deletedImages.length > 8 ? (
                  <p>{copy.evidencePanel.moreDeletedRecords(deletedImages.length - 8)}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="reporting-evidence-gallery">
            <div className="reporting-evidence-gallery-header">
              <strong>{copy.evidencePanel.images}</strong>
              <div className="reporting-inline-actions">
                <span>
                  {myEvidenceImages.length}/{maxImageCount} {copy.evidencePanel.images.toLowerCase()}
                </span>
              </div>
            </div>

            {myEvidenceImages.length ? (
              <div className="reporting-evidence-image-grid">
                {myEvidenceImages.map((image) => (
                  <article key={image.id} className="reporting-evidence-image-card">
                    <div className="reporting-evidence-image-frame">
                      {image.source ? (
                        <img src={image.source} alt={image.name} loading="lazy" />
                      ) : isImageLoading(image, image?.submissionId || "") ? (
                        <span>{copy.common.loadingPreview}</span>
                      ) : (
                        <span>{copy.common.noPreview}</span>
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
                              image?.submissionId || "",
                              myEvidenceImages,
                              copy.evidencePanel.title
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
                {copy.evidencePanel.noImagesUploaded}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="reporting-workspace-empty">{copy.evidencePanel.noEvidenceAdded}</div>
      )}  {emailEntryCount ? (
        <ReportingEmailActivitySection
          title={copy.evidencePanel.emailActivityTitle}
          subtitle={copy.evidencePanel.emailCount(emailEntryCount)}
          entries={safeEmailEntries}
          formatDateTime={formatDateTime}
        />
      ) : null}
    </section>
  );
}
