import { useEffect, useState } from "react";
import {
  getSerperAvailabilityAlertClassName,
  shouldHideDuplicateSerperError,
} from "../utils/serperAvailabilityUi";

const INTERVAL_OPTIONS = [15, 30, 60];
const WIB_TIME_ZONE = "Asia/Jakarta";

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatDateTimeWib(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("id-ID", {
        timeZone: WIB_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
}

function formatTimeWib(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("id-ID", {
        timeZone: WIB_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(date)
        .replace(":", ".");
}

function joinLines(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isVisible(sectionView, sectionKey) {
  return sectionView === sectionKey;
}

function getIntervalMinutes(settings) {
  const minutes = Number(settings?.checkIntervalMinutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    return minutes;
  }

  const hours = Number(settings?.checkIntervalHours || 1);
  return Number.isFinite(hours) && hours > 0 ? hours * 60 : 60;
}

function formatCountdown(value, nowMs = Date.now()) {
  if (!value) {
    return "";
  }

  const target = new Date(value);
  const targetMs = target.getTime();
  if (Number.isNaN(targetMs)) {
    return "";
  }

  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) {
    return "Starting now";
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}

function getPreviewBadgeClass(badge) {
  if (badge === "OWN") {
    return "bg-emerald-100 text-emerald-800";
  }

  return "bg-slate-100 text-slate-700";
}

export default function AdminPanel({
  dashboard,
  liveAutoCheckStatus = null,
  loading,
  error,
  notice,
  serperAvailability,
  serperAvailabilityLoading,
  onSaveSchedule = async () => {},
  onAddKey,
  onUpdateKey,
  onDeleteKey,
  onStartAutoCheck = async () => {},
  onStopRun = async () => {},
  runActionLoading = false,
  onSaveBackupSettings = async () => {},
  onSaveNotificationSettings = async () => {},
  onRunBackupNow = async () => {},
  backupActionLoading = false,
  onTestBackupTelegram = async () => {},
  backupTestLoading = false,
  onTestNotificationTelegram = async () => {},
  notificationTestLoading = false,
  sectionView = "rank-check",
  isManager = false,
  apiKeysOnly = false,
}) {
  const settings = dashboard?.settings || {};
  const tokens = dashboard?.tokens || [];
  const schedulerStatus = liveAutoCheckStatus?.schedulerStatus || dashboard?.schedulerStatus || {};
  const liveSettings = liveAutoCheckStatus?.settings || settings;
  const scheduleWindow = liveAutoCheckStatus?.scheduleWindow || dashboard?.autoCheckScheduleWindow || [];
  const [scheduleForm, setScheduleForm] = useState({ autoCheckEnabled: false, checkIntervalMinutes: 60 });
  const [backupForm, setBackupForm] = useState({
    backupEnabled: false,
    backupFrequency: "daily",
    backupTimeWib: "00:00",
    backupFormat: "json",
    backupTelegramBotToken: "",
    backupTelegramChatIds: "",
  });
  const [notificationForm, setNotificationForm] = useState({
    notificationsEnabled: false,
    notificationHourlyEnabled: true,
    notificationHourlySendAtMinute: 0,
    notificationInstantEnabled: true,
    notificationInstantDropThreshold: 3,
    notificationAlertOnDrop: true,
    notificationAlertOnNotFound: true,
    notificationDailyDigestEnabled: true,
    notificationDailyDigestTimeWib: "23:00",
    notificationTelegramBotToken: "",
    notificationTelegramChatIds: "",
  });
  const [newKeyForm, setNewKeyForm] = useState({ name: "", key: "", isActive: true });
  const [busy, setBusy] = useState("");
  const [backupTokenEditMode, setBackupTokenEditMode] = useState(false);
  const [clearBackupTokenOnSave, setClearBackupTokenOnSave] = useState(false);
  const [notificationTokenEditMode, setNotificationTokenEditMode] = useState(false);
  const [clearNotificationTokenOnSave, setClearNotificationTokenOnSave] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const currentIntervalMinutes = getIntervalMinutes(liveSettings);
  const selectedIntervalMinutes = Number(scheduleForm.checkIntervalMinutes || currentIntervalMinutes);
  const isAutoCheckActive = Boolean(liveSettings.autoCheckEnabled);
  const isSchedulerRunning = Boolean(schedulerStatus.isRunning);
  const isStopRequested = Boolean(schedulerStatus.stopRequested);
  const needsRestartToApplyInterval = isAutoCheckActive && selectedIntervalMinutes !== currentIntervalMinutes;
  const schedulerStateLabel = isSchedulerRunning
    ? isStopRequested
      ? "Stopping"
      : "Running"
    : isAutoCheckActive
      ? "Scheduled"
      : "Stopped";
  const schedulerStateDetail =
    isSchedulerRunning && Number(schedulerStatus.progress?.totalBrands || 0) > 0
      ? `${Number(schedulerStatus.progress?.processedBrands || 0)}/${Number(
          schedulerStatus.progress?.totalBrands || 0
        )} brands processed`
      : isAutoCheckActive
        ? "Waiting for the next scheduled run"
        : "No active auto-check schedule";
  const processedBrands = Number(schedulerStatus.progress?.processedBrands || 0);
  const totalBrands = Number(schedulerStatus.progress?.totalBrands || 0);
  const liveProgressPercent = totalBrands > 0 ? Math.min(100, Math.round((processedBrands / totalBrands) * 100)) : 0;
  const activeBrandCode = isSchedulerRunning ? schedulerStatus.progress?.brandCode || "-" : "-";
  const activeBrandName = isSchedulerRunning ? schedulerStatus.progress?.brandName || "" : "";
  const previewBrandCode = schedulerStatus.progress?.previewBrandCode || null;
  const previewBrandName = schedulerStatus.progress?.previewBrandName || "";
  const previewResults = Array.isArray(schedulerStatus.progress?.previewResults)
    ? schedulerStatus.progress.previewResults.slice(0, 3)
    : [];
  const previewResultState = schedulerStatus.progress?.previewOk;
  const previewResultError = schedulerStatus.progress?.previewError || "";
  const previewCheckedAt = schedulerStatus.progress?.previewCheckedAt || null;
  const lastRunSummary = schedulerStatus.lastRunSummary || null;
  const autoProcessLabel = isSchedulerRunning ? "Running" : isAutoCheckActive ? "Ready" : "Stopped";
  const runtimeLabel = isSchedulerRunning ? (isStopRequested ? "Stopping" : "Active") : "Idle";
  const isSerperBlocked = serperAvailability?.available === false;
  const displayError = shouldHideDuplicateSerperError(error, serperAvailability) ? "" : error;
  const lastSummaryText = lastRunSummary
    ? `${Number(lastRunSummary.okCount || 0)}/${Number(lastRunSummary.totalBrands || 0)} success`
    : "-";
  const nextAutoCheckCountdown = !isSchedulerRunning && isAutoCheckActive
    ? formatCountdown(liveSettings.nextAutoCheckAt, nowMs)
    : "";
  const isNextAutoCheckStartingNow = nextAutoCheckCountdown === "Starting now";
  const nextAutoCheckDetail = isSchedulerRunning
    ? "Current run in progress"
    : isNextAutoCheckStartingNow
      ? "Next run is starting now"
      : nextAutoCheckCountdown
      ? `Next run in ${nextAutoCheckCountdown}`
      : isAutoCheckActive
        ? "Waiting for the next scheduled slot"
        : "Auto check is stopped";
  const currentProgressText =
    isSchedulerRunning && totalBrands > 0 ? `${processedBrands}/${totalBrands} (${liveProgressPercent}%)` : "-";
  const autoStateMessage = isSchedulerRunning
    ? "Auto check is running now. (WIB)"
    : isAutoCheckActive
      ? "Enabled and waiting for next trigger. (WIB)"
      : "Auto check is stopped.";

  useEffect(() => {
    setScheduleForm({
      autoCheckEnabled: Boolean(settings.autoCheckEnabled),
      checkIntervalMinutes: getIntervalMinutes(settings),
    });
    setBackupForm({
      backupEnabled: Boolean(settings.backupEnabled),
      backupFrequency: settings.backupFrequency || "daily",
      backupTimeWib: settings.backupTimeWib || "00:00",
      backupFormat: settings.backupFormat || "json",
      backupTelegramBotToken: "",
      backupTelegramChatIds: joinLines(settings.backupTelegramChatIds),
    });
    setNotificationForm({
      notificationsEnabled: Boolean(settings.notificationsEnabled),
      notificationHourlyEnabled: settings.notificationHourlyEnabled !== false,
      notificationHourlySendAtMinute: Number(settings.notificationHourlySendAtMinute || 0),
      notificationInstantEnabled: settings.notificationInstantEnabled !== false,
      notificationInstantDropThreshold: Number(settings.notificationInstantDropThreshold || 3),
      notificationAlertOnDrop: settings.notificationAlertOnDrop !== false,
      notificationAlertOnNotFound: settings.notificationAlertOnNotFound !== false,
      notificationDailyDigestEnabled: settings.notificationDailyDigestEnabled !== false,
      notificationDailyDigestTimeWib: settings.notificationDailyDigestTimeWib || "23:00",
      notificationTelegramBotToken: "",
      notificationTelegramChatIds: joinLines(settings.notificationTelegramChatIds),
    });
    setBackupTokenEditMode(false);
    setClearBackupTokenOnSave(false);
    setNotificationTokenEditMode(false);
    setClearNotificationTokenOnSave(false);
  }, [dashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const runAction = async (key, action) => {
    try {
      setBusy(key);
      await action();
    } catch {
      // Parent handlers already surface request errors in the panel.
    } finally {
      setBusy("");
    }
  };

  const promptEditKey = async (token) => {
    const name = window.prompt("Key name", token.name || "");
    if (name === null) return;
    const key = window.prompt("New API key value (leave blank to keep current key)", "");
    if (key === null) return;
    const active = window.confirm("Keep this API key active?");

    await onUpdateKey(token._id, {
      name,
      key,
      isActive: active,
    });
  };

  const buildBackupSettingsPayload = () => {
    const payload = {
      ...backupForm,
      backupTelegramChatIds: splitLines(backupForm.backupTelegramChatIds),
      clearBackupTelegramBotToken: clearBackupTokenOnSave,
    };

    const nextToken = String(backupForm.backupTelegramBotToken || "").trim();
    if (backupTokenEditMode && nextToken && !clearBackupTokenOnSave) {
      payload.backupTelegramBotToken = nextToken;
    } else {
      delete payload.backupTelegramBotToken;
    }

    return payload;
  };

  const buildNotificationSettingsPayload = () => {
    const payload = {
      ...notificationForm,
      notificationTelegramChatIds: splitLines(notificationForm.notificationTelegramChatIds),
      clearNotificationTelegramBotToken: clearNotificationTokenOnSave,
    };

    const nextToken = String(notificationForm.notificationTelegramBotToken || "").trim();
    if (notificationTokenEditMode && nextToken && !clearNotificationTokenOnSave) {
      payload.notificationTelegramBotToken = nextToken;
    } else {
      delete payload.notificationTelegramBotToken;
    }

    return payload;
  };

  const buildBackupTestPayload = () => {
    const payload = {
      backupTelegramChatIds: splitLines(backupForm.backupTelegramChatIds),
    };
    const nextToken = String(backupForm.backupTelegramBotToken || "").trim();
    if (backupTokenEditMode && nextToken && !clearBackupTokenOnSave) {
      payload.backupTelegramBotToken = nextToken;
    }
    return payload;
  };

  const buildNotificationTestPayload = () => {
    const payload = {
      notificationTelegramChatIds: splitLines(notificationForm.notificationTelegramChatIds),
    };
    const nextToken = String(notificationForm.notificationTelegramBotToken || "").trim();
    if (notificationTokenEditMode && nextToken && !clearNotificationTokenOnSave) {
      payload.notificationTelegramBotToken = nextToken;
    }
    return payload;
  };

  if (loading && !dashboard) {
    return <section className="p-4 lg:p-6"><div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-500">Loading Rank Checker settings...</div></section>;
  }

  if (apiKeysOnly) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {serperAvailabilityLoading ? (
            <div className="mb-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              Checking Serper API status...
            </div>
          ) : null}

          {isSerperBlocked ? (
            <div className={`mb-3 rounded-lg px-4 py-3 text-sm ${getSerperAvailabilityAlertClassName(serperAvailability)}`}>
              {serperAvailability?.message || "Rank Checker is unavailable right now."}
            </div>
          ) : null}

          {displayError ? <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{displayError}</p> : null}
          {notice ? <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}

          <div className="space-y-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                runAction("add-key", async () => {
                  await onAddKey(newKeyForm);
                  setNewKeyForm({ name: "", key: "", isActive: true });
                });
              }}
              className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <h3 className="text-sm font-semibold text-slate-900">Add API Key</h3>
              <input
                value={newKeyForm.name}
                onChange={(event) => setNewKeyForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Key name"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
              <textarea
                value={newKeyForm.key}
                onChange={(event) => setNewKeyForm((current) => ({ ...current, key: event.target.value }))}
                placeholder="SERPER API key"
                className="h-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={newKeyForm.isActive}
                  onChange={(event) => setNewKeyForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                <span>Active</span>
              </label>
              <button
                type="submit"
                disabled={busy === "add-key"}
                className="w-fit rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy === "add-key" ? "Adding..." : "Add Key"}
              </button>
            </form>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Key</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Usage</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {tokens.map((token) => (
                    <tr key={token._id}>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{token.name}</p>
                        <p className="text-xs text-slate-500">
                          Remaining: {token.remainingDisplay ?? "-"} | Last used: {formatDateTime(token.lastUsedAt)}
                        </p>
                      </td>
                      <td className="px-3 py-3">{token.isActive ? "Active" : "Inactive"}</td>
                      <td className="px-3 py-3">{token.totalRequests || 0}/{token.monthlyLimit || 0}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => runAction(`edit-key-${token._id}`, () => promptEditKey(token))}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => runAction(`delete-key-${token._id}`, () => onDeleteKey(token._id))}
                            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Rank Checker Admin</h1>
            <p className="mt-1 text-sm text-slate-500">Manage service automation, keys, backup, and notifications.</p>
          </div>
        </div>
   {isVisible(sectionView, "rank-check") ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {serperAvailabilityLoading ? (
              <div className="mb-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                Checking Serper API status...
              </div>
            ) : null}

            {isSerperBlocked ? (
              <div className={`mb-3 rounded-lg px-4 py-3 text-sm ${getSerperAvailabilityAlertClassName(serperAvailability)}`}>
                {serperAvailability?.message || 'Rank Checker is unavailable right now.'}
              </div>
            ) : null}

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[180px] flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Check Interval
                </span>
                <select
                  value={Number(scheduleForm.checkIntervalMinutes)}
                  onChange={(event) =>
                    setScheduleForm((current) => ({
                      ...current,
                      checkIntervalMinutes: Number(event.target.value),
                    }))
                  }
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
                >
                  {INTERVAL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} min
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => runAction("schedule", () => onSaveSchedule(scheduleForm))}
                disabled={busy === "schedule" || needsRestartToApplyInterval}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {busy === "schedule" ? "Saving..." : "Save Schedule"}
              </button>
              <button
                type="button"
                onClick={() => onStartAutoCheck()}
                disabled={
                  runActionLoading ||
                  isAutoCheckActive ||
                  isSchedulerRunning ||
                  serperAvailabilityLoading ||
                  isSerperBlocked
                }
                className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
              >
                {runActionLoading && !isAutoCheckActive && !isSchedulerRunning ? "Starting..." : "Start Auto Check"}
              </button>
              <button
                type="button"
                onClick={() => onStopRun()}
                disabled={runActionLoading || (!isAutoCheckActive && !isSchedulerRunning)}
                className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
              >
                {runActionLoading && (isAutoCheckActive || isSchedulerRunning) ? "Stopping..." : "Stop Auto Check"}
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Start uses the saved interval. Stop is the backend-approved way to change timing while auto-check is active.
            </p>

            {needsRestartToApplyInterval ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Auto check is currently using {currentIntervalMinutes} min. Stop auto check, save {selectedIntervalMinutes} min, then start it again.
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase text-slate-500">Current Progress</p>
                <p className="text-sm font-semibold text-slate-900">{currentProgressText}</p>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    isSchedulerRunning ? "bg-emerald-500" : isAutoCheckActive ? "bg-sky-400" : "bg-slate-400"
                  }`}
                  style={{ width: `${isSchedulerRunning ? liveProgressPercent : 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {isSchedulerRunning
                  ? `Live progress: ${liveProgressPercent}% complete.`
                  : isAutoCheckActive
                    ? isNextAutoCheckStartingNow
                      ? "Ready for the next scheduled slot. Starting now."
                      : nextAutoCheckCountdown
                      ? `Ready for the next scheduled slot in ${nextAutoCheckCountdown}.`
                      : "Waiting for the next scheduled slot."
                    : "No live auto-check is running right now."}
              </p>
            </div>
        {displayError ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{displayError}</p> : null}
        {notice ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase text-slate-500">Auto Check</p><p className="mt-2 text-xl font-bold text-slate-900">{liveSettings.autoCheckEnabled ? "Enabled" : "Stopped"}</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase text-slate-500">Scheduler</p><p className="mt-2 text-xl font-bold text-slate-900">{schedulerStateLabel}</p><p className="mt-1 text-xs text-slate-500">{schedulerStateDetail}</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase text-slate-500">Interval</p><p className="mt-2 text-xl font-bold text-slate-900">{currentIntervalMinutes} min</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase text-slate-500">Next Auto Check</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTimeWib(liveSettings.nextAutoCheckAt)}</p>
            <p className="mt-1 text-xs text-slate-500">{nextAutoCheckDetail}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase text-slate-500">Last Auto Check</p><p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTimeWib(liveSettings.lastAutoCheckAt)}</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase text-slate-500">Next Backup</p><p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(settings.nextBackupAt)}</p></div>
        </div>

     
      </section>

      {isVisible(sectionView, "rank-check") ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Auto Check Configuration</h2>
          <p className="mt-1 text-sm text-slate-500">
            Live scheduler status, current-run progress, and the upcoming schedule window in WIB.
          </p>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Automation</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {autoStateMessage}
                </p>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                Every {currentIntervalMinutes} minutes
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Last Auto Check</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTimeWib(liveSettings.lastAutoCheckAt)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Next Auto Check</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTimeWib(liveSettings.nextAutoCheckAt)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Auto Process</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{autoProcessLabel}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Runtime</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{runtimeLabel}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Last Summary</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{lastSummaryText}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Last Start</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatDateTimeWib(schedulerStatus.lastRunStartedAt)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Last Finish</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatDateTimeWib(schedulerStatus.lastRunFinishedAt)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Last Source</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{schedulerStatus.lastRunSource || "-"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Current Brand</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {activeBrandCode !== "-" ? `${activeBrandCode}${activeBrandName ? ` - ${activeBrandName}` : ""}` : "-"}
                </p>
              </div>
            </div>
            
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-slate-500">Current Run Preview</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {previewBrandCode ? `${previewBrandCode}${previewBrandName ? ` - ${previewBrandName}` : ""}` : "Waiting for first checked brand"}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  {previewCheckedAt ? `Updated ${formatDateTimeWib(previewCheckedAt)}` : "First 3 results only"}
                </p>
              </div>

              {previewResults.length ? (
                <div className="mt-3 space-y-2">
                  {previewResults.map((item) => (
                    <div key={`${item.rank}-${item.link || item.title}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                          #{item.rank}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getPreviewBadgeClass(item.badge)}`}>
                          {item.badge === "OWN" ? "Own" : item.matchedBrandCode || item.badge}
                        </span>
                        <span className="text-xs text-slate-500">{item.domainHost || "-"}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900" title={item.title}>
                        {item.title}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  {isSchedulerRunning
                    ? previewResultState === false && previewResultError
                      ? `Current brand preview is unavailable: ${previewResultError}`
                      : "The first 3 results appear here as each brand finishes checking."
                    : "Current-run preview appears here while auto check is active."}
                </p>
              )}
            </div>
            {lastRunSummary ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Last Run Summary</p>
                <p className="mt-2">
                  Source: {lastRunSummary.source || "-"} | Success: {Number(lastRunSummary.okCount || 0)} | Failed:{" "}
                  {Number(lastRunSummary.failCount || 0)} | Stopped: {lastRunSummary.stopped ? "Yes" : "No"}
                </p>
                {Array.isArray(lastRunSummary.failureReasons) && lastRunSummary.failureReasons.length ? (
                  <p className="mt-2 text-xs text-rose-600">
                    {lastRunSummary.failureReasons.slice(0, 3).join(" | ")}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-slate-900">
                Schedule Window (WIB: Previous 2 + Next 12 Hours From Now)
              </h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
                {scheduleWindow.map((slot) => {
                  const slotStatus = slot?.status || "Pending";
                  const statusClass =
                    slotStatus === "Success"
                      ? "bg-emerald-100 text-emerald-800"
                      : slotStatus === "Failure"
                        ? "bg-rose-100 text-rose-800"
                        : slotStatus === "Next"
                          ? "bg-sky-100 text-sky-800"
                          : slotStatus === "Running"
                            ? "bg-amber-100 text-amber-800"
                            : slotStatus === "Stopped"
                              ? "bg-slate-200 text-slate-800"
                              : slotStatus === "Scheduled"
                                ? "bg-indigo-100 text-indigo-800"
                                : "bg-slate-100 text-slate-700";

                  return (
                    <div key={slot.slotAt} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-sm font-semibold text-slate-900">{formatTimeWib(slot.slotAt)}</p>
                      <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass}`}>
                        {slotStatus}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                runAction("add-key", async () => {
                  await onAddKey(newKeyForm);
                  setNewKeyForm({ name: "", key: "", isActive: true });
                });
              }}
              className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <h3 className="text-sm font-semibold text-slate-900">Add API Key</h3>
              <input value={newKeyForm.name} onChange={(event) => setNewKeyForm((current) => ({ ...current, name: event.target.value }))} placeholder="Key name" className="rounded-md border border-slate-300 px-3 py-2 text-sm" required />
              <textarea value={newKeyForm.key} onChange={(event) => setNewKeyForm((current) => ({ ...current, key: event.target.value }))} placeholder="SERPER API key" className="h-24 rounded-md border border-slate-300 px-3 py-2 text-sm" required />
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={newKeyForm.isActive} onChange={(event) => setNewKeyForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>Active</span></label>
              <button type="submit" disabled={busy === "add-key"} className="w-fit rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{busy === "add-key" ? "Adding..." : "Add Key"}</button>
            </form>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">Key</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Usage</th><th className="px-3 py-2 text-left">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {tokens.map((token) => (
                    <tr key={token._id}>
                      <td className="px-3 py-3"><p className="font-semibold text-slate-900">{token.name}</p><p className="text-xs text-slate-500">Remaining: {token.remainingDisplay ?? "-"} | Last used: {formatDateTime(token.lastUsedAt)}</p></td>
                      <td className="px-3 py-3">{token.isActive ? "Active" : "Inactive"}</td>
                      <td className="px-3 py-3">{token.totalRequests || 0}/{token.monthlyLimit || 0}</td>
                      <td className="px-3 py-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => runAction(`edit-key-${token._id}`, () => promptEditKey(token))} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button><button type="button" onClick={() => runAction(`delete-key-${token._id}`, () => onDeleteKey(token._id))} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Delete</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {!isManager && isVisible(sectionView, "backup") ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Backup Settings</h2>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><input type="checkbox" checked={backupForm.backupEnabled} onChange={(event) => setBackupForm((current) => ({ ...current, backupEnabled: event.target.checked }))} /><span>Enable scheduled backups</span></label>
            <select value={backupForm.backupFrequency} onChange={(event) => setBackupForm((current) => ({ ...current, backupFrequency: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="daily">Daily</option><option value="twice_weekly">Twice Weekly</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
            <input type="time" value={backupForm.backupTimeWib} onChange={(event) => setBackupForm((current) => ({ ...current, backupTimeWib: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <select value={backupForm.backupFormat} onChange={(event) => setBackupForm((current) => ({ ...current, backupFormat: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="json">JSON</option><option value="ndjson">NDJSON</option></select>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 xl:col-span-2">
              <p className="font-semibold text-slate-900">Backup Bot Token</p>
              <p className="mt-1 text-xs text-slate-500">
                Token changes apply after you click Save Backup Settings.
              </p>
              <p className="mt-3 text-sm">
                Saved Bot: {settings.backupTelegramBotTokenConfigured ? settings.backupTelegramBotTokenMasked : "Not saved"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setBackupTokenEditMode((current) => !current);
                    setClearBackupTokenOnSave(false);
                    setBackupForm((current) => ({ ...current, backupTelegramBotToken: "" }));
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  {backupTokenEditMode ? "Cancel Edit" : settings.backupTelegramBotTokenConfigured ? "Edit" : "Add Token"}
                </button>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={clearBackupTokenOnSave}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setClearBackupTokenOnSave(checked);
                      if (checked) {
                        setBackupTokenEditMode(false);
                        setBackupForm((current) => ({ ...current, backupTelegramBotToken: "" }));
                      }
                    }}
                  />
                  <span>Clear on Update</span>
                </label>
              </div>
            </div>
            {backupTokenEditMode ? (
              <input
                value={backupForm.backupTelegramBotToken}
                onChange={(event) => {
                  setClearBackupTokenOnSave(false);
                  setBackupForm((current) => ({ ...current, backupTelegramBotToken: event.target.value }));
                }}
                placeholder={
                  settings.backupTelegramBotTokenConfigured
                    ? "Enter new token to replace existing"
                    : "Enter backup Telegram bot token"
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm xl:col-span-2"
              />
            ) : null}
            <textarea value={backupForm.backupTelegramChatIds} onChange={(event) => setBackupForm((current) => ({ ...current, backupTelegramChatIds: event.target.value }))} placeholder="Backup Telegram chat IDs, one per line" className="h-28 rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => runAction("backup", () => onSaveBackupSettings(buildBackupSettingsPayload()))} disabled={busy === "backup"} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{busy === "backup" ? "Saving..." : "Save Backup Settings"}</button>
            <button type="button" onClick={() => onTestBackupTelegram(buildBackupTestPayload())} disabled={backupTestLoading} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{backupTestLoading ? "Testing..." : "Test Backup Telegram"}</button>
          </div>
        </section>
      ) : null}

      {!isManager && isVisible(sectionView, "notifications") ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Notification Settings</h2>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><input type="checkbox" checked={notificationForm.notificationsEnabled} onChange={(event) => setNotificationForm((current) => ({ ...current, notificationsEnabled: event.target.checked }))} /><span>Enable notifications</span></label>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><input type="checkbox" checked={notificationForm.notificationHourlyEnabled} onChange={(event) => setNotificationForm((current) => ({ ...current, notificationHourlyEnabled: event.target.checked }))} /><span>Hourly notifications</span></label>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><input type="checkbox" checked={notificationForm.notificationInstantEnabled} onChange={(event) => setNotificationForm((current) => ({ ...current, notificationInstantEnabled: event.target.checked }))} /><span>Instant alerts</span></label>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><input type="checkbox" checked={notificationForm.notificationDailyDigestEnabled} onChange={(event) => setNotificationForm((current) => ({ ...current, notificationDailyDigestEnabled: event.target.checked }))} /><span>Daily digest</span></label>
            <input type="number" min="0" max="59" value={notificationForm.notificationHourlySendAtMinute} onChange={(event) => setNotificationForm((current) => ({ ...current, notificationHourlySendAtMinute: Number(event.target.value || 0) }))} placeholder="Hourly send minute" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input type="number" min="1" max="10" value={notificationForm.notificationInstantDropThreshold} onChange={(event) => setNotificationForm((current) => ({ ...current, notificationInstantDropThreshold: Number(event.target.value || 1) }))} placeholder="Drop threshold" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><input type="checkbox" checked={notificationForm.notificationAlertOnDrop} onChange={(event) => setNotificationForm((current) => ({ ...current, notificationAlertOnDrop: event.target.checked }))} /><span>Alert on rank drop</span></label>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><input type="checkbox" checked={notificationForm.notificationAlertOnNotFound} onChange={(event) => setNotificationForm((current) => ({ ...current, notificationAlertOnNotFound: event.target.checked }))} /><span>Alert on not found</span></label>
            <input type="time" value={notificationForm.notificationDailyDigestTimeWib} onChange={(event) => setNotificationForm((current) => ({ ...current, notificationDailyDigestTimeWib: event.target.value }))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Notification Bot Token</p>
              <p className="mt-1 text-xs text-slate-500">
                Token changes apply after you click Save Notification Settings.
              </p>
              <p className="mt-3 text-sm">
                Saved Bot: {settings.notificationTelegramBotTokenConfigured ? settings.notificationTelegramBotTokenMasked : "Not saved"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationTokenEditMode((current) => !current);
                    setClearNotificationTokenOnSave(false);
                    setNotificationForm((current) => ({ ...current, notificationTelegramBotToken: "" }));
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  {notificationTokenEditMode ? "Cancel Edit" : settings.notificationTelegramBotTokenConfigured ? "Edit" : "Add Token"}
                </button>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={clearNotificationTokenOnSave}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setClearNotificationTokenOnSave(checked);
                      if (checked) {
                        setNotificationTokenEditMode(false);
                        setNotificationForm((current) => ({ ...current, notificationTelegramBotToken: "" }));
                      }
                    }}
                  />
                  <span>Clear on Update</span>
                </label>
              </div>
            </div>
            {notificationTokenEditMode ? (
              <input
                value={notificationForm.notificationTelegramBotToken}
                onChange={(event) => {
                  setClearNotificationTokenOnSave(false);
                  setNotificationForm((current) => ({ ...current, notificationTelegramBotToken: event.target.value }));
                }}
                placeholder={
                  settings.notificationTelegramBotTokenConfigured
                    ? "Enter new token to replace existing"
                    : "Enter notification Telegram bot token"
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            ) : null}
            <textarea value={notificationForm.notificationTelegramChatIds} onChange={(event) => setNotificationForm((current) => ({ ...current, notificationTelegramChatIds: event.target.value }))} placeholder="Notification chat IDs, one per line" className="h-28 rounded-md border border-slate-300 px-3 py-2 text-sm xl:col-span-2" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => runAction("notifications", () => onSaveNotificationSettings(buildNotificationSettingsPayload()))} disabled={busy === "notifications"} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{busy === "notifications" ? "Saving..." : "Save Notification Settings"}</button>
            <button type="button" onClick={() => onTestNotificationTelegram(buildNotificationTestPayload())} disabled={notificationTestLoading} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{notificationTestLoading ? "Testing..." : "Test Notification Telegram"}</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
