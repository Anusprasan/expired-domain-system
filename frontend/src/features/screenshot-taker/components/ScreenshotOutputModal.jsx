import React from "react";

export default function ScreenshotOutputModal({
  copy,
  site,
  capture,
  imageUrl,
  imageStatus,
  captureTone,
  formattedCapturedAt,
  formattedSize,
  onClose,
  onOpenSite,
  onOpenImage,
  onDownloadImage,
}) {
  const isImagePending =
    !imageUrl && capture?.status === "success" && imageStatus !== "failed";
  const captureStatusLabel = capture?.status === "success"
    ? copy.common.success
    : capture?.status === "failed"
      ? copy.common.failed
      : copy.common.notCaptured;

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="management-modal-backdrop is-centered"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="app-panel management-modal screenshot-taker-output-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-taker-output-title"
      >
        <div className="screenshot-taker-modal-header">
          <div>
            <span className={captureTone}>{captureStatusLabel}</span>
            <h2 id="screenshot-taker-output-title">{site.domain}</h2>
            <p>{capture?.title || site.url}</p>
          </div>

          <div className="management-inline-actions">
            <button type="button" className="management-button-secondary" onClick={onOpenSite}>
              {copy.outputModal.openSite}
            </button>
            {imageUrl ? (
              <>
                <button type="button" className="management-button-secondary" onClick={onOpenImage}>
                  {copy.outputModal.openOriginal}
                </button>
                <button type="button" className="management-button-secondary" onClick={onDownloadImage}>
                  {copy.outputModal.downloadOriginal}
                </button>
              </>
            ) : null}
            <button type="button" className="management-button-secondary" onClick={onClose}>
              {copy.common.close}
            </button>
          </div>
        </div>

        <div className="screenshot-taker-output-frame">
          {imageUrl ? (
            <img src={imageUrl} alt={copy.outputModal.imageAlt(site.domain)} />
          ) : (
            <div className="screenshot-taker-preview-empty screenshot-taker-preview-loading" aria-live="polite">
              {isImagePending ? <span className="money-sites-screenshot-loader" aria-hidden="true" /> : null}
              <strong>{isImagePending ? copy.outputModal.loadingTitle : copy.outputModal.noImageTitle}</strong>
              <span>
                {isImagePending
                  ? copy.outputModal.loadingDescription
                  : capture?.error || copy.outputModal.noImageDescription}
              </span>
            </div>
          )}
        </div>

        <div className="screenshot-taker-output-details">
          <span>{copy.outputModal.captured}: {formattedCapturedAt}</span>
          <span>{copy.outputModal.originalSize}: {formattedSize}</span>
          <span>{copy.outputModal.finalUrl}: {capture?.finalUrl || "-"}</span>
        </div>
      </div>
    </div>
  );
}
