import React from "react";

export default function CuttlyLinkEntryModal({
  open,
  form,
  setForm,
  saving,
  onClose,
  onSubmit,
}) {
  if (!open) {
    return null;
  }

  const closeWhenReady = () => {
    if (!saving) {
      onClose();
    }
  };

  return (
    <div
      className="management-modal-backdrop is-centered"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeWhenReady();
        }
      }}
    >
      <form
        className="app-panel management-modal cuttly-link-checker-settings-modal cuttly-link-checker-link-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cuttly-link-modal-title"
        onSubmit={onSubmit}
      >
        <div className="cuttly-link-checker-modal-header">
          <div>
            <span className="management-badge">{form.id ? "Editing" : "New URL"}</span>
            <h2 id="cuttly-link-modal-title">{form.id ? "Edit Cutt.ly URL" : "Add Cutt.ly URL"}</h2>
            <p>The short link is sent to the Cutt.ly stats API to read the original URL and status.</p>
          </div>
          <button
            type="button"
            className="management-button-secondary"
            onClick={closeWhenReady}
            disabled={saving}
          >
            Close
          </button>
        </div>

        <div className="cuttly-link-checker-form-grid">
          <label className="management-field" htmlFor="cuttly-title">
            <span>Title</span>
            <input
              id="cuttly-title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Optional label"
            />
          </label>
          <label className="management-field" htmlFor="cuttly-url">
            <span>Cutt.ly Short Link</span>
            <input
              id="cuttly-url"
              value={form.targetUrl}
              onChange={(event) => setForm((current) => ({ ...current, targetUrl: event.target.value }))}
              placeholder="https://cutt.ly/example"
              required
              autoFocus
            />
          </label>
        </div>

        <div className="cuttly-link-checker-link-options">
          <label className="cuttly-link-checker-toggle">
            <input
              type="checkbox"
              checked={Boolean(form.isActive)}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Active
          </label>
        </div>

        <div className="cuttly-link-checker-modal-actions">
          <button
            type="button"
            className="management-button-secondary"
            onClick={closeWhenReady}
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className="management-button" disabled={saving}>
            {saving ? "Saving..." : form.id ? "Save URL" : "Add URL"}
          </button>
        </div>
      </form>
    </div>
  );
}
