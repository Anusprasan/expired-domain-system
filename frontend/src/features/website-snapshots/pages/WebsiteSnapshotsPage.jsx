import React, { useEffect, useMemo, useState } from "react";
import { FaCheckCircle, FaEye, FaRedoAlt, FaSyncAlt } from "react-icons/fa";
import { useAuth } from "../../auth/hooks/useAuth";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import { hasPrivilege } from "../../../shared/utils/permissions";
import {
  checkWebsiteSnapshotArchiveStatusApi,
  deleteWebsiteSnapshotHistoryApi,
  downloadWebsiteSnapshotApi,
  getWebsiteSnapshotHistoryApi,
  getWebsiteSnapshotViewStatesApi,
  searchWebsiteSnapshotsApi,
  setWebsiteSnapshotViewStateApi,
} from "../api/websiteSnapshotApi";
import "../../../shared/styles/management.css";

const DEFAULT_FROM_DATE = "2005-01-01";
const PREVIEW_LOAD_TIMEOUT_MS = 30000;
const PREVIEW_PARALLEL_LOAD_LIMIT = 4;

function getTodayInputDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDefaultForm() {
  return {
    url: "",
    scope: "domain",
    fromDate: DEFAULT_FROM_DATE,
    toDate: getTodayInputDate(),
    limit: "5000",
    includeAssets: true,
  };
}

function formatDateTime(value, locale) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateOnly(value, locale) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(date);
}

function formatNumber(value, locale) {
  return new Intl.NumberFormat(locale).format(Math.max(0, Number(value) || 0));
}

function formatBytes(value, locale) {
  const bytes = Math.max(0, Number(value) || 0);
  if (!bytes) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(size)} ${units[unitIndex]}`;
}

function getSnapshotYear(snapshot) {
  return String(snapshot?.timestamp || "").slice(0, 4) || "Unknown";
}

function getSnapshotKey(snapshot) {
  if (!snapshot?.timestamp || !snapshot?.originalUrl) {
    return "";
  }

  return `${snapshot.timestamp}:${snapshot.originalUrl}`;
}

function getSnapshotPreviewUrl(snapshot) {
  return snapshot?.previewArchiveUrl || snapshot?.archiveUrl || "";
}

function buildPreviewUrlFromArchiveUrl(archiveUrl, timestamp, originalUrl) {
  if (!archiveUrl || !timestamp || !originalUrl) {
    return "";
  }

  return archiveUrl.replace(`/web/${timestamp}/`, `/web/${timestamp}if_/`);
}

function normalizeHistorySnapshot(snapshot = {}) {
  const timestamp = String(snapshot.timestamp || "");
  const originalUrl = String(snapshot.originalUrl || "");
  const archiveUrl = snapshot.archiveUrl || "";

  return {
    timestamp,
    originalUrl,
    capturedAt: snapshot.capturedAt || "",
    archiveUrl,
    previewArchiveUrl:
      snapshot.previewArchiveUrl || buildPreviewUrlFromArchiveUrl(archiveUrl, timestamp, originalUrl),
    rawArchiveUrl: snapshot.rawArchiveUrl || "",
    mimetype: snapshot.mimetype || "text/html",
    statusCode: Number(snapshot.statusCode) || 0,
    digest: snapshot.digest || "",
    length: Number(snapshot.length) || 0,
  };
}

function buildSnapshotSummary(items = []) {
  const years = items.map((item) => getSnapshotYear(item)).filter(Boolean);

  return {
    totalSnapshots: items.length,
    newestYear: years[0] || "",
    oldestYear: years[years.length - 1] || "",
  };
}

function formatPageLabel(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return value || "-";
  }
}

function buildPageGroups(items = []) {
  const groups = new Map();

  items.forEach((snapshot) => {
    if (!snapshot?.originalUrl) {
      return;
    }

    if (!groups.has(snapshot.originalUrl)) {
      groups.set(snapshot.originalUrl, []);
    }

    groups.get(snapshot.originalUrl).push(snapshot);
  });

  return Array.from(groups.entries())
    .map(([originalUrl, snapshots]) => {
      const sortedSnapshots = [...snapshots].sort((left, right) =>
        String(right.timestamp).localeCompare(String(left.timestamp))
      );

      return {
        originalUrl,
        label: formatPageLabel(originalUrl),
        count: sortedSnapshots.length,
        newestAt: sortedSnapshots[0]?.capturedAt || "",
        oldestAt: sortedSnapshots[sortedSnapshots.length - 1]?.capturedAt || "",
        items: sortedSnapshots,
      };
    })
    .sort((left, right) => String(right.items[0]?.timestamp || "").localeCompare(String(left.items[0]?.timestamp || "")));
}

function buildYearStats(items = []) {
  const counts = items.reduce((accumulator, item) => {
    const year = getSnapshotYear(item);
    accumulator[year] = (accumulator[year] || 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .map(([year, count]) => ({ year, count }))
    .sort((left, right) => String(right.year).localeCompare(String(left.year)));
}

function getYearFromInput(value, fallback) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.getFullYear();
}

function dateStampToInput(value, fallback = "") {
  const text = String(value || "");
  if (/^\d{8}/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  return fallback;
}

function buildWaybackTimelineYears(items = [], fromDate, toDate, selectedSnapshot) {
  const currentYear = new Date().getFullYear();
  const startYear = Math.min(
    getYearFromInput(fromDate, 2015),
    ...items.map((item) => Number(getSnapshotYear(item))).filter(Boolean)
  );
  const endYear = Math.max(
    getYearFromInput(toDate, currentYear),
    ...items.map((item) => Number(getSnapshotYear(item))).filter(Boolean)
  );
  const counts = items.reduce((accumulator, item) => {
    const year = getSnapshotYear(item);
    accumulator[year] = (accumulator[year] || 0) + 1;
    return accumulator;
  }, {});
  const selectedYear = getSnapshotYear(selectedSnapshot);

  return Array.from({ length: Math.max(1, endYear - startYear + 1) }, (_, index) => {
    const year = String(startYear + index);

    return {
      year,
      count: counts[year] || 0,
      isSelected: year === selectedYear,
    };
  });
}

function downloadBlob(blob, fileName) {
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

function getPreviewCardClass({ isSelected, isViewed, status }) {
  const baseClass =
    "group min-w-[190px] rounded-lg border px-3 py-2 text-left transition duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400";

  if (isSelected) {
    return `${baseClass} border-blue-400 bg-blue-50 text-blue-950 shadow-sm shadow-blue-100 ring-1 ring-blue-300`;
  }

  if (isViewed) {
    return `${baseClass} border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm shadow-emerald-100`;
  }

  if (status === "loaded") {
    return `${baseClass} border-teal-300 bg-teal-50 text-teal-950 shadow-sm shadow-teal-100`;
  }

  if (status === "loading") {
    return `${baseClass} border-amber-300 bg-amber-50 text-amber-950 shadow-sm shadow-amber-100`;
  }

  if (status === "failed") {
    return `${baseClass} border-rose-300 bg-rose-50 text-rose-950 shadow-sm shadow-rose-100`;
  }

  return `${baseClass} border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300 hover:bg-white`;
}

export default function WebsiteSnapshotsPage() {
  const { user } = useAuth();
  const { copy, language } = useUiLanguage();
  const snapshotsCopy = copy.websiteSnapshots;
  const locale = language === "indonesian" ? "id-ID" : "en-US";
  const canDownloadSnapshots = hasPrivilege(user, "DOWNLOAD_WEBSITE_SNAPSHOTS");
  const canManageSnapshots = hasPrivilege(user, "MANAGE_WEBSITE_SNAPSHOTS");

  const [form, setForm] = useState(createDefaultForm);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDeletingId, setHistoryDeletingId] = useState("");
  const [historyItems, setHistoryItems] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCache, setPreviewCache] = useState({});
  const [viewedSnapshotKeys, setViewedSnapshotKeys] = useState(() => new Set());
  const [preloadQueue, setPreloadQueue] = useState([]);
  const [archiveStatus, setArchiveStatus] = useState({
    state: "idle",
    message: "",
  });
  const [processingMessage, setProcessingMessage] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedPageUrl, setSelectedPageUrl] = useState("");
  const [selectedSnapshotKey, setSelectedSnapshotKey] = useState("");
  const [snapshotData, setSnapshotData] = useState({
    items: [],
    summary: {
      totalSnapshots: 0,
      newestYear: "",
      oldestYear: "",
    },
    query: null,
    cache: null,
  });

  const pageOptions = useMemo(() => buildPageGroups(snapshotData.items), [snapshotData.items]);
  const selectedPageGroup = useMemo(
    () => pageOptions.find((group) => group.originalUrl === selectedPageUrl) || pageOptions[0] || null,
    [pageOptions, selectedPageUrl]
  );
  const selectedPageSnapshots = selectedPageGroup?.items || [];
  const yearStats = useMemo(() => buildYearStats(selectedPageSnapshots), [selectedPageSnapshots]);
  const maxYearCount = useMemo(
    () => yearStats.reduce((maxValue, item) => Math.max(maxValue, item.count), 0),
    [yearStats]
  );
  const selectedSnapshot = useMemo(
    () =>
      selectedPageSnapshots.find((snapshot) => getSnapshotKey(snapshot) === selectedSnapshotKey)
      || selectedPageSnapshots[0]
      || null,
    [selectedPageSnapshots, selectedSnapshotKey]
  );
  const selectedSnapshotToken = selectedSnapshot ? getSnapshotKey(selectedSnapshot) : "";
  const selectedPreviewEntry = selectedSnapshotToken ? previewCache[selectedSnapshotToken] : null;
  const selectedPreviewStatus = selectedPreviewEntry?.status || "idle";
  const selectedPreviewUrl = getSnapshotPreviewUrl(selectedSnapshot);
  const selectedPreviewFrameKey = `${selectedSnapshotToken}:${selectedPreviewUrl}:${selectedPreviewEntry?.version || 0}`;
  const activePreloadItems = preloadQueue.slice(0, PREVIEW_PARALLEL_LOAD_LIMIT);
  const activePreloadToken = activePreloadItems
    .map((item) => `${item.key}:${item.url}:${previewCache[item.key]?.version || 0}`)
    .join("|");
  const previewLoadTotal = selectedPageSnapshots.length;
  const loadedPreviewCount = selectedPageSnapshots.filter(
    (snapshot) => previewCache[getSnapshotKey(snapshot)]?.status === "loaded"
  ).length;
  const viewedPreviewCount = selectedPageSnapshots.filter(
    (snapshot) => viewedSnapshotKeys.has(getSnapshotKey(snapshot))
  ).length;
  const isPreloadingAll = preloadQueue.length > 0;
  const timelineYears = useMemo(
    () => buildWaybackTimelineYears(selectedPageSnapshots, form.fromDate, form.toDate, selectedSnapshot),
    [form.fromDate, form.toDate, selectedPageSnapshots, selectedSnapshot]
  );
  const maxTimelineCount = useMemo(
    () => timelineYears.reduce((maxValue, item) => Math.max(maxValue, item.count), 0),
    [timelineYears]
  );
  const selectedPageSummary = useMemo(() => {
    const years = selectedPageSnapshots.map(getSnapshotYear).filter(Boolean);

    return {
      totalPages: pageOptions.length,
      totalCaptures: selectedPageSnapshots.length,
      newestYear: years[0] || "",
      oldestYear: years[years.length - 1] || "",
    };
  }, [pageOptions.length, selectedPageSnapshots]);

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await getWebsiteSnapshotHistoryApi({ limit: 8 });
      setHistoryItems(response.data?.items || []);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const setPreviewCacheStatus = (snapshotKey, status, extra = {}) => {
    if (!snapshotKey) {
      return;
    }

    setPreviewCache((current) => ({
      ...current,
      [snapshotKey]: {
        ...(current[snapshotKey] || {}),
        status,
        updatedAt: Date.now(),
        ...extra,
      },
    }));
  };

  const handleRetrySelectedPreview = () => {
    if (!selectedSnapshotToken || !selectedPreviewUrl) {
      return;
    }

    setPreloadQueue((current) => current.filter((item) => item.key !== selectedSnapshotToken));
    setPreviewCache((current) => {
      const currentEntry = current[selectedSnapshotToken] || {};

      return {
        ...current,
        [selectedSnapshotToken]: {
          ...currentEntry,
          status: "idle",
          url: selectedPreviewUrl,
          version: Number(currentEntry.version || 0) + 1,
          updatedAt: Date.now(),
        },
      };
    });
    setPreviewLoading(true);
  };

  const handleToggleSelectedViewed = async () => {
    if (!selectedSnapshotToken || !selectedSnapshot) {
      return;
    }

    const wasViewed = viewedSnapshotKeys.has(selectedSnapshotToken);
    setViewedSnapshotKeys((current) => {
      if (wasViewed) {
        const next = new Set(current);
        next.delete(selectedSnapshotToken);
        return next;
      }

      const next = new Set(current);
      next.add(selectedSnapshotToken);
      return next;
    });

    try {
      await setWebsiteSnapshotViewStateApi({
        timestamp: selectedSnapshot.timestamp,
        originalUrl: selectedSnapshot.originalUrl,
        viewed: !wasViewed,
      });
    } catch (requestError) {
      setViewedSnapshotKeys((current) => {
        const next = new Set(current);
        if (wasViewed) {
          next.add(selectedSnapshotToken);
        } else {
          next.delete(selectedSnapshotToken);
        }
        return next;
      });
      setError(requestError.response?.data?.message || snapshotsCopy.messages.viewStateFailed);
    }
  };

  const handleLoadAllPreviews = () => {
    const queue = selectedPageSnapshots
      .map((snapshot) => ({
        key: getSnapshotKey(snapshot),
        url: getSnapshotPreviewUrl(snapshot),
      }))
      .filter((item) => item.key && item.url);

    if (!queue.length) {
      return;
    }

    setPreviewCache((current) => {
      const next = { ...current };

      queue.forEach((item) => {
        const currentEntry = next[item.key] || {};
        next[item.key] = {
          ...currentEntry,
          status: "loading",
          url: item.url,
          version: Number(currentEntry.version || 0) + 1,
          updatedAt: Date.now(),
        };
      });

      return next;
    });
    setPreloadQueue(queue);
    setPreviewLoading(Boolean(selectedSnapshotToken));
  };

  const completePreloadItem = (snapshotKey, status) => {
    setPreviewCacheStatus(snapshotKey, status);
    setPreloadQueue((current) => {
      return current.filter((item) => item.key !== snapshotKey);
    });
  };

  const loadSnapshotViewStates = async (snapshots) => {
    const snapshotPayload = (snapshots || [])
      .map((snapshot) => ({
        timestamp: snapshot.timestamp,
        originalUrl: snapshot.originalUrl,
      }))
      .filter((snapshot) => snapshot.timestamp && snapshot.originalUrl);

    if (!snapshotPayload.length) {
      return;
    }

    try {
      const response = await getWebsiteSnapshotViewStatesApi({
        snapshots: snapshotPayload,
      });
      const viewedKeys = new Set(response.data?.viewedKeys || []);
      const pageKeys = new Set(
        snapshotPayload.map((snapshot) => `${snapshot.timestamp}:${snapshot.originalUrl}`)
      );

      setViewedSnapshotKeys((current) => {
        const next = new Set(current);
        pageKeys.forEach((key) => next.delete(key));
        viewedKeys.forEach((key) => next.add(key));
        return next;
      });
    } catch {
      // Viewed marks are helpful state, but the viewer can still work without them.
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  useEffect(() => {
    void loadSnapshotViewStates(selectedPageSnapshots);
  }, [selectedPageSnapshots]);

  useEffect(() => {
    if (!selectedPreviewUrl || !selectedSnapshotToken) {
      setPreviewLoading(false);
      return undefined;
    }

    if (selectedPreviewStatus === "loaded" || selectedPreviewStatus === "failed") {
      setPreviewLoading(false);
      return undefined;
    }

    setPreviewCacheStatus(selectedSnapshotToken, "loading", { url: selectedPreviewUrl });
    setPreviewLoading(true);
    const timeoutId = window.setTimeout(() => {
      setPreviewLoading(false);
      setPreviewCacheStatus(selectedSnapshotToken, "failed", { url: selectedPreviewUrl });
    }, PREVIEW_LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    selectedPreviewUrl,
    selectedSnapshotToken,
    selectedPreviewStatus,
    selectedPreviewEntry?.version,
  ]);

  useEffect(() => {
    if (!activePreloadItems.length) {
      return undefined;
    }

    const timeoutIds = activePreloadItems.map((item) =>
      window.setTimeout(() => {
        completePreloadItem(item.key, "failed");
      }, PREVIEW_LOAD_TIMEOUT_MS)
    );

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [activePreloadToken]);

  const handleChange = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleUseHistoryItem = (item) => {
    const savedSnapshots = (item.snapshots || [])
      .map(normalizeHistorySnapshot)
      .filter((snapshot) => snapshot.timestamp && snapshot.originalUrl)
      .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
    const firstItem = savedSnapshots[0] || null;

    setForm((current) => ({
      ...current,
      url: item.requestedUrl || item.normalizedUrl || current.url,
      scope: item.scope || current.scope,
      fromDate: dateStampToInput(item.fromDate, current.fromDate),
      toDate: dateStampToInput(item.toDate, current.toDate),
      limit: item.limit ? String(Math.max(1000, Number(item.limit) || 0)) : current.limit,
      includeAssets: item.includeAssets !== false,
    }));

    if (!savedSnapshots.length) {
      return;
    }

    setSnapshotData({
      items: savedSnapshots,
      summary: {
        ...buildSnapshotSummary(savedSnapshots),
        totalSnapshots: Number(item.totalSnapshots) || savedSnapshots.length,
      },
      query: {
        url: item.normalizedUrl || item.requestedUrl || "",
        scope: item.scope || "exact",
        limit: Number(item.limit) || savedSnapshots.length,
        fromDate: item.fromDate || "",
        toDate: item.toDate || "",
      },
      cache: {
        ttlMs: 0,
        cachedRequests: Number(item.cachedRequests) || 1,
        liveRequests: Number(item.liveRequests) || 0,
        source: "database-history",
      },
    });
    setSelectedPageUrl(firstItem?.originalUrl || "");
    setSelectedSnapshotKey(getSnapshotKey(firstItem));
    setPreloadQueue([]);
    setPreviewLoading(false);
    setArchiveStatus({
      state: "online",
      message: snapshotsCopy.status.databaseResult(savedSnapshots.length),
    });
    setSuccessMessage(snapshotsCopy.messages.historyLoadSuccess(savedSnapshots.length));
  };

  const handleDeleteHistoryItem = async (item) => {
    if (!item?._id || !canManageSnapshots) {
      return;
    }

    const confirmed = window.confirm(snapshotsCopy.history.deleteConfirm);
    if (!confirmed) {
      return;
    }

    try {
      setHistoryDeletingId(item._id);
      setError("");
      await deleteWebsiteSnapshotHistoryApi(item._id);
      setSuccessMessage(snapshotsCopy.history.deleteSuccess);
      await loadHistory();
    } catch (requestError) {
      setError(requestError.response?.data?.message || snapshotsCopy.history.deleteFailed);
    } finally {
      setHistoryDeletingId("");
    }
  };

  const handleSelectPage = (originalUrl) => {
    const nextGroup = pageOptions.find((group) => group.originalUrl === originalUrl);
    setSelectedPageUrl(originalUrl);
    setSelectedSnapshotKey(getSnapshotKey(nextGroup?.items?.[0]));
  };

  const handleSearch = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setProcessingMessage(snapshotsCopy.process.searching);
      setError("");
      setSuccessMessage("");
      const response = await searchWebsiteSnapshotsApi({
        url: form.url,
        scope: "exact",
        fromDate: form.fromDate,
        toDate: form.toDate,
        limit: form.limit,
      });

      const data = response.data || {};
      const items = data.items || [];
      const firstItem = items[0] || null;
      const cache = data.cache || null;
      setSnapshotData({
        items,
        summary: data.summary || {
          totalSnapshots: 0,
          newestYear: "",
          oldestYear: "",
        },
        query: data.query || null,
        cache,
      });
      setSelectedPageUrl(firstItem?.originalUrl || "");
      setSelectedSnapshotKey(getSnapshotKey(firstItem));
      setArchiveStatus({
        state: "online",
        message: cache?.cachedRequests
          ? snapshotsCopy.status.cacheResult(cache.cachedRequests, cache.liveRequests)
          : snapshotsCopy.status.liveResult,
      });
      setSuccessMessage(
        snapshotsCopy.messages.searchSuccess(Number(data.summary?.totalSnapshots || 0))
      );
      void loadHistory();
    } catch (requestError) {
      setSnapshotData({
        items: [],
        summary: {
          totalSnapshots: 0,
          newestYear: "",
          oldestYear: "",
        },
        query: null,
        cache: null,
      });
      setSelectedPageUrl("");
      setSelectedSnapshotKey("");
      setError(requestError.response?.data?.message || snapshotsCopy.messages.searchFailed);
    } finally {
      setLoading(false);
      setProcessingMessage("");
    }
  };

  const handleCheckArchiveStatus = async () => {
    try {
      setArchiveStatus({
        state: "checking",
        message: snapshotsCopy.status.checkingArchive,
      });
      setError("");
      const response = await checkWebsiteSnapshotArchiveStatusApi({
        url: form.url || "example.com",
      });
      const data = response.data || {};
      setArchiveStatus({
        state: "online",
        message: snapshotsCopy.status.online(Number(data.responseTimeMs || 0)),
      });
    } catch (requestError) {
      setArchiveStatus({
        state: "offline",
        message:
          requestError.response?.data?.message
          || requestError.response?.data?.code
          || snapshotsCopy.status.offline,
      });
    }
  };

  const handleDownload = async (snapshot) => {
    if (!snapshot?.timestamp || !snapshot?.originalUrl || !canDownloadSnapshots) {
      return;
    }

    try {
      setActionLoading(`${snapshot.timestamp}:${snapshot.originalUrl}`);
      setProcessingMessage(snapshotsCopy.process.preparingDownload);
      setError("");
      setSuccessMessage("");
      const response = await downloadWebsiteSnapshotApi({
        url: form.url,
        originalUrl: snapshot.originalUrl,
        timestamp: snapshot.timestamp,
        includeAssets: form.includeAssets,
      });
      downloadBlob(response.blob, response.fileName);
      setSuccessMessage(snapshotsCopy.messages.downloadSuccess);
      void loadHistory();
    } catch (requestError) {
      setError(requestError.response?.data?.message || snapshotsCopy.messages.downloadFailed);
    } finally {
      setActionLoading("");
      setProcessingMessage("");
    }
  };

  const resetForm = () => {
    setForm(createDefaultForm());
    setSnapshotData({
      items: [],
      summary: {
        totalSnapshots: 0,
        newestYear: "",
        oldestYear: "",
      },
      query: null,
      cache: null,
    });
    setError("");
    setSuccessMessage("");
    setProcessingMessage("");
    setSelectedPageUrl("");
    setSelectedSnapshotKey("");
  };

  return (
    <div className="management-page website-snapshots-page">
      <section className="app-panel management-header website-snapshots-hero">
        <div>
          <span className="website-snapshots-eyebrow">{snapshotsCopy.page.eyebrow}</span>
          <h1>{snapshotsCopy.page.title}</h1>
          <p>{snapshotsCopy.page.description}</p>
        </div>
        <div className="management-header-actions website-snapshots-header-actions">
          <button
            type="button"
            className="management-button-secondary"
            onClick={handleCheckArchiveStatus}
            disabled={archiveStatus.state === "checking" || loading}
          >
            {archiveStatus.state === "checking"
              ? snapshotsCopy.status.checkingArchive
              : snapshotsCopy.status.checkArchive}
          </button>
          <div className="management-summary">
            <strong>{formatNumber(snapshotData.summary.totalSnapshots, locale)}</strong>
            <span>{snapshotsCopy.page.snapshotsFound}</span>
          </div>
        </div>
      </section>

      <ToastNotice message={error} onClose={() => setError("")} tone="notice" />
      <ToastNotice
        message={successMessage}
        onClose={() => setSuccessMessage("")}
        tone="success"
      />

      <section className="app-panel website-snapshots-live-status">
        <div className={`website-snapshots-status-dot is-${archiveStatus.state}`} />
        <div>
          <strong>
            {processingMessage
              ? snapshotsCopy.status.checkingArchive
              : archiveStatus.state === "online"
                ? snapshotsCopy.status.checkArchive
                : snapshotsCopy.page.eyebrow}
          </strong>
          <p>{processingMessage || archiveStatus.message || snapshotsCopy.status.idle}</p>
        </div>
      </section>

      <section className="app-panel website-snapshots-history-panel">
        <div className="management-section-header">
          <div>
            <h2>{snapshotsCopy.history.title}</h2>
            <p>{snapshotsCopy.history.description}</p>
          </div>
          <button
            type="button"
            className="management-button-secondary"
            onClick={loadHistory}
            disabled={historyLoading}
          >
            {historyLoading ? snapshotsCopy.history.loading : snapshotsCopy.history.refresh}
          </button>
        </div>

        {historyItems.length ? (
          <div className="website-snapshots-history-list">
            {historyItems.map((item) => {
              const historyUrl = formatPageLabel(
                item.selectedOriginalUrl || item.normalizedUrl || item.requestedUrl
              );
              const historyTypeLabel =
                item.type === "download" ? snapshotsCopy.history.download : snapshotsCopy.history.search;
              const historyMeta =
                item.type === "download"
                  ? snapshotsCopy.history.downloadMeta(item.selectedTimestamp || "-", item.downloadedAssets || 0)
                  : snapshotsCopy.history.searchMeta(item.totalSnapshots || 0, item.uniquePageCount || 0);

              return (
                <article key={item._id} className={`website-snapshots-history-item is-${item.type}`}>
                <div className="website-snapshots-history-main">
                  <span className="website-snapshots-history-type">{historyTypeLabel}</span>
                  <strong className="website-snapshots-history-url" title={historyUrl}>{historyUrl}</strong>
                  <p className="website-snapshots-history-meta">
                    {formatDateTime(item.createdAt, locale)}
                    <span className="website-snapshots-history-hidden" hidden>
                    {" · "}
                    {historyMeta}
                    </span>
                    {" - "}
                    {historyMeta}
                  </p>
                </div>
                {item.type === "search" ? (
                  <div className="website-snapshots-history-actions">
                    <button
                      type="button"
                      className="management-button-secondary"
                      onClick={() => handleUseHistoryItem(item)}
                    >
                      {snapshotsCopy.history.useSearch}
                    </button>
                    {canManageSnapshots ? (
                      <button
                        type="button"
                        className="management-button-secondary is-danger"
                        onClick={() => handleDeleteHistoryItem(item)}
                        disabled={historyDeletingId === item._id}
                      >
                        {historyDeletingId === item._id
                          ? snapshotsCopy.history.deleting
                          : snapshotsCopy.history.delete}
                      </button>
                    ) : null}
                  </div>
                ) : canManageSnapshots ? (
                  <div className="website-snapshots-history-actions">
                    <button
                      type="button"
                      className="management-button-secondary is-danger"
                      onClick={() => handleDeleteHistoryItem(item)}
                      disabled={historyDeletingId === item._id}
                    >
                      {historyDeletingId === item._id
                        ? snapshotsCopy.history.deleting
                        : snapshotsCopy.history.delete}
                    </button>
                  </div>
                ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="website-snapshots-empty">
            {historyLoading ? snapshotsCopy.history.loading : snapshotsCopy.history.empty}
          </p>
        )}
      </section>

      <section className="app-panel management-form website-snapshots-search-panel">
        <div className="management-section-header">
          <div>
            <h2>{snapshotsCopy.search.title}</h2>
            <p>{snapshotsCopy.search.description}</p>
          </div>
        </div>

        <form className="website-snapshots-search-grid" onSubmit={handleSearch}>
          <div className="management-field website-snapshots-url-field">
            <label htmlFor="website-snapshot-url">{snapshotsCopy.search.url}</label>
            <input
              id="website-snapshot-url"
              type="text"
              value={form.url}
              onChange={(event) => handleChange("url", event.target.value)}
              placeholder={snapshotsCopy.search.urlPlaceholder}
              required
            />
          </div>

          <div className="management-field">
            <label htmlFor="website-snapshot-from">{snapshotsCopy.search.fromDate}</label>
            <input
              id="website-snapshot-from"
              type="date"
              value={form.fromDate}
              onChange={(event) => handleChange("fromDate", event.target.value)}
            />
          </div>

          <div className="management-field">
            <label htmlFor="website-snapshot-to">{snapshotsCopy.search.toDate}</label>
            <input
              id="website-snapshot-to"
              type="date"
              value={form.toDate}
              onChange={(event) => handleChange("toDate", event.target.value)}
            />
          </div>

          <label className="website-snapshots-checkbox">
            <input
              type="checkbox"
              checked={form.includeAssets}
              onChange={(event) => handleChange("includeAssets", event.target.checked)}
            />
            <span>{snapshotsCopy.search.includeAssets}</span>
          </label>

          <div className="website-snapshots-form-actions">
            <button type="button" className="management-button-secondary" onClick={resetForm}>
              {snapshotsCopy.search.reset}
            </button>
            <button type="submit" className="management-button" disabled={loading}>
              {loading ? snapshotsCopy.search.searching : snapshotsCopy.search.submit}
            </button>
          </div>
        </form>
      </section>

      <section className="app-panel website-snapshots-viewer">
        <div className="management-section-header website-snapshots-viewer-header">
          <div>
            <h2>{snapshotsCopy.viewer.title}</h2>
            <p>{snapshotsCopy.viewer.description}</p>
          </div>
          <div className="management-field website-snapshots-page-picker">
            <label htmlFor="website-snapshots-page-select">{snapshotsCopy.viewer.pageSelect}</label>
            <select
              id="website-snapshots-page-select"
              value={selectedPageGroup?.originalUrl || ""}
              onChange={(event) => handleSelectPage(event.target.value)}
              disabled={!pageOptions.length}
            >
              {!pageOptions.length ? (
                <option value="">{snapshotsCopy.viewer.noPages}</option>
              ) : null}
              {pageOptions.map((group) => (
                <option key={group.originalUrl} value={group.originalUrl}>
                  {group.label} ({formatNumber(group.count, locale)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {!selectedPageGroup ? (
          <p className="website-snapshots-empty">{snapshotsCopy.viewer.empty}</p>
        ) : (
          <>
            <div className="website-snapshots-insight-grid">
              <article className="website-snapshots-insight-card">
                <span>{snapshotsCopy.stats.selectedCaptures}</span>
                <strong>{formatNumber(selectedPageSummary.totalCaptures, locale)}</strong>
                <p>{snapshotsCopy.stats.selectedCapturesDescription}</p>
              </article>
              <article className="website-snapshots-insight-card">
                <span>{snapshotsCopy.stats.pageCount}</span>
                <strong>{formatNumber(selectedPageSummary.totalPages, locale)}</strong>
                <p>{snapshotsCopy.stats.pageCountDescription}</p>
              </article>
              <article className="website-snapshots-insight-card">
                <span>{snapshotsCopy.stats.newestYear}</span>
                <strong>{selectedPageSummary.newestYear || "-"}</strong>
                <p>{snapshotsCopy.stats.newestDescription}</p>
              </article>
              <article className="website-snapshots-insight-card">
                <span>{snapshotsCopy.stats.oldestYear}</span>
                <strong>{selectedPageSummary.oldestYear || "-"}</strong>
                <p>{snapshotsCopy.stats.oldestDescription}</p>
              </article>
            </div>

            <div className="website-snapshots-viewer-grid">
              <section className="website-snapshots-timeline-card">
                <div className="management-section-header">
                  <div>
                    <h3>{snapshotsCopy.timeline.title}</h3>
                    <p>{snapshotsCopy.timeline.description}</p>
                  </div>
                </div>

                {timelineYears.length ? (
                  <div className="website-snapshots-wayback-timeline">
                    <p className="website-snapshots-wayback-saved">
                      {snapshotsCopy.timeline.savedBetween(
                        selectedPageSnapshots.length,
                        formatDateOnly(selectedPageGroup.oldestAt, locale),
                        formatDateOnly(selectedPageGroup.newestAt, locale)
                      )}
                    </p>
                    <div className="website-snapshots-wayback-chart">
                      {timelineYears.map((item) => {
                        const yearSnapshot = selectedPageSnapshots.find(
                          (snapshot) => getSnapshotYear(snapshot) === item.year
                        );
                        const height = item.count
                          ? Math.max(8, (item.count / Math.max(1, maxTimelineCount)) * 84)
                          : 0;

                        return (
                          <button
                            type="button"
                            key={item.year}
                            className={item.isSelected ? "is-selected" : ""}
                            onClick={() => yearSnapshot && setSelectedSnapshotKey(getSnapshotKey(yearSnapshot))}
                            disabled={!yearSnapshot}
                            title={snapshotsCopy.timeline.yearTitle(item.year, item.count)}
                          >
                            <span className="website-snapshots-wayback-column">
                              <i style={{ height: `${height}px` }} />
                            </span>
                            <strong>{item.year}</strong>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="website-snapshots-empty">{snapshotsCopy.timeline.empty}</p>
                )}
              </section>

              <section className="website-snapshots-selected-page-card">
                <span>{snapshotsCopy.viewer.selectedPage}</span>
                <strong>{selectedPageGroup.label}</strong>
                <p>{snapshotsCopy.viewer.selectedPageDescription}</p>
                <dl>
                  <div>
                    <dt>{snapshotsCopy.viewer.newestCapture}</dt>
                    <dd>{formatDateTime(selectedPageGroup.newestAt, locale)}</dd>
                  </div>
                  <div>
                    <dt>{snapshotsCopy.viewer.oldestCapture}</dt>
                    <dd>{formatDateTime(selectedPageGroup.oldestAt, locale)}</dd>
                  </div>
                </dl>
              </section>
            </div>

            <section className="website-snapshots-preview-panel">
              <div className="management-section-header website-snapshots-preview-header">
                <div>
                  <h3>{snapshotsCopy.preview.title}</h3>
                  <p>{snapshotsCopy.preview.description}</p>
                </div>
                {selectedSnapshot ? (
                  <div className="website-snapshots-preview-actions flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-extrabold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleRetrySelectedPreview}
                      disabled={!selectedSnapshotToken || selectedPreviewStatus === "loading"}
                    >
                      <FaRedoAlt className="text-xs" />
                      {snapshotsCopy.preview.retry}
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-extrabold text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-75"
                      onClick={handleToggleSelectedViewed}
                      disabled={!selectedSnapshotToken}
                    >
                      {viewedSnapshotKeys.has(selectedSnapshotToken) ? (
                        <FaRedoAlt className="text-xs" />
                      ) : (
                        <FaEye className="text-xs" />
                      )}
                      {viewedSnapshotKeys.has(selectedSnapshotToken)
                        ? snapshotsCopy.preview.redoViewed
                        : snapshotsCopy.preview.setViewed}
                    </button>
                    <a
                      className="management-button-secondary"
                      href={selectedSnapshot.archiveUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {snapshotsCopy.preview.openFull}
                    </a>
                    {canDownloadSnapshots ? (
                      <button
                        type="button"
                        className="management-button"
                        onClick={() => handleDownload(selectedSnapshot)}
                        disabled={Boolean(actionLoading)}
                      >
                        {actionLoading === getSnapshotKey(selectedSnapshot)
                          ? snapshotsCopy.results.downloading
                          : snapshotsCopy.preview.downloadSelected}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {selectedSnapshot ? (
                <>
                  <div className="website-snapshots-preview-meta">
                    <div>
                      <span>{snapshotsCopy.preview.currentlyPreviewing}</span>
                      <strong>{formatDateTime(selectedSnapshot.capturedAt, locale)}</strong>
                    </div>
                    <div>
                      <span>{snapshotsCopy.preview.timestamp}</span>
                      <strong>{selectedSnapshot.timestamp}</strong>
                    </div>
                    <div>
                      <span>{snapshotsCopy.preview.archiveSize}</span>
                      <strong>{formatBytes(selectedSnapshot.length, locale)}</strong>
                    </div>
                    <div>
                      <span>{snapshotsCopy.preview.type}</span>
                      <strong>{selectedSnapshot.mimetype || "-"}</strong>
                    </div>
                  </div>

                  <div className="website-snapshots-preview-url">
                    <span>{snapshotsCopy.preview.originalUrl}</span>
                    <a href={selectedSnapshot.archiveUrl} target="_blank" rel="noreferrer">
                      {selectedSnapshot.originalUrl}
                    </a>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-sm font-extrabold text-slate-700">
                      {snapshotsCopy.preview.cacheSummary(
                        loadedPreviewCount,
                        previewLoadTotal,
                        viewedPreviewCount
                      )}
                    </span>
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleLoadAllPreviews}
                      disabled={!selectedPageSnapshots.length || isPreloadingAll}
                    >
                      <FaSyncAlt className={isPreloadingAll ? "animate-spin text-xs" : "text-xs"} />
                      {isPreloadingAll ? snapshotsCopy.preview.loadingAll : snapshotsCopy.preview.loadAll}
                    </button>
                  </div>

                  <div
                    className="mt-3 flex gap-2 overflow-x-auto pb-3"
                    aria-label={snapshotsCopy.preview.captureStrip}
                  >
                    {selectedPageSnapshots.map((snapshot) => {
                      const snapshotKey = getSnapshotKey(snapshot);
                      const status = previewCache[snapshotKey]?.status || "idle";
                      const isSelected = snapshotKey === selectedSnapshotToken;
                      const isViewed = viewedSnapshotKeys.has(snapshotKey);
                      const statusLabel = isViewed
                        ? snapshotsCopy.preview.viewed
                        : status === "loaded"
                          ? snapshotsCopy.preview.loaded
                          : status === "loading"
                            ? snapshotsCopy.preview.loadingState
                            : status === "failed"
                              ? snapshotsCopy.preview.failed
                              : snapshotsCopy.preview.pending;

                      return (
                        <button
                          type="button"
                          key={snapshotKey}
                          className={getPreviewCardClass({ isSelected, isViewed, status })}
                          onClick={() => setSelectedSnapshotKey(snapshotKey)}
                          aria-pressed={isSelected}
                        >
                          <strong className="block truncate text-sm font-extrabold">
                            {formatDateTime(snapshot.capturedAt, locale)}
                          </strong>
                          <span className="mt-1 block truncate text-xs font-bold opacity-75">
                            {snapshot.timestamp}
                          </span>
                          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-normal">
                            {status === "loading" ? (
                              <FaSyncAlt className="animate-spin text-[10px]" />
                            ) : isViewed || status === "loaded" ? (
                              <FaCheckCircle className="text-[10px]" />
                            ) : null}
                            {statusLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="website-snapshots-frame-shell">
                    {previewLoading && selectedPreviewStatus !== "loaded" ? (
                      <div className="website-snapshots-frame-loading">
                        <div className="website-snapshots-frame-spinner" />
                        <strong>{snapshotsCopy.preview.loading}</strong>
                        <span>{snapshotsCopy.preview.loadingDescription}</span>
                      </div>
                    ) : null}
                    {selectedPreviewStatus === "failed" ? (
                      <div className="absolute inset-0 z-[3] grid place-items-center bg-white/90 px-4 text-center">
                        <div className="max-w-sm rounded-lg border border-rose-200 bg-rose-50 p-4 shadow-sm">
                          <strong className="block text-base font-extrabold text-rose-800">
                            {snapshotsCopy.preview.failed}
                          </strong>
                          <button
                            type="button"
                            className="mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-rose-700 px-3 text-sm font-extrabold text-white transition hover:bg-rose-800"
                            onClick={handleRetrySelectedPreview}
                          >
                            <FaRedoAlt className="text-xs" />
                            {snapshotsCopy.preview.retry}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <iframe
                      key={selectedPreviewFrameKey}
                      title={`${snapshotsCopy.preview.title} ${selectedSnapshot.timestamp}`}
                      src={selectedPreviewUrl}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                      onLoad={() => {
                        setPreviewLoading(false);
                        setPreviewCacheStatus(selectedSnapshotToken, "loaded", { url: selectedPreviewUrl });
                      }}
                      onError={() => {
                        setPreviewLoading(false);
                        setPreviewCacheStatus(selectedSnapshotToken, "failed", { url: selectedPreviewUrl });
                      }}
                    />
                  </div>

                  {activePreloadItems.map((item) => (
                    <iframe
                      key={`${item.key}:${previewCache[item.key]?.version || 0}`}
                      title={`Preload ${item.key}`}
                      src={item.url}
                      className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0"
                      loading="eager"
                      referrerPolicy="no-referrer"
                      sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                      onLoad={() => completePreloadItem(item.key, "loaded")}
                      onError={() => completePreloadItem(item.key, "failed")}
                    />
                  ))}

                  <p className="website-snapshots-frame-hint">{snapshotsCopy.preview.previewHint}</p>
                </>
              ) : (
                <p className="website-snapshots-empty">{snapshotsCopy.preview.empty}</p>
              )}
            </section>

            <section className="management-table website-snapshots-results">
              <div className="management-section-header">
                <div>
                  <h3>{snapshotsCopy.results.title}</h3>
                  <p>{snapshotsCopy.results.description}</p>
                </div>
              </div>

              <div className="website-snapshots-source-note">
                <strong>{snapshotsCopy.results.sourceTitle}</strong>
                <span>{snapshotsCopy.results.sourceDescription}</span>
              </div>

              {loading ? (
                <p className="website-snapshots-empty">{snapshotsCopy.results.loading}</p>
              ) : selectedPageSnapshots.length ? (
                <div className="management-table-wrap website-snapshots-table-wrap">
                  <table className="website-snapshots-table">
                    <thead>
                      <tr>
                        <th>{snapshotsCopy.results.headers.date}</th>
                        <th>{snapshotsCopy.results.headers.url}</th>
                        <th>{snapshotsCopy.results.headers.type}</th>
                        <th>{snapshotsCopy.results.headers.size}</th>
                        <th>{snapshotsCopy.results.headers.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPageSnapshots.map((snapshot) => {
                        const loadingKey = `${snapshot.timestamp}:${snapshot.originalUrl}`;
                        const isDownloading = actionLoading === loadingKey;
                        const isSelected = getSnapshotKey(selectedSnapshot) === loadingKey;

                        return (
                          <tr key={loadingKey} className={isSelected ? "is-selected" : ""}>
                            <td>
                              <strong>{formatDateTime(snapshot.capturedAt, locale)}</strong>
                              <span className="website-snapshots-cell-meta">{snapshot.timestamp}</span>
                            </td>
                            <td>
                              <a href={snapshot.archiveUrl} target="_blank" rel="noreferrer">
                                {snapshot.originalUrl}
                              </a>
                            </td>
                            <td>
                              <span className="website-snapshots-badge">{snapshot.mimetype}</span>
                            </td>
                            <td>{formatBytes(snapshot.length, locale)}</td>
                            <td>
                              <div className="website-snapshots-row-actions">
                                <button
                                  type="button"
                                  className="management-button-secondary"
                                  onClick={() => setSelectedSnapshotKey(loadingKey)}
                                >
                                  {isSelected ? snapshotsCopy.results.previewing : snapshotsCopy.results.preview}
                                </button>
                                <a
                                  className="management-button-secondary"
                                  href={snapshot.archiveUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {snapshotsCopy.results.open}
                                </a>
                                {canDownloadSnapshots ? (
                                  <button
                                    type="button"
                                    className="management-button"
                                    onClick={() => handleDownload(snapshot)}
                                    disabled={Boolean(actionLoading)}
                                  >
                                    {isDownloading
                                      ? snapshotsCopy.results.downloading
                                      : snapshotsCopy.results.download}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="website-snapshots-empty">{snapshotsCopy.results.empty}</p>
              )}
            </section>
          </>
        )}
      </section>
    </div>
  );
}
