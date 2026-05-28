import React, { useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useArticlePoolUiCopy } from "../hooks/useArticlePoolUiCopy";

function splitLines(value) {
  return Array.isArray(value)
    ? value.filter(Boolean)
    : String(value || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function renderPreviewImage(label, src, type, key, onCopy, title) {
  if (!src) {
    return null;
  }

  return (
    <button
      key={key}
      type="button"
      className={`article-pool-resource-preview-card is-${type}`}
      onClick={() => onCopy(src)}
      title={title}
    >
      <span>{label}</span>
      <div className="article-pool-resource-preview-frame">
        <img src={src} alt={label} loading="lazy" />
      </div>
    </button>
  );
}

export default function ContentPoolPreviewModal({ item, onClose }) {
  const { copy } = useArticlePoolUiCopy();
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");
  const resources = item?.resources || {};
  const content = item?.content || {};
  const logos = splitLines(resources.logos);
  const buttons = splitLines(resources.gifs);
  const hasResources = logos.length || resources.heroImage || resources.favicon || buttons.length;

  const handleCopy = async (value, label) => {
    const text = String(value || "").trim();

    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setNotice(copy.common.copied(label));
    } catch {
      setLocalError(copy.common.copyFailed(label));
    }
  };

  return (
    <section className="app-panel management-form">
      <div className="management-section-header">
        <div>
          <h2>{copy.previewModal.title}</h2>
          <p>{item?.brandName || "-"} | {content.title || item?.topic || "-"}</p>
        </div>
        <button type="button" className="management-button-secondary" onClick={onClose}>
          {copy.previewModal.close}
        </button>
      </div>

      <ToastNotice message={localError} onClose={() => setLocalError("")} />
      <ToastNotice message={notice} onClose={() => setNotice("")} tone="success" duration={2500} />

      <div className="management-fields">
        <div className="management-field">
          <label>{copy.previewModal.titleLabel}</label>
          <button
            type="button"
            className="development-preview-text development-preview-copy"
            onClick={() => handleCopy(content.title || item?.topic, copy.previewModal.titleLabel)}
            disabled={!(content.title || item?.topic)}
          >
            {content.title || item?.topic || "-"}
          </button>
        </div>

        <div className="management-field">
          <label>{copy.previewModal.descriptionLabel}</label>
          <button
            type="button"
            className="development-preview-text development-preview-copy"
            onClick={() => handleCopy(content.summary, copy.previewModal.descriptionLabel)}
            disabled={!content.summary}
          >
            {content.summary || "-"}
          </button>
        </div>

        <div className="management-field">
          <label>{copy.previewModal.contentLabel}</label>
          {content.body ? (
            <div className="development-preview-text development-preview-text-block development-preview-html">
              <span dangerouslySetInnerHTML={{ __html: content.body }} />
            </div>
          ) : (
            <div className="development-preview-text development-preview-text-block">-</div>
          )}
        </div>

        <div className="management-field development-note-field">
          <label>{copy.previewModal.noteLabel}</label>
          <div className="development-preview-text development-preview-text-block">{content.note || "-"}</div>
        </div>

        <div className="management-field">
          <label>{copy.previewModal.resourcesLabel}</label>
          {hasResources ? (
            <div className="article-pool-resource-preview-grid development-content-resource-preview-grid">
              {logos.map((logo, index) =>
                renderPreviewImage(
                  `${copy.form.logo} ${index + 1}`,
                  logo,
                  "logo",
                  `logo-${index}`,
                  (value) => handleCopy(value, copy.common.imageAddress),
                  copy.previewModal.copyImageAddress
                )
              )}
              {renderPreviewImage(
                copy.form.banner,
                resources.heroImage,
                "banner",
                "banner",
                (value) => handleCopy(value, copy.common.imageAddress),
                copy.previewModal.copyImageAddress
              )}
              {renderPreviewImage(
                copy.form.favicon,
                resources.favicon,
                "favicon",
                "favicon",
                (value) => handleCopy(value, copy.common.imageAddress),
                copy.previewModal.copyImageAddress
              )}
              {buttons.map((button, index) =>
                renderPreviewImage(
                  `${copy.form.button} ${index + 1}`,
                  button,
                  "button",
                  `button-${index}`,
                  (value) => handleCopy(value, copy.common.imageAddress),
                  copy.previewModal.copyImageAddress
                )
              )}
            </div>
          ) : (
            <div className="article-pool-resource-preview-empty">{copy.previewModal.noResources}</div>
          )}
        </div>
      </div>
    </section>
  );
}
