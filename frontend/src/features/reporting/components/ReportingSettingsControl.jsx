import React, { useEffect, useMemo, useState } from "react";
import {
  cleanupReportingEvidenceStorageApi,
  getReportingEvidenceStorageSummaryApi,
  getReportingSettingsApi,
  updateReportingSettingsApi,
} from "../api/reportingApi";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";

function buildFormState(settings) {
  return {
    geminiApiKey: "",
    language: settings?.language || "english",
  };
}

function getStatusMeta(settings, copy) {
  const geminiReady = Boolean(settings?.gemini?.hasStoredApiKey);

  if (!geminiReady) {
    return {
      tone: "warning",
      label: copy.settings.statusGeminiNeeded,
      detail: copy.settings.statusGeminiNeededDetail,
    };
  }

  return {
    tone: "ready",
    label: copy.settings.statusAiReady,
    detail: copy.settings.statusAiReadyDetail,
  };
}

function formatBytes(value, locale, zeroLabel) {
  const size = Number(value || 0);

  if (!size) {
    return zeroLabel;
  }

  if (size < 1024) {
    return `${size.toLocaleString(locale)} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} GB`;
}

function formatShortDate(value, locale, fallback) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function downloadBlobFile(blob, filename) {
  if (typeof window === "undefined" || !(blob instanceof Blob)) {
    return;
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename || "reporting-evidence-cleanup-global.zip";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

async function getBlobErrorMessage(error, fallbackMessage) {
  const responseData = error?.response?.data;

  if (responseData instanceof Blob) {
    try {
      const text = await responseData.text();
      const parsed = JSON.parse(text);
      return parsed?.message || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }

  return error?.response?.data?.message || error?.message || fallbackMessage;
}

function StorageSummaryItem({ label, value }) {
  return (
    <div className="reporting-task-summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function ReportingSettingsControl({
  enabled,
  canEditPersonalSettings = false,
  canManageCleanup = false,
}) {
  const { copy, locale } = useReportingUiCopy();
  const todayDateInput = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(buildFormState(null));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [cleanupSummary, setCleanupSummary] = useState(null);
  const [cleanupDate, setCleanupDate] = useState("");
  const [cleanupPassword, setCleanupPassword] = useState("");
  const [cleanupConfirmation, setCleanupConfirmation] = useState("");
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupError, setCleanupError] = useState("");
  const [cleanupSuccess, setCleanupSuccess] = useState("");
  const [activeTab, setActiveTab] = useState(
    canEditPersonalSettings ? "personal" : "storage"
  );

  const loadSettings = async () => {
    if (!canEditPersonalSettings) {
      setSettings(null);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await getReportingSettingsApi();
      const loadedSettings = response.data || null;
      setSettings(loadedSettings);
      setForm(buildFormState(loadedSettings));
    } catch (err) {
      setError(err.response?.data?.message || copy.settings.loadSettingsError);
    } finally {
      setLoading(false);
    }
  };

  const loadCleanupSummary = async (selectedDate = "") => {
    if (!canManageCleanup) {
      setCleanupSummary(null);
      return;
    }

    try {
      setCleanupLoading(true);
      setCleanupError("");
      const response = await getReportingEvidenceStorageSummaryApi(
        selectedDate ? { deleteBefore: selectedDate } : {}
      );
      const summary = response.data || null;
      setCleanupSummary(summary);
      setCleanupDate((currentDate) => {
        if (currentDate) {
          return currentDate;
        }

        return (
          String(summary?.olderThanThresholdDateInput || "").trim() ||
          String(summary?.selectedDateInput || "").trim()
        );
      });
    } catch (err) {
      setCleanupError(err.response?.data?.message || copy.settings.loadStorageError);
    } finally {
      setCleanupLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) {
      setSettings(null);
      setCleanupSummary(null);
      return;
    }

    if (canEditPersonalSettings) {
      void loadSettings();
    }

    if (canManageCleanup) {
      void loadCleanupSummary("");
    }
  }, [enabled, canEditPersonalSettings, canManageCleanup]);

  useEffect(() => {
    if (canEditPersonalSettings && canManageCleanup) {
      return;
    }

    if (canEditPersonalSettings) {
      setActiveTab("personal");
      return;
    }

    if (canManageCleanup) {
      setActiveTab("storage");
    }
  }, [canEditPersonalSettings, canManageCleanup]);

  useEffect(() => {
    if (!isOpen || !canManageCleanup || !cleanupDate) {
      return;
    }

    void loadCleanupSummary(cleanupDate);
  }, [isOpen, canManageCleanup, cleanupDate]);

  const statusMeta = useMemo(() => getStatusMeta(settings, copy), [copy, settings]);
  const showSettingsTabs = canEditPersonalSettings && canManageCleanup;

  const handleChange = (field, value) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
    setError("");
    setSuccess("");
  };

  const handleOpen = async () => {
    setIsOpen(true);
    setSuccess("");
    setCleanupSuccess("");

    if (canEditPersonalSettings && !settings && !loading) {
      await loadSettings();
    }

    if (canManageCleanup && !cleanupSummary && !cleanupLoading) {
      await loadCleanupSummary(cleanupDate);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canEditPersonalSettings) {
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");
      const response = await updateReportingSettingsApi(form);
      const savedSettings = response.data || null;
      setSettings(savedSettings);
      setForm(buildFormState(savedSettings));
      setSuccess(copy.settings.saveSuccess);
    } catch (err) {
      setError(err.response?.data?.message || copy.settings.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleCleanup = async () => {
    const normalizedCleanupDate = String(cleanupDate || "").trim();
    const normalizedPassword = String(cleanupPassword || "").trim();
    const normalizedConfirmation = String(cleanupConfirmation || "").trim().toUpperCase();

    if (!normalizedCleanupDate) {
      setCleanupError(copy.settings.cleanupDateRequired);
      setCleanupSuccess("");
      return;
    }

    if (!normalizedPassword) {
      setCleanupError(copy.settings.cleanupPasswordRequired);
      setCleanupSuccess("");
      return;
    }

    if (normalizedConfirmation !== "DELETE") {
      setCleanupError(copy.settings.cleanupConfirmationRequired);
      setCleanupSuccess("");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(copy.settings.cleanupConfirmPrompt(normalizedCleanupDate));

      if (!confirmed) {
        return;
      }
    }

    try {
      setCleanupBusy(true);
      setCleanupError("");
      setCleanupSuccess("");
      const response = await cleanupReportingEvidenceStorageApi({
        adminPassword: normalizedPassword,
        confirmationText: normalizedConfirmation,
        deleteBefore: normalizedCleanupDate,
      });

      downloadBlobFile(
        response.blob,
        response.filename || `reporting-evidence-cleanup-${normalizedCleanupDate}.zip`
      );

      setCleanupPassword("");
      setCleanupConfirmation("");
      setCleanupSuccess(
        copy.settings.cleanupSuccess(
          response.deletedCount || 0,
          formatBytes(response.deletedBytes || 0, locale, copy.common.bytesZero),
          response.affectedSubmissionCount || 0
        )
      );
      await loadCleanupSummary(normalizedCleanupDate);
    } catch (cleanupRequestError) {
      setCleanupError(
        await getBlobErrorMessage(
          cleanupRequestError,
          copy.settings.cleanupError
        )
      );
    } finally {
      setCleanupBusy(false);
    }
  };

  if (!enabled) {
    return null;
  }

  return (
    <>
      <div className="reporting-settings-control">
        {canEditPersonalSettings ? (
          <span className={`reporting-settings-trigger-status is-${statusMeta.tone}`}>
            {statusMeta.label}
          </span>
        ) : null}{" "}
        <button
          type="button"
          className="management-button-secondary reporting-settings-trigger"
          onClick={handleOpen}
        >
          {copy.settings.trigger}
        </button>
      </div>

      {isOpen ? (
        <div
          className="workflow-modal-backdrop"
          role="presentation"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="workflow-modal-shell reporting-settings-modal-shell"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reporting-settings-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="workflow-modal-header reporting-settings-modal-header">
              <div className="workflow-modal-titleblock">
                <h3 id="reporting-settings-modal-title">{copy.settings.title}</h3>
                <p>
                  {canEditPersonalSettings && canManageCleanup
                    ? copy.settings.descriptionAll
                    : canManageCleanup
                      ? copy.settings.descriptionStorage
                      : copy.settings.descriptionPersonal}
                </p>
              </div>
              <button
                type="button"
                className="management-button-secondary workflow-modal-close"
                onClick={() => setIsOpen(false)}
                disabled={busy || cleanupBusy}
              >
                {copy.common.close}
              </button>
            </div>

            <div className="reporting-settings-modal-body">
              {showSettingsTabs ? (
                <div
                  className="reporting-settings-tabs"
                  role="tablist"
                  aria-label={copy.settings.settingsTabs}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "personal"}
                    className={`reporting-settings-tab${
                      activeTab === "personal" ? " is-active" : ""
                    }`}
                    onClick={() => setActiveTab("personal")}
                  >
                    {copy.settings.personalSettings}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "storage"}
                    className={`reporting-settings-tab${
                      activeTab === "storage" ? " is-active" : ""
                    }`}
                    onClick={() => setActiveTab("storage")}
                  >
                    {copy.settings.reportingImageStorage}
                  </button>
                </div>
              ) : null}

              {canEditPersonalSettings && (!showSettingsTabs || activeTab === "personal") ? (
                loading ? (
                  <div className="reporting-workspace-empty">{copy.settings.loadingSettings}</div>
                ) : (
                  <>
                    {error ? (
                      <p className="management-error reporting-settings-inline-message">{error}</p>
                    ) : null}
                    {success ? (
                      <p className="reporting-success-banner reporting-settings-inline-message">
                        {success}
                      </p>
                    ) : null}

                    <form className="management-fields" onSubmit={handleSubmit}>
                      <section className="reporting-settings-section">
                        <div className="reporting-settings-section-header">
                          <h4>{copy.settings.reportingLanguage}</h4>
                          <span className="reporting-settings-badge is-ready">
                            {form.language === "indonesian"
                              ? copy.settings.indonesian
                              : copy.settings.english}
                          </span>
                        </div>

                        <div className="management-field">
                          <label htmlFor="reporting-language-select">{copy.settings.language}</label>
                          <select
                            id="reporting-language-select"
                            value={form.language}
                            onChange={(event) => handleChange("language", event.target.value)}
                          >
                            <option value="english">{copy.settings.english}</option>
                            <option value="indonesian">{copy.settings.indonesian}</option>
                          </select>
                          <small className="reporting-settings-helper">
                            {copy.settings.languageHelp}
                          </small>
                        </div>
                      </section>

                      <section className="reporting-settings-section">
                        <div className="reporting-settings-section-header">
                          <h4>{copy.settings.geminiApiKey}</h4>
                          <span
                            className={`reporting-settings-badge${
                              settings?.gemini?.hasStoredApiKey ? " is-ready" : ""
                            }`}
                          >
                            {settings?.gemini?.hasStoredApiKey
                              ? copy.settings.saved
                              : copy.settings.notSaved}
                          </span>
                        </div>

                        <div className="management-field">
                          <label htmlFor="reporting-gemini-key">{copy.settings.yourGeminiKey}</label>
                          <input
                            id="reporting-gemini-key"
                            type="password"
                            value={form.geminiApiKey}
                            onChange={(event) => handleChange("geminiApiKey", event.target.value)}
                            placeholder={
                              settings?.gemini?.hasStoredApiKey
                                ? copy.settings.keepSavedGeminiKey
                                : copy.settings.enterGeminiKey
                            }
                          />
                          <small className="reporting-settings-helper">
                            {copy.settings.geminiHelp}
                          </small>
                        </div>
                      </section>

                      <div className="management-actions reporting-settings-modal-actions">
                        <button
                          type="submit"
                          className="management-button"
                          disabled={busy || loading}
                        >
                          {busy ? copy.common.saving : copy.settings.saveSettings}
                        </button>
                      </div>
                    </form>
                  </>
                )
              ) : null}

              {canManageCleanup && (!showSettingsTabs || activeTab === "storage") ? (
                <section className="reporting-settings-section">
                  <div className="reporting-settings-section-header">
                    <h4>{copy.settings.reportingImageStorage}</h4>
                    <span className="reporting-settings-badge is-ready">
                      {formatBytes(
                        cleanupSummary?.totalImageBytes || 0,
                        locale,
                        copy.common.bytesZero
                      )}
                    </span>
                  </div>

                  {cleanupLoading && !cleanupSummary ? (
                    <div className="reporting-workspace-empty">
                      {copy.settings.loadingStorageSummary}
                    </div>
                  ) : (
                    <>
                      {cleanupError ? (
                        <p className="management-error reporting-settings-inline-message">
                          {cleanupError}
                        </p>
                      ) : null}
                      {cleanupSuccess ? (
                        <p className="reporting-success-banner reporting-settings-inline-message">
                          {cleanupSuccess}
                        </p>
                      ) : null}

                      <div className="reporting-task-summary-grid">
                        <StorageSummaryItem
                          label={copy.settings.totalImages}
                          value={cleanupSummary?.totalImageCount || 0}
                        />
                        <StorageSummaryItem
                          label={copy.settings.totalStorage}
                          value={formatBytes(
                            cleanupSummary?.totalImageBytes || 0,
                            locale,
                            copy.common.bytesZero
                          )}
                        />
                        <StorageSummaryItem
                          label={copy.settings.olderThanDays(cleanupSummary?.thresholdDays || 5)}
                          value={copy.settings.imageCount(cleanupSummary?.olderThanThresholdCount || 0)}
                        />
                        <StorageSummaryItem
                          label={copy.settings.olderStorage}
                          value={formatBytes(
                            cleanupSummary?.olderThanThresholdBytes || 0,
                            locale,
                            copy.common.bytesZero
                          )}
                        />
                        <StorageSummaryItem
                          label={copy.settings.selectedDateImages}
                          value={copy.settings.imageCount(cleanupSummary?.selectedImageCount || 0)}
                        />
                        <StorageSummaryItem
                          label={copy.settings.selectedDateStorage}
                          value={formatBytes(
                            cleanupSummary?.selectedImageBytes || 0,
                            locale,
                            copy.common.bytesZero
                          )}
                        />
                      </div>

                      <div className="reporting-task-note">
                        <span>{copy.settings.cleanupScope}</span>
                        <p>{copy.settings.cleanupScopeDescription}</p>
                      </div>

                      <div className="management-fields reporting-storage-cleanup-fields">
                        <div className="management-field-grid reporting-storage-cleanup-grid">
                          <div className="management-field">
                            <label htmlFor="reporting-global-cleanup-date">
                              {copy.settings.deleteImagesOnOrBefore}
                            </label>
                            <input
                              id="reporting-global-cleanup-date"
                              type="date"
                              value={cleanupDate}
                              max={todayDateInput}
                              onChange={(event) => {
                                setCleanupDate(event.target.value);
                                setCleanupError("");
                                setCleanupSuccess("");
                              }}
                            />
                            <small className="reporting-settings-helper">
                              {copy.settings.olderThanDefault(
                                cleanupSummary?.thresholdDays || 5,
                                cleanupSummary?.olderThanThresholdDateInput ||
                                  copy.common.notAvailable,
                                formatBytes(
                                  cleanupSummary?.selectedImageBytes || 0,
                                  locale,
                                  copy.common.bytesZero
                                )
                              )}
                            </small>
                          </div>

                          <div className="management-field reporting-storage-password-field">
                            <label htmlFor="reporting-global-cleanup-password">
                              {copy.settings.adminPassword}
                            </label>
                            <input
                              id="reporting-global-cleanup-password"
                              type="password"
                              value={cleanupPassword}
                              onChange={(event) => {
                                setCleanupPassword(event.target.value);
                                setCleanupError("");
                                setCleanupSuccess("");
                              }}
                              placeholder={copy.settings.adminPasswordPlaceholder}
                              autoComplete="current-password"
                            />
                            <small className="reporting-settings-helper">
                              {copy.settings.adminPasswordHelp}
                            </small>
                          </div>
                        </div>

                        <div className="management-field reporting-storage-confirm-field">
                          <label htmlFor="reporting-global-cleanup-confirm">
                            {copy.settings.typeDeleteToConfirm}
                          </label>
                          <input
                            id="reporting-global-cleanup-confirm"
                            type="text"
                            value={cleanupConfirmation}
                            onChange={(event) => {
                              setCleanupConfirmation(event.target.value);
                              setCleanupError("");
                              setCleanupSuccess("");
                            }}
                            placeholder={copy.settings.deletePlaceholder}
                            autoComplete="off"
                          />
                          <small className="reporting-settings-helper">
                            {copy.settings.confirmHelp}
                          </small>
                        </div>

                        <div className="reporting-task-summary-grid">
                          <StorageSummaryItem
                            label={copy.settings.affectedSubmissions}
                            value={cleanupSummary?.selectedSubmissionCount || 0}
                          />
                          <StorageSummaryItem
                            label={copy.settings.oldestSelected}
                            value={formatShortDate(
                              cleanupSummary?.oldestSelectedImageAt,
                              locale,
                              copy.common.notAvailable
                            )}
                          />
                          <StorageSummaryItem
                            label={copy.settings.newestSelected}
                            value={formatShortDate(
                              cleanupSummary?.newestSelectedImageAt,
                              locale,
                              copy.common.notAvailable
                            )}
                          />
                        </div>

                        <div className="management-actions reporting-settings-modal-actions">
                          <button
                            type="button"
                            className="management-button-secondary"
                            onClick={() => void loadCleanupSummary(cleanupDate)}
                            disabled={cleanupLoading || cleanupBusy}
                          >
                            {cleanupLoading ? copy.common.refreshing : copy.settings.refreshStorage}
                          </button>
                          <button
                            type="button"
                            className="management-button"
                            onClick={handleCleanup}
                            disabled={
                              cleanupBusy ||
                              !cleanupDate ||
                              !cleanupPassword.trim() ||
                              cleanupConfirmation.trim().toUpperCase() !== "DELETE" ||
                              !Number(cleanupSummary?.selectedImageCount || 0)
                            }
                          >
                            {cleanupBusy
                              ? copy.settings.preparingZipAndDeleting
                              : copy.settings.downloadZipAndDelete}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
