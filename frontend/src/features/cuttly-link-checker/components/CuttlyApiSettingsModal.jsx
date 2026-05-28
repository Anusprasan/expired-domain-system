import React from "react";

export default function CuttlyApiSettingsModal({
  open,
  settings,
  apiKey,
  setApiKey,
  saving,
  onClose,
  onSubmit,
  formatDateTime,
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
        className="app-panel management-modal cuttly-link-checker-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cuttly-api-modal-title"
        onSubmit={onSubmit}
      >
        <div className="cuttly-link-checker-modal-header">
          <div>
            <span className={settings.hasApiKey ? "management-badge is-active" : "management-badge"}>
              {settings.hasApiKey ? "API key saved" : "API key needed"}
            </span>
            <h2 id="cuttly-api-modal-title">Cutt.ly API Settings</h2>
            <p>Used for manual checks and scheduled Cutt.ly validation.</p>
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

        <label className="management-field" htmlFor="cuttly-api-key">
          <span>API Key</span>
          <input
            id="cuttly-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={settings.hasApiKey ? "Leave blank to keep saved key" : "Enter Cutt.ly API key"}
            autoComplete="off"
            autoFocus
          />
        </label>

        <small className="cuttly-link-checker-modal-note">Last saved: {formatDateTime(settings.apiKeyUpdatedAt)}</small>

        <div className="cuttly-link-checker-modal-actions">
          <button
            type="button"
            className="management-button-secondary"
            onClick={closeWhenReady}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="management-button"
            disabled={saving || (!apiKey && !settings.hasApiKey)}
          >
            {saving ? "Saving..." : "Save API Key"}
          </button>
        </div>
      </form>
    </div>
  );
}
