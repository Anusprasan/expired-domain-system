import React, { useMemo, useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useArticlePoolUiCopy } from "../hooks/useArticlePoolUiCopy";

const editorModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline"],
    ["link", "image"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["clean"],
  ],
};

const editorFormats = [
  "header",
  "bold",
  "italic",
  "underline",
  "link",
  "image",
  "list",
  "bullet",
];

function normalizeEditorValue(value) {
  const html = String(value || "").trim();
  const text = html.replace(/<(.|\n)*?>/g, "").replace(/&nbsp;/g, " ").trim();

  return text ? html : "";
}

function getPlainText(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(.|\n)*?>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function getWordCount(value) {
  const text = getPlainText(value);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderResourcePreview(label, src, type, key, title) {
  if (!src) {
    return null;
  }

  return (
    <a
      key={key}
      className={`article-pool-resource-preview-card is-${type}`}
      href={src}
      target="_blank"
      rel="noreferrer"
      title={title}
    >
      <span>{label}</span>
      <div className="article-pool-resource-preview-frame">
        <img src={src} alt={label} loading="lazy" />
      </div>
    </a>
  );
}

export default function ContentPoolForm({
  brands,
  busy,
  article,
  canDelete = false,
  onSubmit,
  onDelete,
  onCancel,
  heading,
  description,
  brandDisabled = false,
}) {
  const { copy } = useArticlePoolUiCopy();
  const [form, setForm] = useState({
    brandName: article?.brandName || "",
    title: article?.content?.title || article?.topic || "",
    description: article?.content?.summary || "",
    articleBody: article?.content?.body || "",
    note: article?.content?.note || "",
    logos: (article?.resources?.logos || []).join("\n"),
    heroImage: article?.resources?.heroImage || "",
    favicon: article?.resources?.favicon || "",
    buttons: (article?.resources?.gifs || []).join("\n"),
  });
  const [localError, setLocalError] = useState("");
  const articleWordCount = getWordCount(form.articleBody);
  const currentResources = {
    logos: splitLines(form.logos),
    heroImage: form.heroImage.trim(),
    favicon: form.favicon.trim(),
    buttons: splitLines(form.buttons),
  };
  const hasResourcePreview =
    currentResources.logos.length > 0 ||
    currentResources.heroImage ||
    currentResources.favicon ||
    currentResources.buttons.length > 0;

  const brandOptions = useMemo(
    () => [...brands].sort((left, right) => left.brandName.localeCompare(right.brandName)),
    [brands]
  );

  const handleChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.brandName) {
      setLocalError(copy.form.validation.selectBrand);
      return;
    }

    if (!form.title.trim()) {
      setLocalError(copy.form.validation.titleRequired);
      return;
    }

    if (!form.description.trim()) {
      setLocalError(copy.form.validation.descriptionRequired);
      return;
    }

    const articleBody = normalizeEditorValue(form.articleBody);

    if (!articleBody) {
      setLocalError(copy.form.validation.bodyRequired);
      return;
    }

    try {
      setLocalError("");
      await onSubmit({
        brandName: form.brandName,
        topic: form.title.trim(),
        content: {
          title: form.title.trim(),
          summary: form.description.trim(),
          body: articleBody,
          note: form.note.trim(),
        },
        resources: {
          logos: splitLines(form.logos),
          heroImage: form.heroImage.trim(),
          favicon: form.favicon.trim(),
          gifs: splitLines(form.buttons),
        },
      });
    } catch (error) {
      setLocalError(error.response?.data?.message || copy.form.saveError);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    const confirmed = window.confirm(copy.form.deleteConfirm);
    if (!confirmed) {
      return;
    }

    try {
      setLocalError("");
      await onDelete();
    } catch (error) {
      setLocalError(error.response?.data?.message || copy.form.deleteError);
    }
  };

  return (
    <form className="app-panel management-form" onSubmit={handleSubmit}>
      <div className="management-section-header">
        <div>
          <h2>{heading || (article ? copy.form.updateTitle : copy.form.createTitle)}</h2>
          <p>{description || copy.form.description}</p>
        </div>
      </div>

      <ToastNotice message={localError} onClose={() => setLocalError("")} />

      <div className="management-fields">
        <div className="management-field">
          <label htmlFor="article-pool-brand">{copy.form.brand}</label>
          <select
            id="article-pool-brand"
            value={form.brandName}
            onChange={(event) => handleChange("brandName", event.target.value)}
            disabled={busy || brandDisabled}
          >
            <option value="">{copy.form.selectBrand}</option>
            {brandOptions.map((brand) => (
              <option key={brand._id} value={brand.brandName}>
                {brand.brandName}
              </option>
            ))}
          </select>
        </div>

        <div className="management-field">
          <label htmlFor="article-pool-title">{copy.form.title}</label>
          <input
            id="article-pool-title"
            value={form.title}
            onChange={(event) => handleChange("title", event.target.value)}
            placeholder={copy.form.titlePlaceholder}
            disabled={busy}
          />
        </div>

        <div className="management-field">
          <label htmlFor="article-pool-description">{copy.form.descriptionLabel}</label>
          <textarea
            id="article-pool-description"
            value={form.description}
            onChange={(event) => handleChange("description", event.target.value)}
            placeholder={copy.form.descriptionPlaceholder}
            disabled={busy}
          />
        </div>

        <div className="management-field article-pool-article-editor-field">
          <div className="article-pool-field-label-row">
            <label htmlFor="article-pool-article-body">{copy.form.content}</label>
            <span>{copy.common.words(articleWordCount)}</span>
          </div>
          <ReactQuill
            id="article-pool-article-body"
            theme="snow"
            value={form.articleBody}
            onChange={(value) => handleChange("articleBody", value)}
            modules={editorModules}
            formats={editorFormats}
            readOnly={busy}
            placeholder={copy.form.contentPlaceholder}
          />
        </div>

        <div className="management-field article-pool-note-field">
          <label htmlFor="article-pool-note">{copy.form.note}</label>
          <textarea
            id="article-pool-note"
            className="development-content-editor development-content-note"
            value={form.note}
            onChange={(event) => handleChange("note", event.target.value)}
            placeholder={copy.form.notePlaceholder}
            disabled={busy}
          />
        </div>

        <div className="article-pool-resource-section-header">
          <strong>{copy.form.resourceLinks}</strong>
          <span>{copy.form.resourceLinksDescription}</span>
        </div>

        <div className="development-resource-editor-list article-pool-resource-editor-list">
          <div className="development-resource-editor">
            <div className="development-resource-editor-input">
              <label htmlFor="article-pool-logo">{copy.form.logo}</label>
              <textarea
                id="article-pool-logo"
                className="development-resource-textarea"
                value={form.logos}
                onChange={(event) => handleChange("logos", event.target.value)}
                placeholder={copy.form.logoPlaceholder}
                disabled={busy}
              />
            </div>
          </div>

          <div className="development-resource-editor">
            <div className="development-resource-editor-input">
              <label htmlFor="article-pool-banner">{copy.form.banner}</label>
              <input
                id="article-pool-banner"
                className="development-resource-input"
                value={form.heroImage}
                onChange={(event) => handleChange("heroImage", event.target.value)}
                placeholder={copy.form.bannerPlaceholder}
                disabled={busy}
              />
            </div>
          </div>

          <div className="development-resource-editor">
            <div className="development-resource-editor-input">
              <label htmlFor="article-pool-favicon">{copy.form.favicon}</label>
              <input
                id="article-pool-favicon"
                className="development-resource-input"
                value={form.favicon}
                onChange={(event) => handleChange("favicon", event.target.value)}
                placeholder={copy.form.faviconPlaceholder}
                disabled={busy}
              />
            </div>
          </div>

          <div className="development-resource-editor">
            <div className="development-resource-editor-input">
              <label htmlFor="article-pool-button">{copy.form.button}</label>
              <textarea
                id="article-pool-button"
                className="development-resource-textarea"
                value={form.buttons}
                onChange={(event) => handleChange("buttons", event.target.value)}
                placeholder={copy.form.buttonPlaceholder}
                disabled={busy}
              />
            </div>
          </div>
        </div>

        <div className="article-pool-resource-preview-panel">
          <div className="article-pool-resource-preview-header">
            <strong>{copy.form.resourcePreview}</strong>
            <span>{copy.form.resourcePreviewDescription}</span>
          </div>
          {hasResourcePreview ? (
            <div className="article-pool-resource-preview-grid">
              {currentResources.logos.map((logo, index) =>
                renderResourcePreview(
                  `${copy.form.logo} ${index + 1}`,
                  logo,
                  "logo",
                  `logo-${index}`,
                  copy.form.openResourceImage
                )
              )}
              {renderResourcePreview(
                copy.form.banner,
                currentResources.heroImage,
                "banner",
                "banner",
                copy.form.openResourceImage
              )}
              {renderResourcePreview(
                copy.form.favicon,
                currentResources.favicon,
                "favicon",
                "favicon",
                copy.form.openResourceImage
              )}
              {currentResources.buttons.map((button, index) =>
                renderResourcePreview(
                  `${copy.form.button} ${index + 1}`,
                  button,
                  "button",
                  `button-${index}`,
                  copy.form.openResourceImage
                )
              )}
            </div>
          ) : (
            <div className="article-pool-resource-preview-empty">
              {copy.form.resourcePreviewEmpty}
            </div>
          )}
        </div>
      </div>

      <div className="management-actions">
        <button type="submit" className="management-button" disabled={busy}>
          {busy ? copy.common.saving : article ? copy.common.update : copy.common.create}
        </button>
        {canDelete ? (
          <button type="button" className="management-button-secondary is-danger" onClick={handleDelete} disabled={busy}>
            {copy.common.delete}
          </button>
        ) : null}
        <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
          {copy.common.cancel}
        </button>
      </div>
    </form>
  );
}
