import React from "react";
import {
  DEFAULT_ALERT_STATUS_CODES,
  formatDateTime,
  getAlertStatusOptions,
  getAlertStatusLabel,
  normalizeCustomAlertStatusCodes,
  normalizeStatusCodes,
} from "../utils/shortLinkCheckerUi";

export default function ShortLinkTelegramModal({
  copy,
  language,
  telegram,
  telegramForm,
  saving,
  onClose,
  onTelegramChange,
  onSubmit,
}) {
  const [customStatusCode, setCustomStatusCode] = React.useState("");
  const [customStatusName, setCustomStatusName] = React.useState("");
  const [customStatusError, setCustomStatusError] = React.useState("");
  const alertStatusOptions = getAlertStatusOptions(copy);
  const selectedStatusCodes = new Set(normalizeStatusCodes(telegramForm.alertStatusCodes));
  const customStatusCodes = normalizeCustomAlertStatusCodes(telegramForm.customAlertStatusCodes);
  const optionCodeSet = new Set(alertStatusOptions.map((item) => item.code));
  const customSelectedCodes = [...selectedStatusCodes].filter(
    (code) => !optionCodeSet.has(code) || customStatusCodes.some((item) => item.code === code)
  );
  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const getSortedCodes = (codes) => [...codes].sort((left, right) => left - right);

  const getNextCustomStatusCodes = (codes, nextCustomStatusCodes = customStatusCodes) => {
    const codeSet = new Set(codes);

    return nextCustomStatusCodes.filter((item) => codeSet.has(item.code));
  };

  const toggleStatusCode = (code) => {
    const nextCodes = new Set(selectedStatusCodes);

    if (nextCodes.has(code)) {
      nextCodes.delete(code);
    } else {
      nextCodes.add(code);
    }

    onTelegramChange({
      alertStatusCodes: getSortedCodes(nextCodes),
      customAlertStatusCodes: getNextCustomStatusCodes(nextCodes),
    });
  };

  const addCustomStatusCode = () => {
    const rawCode = String(customStatusCode || "").trim();
    const name = String(customStatusName || "").trim().replace(/\s+/g, " ").slice(0, 40);

    if (!rawCode) {
      setCustomStatusError(copy.telegramModal.validation.codeRequired);
      return;
    }

    if (!name) {
      setCustomStatusError(copy.telegramModal.validation.nameRequired);
      return;
    }

    const parsedCode = Number(rawCode);

    if (!Number.isInteger(parsedCode) || parsedCode < 0 || parsedCode > 599) {
      setCustomStatusError(copy.telegramModal.validation.invalidCode);
      return;
    }

    const nextCodes = new Set(selectedStatusCodes);
    const nextCustomStatusCodes = new Map(customStatusCodes.map((item) => [item.code, item]));

    nextCodes.add(parsedCode);
    nextCustomStatusCodes.set(parsedCode, { code: parsedCode, name });
    onTelegramChange({
      alertStatusCodes: getSortedCodes(nextCodes),
      customAlertStatusCodes: getNextCustomStatusCodes(nextCodes, [...nextCustomStatusCodes.values()]),
    });
    setCustomStatusCode("");
    setCustomStatusName("");
    setCustomStatusError("");
  };

  return (
    <div className="management-modal-backdrop is-centered" role="presentation" onMouseDown={handleBackdropMouseDown}>
      <div
        className="app-panel management-modal short-link-checker-telegram-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="short-link-telegram-title"
      >
        <div className="short-link-checker-modal-header">
          <div>
            <span className={telegram.enabled ? "management-badge is-active" : "management-badge"}>{copy.telegramModal.badge}</span>
            <h2 id="short-link-telegram-title">{copy.telegramModal.title}</h2>
            <p>{copy.telegramModal.description}</p>
          </div>
          <button type="button" className="management-button-secondary" onClick={onClose}>
            {copy.common.close}
          </button>
        </div>

        <form className="short-link-checker-modal-form" onSubmit={onSubmit}>
          <label className="management-checkbox">
            <input
              type="checkbox"
              checked={telegramForm.enabled}
              onChange={(event) => onTelegramChange({ enabled: event.target.checked })}
            />
            <span className="management-checkbox-copy">
              <strong>{copy.telegramModal.enableAlerts}</strong>
              <small className="management-checkbox-meta">{copy.telegramModal.enableAlertsHelp}</small>
            </span>
          </label>

          <div className="short-link-checker-alert-rules">
            <label className="management-checkbox">
              <input
                type="checkbox"
                checked={Boolean(telegramForm.notifyCloudflareVerification)}
                onChange={(event) => onTelegramChange({ notifyCloudflareVerification: event.target.checked })}
              />
              <span className="management-checkbox-copy">
                <strong>{copy.telegramModal.sendCloudflareCaptures}</strong>
                <small className="management-checkbox-meta">{copy.telegramModal.sendCloudflareCapturesHelp}</small>
              </span>
            </label>

            <label className="management-checkbox">
              <input
                type="checkbox"
                checked={Boolean(telegramForm.notifySecurityVerification)}
                onChange={(event) => onTelegramChange({ notifySecurityVerification: event.target.checked })}
              />
              <span className="management-checkbox-copy">
                <strong>{copy.telegramModal.sendSecurityCaptures}</strong>
                <small className="management-checkbox-meta">{copy.telegramModal.sendSecurityCapturesHelp}</small>
              </span>
            </label>
          </div>

          <div className="short-link-checker-field-grid">
            <label className="management-field" htmlFor="short-link-telegram-chat">
              <span>{copy.telegramModal.chatId}</span>
              <input
                id="short-link-telegram-chat"
                value={telegramForm.chatId}
                onChange={(event) => onTelegramChange({ chatId: event.target.value })}
                placeholder="-1001234567890"
              />
            </label>

            <label className="management-field" htmlFor="short-link-telegram-token">
              <span>{copy.telegramModal.botToken}</span>
              <input
                id="short-link-telegram-token"
                type="password"
                value={telegramForm.botToken}
                onChange={(event) => onTelegramChange({ botToken: event.target.value })}
                placeholder={telegram.hasBotToken ? copy.telegramModal.savedTokenPlaceholder : copy.telegramModal.tokenPlaceholder}
                autoComplete="off"
              />
            </label>
          </div>

          <div className="short-link-checker-alert-codes">
            <div className="short-link-checker-alert-codes-header">
              <div>
                <strong>{copy.telegramModal.statusCodeTitle}</strong>
                <span>{copy.telegramModal.statusCodeSummary(selectedStatusCodes.size)}</span>
              </div>
              <div className="management-inline-actions">
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => onTelegramChange({
                    alertStatusCodes: DEFAULT_ALERT_STATUS_CODES,
                    customAlertStatusCodes: getNextCustomStatusCodes(DEFAULT_ALERT_STATUS_CODES),
                  })}
                >
                  {copy.telegramModal.common}
                </button>
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => {
                    const allStatusCodes = alertStatusOptions.map((item) => item.code);

                    onTelegramChange({
                      alertStatusCodes: allStatusCodes,
                      customAlertStatusCodes: getNextCustomStatusCodes(allStatusCodes),
                    });
                  }}
                >
                  {copy.telegramModal.all}
                </button>
              </div>
            </div>

            <div className="short-link-checker-alert-code-grid">
              {alertStatusOptions.map((option) => (
                <label key={option.code} className="short-link-checker-code-option">
                  <input
                    type="checkbox"
                    checked={selectedStatusCodes.has(option.code)}
                    onChange={() => toggleStatusCode(option.code)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>

            <div className="short-link-checker-custom-code-row">
              <label className="management-field" htmlFor="short-link-telegram-custom-code">
                <span>{copy.telegramModal.addCustomStatusCode}</span>
                <input
                  id="short-link-telegram-custom-code"
                  type="number"
                  min="0"
                  max="599"
                  value={customStatusCode}
                  onChange={(event) => {
                    setCustomStatusCode(event.target.value);
                    setCustomStatusError("");
                  }}
                  placeholder={copy.telegramModal.customStatusCodePlaceholder}
                />
              </label>
              <label className="management-field" htmlFor="short-link-telegram-custom-name">
                <span>{copy.telegramModal.shortName}</span>
                <input
                  id="short-link-telegram-custom-name"
                  value={customStatusName}
                  maxLength={40}
                  onChange={(event) => {
                    setCustomStatusName(event.target.value);
                    setCustomStatusError("");
                  }}
                  placeholder={copy.telegramModal.shortNamePlaceholder}
                />
              </label>
              <button
                type="button"
                className="management-button-secondary"
                onClick={addCustomStatusCode}
              >
                {copy.telegramModal.addCode}
              </button>
            </div>
            {customStatusError ? <p className="management-error">{customStatusError}</p> : null}

            {customSelectedCodes.length ? (
              <div className="short-link-checker-custom-code-list">
                {customSelectedCodes.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className="short-link-checker-custom-code-chip"
                    onClick={() => toggleStatusCode(code)}
                  >
                    <span>{getAlertStatusLabel(code, customStatusCodes, copy)}</span>
                    <small>{copy.telegramModal.remove}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="short-link-checker-telegram-stats">
            <span>{copy.telegramModal.sent(telegram.sentCount || 0)}</span>
            <span>{copy.telegramModal.failed(telegram.failedCount || 0)}</span>
            <span>{copy.telegramModal.lastSent(formatDateTime(telegram.lastSentAt, language))}</span>
            {telegram.lastError ? <span className="management-error">{telegram.lastError}</span> : null}
          </div>

          <div className="short-link-checker-modal-actions">
            <button type="submit" className="management-button" disabled={saving}>
              {saving ? copy.common.saving : copy.telegramModal.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
