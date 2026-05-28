import React from "react";

export default function CuttlyTelegramModal({
  open,
  telegramForm,
  setTelegramForm,
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
        aria-labelledby="cuttly-telegram-modal-title"
        onSubmit={onSubmit}
      >
        <div className="cuttly-link-checker-modal-header">
          <div>
            <span className={telegramForm.enabled ? "management-badge is-active" : "management-badge"}>
              {telegramForm.enabled ? "Telegram on" : "Telegram off"}
            </span>
            <h2 id="cuttly-telegram-modal-title">Telegram Alerts</h2>
            <p>Dedicated bot for scheduled Cutt.ly stats errors and unavailable-link summaries.</p>
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

        <label className="cuttly-link-checker-toggle cuttly-link-checker-modal-toggle">
          <input
            type="checkbox"
            checked={Boolean(telegramForm.enabled)}
            onChange={(event) => setTelegramForm((current) => ({ ...current, enabled: event.target.checked }))}
          />
          Enable scheduled alerts
        </label>

        <div className="cuttly-link-checker-field-grid">
          <label className="management-field" htmlFor="cuttly-telegram-chat">
            <span>Chat or Group ID</span>
            <input
              id="cuttly-telegram-chat"
              value={telegramForm.chatId || ""}
              onChange={(event) => setTelegramForm((current) => ({ ...current, chatId: event.target.value }))}
              placeholder="-1001234567890"
            />
          </label>
          <label className="management-field" htmlFor="cuttly-telegram-token">
            <span>Bot Token</span>
            <input
              id="cuttly-telegram-token"
              type="password"
              value={telegramForm.botToken || ""}
              onChange={(event) => setTelegramForm((current) => ({ ...current, botToken: event.target.value }))}
              placeholder={telegramForm.hasBotToken ? "Leave blank to keep saved token" : "Enter bot token"}
              autoComplete="off"
            />
          </label>
        </div>

        <small className="cuttly-link-checker-modal-note">
          Sent {telegramForm.sentCount || 0}, failed {telegramForm.failedCount || 0}. Last sent:{" "}
          {formatDateTime(telegramForm.lastSentAt)}
        </small>
        {telegramForm.lastError ? <p className="management-error">{telegramForm.lastError}</p> : null}

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
            {saving ? "Saving..." : "Save Telegram"}
          </button>
        </div>
      </form>
    </div>
  );
}
