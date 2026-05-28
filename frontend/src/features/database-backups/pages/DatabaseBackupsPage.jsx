import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import { hasAdminAccess, hasAnyPrivilege, hasPrivilege } from "../../../shared/utils/permissions";
import {
  createDatabaseBackupApi,
  deleteDatabaseBackupApi,
  downloadDatabaseBackupApi,
  executeDatabaseRestoreApi,
  getDatabaseBackupTelegramSettingsApi,
  getDatabaseBackupsApi,
  prepareDatabaseRestoreApi,
  requestDatabaseRestoreVerificationCodeApi,
  sendDatabaseBackupToTelegramApi,
  testDatabaseBackupTelegramSettingsApi,
  updateDatabaseBackupTelegramSettingsApi,
} from "../api/databaseBackupApi";
import "../../../shared/styles/management.css";

function createEmptyBackupData() {
  return {
    items: [],
    stats: {
      totalBackups: 0,
      availableBackups: 0,
      totalBackupSizeBytes: 0,
      minimumRetainedBackups: 3,
      latestBackupAt: null,
      latestManualBackupAt: null,
      latestPreRestoreBackupAt: null,
    },
  };
}

function createBackupFilters() {
  return {
    fromDate: "",
    toDate: "",
    type: "all",
  };
}

function createEmptyTelegramSettings() {
  return {
    telegram: {
      enabled: false,
      chatIds: [],
      hasBotToken: false,
      botTokenMasked: "",
      lastSentAt: null,
      lastError: "",
      sentCount: 0,
      failedCount: 0,
      updatedAt: null,
    },
  };
}

function buildTelegramForm(settings) {
  return {
    enabled: Boolean(settings?.telegram?.enabled),
    botToken: "",
    chatIds: Array.isArray(settings?.telegram?.chatIds)
      ? settings.telegram.chatIds.join("\n")
      : "",
    clearToken: false,
  };
}

function normalizeVerificationCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 4);
}

function formatDateTime(value, locale, fallback = "-") {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateOnly(value, locale, fallback = "-") {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(date);
}

function formatFileSize(value, locale) {
  const size = Math.max(0, Number(value) || 0);
  if (!size) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let nextSize = size;

  while (nextSize >= 1024 && unitIndex < units.length - 1) {
    nextSize /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 2,
  }).format(nextSize)} ${units[unitIndex]}`;
}

function isBackupWithinDateRange(backup, filters) {
  const createdAtValue = backup?.createdAt;

  if (!createdAtValue) {
    return !filters.fromDate && !filters.toDate;
  }

  const createdAt = new Date(createdAtValue);
  if (Number.isNaN(createdAt.getTime())) {
    return !filters.fromDate && !filters.toDate;
  }

  if (filters.fromDate) {
    const fromDate = new Date(`${filters.fromDate}T00:00:00`);
    if (!Number.isNaN(fromDate.getTime()) && createdAt < fromDate) {
      return false;
    }
  }

  if (filters.toDate) {
    const toDate = new Date(`${filters.toDate}T23:59:59.999`);
    if (!Number.isNaN(toDate.getTime()) && createdAt > toDate) {
      return false;
    }
  }

  return true;
}

function triggerBrowserDownload(blob, fileName) {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
  }, 2000);
}

export default function DatabaseBackupsPage() {
  const { user } = useAuth();
  const { copy, language } = useUiLanguage();
  const backupCopy = copy.databaseBackups;
  const commonCopy = copy.common;
  const locale = language === "indonesian" ? "id-ID" : "en-US";

  const canExportBackups = hasPrivilege(user, "EXPORT_DATABASE_BACKUPS");
  const canManageBackups = hasPrivilege(user, "MANAGE_DATABASE_BACKUPS");
  const canRestoreBackups = hasPrivilege(user, "RESTORE_DATABASE_BACKUPS");
  const canSendBackupsToTelegram = hasPrivilege(user, "SEND_DATABASE_BACKUPS_TELEGRAM");
  const canDownloadBackups = hasAnyPrivilege(user, [
    "EXPORT_DATABASE_BACKUPS",
    "RESTORE_DATABASE_BACKUPS",
  ]);
  const canConfigureTelegram = hasAdminAccess(user);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [backupData, setBackupData] = useState(createEmptyBackupData);
  const [telegramSettings, setTelegramSettings] = useState(createEmptyTelegramSettings);
  const [telegramForm, setTelegramForm] = useState(buildTelegramForm(createEmptyTelegramSettings()));
  const [filters, setFilters] = useState(createBackupFilters);
  const [restoreBackupId, setRestoreBackupId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [restoreCodeMeta, setRestoreCodeMeta] = useState(null);
  const [restoreStatusMessage, setRestoreStatusMessage] = useState("");
  const [botPopupOpen, setBotPopupOpen] = useState(false);
  const botPopupRef = useRef(null);

  // Close bot popup on outside click
  useEffect(() => {
    if (!botPopupOpen) return;
    function handleClick(e) {
      if (botPopupRef.current && !botPopupRef.current.contains(e.target)) {
        setBotPopupOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [botPopupOpen]);

  const restoreBackup = useMemo(
    () => backupData.items.find((item) => item.id === restoreBackupId) || null,
    [backupData.items, restoreBackupId]
  );
  const minimumRetainedBackups = Math.max(
    1,
    Number(backupData.stats.minimumRetainedBackups) || 3
  );
  const hasActiveFilters = Boolean(filters.fromDate || filters.toDate || filters.type !== "all");
  const filteredBackups = useMemo(
    () =>
      backupData.items.filter((backup) => {
        if (filters.type !== "all" && backup.type !== filters.type) {
          return false;
        }

        return isBackupWithinDateRange(backup, filters);
      }),
    [backupData.items, filters]
  );

  const loadTelegramSettings = useCallback(
    async ({ syncForm = true } = {}) => {
      if (!canConfigureTelegram) {
        return createEmptyTelegramSettings();
      }

      const response = await getDatabaseBackupTelegramSettingsApi();
      const nextSettings = response.data || createEmptyTelegramSettings();
      setTelegramSettings(nextSettings);

      if (syncForm) {
        setTelegramForm(buildTelegramForm(nextSettings));
      }

      return nextSettings;
    },
    [canConfigureTelegram]
  );

  const loadBackupData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await getDatabaseBackupsApi();
      setBackupData(response.data || createEmptyBackupData());

      if (canConfigureTelegram) {
        try {
          await loadTelegramSettings({ syncForm: true });
        } catch (telegramError) {
          setError(
            telegramError.response?.data?.message || backupCopy.telegram.loadErrorFallback
          );
        }
      }
    } catch (requestError) {
      setBackupData(createEmptyBackupData());
      setError(requestError.response?.data?.message || backupCopy.page.loadErrorFallback);
    } finally {
      setLoading(false);
    }
  }, [
    backupCopy.page.loadErrorFallback,
    backupCopy.telegram.loadErrorFallback,
    canConfigureTelegram,
    loadTelegramSettings,
  ]);

  useEffect(() => {
    void loadBackupData();
  }, [loadBackupData]);

  const closeRestoreModal = useCallback(() => {
    setRestoreBackupId("");
    setVerificationCode("");
    setRestoreCodeMeta(null);
    setRestoreStatusMessage("");
  }, []);

  useEscapeKey(Boolean(restoreBackup), closeRestoreModal);
  useEscapeKey(Boolean(botPopupOpen), () => setBotPopupOpen(false));

  useEffect(() => {
    if (restoreBackupId && !restoreBackup) {
      closeRestoreModal();
    }
  }, [closeRestoreModal, restoreBackup, restoreBackupId]);

  const downloadBackup = useCallback(
    async (backup) => {
      const response = await downloadDatabaseBackupApi(
        backup.id,
        backup.downloadFileName || `${backup.slug}.archive.gz`
      );
      triggerBrowserDownload(response.blob, response.fileName);
      return response.fileName;
    },
    []
  );

  const handleExportBackup = async () => {
    try {
      setActionLoading("export");
      setError("");
      setSuccessMessage("");
      const response = await createDatabaseBackupApi();
      const createdBackup = response.data;

      try {
        await downloadBackup(createdBackup);
        setSuccessMessage(backupCopy.messages.exportSuccess(createdBackup.slug));
      } catch (downloadError) {
        setSuccessMessage(backupCopy.messages.exportCreatedDownloadFailed(createdBackup.slug));
        setError(downloadError.response?.data?.message || String(downloadError.message || ""));
      }

      await loadBackupData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || backupCopy.page.loadErrorFallback);
    } finally {
      setActionLoading("");
    }
  };

  const handleDownloadBackup = async (backup) => {
    try {
      setActionLoading(`download:${backup.id}`);
      setError("");
      setSuccessMessage("");
      await downloadBackup(backup);
      setSuccessMessage(backupCopy.messages.downloadStarted(backup.slug));
    } catch (requestError) {
      setError(requestError.response?.data?.message || String(requestError.message || ""));
    } finally {
      setActionLoading("");
    }
  };

  const handleDeleteBackup = async (backup) => {
    if (!backup?.id || !canManageBackups) {
      return;
    }

    if (backup.isDeleteProtected) {
      setError(backup.deleteProtectionReason || backupCopy.list.protectionHint(minimumRetainedBackups));
      return;
    }

    if (!window.confirm(backupCopy.confirmations.delete(backup.slug, minimumRetainedBackups))) {
      return;
    }

    try {
      setActionLoading(`delete:${backup.id}`);
      setError("");
      setSuccessMessage("");
      await deleteDatabaseBackupApi(backup.id);
      await loadBackupData();
      setSuccessMessage(backupCopy.messages.deleteSuccess(backup.slug));
    } catch (requestError) {
      setError(requestError.response?.data?.message || String(requestError.message || ""));
    } finally {
      setActionLoading("");
    }
  };

  const handleSendBackupToTelegram = async (backup) => {
    if (!backup?.id || !canSendBackupsToTelegram) {
      return;
    }

    try {
      setActionLoading(`telegram:${backup.id}`);
      setError("");
      setSuccessMessage("");
      const response = await sendDatabaseBackupToTelegramApi(backup.id);
      const data = response.data || {};
      setSuccessMessage(
        backupCopy.messages.sendTelegramSuccess(
          backup.slug,
          Number(data.sentCount) || 0,
          Number(data.failedCount) || 0
        )
      );

      if (canConfigureTelegram) {
        await loadTelegramSettings({ syncForm: false });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || String(requestError.message || ""));
    } finally {
      setActionLoading("");
    }
  };

  const handleSendRestoreCode = async () => {
    if (!restoreBackup) {
      setError(backupCopy.messages.noBackupSelected);
      return;
    }

    try {
      setActionLoading(`code:${restoreBackup.id}`);
      setError("");
      setSuccessMessage("");
      setRestoreStatusMessage("");
      const response = await requestDatabaseRestoreVerificationCodeApi(restoreBackup.id);
      setRestoreCodeMeta(response.data || null);
      setSuccessMessage(backupCopy.messages.restoreCodeSent);
    } catch (requestError) {
      setError(requestError.response?.data?.message || backupCopy.page.loadErrorFallback);
    } finally {
      setActionLoading("");
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreBackup) {
      setError(backupCopy.messages.noBackupSelected);
      return;
    }

    const normalizedCode = normalizeVerificationCode(verificationCode);
    if (normalizedCode.length !== 4) {
      setError(backupCopy.messages.verificationCodeRequired);
      return;
    }

    if (!window.confirm(backupCopy.restore.confirmRestore(restoreBackup.slug))) {
      return;
    }

    try {
      setActionLoading(`restore:${restoreBackup.id}`);
      setError("");
      setSuccessMessage("");
      setRestoreStatusMessage(backupCopy.restore.stepPreparing);

      const prepareResponse = await prepareDatabaseRestoreApi(restoreBackup.id, {
        verificationCode: normalizedCode,
      });
      const preparedRestore = prepareResponse.data;

      setRestoreStatusMessage(
        backupCopy.restore.safetyBackupDownload(preparedRestore.safetyBackup.slug)
      );
      await downloadBackup(preparedRestore.safetyBackup);

      setRestoreStatusMessage(backupCopy.restore.stepRestoring);
      const executeResponse = await executeDatabaseRestoreApi({
        restoreToken: preparedRestore.restoreToken,
      });

      await loadBackupData();
      closeRestoreModal();
      setSuccessMessage(
        backupCopy.restore.success(
          executeResponse.data.selectedBackup.slug,
          executeResponse.data.safetyBackup.slug
        )
      );
    } catch (requestError) {
      setError(requestError.response?.data?.message || backupCopy.page.loadErrorFallback);
    } finally {
      setActionLoading("");
      setRestoreStatusMessage("");
    }
  };

  const handleSaveTelegramSettings = async (event) => {
    event.preventDefault();

    try {
      setActionLoading("telegram-save");
      setError("");
      setSuccessMessage("");
      const response = await updateDatabaseBackupTelegramSettingsApi({
        enabled: telegramForm.enabled,
        botToken: telegramForm.botToken,
        chatIds: telegramForm.chatIds,
        clearToken: telegramForm.clearToken,
      });
      const nextSettings = response.data || createEmptyTelegramSettings();
      setTelegramSettings(nextSettings);
      setTelegramForm(buildTelegramForm(nextSettings));
      setSuccessMessage(backupCopy.telegram.updateSuccess);
    } catch (requestError) {
      setError(requestError.response?.data?.message || backupCopy.telegram.saveErrorFallback);
    } finally {
      setActionLoading("");
    }
  };

  const handleTestTelegramSettings = async () => {
    try {
      setActionLoading("telegram-test");
      setError("");
      setSuccessMessage("");
      await testDatabaseBackupTelegramSettingsApi({
        enabled: telegramForm.enabled,
        botToken: telegramForm.botToken,
        chatIds: telegramForm.chatIds,
        clearToken: telegramForm.clearToken,
      });
      setSuccessMessage(backupCopy.telegram.testSuccess);
      await loadTelegramSettings({ syncForm: false });
    } catch (requestError) {
      setError(requestError.response?.data?.message || backupCopy.telegram.testErrorFallback);
    } finally {
      setActionLoading("");
    }
  };

  const botEnabled = telegramSettings.telegram.enabled;

  return (
    <div className="management-page database-backups-page">
      <section className="app-panel management-header database-backups-header">
        <div>
          <h1>{backupCopy.page.title}</h1>
          <p>{backupCopy.page.description}</p>
        </div>
        <div className="management-header-actions database-backups-header-actions">
          {canConfigureTelegram ? (
            <button
              type="button"
              className={`db-bot-pill ${botEnabled ? "is-on" : "is-off"}`}
              onClick={() => setBotPopupOpen((v) => !v)}
              aria-label={backupCopy.telegram.title}
            >
              <span className="db-bot-pill-dot" />
              {`${backupCopy.actions.configureBot} - ${
                botEnabled
                  ? backupCopy.telegram.statusEnabled
                  : backupCopy.telegram.statusDisabled
              }`}
            </button>
          ) : null}
          <button
            type="button"
            className="management-button-secondary"
            onClick={() => void loadBackupData()}
            disabled={loading}
          >
            {loading ? backupCopy.page.refreshing : backupCopy.page.refresh}
          </button>
          {canExportBackups ? (
            <button
              type="button"
              className="management-button"
              onClick={() => void handleExportBackup()}
              disabled={actionLoading === "export"}
            >
              {actionLoading === "export"
                ? backupCopy.page.exporting
                : backupCopy.page.exportAction}
            </button>
          ) : null}
        </div>
      </section>

      {/* Bot Settings Popup */}
      {botPopupOpen && canConfigureTelegram ? (
        <div className="db-bot-popup-backdrop" onClick={() => setBotPopupOpen(false)}>
          <div
            className="db-bot-popup"
            ref={botPopupRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="db-bot-popup-header">
              <div>
                <h2>{backupCopy.telegram.title}</h2>
                <p>{backupCopy.telegram.description}</p>
              </div>
              <button
                type="button"
                className="db-bot-popup-close"
                onClick={() => setBotPopupOpen(false)}
              >
                X
              </button>
            </div>

            <div className="db-bot-popup-statuses">
              <span className={`management-badge${telegramSettings.telegram.enabled ? " is-active" : " is-inactive"}`}>
                {telegramSettings.telegram.enabled ? backupCopy.telegram.statusEnabled : backupCopy.telegram.statusDisabled}
              </span>
              <span className={`management-badge${telegramSettings.telegram.hasBotToken ? " is-active" : " is-inactive"}`}>
                {telegramSettings.telegram.hasBotToken ? backupCopy.telegram.tokenStored : backupCopy.telegram.tokenMissing}
              </span>
              <span className="management-badge">
                {backupCopy.telegram.chatCount}: {telegramSettings.telegram.chatIds.length}
              </span>
            </div>

            <form onSubmit={handleSaveTelegramSettings} className="management-fields">
              <label className="management-checkbox">
                <input
                  type="checkbox"
                  checked={telegramForm.enabled}
                  onChange={(e) => setTelegramForm((c) => ({ ...c, enabled: e.target.checked }))}
                />
                <span className="management-checkbox-copy">
                  <strong>{backupCopy.telegram.enabled}</strong>
                  <span className="management-checkbox-meta">{backupCopy.telegram.enabledHelp}</span>
                </span>
              </label>

              <div className="management-field">
                <label htmlFor="db-popup-bot-token">{backupCopy.telegram.botToken}</label>
                <input
                  id="db-popup-bot-token"
                  type="password"
                  value={telegramForm.botToken}
                  onChange={(e) => setTelegramForm((c) => ({ ...c, botToken: e.target.value, clearToken: false }))}
                  placeholder={backupCopy.telegram.botTokenPlaceholder}
                />
                <span className="management-help">
                  {telegramSettings.telegram.botTokenMasked
                    ? `${backupCopy.telegram.keepExistingToken} (${telegramSettings.telegram.botTokenMasked})`
                    : backupCopy.telegram.keepExistingToken}
                </span>
              </div>

              <div className="management-field">
                <label htmlFor="db-popup-chat-ids">{backupCopy.telegram.chatIds}</label>
                <textarea
                  id="db-popup-chat-ids"
                  rows={4}
                  value={telegramForm.chatIds}
                  onChange={(e) => setTelegramForm((c) => ({ ...c, chatIds: e.target.value }))}
                  placeholder={backupCopy.telegram.chatIdsPlaceholder}
                />
                <span className="management-help">{backupCopy.telegram.chatIdsHelp}</span>
              </div>

              <label className="management-checkbox">
                <input
                  type="checkbox"
                  checked={telegramForm.clearToken}
                  disabled={!telegramSettings.telegram.hasBotToken}
                  onChange={(e) => setTelegramForm((c) => ({ ...c, clearToken: e.target.checked, botToken: e.target.checked ? "" : c.botToken }))}
                />
                <span className="management-checkbox-copy">
                  <strong>{backupCopy.telegram.clearSavedToken}</strong>
                </span>
              </label>

              <div className="db-bot-popup-meta">
                <div className="db-bot-popup-meta-row">
                  <strong>{backupCopy.telegram.lastSentAt}</strong>
                  <span>{telegramSettings.telegram.lastSentAt ? formatDateTime(telegramSettings.telegram.lastSentAt, locale) : "-"}</span>
                </div>
                <div className="db-bot-popup-meta-row">
                  <strong>{backupCopy.telegram.lastError}</strong>
                  <span>{telegramSettings.telegram.lastError || backupCopy.telegram.noErrors}</span>
                </div>
              </div>

              <div className="db-bot-popup-actions">
                <button type="submit" className="management-button" disabled={actionLoading === "telegram-save"}>
                  {actionLoading === "telegram-save" ? backupCopy.actions.savingBot : backupCopy.actions.saveBot}
                </button>
                <button type="button" className="management-button-secondary" onClick={() => void handleTestTelegramSettings()} disabled={actionLoading === "telegram-test"}>
                  {actionLoading === "telegram-test" ? backupCopy.actions.testingBot : backupCopy.actions.testBot}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ToastNotice message={error} onClose={() => setError("")} />
      <ToastNotice
        message={successMessage}
        tone="success"
        onClose={() => setSuccessMessage("")}
      />

      {loading ? (
        <section className="app-panel management-state">
          <h2>{commonCopy.loading}</h2>
          <p>{backupCopy.page.loadingDescription}</p>
        </section>
      ) : (
        <>
          <div className="database-backups-overview-grid">
            <div className="db-stat-card">
              <span className="db-stat-icon">DB</span>
              <span className="db-stat-label">{backupCopy.overview.latestBackupDay}</span>
              <span className="db-stat-value">
                {backupData.stats.latestBackupAt
                  ? formatDateOnly(backupData.stats.latestBackupAt, locale)
                  : backupCopy.overview.noBackupYet}
              </span>
            </div>
            <div className="db-stat-card">
              <span className="db-stat-icon">SAFE</span>
              <span className="db-stat-label">{backupCopy.overview.latestSafetyBackup}</span>
              <span className="db-stat-value">
                {backupData.stats.latestPreRestoreBackupAt
                  ? formatDateTime(backupData.stats.latestPreRestoreBackupAt, locale)
                  : backupCopy.overview.neverCreated}
              </span>
            </div>
            <div className="db-stat-card">
              <span className="db-stat-icon">FILES</span>
              <span className="db-stat-label">{backupCopy.overview.availableBackups}</span>
              <span className="db-stat-value">{backupData.stats.availableBackups}</span>
            </div>
            <div className="db-stat-card">
              <span className="db-stat-icon">SIZE</span>
              <span className="db-stat-label">{backupCopy.overview.totalStorage}</span>
              <span className="db-stat-value">{formatFileSize(backupData.stats.totalBackupSizeBytes, locale)}</span>
            </div>
          </div>

          <section className="app-panel management-form">
            <p className="database-backups-storage-hint">{backupCopy.page.storageHint}</p>
          </section>

          <div className="database-backups-layout" style={{ gridTemplateColumns: "1fr" }}>
            <section className="app-panel management-form">
              <div className="management-section-header">
                <div>
                  <h2>{backupCopy.list.title}</h2>
                  <p>{backupCopy.list.description}</p>
                  <p className="database-backups-protection-hint">
                    {backupCopy.list.protectionHint(minimumRetainedBackups)}
                  </p>
                </div>
                <div className="management-summary">
                  <strong>{filteredBackups.length}</strong>
                  <span>
                    {backupCopy.list.filteredCount(
                      filteredBackups.length,
                      backupData.stats.totalBackups
                    )}
                  </span>
                </div>
              </div>

              <div className="database-backups-filter-grid">
                <div className="management-field">
                  <label htmlFor="database-backups-from-date">
                    {backupCopy.filters.fromDate}
                  </label>
                  <input
                    id="database-backups-from-date"
                    type="date"
                    value={filters.fromDate}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        fromDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="management-field">
                  <label htmlFor="database-backups-to-date">
                    {backupCopy.filters.toDate}
                  </label>
                  <input
                    id="database-backups-to-date"
                    type="date"
                    value={filters.toDate}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        toDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="management-field">
                  <label htmlFor="database-backups-type-filter">
                    {backupCopy.filters.type}
                  </label>
                  <select
                    id="database-backups-type-filter"
                    value={filters.type}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        type: event.target.value,
                      }))
                    }
                  >
                    <option value="all">{backupCopy.filters.allTypes}</option>
                    <option value="manual">{backupCopy.filters.manualOnly}</option>
                    <option value="pre-restore">{backupCopy.filters.safetyOnly}</option>
                  </select>
                </div>
                <div className="database-backups-filter-actions">
                  <button
                    type="button"
                    className="management-button-secondary"
                    onClick={() => setFilters(createBackupFilters())}
                    disabled={!hasActiveFilters}
                  >
                    {commonCopy.reset}
                  </button>
                </div>
              </div>

              {filteredBackups.length ? (
                <div className="database-backups-grid">
                  {filteredBackups.map((backup) => (
                    <article
                      key={backup.id}
                      className={`database-backups-card${
                        backup.isAvailable ? "" : " is-missing"
                      }`}
                    >
                      <div className="database-backups-card-header">
                        <div className="database-backups-card-copy">
                          <div className="database-backups-card-badges">
                            <span className="management-badge">
                              {backup.type === "pre-restore"
                                ? backupCopy.statuses.preRestore
                                : backupCopy.statuses.manual}
                            </span>
                            <span
                              className={`management-badge${
                                backup.isAvailable ? " is-active" : " is-inactive"
                              }`}
                            >
                              {backup.isAvailable
                                ? backupCopy.statuses.available
                                : backupCopy.statuses.missing}
                            </span>
                            {backup.isDeleteProtected ? (
                              <span className="management-badge">
                                {backupCopy.actions.protected}
                              </span>
                            ) : null}
                          </div>
                          <h3>{backup.slug}</h3>
                          <p>{backup.note || backup.databaseName}</p>
                        </div>
                        <strong className="database-backups-size-pill">
                          {formatFileSize(backup.fileSizeBytes, locale)}
                        </strong>
                      </div>

                      <dl className="database-backups-meta-grid">
                        <div>
                          <dt>{backupCopy.list.createdAt}</dt>
                          <dd>{formatDateTime(backup.createdAt, locale)}</dd>
                        </div>
                        <div>
                          <dt>{backupCopy.list.createdBy}</dt>
                          <dd>
                            {backup.createdByName
                              || backup.createdByEmail
                              || backupCopy.list.noCreator}
                          </dd>
                        </div>
                        <div>
                          <dt>{backupCopy.list.databaseName}</dt>
                          <dd>{backup.databaseName || "-"}</dd>
                        </div>
                        <div>
                          <dt>{backupCopy.list.lastRestored}</dt>
                          <dd>
                            {backup.lastRestoredAt
                              ? formatDateTime(backup.lastRestoredAt, locale)
                              : backupCopy.list.neverRestored}
                          </dd>
                        </div>
                      </dl>

                      {!backup.isAvailable ? (
                        <p className="management-empty database-backups-card-warning">
                          {backupCopy.list.missingFileHelp}
                        </p>
                      ) : null}

                      <div className="management-inline-actions database-backups-card-actions">
                        {canDownloadBackups ? (
                          <button
                            type="button"
                            className="management-button-secondary"
                            onClick={() => void handleDownloadBackup(backup)}
                            disabled={!backup.isAvailable || actionLoading !== ""}
                          >
                            {actionLoading === `download:${backup.id}`
                              ? backupCopy.actions.downloading
                              : backupCopy.actions.download}
                          </button>
                        ) : null}
                        {canSendBackupsToTelegram ? (
                          <button
                            type="button"
                            className="management-button-secondary"
                            onClick={() => void handleSendBackupToTelegram(backup)}
                            disabled={!backup.isAvailable || actionLoading !== ""}
                          >
                            {actionLoading === `telegram:${backup.id}`
                              ? backupCopy.actions.sendingTelegram
                              : backupCopy.actions.sendTelegram}
                          </button>
                        ) : null}
                        {canRestoreBackups ? (
                          <button
                            type="button"
                            className="management-button-secondary"
                            onClick={() => setRestoreBackupId(backup.id)}
                            disabled={!backup.isAvailable || actionLoading !== ""}
                          >
                            {backupCopy.actions.restore}
                          </button>
                        ) : null}
                        {canManageBackups ? (
                          <button
                            type="button"
                            className={`management-button-secondary${
                              backup.isDeleteProtected ? "" : " is-danger"
                            }`}
                            onClick={() => void handleDeleteBackup(backup)}
                            disabled={backup.isDeleteProtected || actionLoading !== ""}
                            title={
                              backup.isDeleteProtected
                                ? backup.deleteProtectionReason
                                : ""
                            }
                          >
                            {actionLoading === `delete:${backup.id}`
                              ? backupCopy.actions.deleting
                              : backup.isDeleteProtected
                                ? backupCopy.actions.protected
                                : backupCopy.actions.delete}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="management-empty">
                  {backupData.items.length && hasActiveFilters
                    ? backupCopy.list.noMatches
                    : backupCopy.list.empty}
                </p>
              )}
            </section>

            {/* Telegram settings moved to header bot popup */}
          </div>
        </>
      )}

      {restoreBackup ? (
        <div className="management-modal-backdrop is-centered" onClick={closeRestoreModal}>
          <div
            className="management-modal management-modal-wide database-backups-restore-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="app-panel management-form">
              <div className="management-section-header">
                <div>
                  <h2>{backupCopy.restore.title}</h2>
                  <p>{backupCopy.restore.description}</p>
                </div>
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={closeRestoreModal}
                >
                  {commonCopy.close}
                </button>
              </div>

              <div className="database-backups-restore-grid">
                <div className="database-backups-restore-summary">
                  <span className="management-badge">
                    {restoreBackup.type === "pre-restore"
                      ? backupCopy.statuses.preRestore
                      : backupCopy.statuses.manual}
                  </span>
                  <h3>{restoreBackup.slug}</h3>
                  <p>{backupCopy.restore.latestProtection}</p>

                  <dl className="database-backups-meta-grid">
                    <div>
                      <dt>{backupCopy.list.createdAt}</dt>
                      <dd>{formatDateTime(restoreBackup.createdAt, locale)}</dd>
                    </div>
                    <div>
                      <dt>{backupCopy.list.databaseName}</dt>
                      <dd>{restoreBackup.databaseName || "-"}</dd>
                    </div>
                    <div>
                      <dt>{backupCopy.list.fileSize}</dt>
                      <dd>{formatFileSize(restoreBackup.fileSizeBytes, locale)}</dd>
                    </div>
                    <div>
                      <dt>{backupCopy.list.status}</dt>
                      <dd>
                        {restoreBackup.isAvailable
                          ? backupCopy.statuses.available
                          : backupCopy.statuses.missing}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="database-backups-restore-form">
                  <p className="management-help">{backupCopy.restore.verificationHint}</p>

                  <div className="management-actions">
                    <button
                      type="button"
                      className="management-button-secondary"
                      onClick={() => void handleSendRestoreCode()}
                      disabled={actionLoading === `code:${restoreBackup.id}`}
                    >
                      {actionLoading === `code:${restoreBackup.id}`
                        ? backupCopy.actions.sendingCode
                        : backupCopy.actions.requestCode}
                    </button>
                  </div>

                  {restoreCodeMeta ? (
                    <div className="database-backups-restore-meta">
                      <span>
                        <strong>{backupCopy.restore.codeSentAt}:</strong>{" "}
                        {formatDateTime(restoreCodeMeta.requestedAt, locale)}
                      </span>
                      <span>
                        <strong>{backupCopy.restore.codeExpiresAt}:</strong>{" "}
                        {formatDateTime(restoreCodeMeta.expiresAt, locale)}
                      </span>
                    </div>
                  ) : null}

                  <div className="management-field">
                    <label htmlFor="database-backup-restore-code">
                      {backupCopy.restore.verificationCode}
                    </label>
                    <input
                      id="database-backup-restore-code"
                      inputMode="numeric"
                      maxLength={4}
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(normalizeVerificationCode(event.target.value))}
                      placeholder={backupCopy.restore.verificationCodePlaceholder}
                    />
                  </div>

                  {restoreStatusMessage ? (
                    <p className="management-help database-backups-restore-status">
                      {restoreStatusMessage}
                    </p>
                  ) : null}

                  <div className="management-actions">
                    <button
                      type="button"
                      className="management-button"
                      onClick={() => void handleExecuteRestore()}
                      disabled={actionLoading === `restore:${restoreBackup.id}`}
                    >
                      {actionLoading === `restore:${restoreBackup.id}`
                        ? backupCopy.actions.preparingRestore
                        : backupCopy.actions.restoreNow}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
