import React, { useCallback, useEffect, useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import { hasPrivilege } from "../../../shared/utils/permissions";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  checkAllCuttlyLinksApi,
  checkCuttlyLinkApi,
  createCuttlyLinkApi,
  deleteCuttlyLinkApi,
  getCuttlyLinksApi,
  getCuttlyStatusApi,
  toggleCuttlyScheduleApi,
  updateCuttlyApiSettingsApi,
  updateCuttlyLinkApi,
  updateCuttlyScheduleApi,
  updateCuttlyTelegramApi,
} from "../api/cuttlyLinkCheckerApi";
import CuttlyApiSettingsModal from "../components/CuttlyApiSettingsModal";
import CuttlyLinkEntryModal from "../components/CuttlyLinkEntryModal";
import CuttlyScheduleModal from "../components/CuttlyScheduleModal";
import CuttlyTelegramModal from "../components/CuttlyTelegramModal";
import "../../../shared/styles/management.css";
import "../styles/cuttlyLinkChecker.css";

const EMPTY_LINK_FORM = {
  id: "",
  title: "",
  targetUrl: "",
  preferredName: "",
  useUserDomain: true,
  isActive: true,
};

const EMPTY_SETTINGS = {
  hasApiKey: false,
  apiKeyUpdatedAt: null,
  schedule: {
    enabled: false,
    delayMinutes: 60,
    parallelChecks: 1,
    nextRunAt: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: "",
  },
  telegram: {
    enabled: false,
    chatId: "",
    hasBotToken: false,
    lastSentAt: null,
    lastError: "",
    sentCount: 0,
    failedCount: 0,
  },
};

const EMPTY_STATUS = {
  running: false,
  stopRequested: false,
  currentBatch: null,
  schedule: EMPTY_SETTINGS.schedule,
};

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function getTimeMs(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function formatCountdown(valueMs) {
  const totalSeconds = Math.max(0, Math.ceil(Number(valueMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getStatusTone(status) {
  if (status === "ok") {
    return "management-badge is-active";
  }

  if (status === "blocked" || status === "error") {
    return "management-badge is-inactive";
  }

  if (status === "warning") {
    return "management-badge is-progress";
  }

  return "management-badge";
}

function getStatusLabel(status) {
  if (status === "not_checked") {
    return "Not checked";
  }

  return status || "Not checked";
}

function getScheduleLabel(status) {
  const batch = status?.currentBatch;

  if (status?.running && batch?.status === "stopping") {
    return "Stopping";
  }

  if (status?.running && batch?.source === "schedule") {
    return "Auto checking";
  }

  if (status?.running) {
    return "Checking";
  }

  if (batch?.status === "completed") {
    return "Completed";
  }

  if (batch?.status === "stopped") {
    return "Stopped";
  }

  if (batch?.status === "failed") {
    return "Failed";
  }

  return "Idle";
}

function normalizeSettings(value) {
  return {
    ...EMPTY_SETTINGS,
    ...(value || {}),
    schedule: {
      ...EMPTY_SETTINGS.schedule,
      ...(value?.schedule || {}),
      delayMinutes: Number(value?.schedule?.delayMinutes || EMPTY_SETTINGS.schedule.delayMinutes),
      parallelChecks: Number(value?.schedule?.parallelChecks || EMPTY_SETTINGS.schedule.parallelChecks),
    },
    telegram: {
      ...EMPTY_SETTINGS.telegram,
      ...(value?.telegram || {}),
      botToken: "",
    },
  };
}

function buildPayload(form) {
  return {
    title: form.title,
    targetUrl: form.targetUrl,
    isActive: Boolean(form.isActive),
  };
}

export default function CuttlyLinkCheckerPage() {
  const { user } = useAuth();
  const canManageLinks = hasPrivilege(user, "MANAGE_CUTTLY_LINK_CHECKER");
  const canCheckLinks = hasPrivilege(user, "CHECK_CUTTLY_LINKS") || canManageLinks;
  const canSchedule = hasPrivilege(user, "SCHEDULE_CUTTLY_LINK_CHECKER") || canManageLinks;
  const canManageApi = hasPrivilege(user, "MANAGE_CUTTLY_API_SETTINGS");
  const canManageTelegram = hasPrivilege(user, "MANAGE_CUTTLY_LINK_TELEGRAM");
  const [links, setLinks] = useState([]);
  const [summary, setSummary] = useState({
    totalCount: 0,
    activeCount: 0,
    checkedCount: 0,
    okCount: 0,
    blockedCount: 0,
    warningCount: 0,
    errorCount: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalItems: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [apiKey, setApiKey] = useState("");
  const [telegramForm, setTelegramForm] = useState(EMPTY_SETTINGS.telegram);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SETTINGS.schedule);
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [form, setForm] = useState(EMPTY_LINK_FORM);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [savingApi, setSavingApi] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [checkingId, setCheckingId] = useState("");
  const [checkingAll, setCheckingAll] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activeSettingsModal, setActiveSettingsModal] = useState("");
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

  const activeItems = Array.isArray(status.currentBatch?.activeItems) ? status.currentBatch.activeItems : [];
  const latestCompleted = status.currentBatch?.latestCompleted || null;
  const progressLabel = status.currentBatch
    ? `${Number(status.currentBatch.completedCount || 0)}/${Number(status.currentBatch.totalCount || 0)}`
    : "0 queued";
  const nextRunMs = getTimeMs(scheduleForm.nextRunAt);
  const nextRunLabel = !scheduleForm.enabled
    ? "Not scheduled"
    : status.running
      ? "Running now"
      : nextRunMs
        ? formatCountdown(nextRunMs - nowMs)
        : "Calculating...";

  const loadCuttlyLinks = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) {
        setLoading(true);
        setError("");
      }

      const response = await getCuttlyLinksApi({
        page: pagination.page,
        limit: pagination.limit,
        search,
        status: statusFilter,
        active: activeFilter,
      });
      const data = response.data || {};
      const nextSettings = normalizeSettings(data.settings);
      const nextStatus = data.status || EMPTY_STATUS;

      setLinks(data.items || []);
      setSummary((current) => ({ ...current, ...(data.summary || {}) }));
      setPagination((current) => ({ ...current, ...(data.pagination || {}) }));
      setSettings(nextSettings);
      if (activeSettingsModal !== "telegram") {
        setTelegramForm(nextSettings.telegram);
      }
      if (activeSettingsModal !== "schedule") {
        setScheduleForm(nextSettings.schedule);
      }
      setStatus({ ...EMPTY_STATUS, ...nextStatus, schedule: nextSettings.schedule });
    } catch (err) {
      if (!quiet) {
        setError(err.response?.data?.message || "Failed to load Cutt.ly Link Checker");
      }
    } finally {
      if (!quiet) {
        setLoading(false);
      }
    }
  }, [activeFilter, activeSettingsModal, pagination.limit, pagination.page, search, statusFilter]);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await getCuttlyStatusApi();
      const nextStatus = response.data?.item || EMPTY_STATUS;

      setStatus((current) => ({ ...current, ...nextStatus, schedule: scheduleForm }));
    } catch {
      // Keep background polling quiet.
    }
  }, [scheduleForm]);

  useEffect(() => {
    void loadCuttlyLinks();
  }, [loadCuttlyLinks]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!scheduleForm.enabled && !status.running && !checkingAll && !checkingId) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refreshStatus();
      void loadCuttlyLinks({ quiet: true });
    }, 2500);

    return () => window.clearInterval(timer);
  }, [checkingAll, checkingId, loadCuttlyLinks, refreshStatus, scheduleForm.enabled, status.running]);

  const resetForm = () => setForm(EMPTY_LINK_FORM);

  const openNewLinkModal = () => {
    resetForm();
    setIsLinkModalOpen(true);
  };

  const closeLinkModal = () => {
    if (savingLink) {
      return;
    }

    setIsLinkModalOpen(false);
    resetForm();
  };

  const handleEdit = (link) => {
    setForm({
      id: link.id,
      title: link.title || "",
      targetUrl: link.targetUrl || "",
      preferredName: link.preferredName || "",
      useUserDomain: link.useUserDomain !== false,
      isActive: link.isActive !== false,
    });
    setIsLinkModalOpen(true);
  };

  const handleSaveLink = async (event) => {
    event.preventDefault();

    if (!canManageLinks) {
      setError("You do not have permission to manage Cutt.ly links.");
      return;
    }

    try {
      setSavingLink(true);
      setError("");
      setNotice("");

      if (form.id) {
        await updateCuttlyLinkApi(form.id, buildPayload(form));
        setNotice("Cutt.ly link updated.");
      } else {
        await createCuttlyLinkApi(buildPayload(form));
        setNotice("Cutt.ly link added.");
      }

      resetForm();
      setIsLinkModalOpen(false);
      await loadCuttlyLinks({ quiet: true });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save Cutt.ly link");
    } finally {
      setSavingLink(false);
    }
  };

  const handleDelete = async (link) => {
    if (!window.confirm(`Remove ${link.targetUrl} from Cutt.ly Link Checker?`)) {
      return;
    }

    try {
      setError("");
      setNotice("");
      await deleteCuttlyLinkApi(link.id);
      setNotice("Cutt.ly link removed.");
      await loadCuttlyLinks({ quiet: true });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to remove Cutt.ly link");
    }
  };

  const handleCheck = async (link) => {
    if (status.running) {
      setError("Wait until the current Cutt.ly batch finishes.");
      return;
    }

    try {
      setCheckingId(link.id);
      setError("");
      setNotice("");
      const response = await checkCuttlyLinkApi(link.id);
      const check = response.data?.item || {};

      setNotice(check.status === "blocked" ? "Cutt.ly reports this URL as blocked." : "Cutt.ly check completed.");
      await loadCuttlyLinks({ quiet: true });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to check Cutt.ly link");
    } finally {
      setCheckingId("");
    }
  };

  const handleCheckAll = async () => {
    if (scheduleForm.enabled || status.running) {
      setError("Stop auto schedule and wait for the current check before using Check All.");
      return;
    }

    try {
      setCheckingAll(true);
      setError("");
      setNotice("");
      const response = await checkAllCuttlyLinksApi();
      const result = response.data?.item || {};

      setNotice(`Checked ${result.completedCount || 0} URLs. ${result.blockedCount || 0} blocked.`);
      await loadCuttlyLinks({ quiet: true });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to check Cutt.ly links");
    } finally {
      setCheckingAll(false);
    }
  };

  const handleSaveApi = async (event) => {
    event.preventDefault();

    try {
      setSavingApi(true);
      setError("");
      setNotice("");
      const response = await updateCuttlyApiSettingsApi({ apiKey });
      const nextSettings = normalizeSettings(response.data?.item);

      setSettings(nextSettings);
      setScheduleForm(nextSettings.schedule);
      setTelegramForm(nextSettings.telegram);
      setApiKey("");
      setNotice("Cutt.ly API key saved.");
      setActiveSettingsModal("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save Cutt.ly API key");
    } finally {
      setSavingApi(false);
    }
  };

  const handleSaveTelegram = async (event) => {
    event.preventDefault();

    try {
      setSavingTelegram(true);
      setError("");
      setNotice("");
      const response = await updateCuttlyTelegramApi({
        enabled: telegramForm.enabled,
        chatId: telegramForm.chatId,
        botToken: telegramForm.botToken,
      });
      const nextTelegram = {
        ...EMPTY_SETTINGS.telegram,
        ...(response.data?.item || {}),
        botToken: "",
      };

      setTelegramForm(nextTelegram);
      setSettings((current) => ({ ...current, telegram: nextTelegram }));
      setNotice("Cutt.ly Telegram settings saved.");
      setActiveSettingsModal("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save Cutt.ly Telegram settings");
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleSaveSchedule = async () => {
    try {
      setSavingSchedule(true);
      setError("");
      setNotice("");
      const response = await updateCuttlyScheduleApi({
        enabled: scheduleForm.enabled,
        delayMinutes: scheduleForm.delayMinutes,
        parallelChecks: scheduleForm.parallelChecks,
      });
      const nextSchedule = {
        ...EMPTY_SETTINGS.schedule,
        ...(response.data?.item || {}),
      };

      setScheduleForm(nextSchedule);
      setSettings((current) => ({ ...current, schedule: nextSchedule }));
      setStatus((current) => ({ ...current, ...(response.data?.status || {}), schedule: nextSchedule }));
      setNotice("Cutt.ly schedule settings saved.");
      setActiveSettingsModal("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save Cutt.ly schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleToggleSchedule = async (enabled) => {
    try {
      setSavingSchedule(true);
      setError("");
      setNotice("");
      const response = await toggleCuttlyScheduleApi(enabled, {
        delayMinutes: scheduleForm.delayMinutes,
        parallelChecks: scheduleForm.parallelChecks,
      });
      const nextSchedule = {
        ...EMPTY_SETTINGS.schedule,
        ...(response.data?.item || {}),
      };
      const nextStatus = response.data?.status || {};

      setScheduleForm(nextSchedule);
      setSettings((current) => ({ ...current, schedule: nextSchedule }));
      setStatus((current) => ({ ...current, ...nextStatus, schedule: nextSchedule }));
      setNotice(enabled ? "Cutt.ly schedule started." : "Cutt.ly schedule stopped.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update Cutt.ly schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <div className="management-page cuttly-link-checker-page">
      <section className="app-panel management-header cuttly-link-checker-hero">
        <div>
          <span className="management-badge">Cutt.ly Monitor</span>
          <h1>Cutt.ly Link Checker</h1>
          <p>Check Cutt.ly short links through the stats API and catch unavailable responses before the next run.</p>
        </div>
        <div className="management-header-actions cuttly-link-checker-hero-actions">
          {canManageLinks ? (
            <button
              type="button"
              className={`management-button-secondary${isLinkModalOpen && !form.id ? " is-active" : ""}`}
              onClick={openNewLinkModal}
              aria-pressed={isLinkModalOpen && !form.id}
            >
              Add URL
            </button>
          ) : null}
          {canManageApi ? (
            <button
              type="button"
              className={`management-button-secondary${settings.hasApiKey ? " is-active" : ""}`}
              onClick={() => setActiveSettingsModal("api")}
              aria-pressed={activeSettingsModal === "api"}
            >
              API Settings
            </button>
          ) : null}
          {canManageTelegram ? (
            <button
              type="button"
              className={`management-button-secondary${telegramForm.enabled ? " is-active" : ""}`}
              onClick={() => setActiveSettingsModal("telegram")}
              aria-pressed={activeSettingsModal === "telegram"}
            >
              Telegram
            </button>
          ) : null}
          {canSchedule ? (
            <button
              type="button"
              className={`management-button-secondary${scheduleForm.enabled ? " is-active" : ""}`}
              onClick={() => setActiveSettingsModal("schedule")}
              aria-pressed={activeSettingsModal === "schedule"}
            >
              Schedule
            </button>
          ) : null}
          {canCheckLinks ? (
            <button
              type="button"
              className="management-button"
              onClick={handleCheckAll}
              disabled={checkingAll || loading || !summary.activeCount || scheduleForm.enabled || status.running}
            >
              {checkingAll ? "Checking..." : "Check All"}
            </button>
          ) : null}
          <button type="button" className="management-button-secondary" onClick={loadCuttlyLinks} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      <ToastNotice message={error} onClose={() => setError("")} />
      <ToastNotice message={notice} tone="success" onClose={() => setNotice("")} />

      <section className="cuttly-link-checker-summary">
        <div className="app-panel">
          <span>Total</span>
          <strong>{summary.totalCount}</strong>
        </div>
        <div className="app-panel">
          <span>Active</span>
          <strong>{summary.activeCount}</strong>
        </div>
        <div className="app-panel">
          <span>OK</span>
          <strong>{summary.okCount}</strong>
        </div>
        <div className="app-panel is-danger">
          <span>Blocked</span>
          <strong>{summary.blockedCount}</strong>
        </div>
        <div className="app-panel">
          <span>Errors</span>
          <strong>{summary.errorCount}</strong>
        </div>
      </section>

      <section className="app-panel cuttly-link-checker-live">
        <div>
          <span>Auto schedule</span>
          <strong>{scheduleForm.enabled ? "Running" : "Stopped"}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{getScheduleLabel(status)}</strong>
        </div>
        <div>
          <span>Progress</span>
          <strong>{progressLabel}</strong>
        </div>
        <div>
          <span>Next check</span>
          <strong>{nextRunLabel}</strong>
          <small>{scheduleForm.nextRunAt ? `Next at: ${formatDateTime(scheduleForm.nextRunAt)}` : "No next run"}</small>
        </div>
        <div>
          <span>Scanning now</span>
          <strong>{activeItems.length ? `${activeItems.length} active` : status.running ? "Starting" : "Idle"}</strong>
          <small>{activeItems[0]?.targetUrl || latestCompleted?.targetUrl || "No active URL right now."}</small>
        </div>
        {canSchedule && scheduleForm.enabled ? (
          <button
            type="button"
            className="management-button-secondary is-danger"
            disabled={savingSchedule}
            onClick={() => void handleToggleSchedule(false)}
          >
            Stop Schedule
          </button>
        ) : null}
      </section>

      <section className="app-panel cuttly-link-checker-filter-panel">
        <div>
          <span className="management-badge">Filters</span>
          <h2>Cutt.ly URLs</h2>
          <p>Showing {links.length} of {pagination.totalItems} matching URLs.</p>
        </div>
        <div className="cuttly-link-checker-filters">
          <label className="management-field" htmlFor="cuttly-search">
            <span>Search</span>
            <input
              id="cuttly-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
              placeholder="Short link, original link, title, message..."
            />
          </label>
          <label className="management-field" htmlFor="cuttly-status-filter">
            <span>Status</span>
            <select
              id="cuttly-status-filter"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            >
              <option value="all">All</option>
              <option value="ok">OK</option>
              <option value="blocked">Blocked</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="not_checked">Not checked</option>
            </select>
          </label>
          <label className="management-field" htmlFor="cuttly-active-filter">
            <span>Active</span>
            <select
              id="cuttly-active-filter"
              value={activeFilter}
              onChange={(event) => {
                setActiveFilter(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            >
              <option value="all">All links</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
      </section>

      <section className="app-panel management-table cuttly-link-checker-table-panel">
        {loading ? (
          <p className="management-empty">Loading Cutt.ly links...</p>
        ) : links.length ? (
          <>
            <div className="management-table-wrap">
              <table className="cuttly-link-checker-table">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Link Status</th>
                    <th>Stats Result</th>
                    <th>Last Check</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => {
                    const check = link.lastCheck || {};
                    const isChecking = checkingId === link.id;
                    const isActiveLive = activeItems.some((item) => item.linkId === link.id);

                    return (
                      <tr key={link.id}>
                        <td>
                          <div className="cuttly-link-checker-url-cell">
                            <span className={getStatusTone(check.status)}>{getStatusLabel(check.status)}</span>
                            <strong>{link.title || link.targetUrl}</strong>
                            <a href={link.targetUrl} target="_blank" rel="noreferrer">
                              {link.targetUrl}
                            </a>
                            <small>
                              Stats API - {link.isActive ? "Active" : "Inactive"}
                            </small>
                          </div>
                        </td>
                        <td>
                          <span className={getStatusTone(check.status)}>{check.cuttlyStatusCode || "-"}</span>
                          <small>{check.cuttlyStatusLabel || "-"}</small>
                        </td>
                        <td>
                          <div className="cuttly-link-checker-result-cell">
                            {check.shortLink ? (
                              <a href={check.shortLink} target="_blank" rel="noreferrer">
                                {check.shortLink}
                              </a>
                            ) : null}
                            {check.fullLink ? <small>{check.fullLink}</small> : null}
                            {check.title ? <small>Title: {check.title}</small> : null}
                            {check.checkedAt ? <small>Clicks: {Number(check.clicks || 0)}</small> : null}
                            {check.message ? <small>{check.message}</small> : null}
                          </div>
                        </td>
                        <td>{formatDateTime(check.checkedAt)}</td>
                        <td>
                          <div className="management-inline-actions cuttly-link-checker-row-actions">
                            {isActiveLive ? <span className="management-badge is-progress">Checking...</span> : null}
                            {canCheckLinks ? (
                              <button
                                type="button"
                                className="management-button-secondary"
                                disabled={isChecking || checkingAll || status.running}
                                onClick={() => void handleCheck(link)}
                              >
                                {isChecking ? "Checking..." : "Check"}
                              </button>
                            ) : null}
                            {canManageLinks ? (
                              <>
                                <button
                                  type="button"
                                  className="management-button-secondary"
                                  onClick={() => handleEdit(link)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="management-button-secondary is-danger"
                                  onClick={() => void handleDelete(link)}
                                >
                                  Remove
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="cuttly-link-checker-pagination">
              <div>
                <span>Page {pagination.page} of {pagination.totalPages}</span>
                <strong>{pagination.totalItems} matching URLs</strong>
              </div>
              <label className="management-field" htmlFor="cuttly-page-size">
                <span>Rows</span>
                <select
                  id="cuttly-page-size"
                  value={pagination.limit}
                  onChange={(event) =>
                    setPagination((current) => ({ ...current, page: 1, limit: Number(event.target.value) }))
                  }
                >
                  {[10, 20, 50, 100].map((pageSize) => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize}
                    </option>
                  ))}
                </select>
              </label>
              <div className="management-inline-actions">
                <button
                  type="button"
                  className="management-button-secondary"
                  disabled={!pagination.hasPreviousPage}
                  onClick={() => setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="management-button-secondary"
                  disabled={!pagination.hasNextPage}
                  onClick={() =>
                    setPagination((current) => ({
                      ...current,
                      page: Math.min(current.totalPages || current.page + 1, current.page + 1),
                    }))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="management-empty">No Cutt.ly URLs yet.</p>
        )}
      </section>

      <CuttlyLinkEntryModal
        open={isLinkModalOpen && canManageLinks}
        form={form}
        setForm={setForm}
        saving={savingLink}
        onClose={closeLinkModal}
        onSubmit={handleSaveLink}
      />

      <CuttlyApiSettingsModal
        open={activeSettingsModal === "api" && canManageApi}
        settings={settings}
        apiKey={apiKey}
        setApiKey={setApiKey}
        saving={savingApi}
        onClose={() => setActiveSettingsModal("")}
        onSubmit={handleSaveApi}
        formatDateTime={formatDateTime}
      />

      <CuttlyScheduleModal
        open={activeSettingsModal === "schedule" && canSchedule}
        scheduleForm={scheduleForm}
        setScheduleForm={setScheduleForm}
        status={status}
        saving={savingSchedule}
        nextRunLabel={nextRunLabel}
        getScheduleLabel={getScheduleLabel}
        formatDateTime={formatDateTime}
        onClose={() => setActiveSettingsModal("")}
        onSaveSchedule={handleSaveSchedule}
        onToggleSchedule={handleToggleSchedule}
      />

      <CuttlyTelegramModal
        open={activeSettingsModal === "telegram" && canManageTelegram}
        telegramForm={telegramForm}
        setTelegramForm={setTelegramForm}
        saving={savingTelegram}
        onClose={() => setActiveSettingsModal("")}
        onSubmit={handleSaveTelegram}
        formatDateTime={formatDateTime}
      />
    </div>
  );
}
