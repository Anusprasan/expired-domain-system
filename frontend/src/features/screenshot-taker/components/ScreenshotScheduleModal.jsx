import React from "react";

export default function ScreenshotScheduleModal({
  copy,
  schedule,
  scheduleBusy,
  scheduleIsActive,
  scheduleScanLabel,
  scheduleProgressLabel,
  nextScanCountdownLabel,
  nextScanAtLabel,
  canManageTelegramBot,
  lastError,
  onClose,
  onDelayMinutesChange,
  onParallelCapturesChange,
  onTelegramChange,
  onScheduleSettingsSave,
  onScheduleToggle,
}) {
  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };
  const telegram = schedule.telegram || {};
  const telegramStatusText = telegram.enabled
    ? telegram.hasBotToken
      ? copy.scheduleModal.telegramEnabled
      : copy.scheduleModal.telegramNeedsToken
    : copy.scheduleModal.telegramDisabled;

  return (
    <div
      className="management-modal-backdrop is-centered"
      role="presentation"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="app-panel management-modal screenshot-taker-schedule-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-taker-schedule-title"
      >
        <div className="screenshot-taker-modal-header">
          <div>
            <span className={`management-badge${scheduleIsActive ? " is-active" : ""}`}>
              {scheduleIsActive ? copy.scheduleModal.scheduled : copy.scheduleModal.stopped}
            </span>
            <h2 id="screenshot-taker-schedule-title">{copy.scheduleModal.title}</h2>
            <p>{copy.scheduleModal.description}</p>
          </div>

          <button type="button" className="management-button-secondary" onClick={onClose}>
            {copy.common.close}
          </button>
        </div>

        <form
          className="screenshot-taker-schedule-simple"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <label className="management-field screenshot-taker-delay-field" htmlFor="screenshot-taker-schedule-delay">
            <span>{copy.scheduleModal.delayMinutes}</span>
            <input
              id="screenshot-taker-schedule-delay"
              type="number"
              min="1"
              max="1440"
              value={schedule.delayMinutes || 60}
              onChange={(event) => onDelayMinutesChange(Number(event.target.value))}
              disabled={scheduleBusy}
            />
          </label>

          <label className="management-field screenshot-taker-delay-field" htmlFor="screenshot-taker-parallel-captures">
            <span>{copy.scheduleModal.parallelCaptures}</span>
            <input
              id="screenshot-taker-parallel-captures"
              type="number"
              min="1"
              max="100"
              value={schedule.parallelCaptures || 2}
              onChange={(event) => onParallelCapturesChange(Number(event.target.value))}
              disabled={scheduleBusy}
            />
            <small>{copy.scheduleModal.parallelHelp}</small>
          </label>

          {canManageTelegramBot ? (
            <div className="screenshot-taker-telegram-config">
              <label className="management-checkbox screenshot-taker-telegram-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(telegram.enabled)}
                  onChange={(event) => onTelegramChange({ enabled: event.target.checked })}
                  disabled={scheduleBusy}
                />
                <span className="management-checkbox-copy">
                  <strong>{copy.scheduleModal.sendToTelegram}</strong>
                  <small>{copy.scheduleModal.sendToTelegramHelp}</small>
                </span>
              </label>

              <div className="screenshot-taker-telegram-fields">
                <label className="management-field" htmlFor="screenshot-taker-telegram-chat-id">
                  <span>{copy.scheduleModal.chatId}</span>
                  <input
                    id="screenshot-taker-telegram-chat-id"
                    value={telegram.chatId || ""}
                    onChange={(event) => onTelegramChange({ chatId: event.target.value })}
                    placeholder="-1001234567890"
                    disabled={scheduleBusy}
                  />
                </label>

                <label className="management-field" htmlFor="screenshot-taker-telegram-bot-token">
                  <span>{copy.scheduleModal.botToken}</span>
                  <input
                    id="screenshot-taker-telegram-bot-token"
                    type="password"
                    value={telegram.botToken || ""}
                    onChange={(event) => onTelegramChange({ botToken: event.target.value })}
                    placeholder={telegram.hasBotToken ? copy.scheduleModal.savedTokenPlaceholder : copy.scheduleModal.tokenPlaceholder}
                    disabled={scheduleBusy}
                    autoComplete="off"
                  />
                </label>
              </div>

              <div className="screenshot-taker-telegram-status">
                <span>{telegramStatusText}</span>
                {telegram.sentCount || telegram.failedCount ? (
                  <small>
                    {copy.scheduleModal.sentFailed(telegram.sentCount, telegram.failedCount)}
                  </small>
                ) : null}
                {telegram.lastError ? <small className="management-error">{copy.scheduleModal.lastTelegramIssue(telegram.lastError)}</small> : null}
              </div>
            </div>
          ) : null}

          <div className="screenshot-taker-schedule-inline-status">
            <div>
              <span>{copy.scheduleModal.status}</span>
              <strong>{scheduleScanLabel}</strong>
            </div>
            <div>
              <span>{copy.scheduleModal.progress}</span>
              <strong>{scheduleProgressLabel}</strong>
            </div>
            <div>
              <span>{copy.scheduleModal.nextScan}</span>
              <strong>{nextScanCountdownLabel}</strong>
              <small>{nextScanAtLabel}</small>
            </div>
          </div>

          <div className="screenshot-taker-schedule-actions">
            <button
              type="button"
              className="management-button-secondary"
              disabled={scheduleBusy}
              onClick={onScheduleSettingsSave}
            >
              {scheduleBusy ? copy.common.saving : copy.scheduleModal.saveSettings}
            </button>
            {scheduleIsActive ? (
              <button
                type="button"
                className="management-button-secondary is-danger"
                disabled={scheduleBusy}
                onClick={() => onScheduleToggle(false)}
              >
                {copy.scheduleModal.stopSchedule}
              </button>
            ) : (
              <button
                type="button"
                className="management-button"
                disabled={scheduleBusy}
                onClick={() => onScheduleToggle(true)}
              >
                {scheduleBusy ? copy.common.saving : copy.scheduleModal.startSchedule}
              </button>
            )}
          </div>
        </form>

        {lastError ? <p className="management-error screenshot-taker-schedule-error">{copy.scheduleModal.lastIssue(lastError)}</p> : null}
      </div>
    </div>
  );
}
