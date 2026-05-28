import React from "react";

export default function CuttlyScheduleModal({
  open,
  scheduleForm,
  setScheduleForm,
  status,
  saving,
  nextRunLabel,
  getScheduleLabel,
  formatDateTime,
  onClose,
  onSaveSchedule,
  onToggleSchedule,
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
      <div
        className="app-panel management-modal cuttly-link-checker-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cuttly-schedule-modal-title"
      >
        <div className="cuttly-link-checker-modal-header">
          <div>
            <span className={scheduleForm.enabled ? "management-badge is-active" : "management-badge"}>
              {scheduleForm.enabled ? "Scheduled" : "Stopped"}
            </span>
            <h2 id="cuttly-schedule-modal-title">Auto Schedule</h2>
            <p>Check active short links, send Telegram summary for unavailable or error results, then wait.</p>
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

        <div className="cuttly-link-checker-field-grid">
          <label className="management-field" htmlFor="cuttly-delay">
            <span>Delay Minutes</span>
            <input
              id="cuttly-delay"
              type="number"
              min="1"
              max="1440"
              value={scheduleForm.delayMinutes}
              onChange={(event) =>
                setScheduleForm((current) => ({ ...current, delayMinutes: Number(event.target.value) }))
              }
            />
          </label>
          <label className="management-field" htmlFor="cuttly-parallel">
            <span>Parallel Checks</span>
            <input
              id="cuttly-parallel"
              type="number"
              min="1"
              max="5"
              value={scheduleForm.parallelChecks}
              onChange={(event) =>
                setScheduleForm((current) => ({ ...current, parallelChecks: Number(event.target.value) }))
              }
            />
          </label>
        </div>

        <div className="cuttly-link-checker-schedule-status">
          <span>Current status: {getScheduleLabel(status)}</span>
          <span>Next check: {nextRunLabel}</span>
          <span>Last finished: {formatDateTime(scheduleForm.lastFinishedAt)}</span>
        </div>

        {scheduleForm.lastError ? <p className="management-error">Last issue: {scheduleForm.lastError}</p> : null}

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
            type="button"
            className="management-button-secondary"
            disabled={saving}
            onClick={() => void onSaveSchedule()}
          >
            {saving ? "Saving..." : "Save Schedule"}
          </button>
          {scheduleForm.enabled ? (
            <button
              type="button"
              className="management-button-secondary is-danger"
              disabled={saving}
              onClick={() => void onToggleSchedule(false)}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="management-button"
              disabled={saving || status.running}
              onClick={() => void onToggleSchedule(true)}
            >
              Start
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
