import React from "react";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";

export default function ReportingEvidenceModal({
  isOpen,
  form,
  busy,
  error,
  uploadProgress,
  uploadPhase,
  onChange,
  onSubmit,
  onClose,
  onRemoveImage,
  onRenameImage,
  evidenceInputRef,
  onEvidenceImageSelection,
  onEvidenceDrop,
  isEvidenceDropActive,
  setIsEvidenceDropActive,
  isEditing,
  maxImageCount,
  maxTotalSizeBytes,
  formatBytes,
  getEvidenceImageSource,
  isImageLoading,
  onOpenImage,
}) {
  const { copy } = useReportingUiCopy();

  if (!isOpen) {
    return null;
  }

  return (
    <div className="workflow-modal-backdrop" role="presentation">
      <div
        className="workflow-modal-shell reporting-evidence-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reporting-evidence-modal-title"
      >
        <div className="workflow-modal-header reporter-task-modal-header">
          <div className="workflow-modal-titleblock">
            <h3 id="reporting-evidence-modal-title">
              {isEditing ? copy.evidenceModal.editTitle : copy.evidenceModal.addTitle}
            </h3>
            <p>{copy.evidenceModal.description}</p>
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

            <div className="management-fields">
              <div className="management-field">
                <label htmlFor="reporting-evidence-drive">
                  {copy.evidenceModal.googleDriveLink}
                </label>
                <input
                  id="reporting-evidence-drive"
                  type="url"
                  value={form.driveLink}
                  onChange={(event) => onChange("driveLink", event.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </div>

              <div className="management-field">
                <label htmlFor="reporting-evidence-notes">
                  {copy.evidenceModal.evidenceNotes}
                </label>
                <textarea
                  id="reporting-evidence-notes"
                  value={form.notes}
                  onChange={(event) => onChange("notes", event.target.value)}
                  placeholder={copy.evidenceModal.notesPlaceholder}
                />
              </div>

              <label className="management-checkbox" htmlFor="reporting-evidence-ddos">
                <input
                  id="reporting-evidence-ddos"
                  type="checkbox"
                  checked={Boolean(form.didDdos)}
                  onChange={(event) => onChange("didDdos", event.target.checked)}
                />
                <span>
                  <strong>{copy.evidenceModal.ddosCompleted}</strong>
                  <small>{copy.evidenceModal.ddosCompletedHelp}</small>
                </span>
              </label>

              <div className="reporting-evidence-gallery">
                <div className="reporting-evidence-gallery-header">
                  <strong>{copy.evidenceModal.images}</strong>
                  <div className="reporting-inline-actions">
                    <span>
                      {copy.evidenceModal.imagesCount(
                        form.images.length,
                        maxImageCount,
                        formatBytes(
                          form.images.reduce(
                            (sum, image) => sum + Number(image?.size || 0),
                            0
                          )
                        )
                      )}
                    </span>
                  </div>
                </div>

                <div className="reporting-evidence-helptext">
                  {copy.evidenceModal.helpText(
                    maxImageCount,
                    formatBytes(maxTotalSizeBytes)
                  )}
                </div>

                {busy ? (
                  <div
                    className="reporting-evidence-upload-progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.max(0, Math.min(100, Number(uploadProgress || 0)))}
                  >
                    <div className="reporting-evidence-upload-progress-header">
                      <strong>{uploadPhase || copy.evidenceModal.uploadPhaseFallback}</strong>
                      <span>{Math.max(0, Math.min(100, Number(uploadProgress || 0)))}%</span>
                    </div>
                    <div className="reporting-evidence-upload-progress-track">
                      <span
                        className="reporting-evidence-upload-progress-value"
                        style={{
                          width: `${Math.max(0, Math.min(100, Number(uploadProgress || 0)))}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  className={`reporting-evidence-dropzone${isEvidenceDropActive ? " is-active" : ""}`}
                  onClick={() => evidenceInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!isEvidenceDropActive) {
                      setIsEvidenceDropActive(true);
                    }
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setIsEvidenceDropActive(false);
                    }
                  }}
                  onDrop={onEvidenceDrop}
                >
                  <strong>{copy.evidenceModal.dragDropTitle}</strong>
                  <span>{copy.evidenceModal.dragDropHint}</span>
                </button>

                {form.images.length ? (
                  <div className="reporting-evidence-image-grid">
                    {form.images.map((image) => {
                      const imageSource = getEvidenceImageSource(image);

                      return (
                        <article key={image.id} className="reporting-evidence-image-card">
                          <div className="reporting-evidence-image-frame">
                            {imageSource ? (
                              <img src={imageSource} alt={image.name} loading="lazy" />
                            ) : isImageLoading(image, image?.submissionId || "") ? (
                              <span>{copy.evidenceModal.loadingPreview}</span>
                            ) : (
                              <span>{copy.evidenceModal.noPreview}</span>
                            )}
                          </div>
                          <div className="reporting-evidence-image-meta">
                            <strong>{image.name}</strong>
                            <span>
                              {formatBytes(image.size)}
                              {image?.file ? ` | ${copy.evidenceModal.readyToUpload}` : ""}
                            </span>
                            <label className="reporting-evidence-image-rename-label">
                              <span>{copy.evidenceModal.fileName}</span>
                              <input
                                type="text"
                                value={image.name || ""}
                                onChange={(event) => onRenameImage?.(image.id, event.target.value)}
                                placeholder={copy.evidenceModal.renamePlaceholder}
                                disabled={busy}
                              />
                            </label>
                            {image?.nameEdited ? (
                              <small className="reporting-evidence-image-name-edited">
                                {copy.evidenceModal.nameChanged}
                              </small>
                            ) : null}
                          </div>
                          <div className="reporting-inline-actions">
                            {imageSource ? (
                              <button
                                type="button"
                                className="management-button-secondary"
                                onClick={() =>
                                  onOpenImage(
                                    image,
                                    image?.submissionId || "",
                                    form.images,
                                    copy.evidenceModal.images
                                  )
                                }
                              >
                                {copy.common.view}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="management-button-secondary"
                              onClick={() => onRemoveImage(image.id)}
                              disabled={busy}
                            >
                              {copy.common.remove}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="reporting-workspace-empty">{copy.evidenceModal.noImages}</div>
                )}
              </div>
            </div>

            <input
              ref={evidenceInputRef}
              type="file"
              accept="image/*"
              multiple
              className="reporting-ai-hidden-input"
              onChange={onEvidenceImageSelection}
            />

            <div className="management-actions">
              <button type="submit" className="management-button" disabled={busy}>
                {busy
                  ? copy.common.saving
                  : isEditing
                    ? copy.evidenceModal.updateEvidence
                    : copy.evidenceModal.submitEvidence}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
