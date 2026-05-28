import React from "react";
import { getScanModeOptions } from "../utils/shortLinkCheckerUi";

export default function ShortLinkScheduleModal({
  copy,
  schedule,
  status,
  busy,
  scheduleScanLabel,
  scheduleProgressLabel,
  nextCheckCountdownLabel,
  nextCheckAtLabel,
  onClose,
  onScheduleChange,
  onSave,
  onToggle,
}) {
  const isStopping = Boolean(status?.running && status?.currentBatch?.status === "stopping");
  const scanModeOptions = getScanModeOptions(copy);

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="management-modal-backdrop is-centered" role="presentation" onMouseDown={handleBackdropMouseDown}>
      <div
        className="app-panel management-modal short-link-checker-schedule-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="short-link-schedule-title"
      >
        <div className="short-link-checker-modal-header">
          <div>
            <span className={schedule.enabled ? "management-badge is-active" : "management-badge"}>
              {isStopping ? copy.scheduleModal.stopping : schedule.enabled ? copy.scheduleModal.scheduled : copy.scheduleModal.stopped}
            </span>
            <h2 id="short-link-schedule-title">{copy.scheduleModal.title}</h2>
            <p>{copy.scheduleModal.description}</p>
          </div>
          <button type="button" className="management-button-secondary" onClick={onClose}>
            {copy.common.close}
          </button>
        </div>

        <form className="short-link-checker-modal-form" onSubmit={(event) => event.preventDefault()}>
          <div className="short-link-checker-field-grid">
            <label className="management-field" htmlFor="short-link-schedule-delay">
              <span>{copy.scheduleModal.delayMinutes}</span>
              <input
                id="short-link-schedule-delay"
                type="number"
                min="1"
                max="1440"
                value={schedule.delayMinutes || 60}
                onChange={(event) => onScheduleChange({ delayMinutes: Number(event.target.value) })}
                disabled={busy}
              />
            </label>

            <label className="management-field" htmlFor="short-link-schedule-parallel">
              <span>{copy.scheduleModal.parallelChecks}</span>
              <input
                id="short-link-schedule-parallel"
                type="number"
                min="1"
                max="5"
                value={schedule.parallelChecks || 2}
                onChange={(event) => onScheduleChange({ parallelChecks: Number(event.target.value) })}
                disabled={busy}
              />
            </label>

            <label className="management-field" htmlFor="short-link-schedule-mode">
              <span>{copy.common.scanMode}</span>
              <select
                id="short-link-schedule-mode"
                value={schedule.scanMode || "capture"}
                onChange={(event) => onScheduleChange({ scanMode: event.target.value })}
                disabled={busy}
              >
                {scanModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="short-link-checker-schedule-inline-status">
            <div>
              <span>{copy.scheduleModal.status}</span>
              <strong>{scheduleScanLabel}</strong>
            </div>
            <div>
              <span>{copy.scheduleModal.progress}</span>
              <strong>{scheduleProgressLabel}</strong>
            </div>
            <div>
              <span>{copy.scheduleModal.nextCheck}</span>
              <strong>{nextCheckCountdownLabel}</strong>
              <small>{nextCheckAtLabel}</small>
            </div>
          </div>

          {status?.schedule?.lastError ? (
            <p className="management-error short-link-checker-schedule-error">
              {copy.scheduleModal.lastIssue}: {status.schedule.lastError}
            </p>
          ) : null}

          <div className="short-link-checker-modal-actions">
            <button type="button" className="management-button-secondary" disabled={busy} onClick={onSave}>
              {busy ? copy.common.saving : copy.scheduleModal.saveSettings}
            </button>
            {schedule.enabled ? (
              <button
                type="button"
                className="management-button-secondary is-danger"
                disabled={busy}
                onClick={() => onToggle(false)}
              >
                {copy.scheduleModal.stopSchedule}
              </button>
            ) : (
              <button
                type="button"
                className="management-button"
                disabled={busy || status?.running}
                onClick={() => onToggle(true)}
                title={status?.running ? copy.scheduleModal.startScheduleTitle : ""}
              >
                {busy ? copy.common.saving : isStopping ? copy.scheduleModal.stopping : copy.scheduleModal.startSchedule}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
