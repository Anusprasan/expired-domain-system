import React from "react";
import { formatDateTime, getStatusLabel, getStatusTone } from "../utils/shortLinkCheckerUi";

export default function ShortLinkCaptureModal({
  copy,
  language,
  link,
  check,
  imageUrl,
  loading,
  onClose,
  onOpenImage,
  onDownloadImage,
}) {
  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="management-modal-backdrop is-centered" role="presentation" onMouseDown={handleBackdropMouseDown}>
      <div
        className="app-panel management-modal short-link-checker-output-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="short-link-output-title"
      >
        <div className="short-link-checker-modal-header">
          <div>
            <span className={getStatusTone(check?.status)}>{getStatusLabel(check?.status, copy)}</span>
            <h2 id="short-link-output-title">{link?.title || link?.moneySiteDomain || link?.shortUrl}</h2>
            <p>{check?.finalUrl || link?.shortUrl}</p>
            {check?.verificationDetected ? (
              <p className="short-link-checker-verification-inline">
                {check.verificationName || copy.common.verification}: {check.verificationReason || copy.common.detectedOnFinalPage}
              </p>
            ) : null}
          </div>
          <div className="management-inline-actions">
            <a className="management-button-secondary" href={link?.shortUrl} target="_blank" rel="noreferrer">
              {copy.captureModal.openShortLink}
            </a>
            {check?.finalUrl ? (
              <a className="management-button-secondary" href={check.finalUrl} target="_blank" rel="noreferrer">
                {copy.captureModal.openFinal}
              </a>
            ) : null}
            {imageUrl ? (
              <>
                <button type="button" className="management-button-secondary" onClick={onOpenImage}>
                  {copy.captureModal.openImage}
                </button>
                <button type="button" className="management-button-secondary" onClick={onDownloadImage}>
                  {copy.captureModal.download}
                </button>
              </>
            ) : null}
            <button type="button" className="management-button-secondary" onClick={onClose}>
              {copy.common.close}
            </button>
          </div>
        </div>

        <div className="short-link-checker-output-frame">
          {loading ? (
            <div className="short-link-checker-output-empty" aria-live="polite">
              <span className="money-sites-screenshot-loader" aria-hidden="true" />
              <strong>{copy.captureModal.loadingTitle}</strong>
              <span>{copy.captureModal.loadingDescription}</span>
            </div>
          ) : imageUrl ? (
            <img src={imageUrl} alt={copy.captureModal.imageAlt(link?.shortUrl)} />
          ) : (
            <div className="short-link-checker-output-empty">
              <strong>{copy.captureModal.emptyTitle}</strong>
              <span>{check?.error || copy.captureModal.emptyDescription}</span>
            </div>
          )}
        </div>

        <div className="short-link-checker-output-details">
          <span>{copy.captureModal.shortLinkStatus}: {check?.exactStatusCode || "-"}</span>
          <span>{copy.captureModal.finalStatus}: {check?.finalStatusCode || "-"}</span>
          {check?.verificationDetected ? <span>{check.verificationName || copy.captureModal.verificationDetected}</span> : null}
          <span>{copy.captureModal.checkedAt}: {formatDateTime(check?.checkedAt, language)}</span>
          <span>{copy.captureModal.telegramCodes}: {(check?.telegramAlertMatched || []).join(", ") || "-"}</span>
        </div>
      </div>
    </div>
  );
}
