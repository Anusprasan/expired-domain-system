import React from "react";

export default function ConfirmActionModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busyLabel = "Working...",
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <section className="app-panel management-form">
      <h2>{title}</h2>
      <p>{message}</p>

      <div className="management-actions">
        <button type="button" className="management-button" onClick={onConfirm} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
      </div>
    </section>
  );
}
