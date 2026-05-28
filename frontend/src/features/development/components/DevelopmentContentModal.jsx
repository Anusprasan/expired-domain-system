import React, { useEffect, useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

const splitLines = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeEditorValue = (value) => {
  const html = String(value || "").trim();
  const text = html.replace(/<(.|\n)*?>/g, "").replace(/&nbsp;/g, " ").trim();

  return text ? html : "";
};

const stripHtml = (value) =>
  String(value || "")
    .replace(/<(.|\n)*?>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const articleEditorModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline"],
    ["link", "image"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["clean"],
  ],
};

const articleEditorFormats = [
  "header",
  "bold",
  "italic",
  "underline",
  "link",
  "image",
  "list",
  "bullet",
];

function getPageLinks(item, copy) {
  return [
    item?.landingPage ? { key: "landingPage", label: copy.pageBadges.landingPage.title, title: copy.pageBadges.landingPage.title, href: item.landingPage } : null,
    item?.aboutPage ? { key: "aboutPage", label: copy.pageBadges.aboutPage.title, title: copy.pageBadges.aboutPage.title, href: item.aboutPage } : null,
    item?.contactPage ? { key: "contactPage", label: copy.pageBadges.contactPage.title, title: copy.pageBadges.contactPage.title, href: item.contactPage } : null,
    item?.termsAndConditionsPage ? { key: "termsAndConditionsPage", label: copy.pageBadges.termsAndConditionsPage.title, title: copy.pageBadges.termsAndConditionsPage.title, href: item.termsAndConditionsPage } : null,
  ].filter(Boolean);
}

function renderEditableResource(label, value, onChange, placeholder) {
  return (
    <div className="development-resource-editor">
      <div className="development-resource-editor-input">
        <label>{label}</label>
        <input
          type="text"
          className="development-resource-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}

function renderPreviewImage(label, src, alt, className = "", key, onCopy) {
  if (!src) {
    return null;
  }

  const type = className.includes("is-banner")
    ? "banner"
    : className.includes("is-favicon")
      ? "favicon"
      : className.includes("is-button")
        ? "button"
        : "logo";

  return (
    <button
      key={key}
      type="button"
      className={`article-pool-resource-preview-card is-${type}`}
      onClick={() => onCopy(src)}
      title={alt}
    >
      <span>{label}</span>
      <div className="article-pool-resource-preview-frame">
        <img src={src} alt={alt} loading="lazy" />
      </div>
    </button>
  );
}

export default function DevelopmentContentModal({ item, busy, onSubmit, onClose, readOnly = false }) {
  const { copy } = useDevelopmentUiCopy();
  const pageLinks = getPageLinks(item, copy);
  const [form, setForm] = useState({
    title: item?.content?.title || "",
    description: item?.content?.description || "",
    article: item?.content?.article || "",
    note: item?.content?.note || "",
    logos: (item?.resources?.logos || []).join("\n"),
    gifs: (item?.resources?.gifs || []).join("\n"),
    heroImage: item?.resources?.heroImage || "",
    favicon: item?.resources?.favicon || "",
  });
  const [localError, setLocalError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setForm({
      title: item?.content?.title || "",
      description: item?.content?.description || "",
      article: item?.content?.article || "",
      note: item?.content?.note || "",
      logos: (item?.resources?.logos || []).join("\n"),
      gifs: (item?.resources?.gifs || []).join("\n"),
      heroImage: item?.resources?.heroImage || "",
      favicon: item?.resources?.favicon || "",
    });
  }, [item]);

  const currentResources = {
    logos: splitLines(form.logos),
    gifs: splitLines(form.gifs),
    heroImage: form.heroImage.trim(),
    favicon: form.favicon.trim(),
  };

  const handleChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (readOnly) {
      onClose();
      return;
    }

    try {
      setLocalError("");
      await onSubmit({
        content: {
          title: form.title,
          description: form.description,
          article: normalizeEditorValue(form.article),
          note: form.note,
        },
        resources: currentResources,
      });
    } catch (error) {
      setLocalError(error.response?.data?.message || copy.contentModal.saveError);
    }
  };

  const handleCopy = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      setNotice(copy.contentModal.copyImageSuccess);
    } catch {
      setLocalError(copy.contentModal.copyImageError);
    }
  };

  const handleCopyText = async (value, label) => {
    const text = String(value || "").trim();

    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setNotice(copy.contentModal.copied(label));
    } catch {
      setLocalError(copy.contentModal.copyTextError(label));
    }
  };

  return (
    <form className="app-panel management-form" onSubmit={handleSubmit}>
      <div className="management-section-header">
        <div>
          <h2>{readOnly ? copy.contentModal.previewTitle : copy.contentModal.editTitle}</h2>
          <p>{item?.brandName} | {item?.domain}</p>
        </div>
        <button type="button" className="management-button-secondary" onClick={onClose}>
          {copy.contentModal.close}
        </button>
      </div>

      <ToastNotice message={localError} onClose={() => setLocalError("")} />
      <ToastNotice message={notice} onClose={() => setNotice("")} tone="success" duration={2500} />

      <div className="management-fields">
        {readOnly && pageLinks.length ? (
          <div className="management-field">
            <label>{copy.contentModal.pages}</label>
            <div className="development-preview-link-list">
              {pageLinks.map((link) => (
                <button
                  key={link.key}
                  type="button"
                  className="development-preview-text development-preview-copy development-preview-link-button"
                  onClick={() => handleCopyText(link.href, link.title)}
                  title={link.href ? copy.contentModal.clickToCopy(link.title) : undefined}
                  disabled={!link.href}
                >
                  <span className="development-preview-link-label">{link.label}</span>
                  <span className="development-preview-link-separator"> - </span>
                  <span className="development-preview-link-value">{link.href || "-"}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="management-field">
          <label htmlFor="development-content-title">{copy.contentModal.title}</label>
          {readOnly ? (
            <button
              type="button"
              className="development-preview-text development-preview-copy"
              onClick={() => handleCopyText(form.title, copy.contentModal.title)}
              title={form.title ? copy.contentModal.clickToCopy(copy.contentModal.title) : undefined}
              disabled={!form.title}
            >
              {form.title || "-"}
            </button>
          ) : (
            <input
              id="development-content-title"
              value={form.title}
              onChange={(event) => handleChange("title", event.target.value)}
              disabled={busy || readOnly}
            />
          )}
        </div>
        <div className="management-field">
          <label htmlFor="development-content-description">{copy.contentModal.description}</label>
          {readOnly ? (
            <button
              type="button"
              className="development-preview-text development-preview-copy"
              onClick={() => handleCopyText(form.description, copy.contentModal.description)}
              title={form.description ? copy.contentModal.clickToCopy(copy.contentModal.description) : undefined}
              disabled={!form.description}
            >
              {form.description || "-"}
            </button>
          ) : (
            <textarea
              id="development-content-description"
              value={form.description}
              onChange={(event) => handleChange("description", event.target.value)}
              disabled={busy || readOnly}
            />
          )}
        </div>
        <div className="management-field">
          <label htmlFor="development-content-article">{copy.contentModal.article}</label>
          {readOnly ? (
            form.article ? (
              <div className="development-preview-text development-preview-text-block development-preview-html">
                <span dangerouslySetInnerHTML={{ __html: form.article }} />
              </div>
            ) : (
              <div className="development-preview-text development-preview-text-block">-</div>
            )
          ) : (
            <ReactQuill
              theme="snow"
              value={form.article}
              onChange={(value) => handleChange("article", value)}
              modules={articleEditorModules}
              formats={articleEditorFormats}
              readOnly={busy || readOnly}
              placeholder={copy.contentModal.articlePlaceholder}
            />
          )}
        </div>
        <div className="management-field development-note-field">
          <label htmlFor="development-content-note">{copy.contentModal.note}</label>
          {readOnly ? (
            <div className="development-preview-text development-preview-text-block">{form.note || "-"}</div>
          ) : (
            <textarea
              id="development-content-note"
              className="development-content-editor development-content-note"
              value={form.note}
              onChange={(event) => handleChange("note", event.target.value)}
              placeholder={copy.contentModal.notePlaceholder}
              disabled={busy || readOnly}
            />
          )}
        </div>

        {readOnly ? (
          <div className="management-field">
            <label>{copy.contentModal.resources}</label>
            <div className="article-pool-resource-preview-grid development-content-resource-preview-grid">
              {currentResources.logos.map((logo, index) =>
                renderPreviewImage(
                  copy.contentModal.logo,
                  logo,
                  copy.contentModal.clickToCopy(copy.contentModal.logo),
                  "development-preview-image is-logo",
                  `logo-${index}`,
                  handleCopy
                )
              )}
              {renderPreviewImage(copy.contentModal.banner, currentResources.heroImage, copy.contentModal.clickToCopy(copy.contentModal.banner), "development-preview-image is-banner", "banner", handleCopy)}
              {renderPreviewImage(copy.contentModal.favicon, currentResources.favicon, copy.contentModal.clickToCopy(copy.contentModal.favicon), "development-preview-image is-favicon", "favicon", handleCopy)}
              {currentResources.gifs.map((gif, index) =>
                renderPreviewImage(
                  copy.contentModal.button,
                  gif,
                  copy.contentModal.clickToCopy(copy.contentModal.button),
                  "development-preview-image is-button",
                  `button-${index}`,
                  handleCopy
                )
              )}
            </div>
            {!currentResources.logos.length && !currentResources.heroImage && !currentResources.favicon && !currentResources.gifs.length ? (
              <div className="article-pool-resource-preview-empty">{copy.contentModal.noResourceImages}</div>
            ) : null}
          </div>
        ) : (
          <div className="development-resource-editor-list">
            {renderEditableResource(copy.contentModal.logo, form.logos, (value) => handleChange("logos", value), copy.contentModal.resourcePlaceholder)}
            {renderEditableResource(copy.contentModal.banner, form.heroImage, (value) => handleChange("heroImage", value), copy.contentModal.resourcePlaceholder)}
            {renderEditableResource(copy.contentModal.favicon, form.favicon, (value) => handleChange("favicon", value), copy.contentModal.resourcePlaceholder)}
            {renderEditableResource(copy.contentModal.button, form.gifs, (value) => handleChange("gifs", value), copy.contentModal.resourcePlaceholder)}
          </div>
        )}
      </div>

      {!readOnly ? (
        <div className="management-actions">
          <button type="submit" className="management-button" disabled={busy}>
            {busy ? copy.common.saving : copy.contentModal.saveContent}
          </button>
          <button type="button" className="management-button-secondary" onClick={onClose} disabled={busy}>
            {copy.contentModal.cancel}
          </button>
        </div>
      ) : null}
    </form>
  );
}
