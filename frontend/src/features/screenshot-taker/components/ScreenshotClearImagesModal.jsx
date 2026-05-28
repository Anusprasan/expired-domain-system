import React, { useState } from "react";

export default function ScreenshotClearImagesModal({ copy, busy, onClose, onConfirm }) {
  const [password, setPassword] = useState("");

  const handleBackdropMouseDown = (event) => {
    if (!busy && event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onConfirm(password);
  };

  return (
    <div
      className="management-modal-backdrop is-centered"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <form
        className="app-panel management-modal screenshot-taker-clear-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-taker-clear-title"
        onSubmit={handleSubmit}
      >
        <div className="screenshot-taker-modal-header">
          <div>
            <span className="management-badge is-inactive">{copy.clearModal.badge}</span>
            <h2 id="screenshot-taker-clear-title">{copy.clearModal.title}</h2>
            <p>{copy.clearModal.description}</p>
          </div>

          <button type="button" className="management-button-secondary" onClick={onClose} disabled={busy}>
            {copy.common.close}
          </button>
        </div>

        <div className="management-field">
          <label htmlFor="screenshot-taker-clear-password">{copy.clearModal.adminPassword}</label>
          <input
            id="screenshot-taker-clear-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={busy}
            placeholder={copy.clearModal.passwordPlaceholder}
          />
        </div>

        <div className="screenshot-taker-clear-actions">
          <button type="submit" className="management-button-secondary is-danger" disabled={busy || !password}>
            {busy ? copy.clearModal.clearing : copy.clearModal.confirm}
          </button>
        </div>
      </form>
    </div>
  );
}
