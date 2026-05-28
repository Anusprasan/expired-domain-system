import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import { hasPrivilege } from "../../../shared/utils/permissions";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  getScreenshotTakerLocale,
  getScreenshotTakerUiCopy,
  normalizeScreenshotTakerLanguage,
} from "../constants/screenshotTakerLanguage";
import ScreenshotClearImagesModal from "../components/ScreenshotClearImagesModal";
import ScreenshotOutputModal from "../components/ScreenshotOutputModal";
import ScreenshotScheduleModal from "../components/ScreenshotScheduleModal";
import {
  captureScreenshotSiteApi,
  clearScreenshotImagesApi,
  fetchScreenshotImageBlobApi,
  fetchScreenshotOriginalImageBlobApi,
  getScreenshotImageStorageApi,
  getScreenshotScheduleApi,
  getScreenshotSitesApi,
  getScreenshotStatusApi,
  removeScreenshotSiteApi,
  updateScreenshotScheduleApi,
} from "../api/screenshotTakerApi";
import "../../../shared/styles/management.css";
import "../styles/screenshotTaker.css";

function formatNumber(value, locale, minimumFractionDigits = 0, maximumFractionDigits = minimumFractionDigits) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(Number(value || 0));
}

function formatDateTime(value, locale) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(locale);
}

function formatBytes(value, locale, fallbackLabel) {
  const size = Number(value || 0);

  if (!size) {
    return fallbackLabel;
  }

  if (size < 1024) {
    return `${formatNumber(size, locale)} B`;
  }

  if (size < 1024 * 1024) {
    return `${formatNumber(size / 1024, locale, 1, 1)} KB`;
  }

  return `${formatNumber(size / (1024 * 1024), locale, 1, 1)} MB`;
}

function formatStorageBytes(value, locale, fallbackLabel) {
  const size = Number(value || 0);

  if (!size) {
    return fallbackLabel;
  }

  if (size < 1024) {
    return `${formatNumber(size, locale)} B`;
  }

  if (size < 1024 * 1024) {
    return `${formatNumber(size / 1024, locale, 1, 1)} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${formatNumber(size / (1024 * 1024), locale, 1, 1)} MB`;
  }

  return `${formatNumber(size / (1024 * 1024 * 1024), locale, 2, 2)} GB`;
}

function getCaptureTone(status) {
  if (status === "success") {
    return "management-badge is-active";
  }

  if (status === "failed") {
    return "management-badge is-inactive";
  }

  return "management-badge";
}

function getCaptureStatusLabel(status, copy) {
  if (status === "success") {
    return copy.common.success;
  }

  if (status === "failed") {
    return copy.common.failed;
  }

  return copy.common.notCaptured;
}

function getSiteScanState(scannerStatus, siteId) {
  const activeJob = scannerStatus?.activeJobs?.find((job) => job.siteId === siteId);

  if (activeJob) {
    return activeJob;
  }

  if (scannerStatus?.activeJob?.siteId === siteId) {
    return scannerStatus.activeJob;
  }

  return scannerStatus?.queue?.find((job) => job.siteId === siteId) || null;
}

function getStableSiteTime(site) {
  const date = new Date(site.assignedAt || site.updatedAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getSitesSignature(items = []) {
  return items
    .map((site) =>
      [
        site.id,
        site.moneySiteId || "",
        site.domain || "",
        site.url || "",
        site.brandName || "",
        site.note || "",
        site.active === false ? "inactive" : "active",
        site.assignedAt || "",
        site.updatedAt || "",
        site.latestCapture?.id || "",
        site.latestCapture?.status || "",
        site.latestCapture?.capturedAt || "",
      ].join(":")
    )
    .join("|");
}

function getScheduleScanLabel(activeJobs, activeBatch, copy) {
  const scheduledActiveJobs = (activeJobs || []).filter((job) => job?.source === "schedule");

  if (scheduledActiveJobs.some((job) => job?.phase === "retry")) {
    return scheduledActiveJobs.length === 1
      ? copy.helpers.retryingSite(scheduledActiveJobs[0].domain)
      : copy.helpers.retryingSites(scheduledActiveJobs.length);
  }

  if (scheduledActiveJobs.length > 1) {
    return copy.helpers.scanningSites(scheduledActiveJobs.length);
  }

  if (scheduledActiveJobs.length === 1) {
    return copy.helpers.scanningSite(scheduledActiveJobs[0].domain);
  }

  if (activeBatch?.status === "queued") {
    return copy.helpers.scanQueued;
  }

  if (activeBatch?.status === "running") {
    return copy.common.running;
  }

  if (activeBatch?.status === "retrying") {
    return copy.helpers.retryingErrorSites;
  }

  if (activeBatch?.status === "stopping") {
    return copy.helpers.stopping;
  }

  if (activeBatch?.status === "stopped") {
    return copy.common.stopped;
  }

  return copy.common.idle;
}

function getScheduleProgressLabel(activeBatch, scheduledQueueCount, copy) {
  if (activeBatch?.status === "retrying") {
    const retryTotal = Number(activeBatch?.retryCount || 0);
    const retriedCount = Number(activeBatch?.retriedCount || 0);

    return retryTotal
      ? copy.helpers.retries(retriedCount, retryTotal)
      : copy.helpers.preparingRetries;
  }

  const batchTotal = Number(activeBatch?.totalCount || 0);
  const batchDone = Number(activeBatch?.completedCount || 0);

  if (batchTotal) {
    return `${batchDone}/${batchTotal}`;
  }

  return `${scheduledQueueCount} ${copy.helpers.queued}`;
}

function getTimeMs(value) {
  if (!value) {
    return 0;
  }

  const timeMs = new Date(value).getTime();
  return Number.isNaN(timeMs) ? 0 : timeMs;
}

function padTimeUnit(value) {
  return String(value).padStart(2, "0");
}

function formatCountdownMs(valueMs) {
  const totalSeconds = Math.max(0, Math.ceil(Number(valueMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${padTimeUnit(hours)}:${padTimeUnit(minutes)}:${padTimeUnit(seconds)}`;
}

function getNextScanCountdownLabel({ enabled, nextRunAt, batchStatus, isScheduleJobRunning, nowMs, copy }) {
  if (!enabled) {
    return copy.helpers.notScheduled;
  }

  if (isScheduleJobRunning || ["queued", "running", "retrying", "stopping"].includes(batchStatus)) {
    return copy.helpers.runningNow;
  }

  const nextRunMs = getTimeMs(nextRunAt);

  if (!nextRunMs) {
    return copy.helpers.calculating;
  }

  const remainingMs = nextRunMs - nowMs;

  if (remainingMs <= 0) {
    return copy.helpers.starting;
  }

  return formatCountdownMs(remainingMs);
}

function getServerClockOffset(status) {
  const serverNowMs = getTimeMs(status?.serverNow);

  return serverNowMs ? Date.now() - serverNowMs : 0;
}

function matchesScanFilter(site, filter) {
  const capture = site.latestCapture;

  if (filter === "all") {
    return true;
  }

  if (filter === "success") {
    return capture?.status === "success";
  }

  if (filter === "failed") {
    return capture?.status === "failed";
  }

  return true;
}

function matchesSearch(site, searchTerm) {
  const term = String(searchTerm || "").trim().toLowerCase();

  if (!term) {
    return true;
  }

  return [
    site.brandName,
    site.domain,
    site.url,
    site.latestCapture?.title,
    site.latestCapture?.finalUrl,
    site.latestCapture?.error,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term));
}

function getScanFilterOptions(copy) {
  return [
    { value: "all", label: copy.scanFilterOptions.all },
    { value: "success", label: copy.scanFilterOptions.success },
    { value: "failed", label: copy.scanFilterOptions.failed },
  ];
}

const SCREENSHOT_IMAGE_LOAD_CONCURRENCY = 4;
const SCREENSHOT_IMAGE_LAZY_ROOT_MARGIN = "720px 0px";
const SCREENSHOT_IMAGE_REQUEST_TIMEOUT_MS = 45000;

function sanitizeFilePart(value, fallback = "screenshot") {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return cleaned || fallback;
}

function buildScreenshotDownloadName(site, capture) {
  const brand = sanitizeFilePart(site?.brandName, "brand");
  const url = sanitizeFilePart(capture?.finalUrl || site?.url || site?.domain, "site");
  const capturedAt = new Date(capture?.capturedAt || Date.now());
  const time = Number.isNaN(capturedAt.getTime())
    ? "unknown-time"
    : capturedAt.toISOString().replace(/[:.]/g, "-");

  return `${brand}_${url}_${time}.png`;
}

const EMPTY_SCANNER_STATUS = {
  running: false,
  activeJob: null,
  queue: [],
  queuedCount: 0,
  currentBatch: null,
  schedule: null,
};

const EMPTY_SCHEDULE = {
  enabled: false,
  delayMinutes: 60,
  parallelCaptures: 2,
  telegram: {
    enabled: false,
    chatId: "",
    hasBotToken: false,
    botToken: "",
    lastSentAt: null,
    lastError: "",
    sentCount: 0,
    failedCount: 0,
  },
};

function normalizeSchedule(value) {
  const schedule = value || {};
  const telegram = schedule.telegram || {};

  return {
    ...EMPTY_SCHEDULE,
    ...schedule,
    telegram: {
      ...EMPTY_SCHEDULE.telegram,
      ...telegram,
      botToken: telegram.botToken || "",
    },
  };
}

function ScreenshotLazyPreview({ captureId, imageUrl, imageStatus, alt, copy, onRequestImage }) {
  const placeholderRef = useRef(null);
  const isImagePending = imageStatus === "queued" || imageStatus === "loading";

  useEffect(() => {
    if (!captureId || imageUrl || imageStatus === "failed") {
      return undefined;
    }

    const node = placeholderRef.current;

    if (!node) {
      return undefined;
    }

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      onRequestImage(captureId);
      return undefined;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onRequestImage(captureId);
          observer.disconnect();
        }
      },
      {
        rootMargin: SCREENSHOT_IMAGE_LAZY_ROOT_MARGIN,
        threshold: 0.01,
      }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [captureId, imageStatus, imageUrl, onRequestImage]);

  if (imageUrl) {
    return <img src={imageUrl} alt={alt} loading="lazy" decoding="async" />;
  }

  if (captureId) {
    const title = imageStatus === "failed"
      ? copy.helpers.previewUnavailable
      : isImagePending
        ? copy.helpers.loadingPreview
        : copy.helpers.previewPending;
    const detail = imageStatus === "failed" ? copy.helpers.previewFailedDetail : copy.helpers.previewPendingDetail;

    return (
      <div
        ref={placeholderRef}
        className={`screenshot-taker-preview-empty screenshot-taker-preview-loading${
          imageStatus === "failed" ? " is-error" : ""
        }`}
        aria-live="polite"
      >
        {isImagePending ? <span className="money-sites-screenshot-loader" aria-hidden="true" /> : null}
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    );
  }

  return (
    <div className="screenshot-taker-preview-empty">
      <strong>{copy.helpers.noScreenshotYet}</strong>
      <span>{copy.helpers.noScreenshotDetail}</span>
    </div>
  );
}

export default function ScreenshotTakerPage() {
  const { user } = useAuth();
  const language = normalizeScreenshotTakerLanguage(user?.preferredLanguage || user?.moneySiteLanguage);
  const locale = getScreenshotTakerLocale(language);
  const copy = getScreenshotTakerUiCopy(language);
  const canManageSites = hasPrivilege(user, "MANAGE_SCREENSHOT_TAKER");
  const canCaptureSites = hasPrivilege(user, "CAPTURE_SCREENSHOT_TAKER") || canManageSites;
  const canScheduleCaptures = hasPrivilege(user, "SCHEDULE_SCREENSHOT_TAKER");
  const canClearImages = hasPrivilege(user, "ADMIN_ACCESS");
  const canManageTelegramBot = hasPrivilege(user, "ADMIN_ACCESS");
  const canViewImageStorage = hasPrivilege(user, "ADMIN_ACCESS");
  const [sites, setSites] = useState([]);
  const [schedule, setSchedule] = useState(EMPTY_SCHEDULE);
  const [scannerStatus, setScannerStatus] = useState(EMPTY_SCANNER_STATUS);
  const [imageUrls, setImageUrls] = useState({});
  const [imageLoadStates, setImageLoadStates] = useState({});
  const [imageStorage, setImageStorage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busySiteId, setBusySiteId] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [clearImagesBusy, setClearImagesBusy] = useState(false);
  const [imageStorageBusy, setImageStorageBusy] = useState(false);
  const [countdownNowMs, setCountdownNowMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isClearImagesModalOpen, setIsClearImagesModalOpen] = useState(false);
  const [scanFilter, setScanFilter] = useState("all");
  const [scanSearch, setScanSearch] = useState("");
  const [previewSite, setPreviewSite] = useState(null);
  const [modalImageUrl, setModalImageUrl] = useState("");
  const [modalImageStatus, setModalImageStatus] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const scanFilterOptions = getScanFilterOptions(copy);
  const imageUrlsRef = useRef({});
  const imageLoadStatesRef = useRef({});
  const imageQueueRef = useRef([]);
  const queuedImageIdsRef = useRef(new Set());
  const activeImageLoadCountRef = useRef(0);
  const imageAbortControllersRef = useRef({});
  const activeCaptureIdsRef = useRef(new Set());
  const isMountedRef = useRef(true);

  const sortedSites = useMemo(
    () =>
      [...sites].sort((left, right) => {
        const leftTime = getStableSiteTime(left);
        const rightTime = getStableSiteTime(right);

        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }

        return String(left.domain || "").localeCompare(String(right.domain || ""));
      }),
    [sites]
  );

  const displaySites = useMemo(
    () => sortedSites.filter((site) => matchesScanFilter(site, scanFilter) && matchesSearch(site, scanSearch)),
    [scanFilter, scanSearch, sortedSites]
  );

  const scanSummary = useMemo(() => {
    const scannedCount = sites.filter((site) => site.latestCapture?.capturedAt).length;
    const successCount = sites.filter((site) => site.latestCapture?.status === "success").length;
    const failedCount = sites.filter((site) => site.latestCapture?.status === "failed").length;

    return { scannedCount, successCount, failedCount };
  }, [sites]);

  const latestCaptureIds = useMemo(
    () =>
      sites
        .map((site) => site.latestCapture)
        .filter((capture) => capture?.status === "success" && capture.id)
        .map((capture) => String(capture.id)),
    [sites]
  );

  const latestCaptureIdSet = useMemo(() => new Set(latestCaptureIds), [latestCaptureIds]);

  activeCaptureIdsRef.current = latestCaptureIdSet;

  const updateImageLoadState = useCallback((captureId, nextStatus) => {
    imageLoadStatesRef.current = {
      ...imageLoadStatesRef.current,
      [captureId]: nextStatus,
    };

    setImageLoadStates((current) =>
      current[captureId] === nextStatus
        ? current
        : {
            ...current,
            [captureId]: nextStatus,
          }
    );
  }, []);

  const pumpImageQueue = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    while (activeImageLoadCountRef.current < SCREENSHOT_IMAGE_LOAD_CONCURRENCY && imageQueueRef.current.length) {
      const captureId = imageQueueRef.current.shift();
      queuedImageIdsRef.current.delete(captureId);

      if (!activeCaptureIdsRef.current.has(captureId)) {
        continue;
      }

      const currentStatus = imageLoadStatesRef.current[captureId];

      if (imageUrlsRef.current[captureId] || currentStatus === "loading" || currentStatus === "loaded") {
        continue;
      }

      activeImageLoadCountRef.current += 1;
      updateImageLoadState(captureId, "loading");

      const controller = new AbortController();
      imageAbortControllersRef.current[captureId] = controller;

      fetchScreenshotImageBlobApi(captureId, {
        signal: controller.signal,
        timeout: SCREENSHOT_IMAGE_REQUEST_TIMEOUT_MS,
      })
        .then((blob) => {
          if (!isMountedRef.current || controller.signal.aborted || !activeCaptureIdsRef.current.has(captureId)) {
            return;
          }

          const objectUrl = window.URL.createObjectURL(blob);
          const previousUrl = imageUrlsRef.current[captureId];

          if (previousUrl && previousUrl !== objectUrl) {
            window.URL.revokeObjectURL(previousUrl);
          }

          imageUrlsRef.current = {
            ...imageUrlsRef.current,
            [captureId]: objectUrl,
          };

          setImageUrls((current) =>
            current[captureId] === objectUrl
              ? current
              : {
                  ...current,
                  [captureId]: objectUrl,
                }
          );
          updateImageLoadState(captureId, "loaded");
        })
        .catch((err) => {
          const isCanceled =
            controller.signal.aborted || err?.code === "ERR_CANCELED" || err?.name === "CanceledError";

          if (!isMountedRef.current || isCanceled || !activeCaptureIdsRef.current.has(captureId)) {
            return;
          }

          updateImageLoadState(captureId, "failed");
        })
        .finally(() => {
          if (imageAbortControllersRef.current[captureId] === controller) {
            delete imageAbortControllersRef.current[captureId];
          }

          activeImageLoadCountRef.current = Math.max(0, activeImageLoadCountRef.current - 1);
          pumpImageQueue();
        });
    }
  }, [updateImageLoadState]);

  const requestScreenshotImage = useCallback(
    (captureId, options = {}) => {
      const normalizedCaptureId = String(captureId || "");

      if (!normalizedCaptureId || !activeCaptureIdsRef.current.has(normalizedCaptureId)) {
        return;
      }

      const { forceRetry = false, priority = false } = options;
      const currentStatus = imageLoadStatesRef.current[normalizedCaptureId];

      if (
        imageUrlsRef.current[normalizedCaptureId] ||
        currentStatus === "loading" ||
        currentStatus === "loaded" ||
        (currentStatus === "failed" && !forceRetry)
      ) {
        return;
      }

      if (queuedImageIdsRef.current.has(normalizedCaptureId)) {
        if (priority) {
          imageQueueRef.current = [
            normalizedCaptureId,
            ...imageQueueRef.current.filter((queuedCaptureId) => queuedCaptureId !== normalizedCaptureId),
          ];
          pumpImageQueue();
        }

        return;
      }

      if (priority) {
        imageQueueRef.current.unshift(normalizedCaptureId);
      } else {
        imageQueueRef.current.push(normalizedCaptureId);
      }

      queuedImageIdsRef.current.add(normalizedCaptureId);
      updateImageLoadState(normalizedCaptureId, "queued");
      pumpImageQueue();
    },
    [pumpImageQueue, updateImageLoadState]
  );

  const loadImageStorage = useCallback(async ({ silent = false } = {}) => {
    if (!canViewImageStorage) {
      setImageStorage(null);
      return null;
    }

    try {
      setImageStorageBusy(true);
      const response = await getScreenshotImageStorageApi();
      const nextStorage = response.data?.item || null;

      setImageStorage(nextStorage);
      return nextStorage;
    } catch (err) {
      if (!silent) {
        setError(err.response?.data?.message || copy.page.loadStorageError);
      }

      return null;
    } finally {
      setImageStorageBusy(false);
    }
  }, [canViewImageStorage, copy.page.loadStorageError]);

  const loadScreenshotTaker = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const [sitesResponse, scheduleResponse, statusResponse] = await Promise.all([
        getScreenshotSitesApi(),
        getScreenshotScheduleApi(),
        getScreenshotStatusApi(),
      ]);

      const nextSites = sitesResponse.data?.items || [];
      const nextStatus = statusResponse.data?.item || scheduleResponse.data?.status || EMPTY_SCANNER_STATUS;

      setSites((current) => (getSitesSignature(current) === getSitesSignature(nextSites) ? current : nextSites));
      setSchedule(normalizeSchedule(scheduleResponse.data?.item));
      setScannerStatus(nextStatus);
      setServerClockOffsetMs(getServerClockOffset(nextStatus));

      if (canViewImageStorage) {
        void loadImageStorage({ silent: true });
      } else {
        setImageStorage(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || copy.page.loadErrorFallback);
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, [canViewImageStorage, copy.page.loadErrorFallback, loadImageStorage]);

  useEffect(() => {
    void loadScreenshotTaker();
  }, [loadScreenshotTaker]);

  useEffect(() => {
    const scrollContainer = document.querySelector(".app-content");

    scrollContainer?.classList.add("is-screenshot-taker-smooth-scroll");

    return () => {
      scrollContainer?.classList.remove("is-screenshot-taker-smooth-scroll");
    };
  }, []);

  const refreshStatus = useCallback(async ({ includeSites = false, includeStorage = false } = {}) => {
    try {
      const shouldLoadStorage = includeStorage && canViewImageStorage;
      const [statusResponse, sitesResponse, storageResponse] = await Promise.all([
        getScreenshotStatusApi(),
        includeSites ? getScreenshotSitesApi() : Promise.resolve(null),
        shouldLoadStorage ? getScreenshotImageStorageApi() : Promise.resolve(null),
      ]);
      const nextStatus = statusResponse.data?.item || EMPTY_SCANNER_STATUS;

      setScannerStatus(nextStatus);
      setServerClockOffsetMs(getServerClockOffset(nextStatus));

      if (nextStatus.schedule) {
        setSchedule((current) => normalizeSchedule({ ...current, ...nextStatus.schedule }));
      }

      if (sitesResponse) {
        const nextSites = sitesResponse.data?.items || [];
        setSites((current) => (getSitesSignature(current) === getSitesSignature(nextSites) ? current : nextSites));
      }

      if (storageResponse) {
        setImageStorage(storageResponse.data?.item || null);
      }
    } catch (err) {
      setError(err.response?.data?.message || copy.page.refreshStatusError);
    }
  }, [canViewImageStorage, copy.page.refreshStatusError]);

  useEffect(() => {
    const shouldPoll =
      scannerStatus?.running ||
      scannerStatus?.queuedCount > 0 ||
      schedule.enabled ||
      scannerStatus?.currentBatch?.status === "running" ||
      scannerStatus?.currentBatch?.status === "queued" ||
      scannerStatus?.currentBatch?.status === "retrying";

    if (!shouldPoll) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void refreshStatus({ includeSites: true, includeStorage: canViewImageStorage });
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [
    refreshStatus,
    canViewImageStorage,
    schedule.enabled,
    scannerStatus?.currentBatch?.status,
    scannerStatus?.queuedCount,
    scannerStatus?.running,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCountdownNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    imageQueueRef.current = imageQueueRef.current.filter((captureId) => {
      const shouldKeep = latestCaptureIdSet.has(captureId);

      if (!shouldKeep) {
        queuedImageIdsRef.current.delete(captureId);
      }

      return shouldKeep;
    });

    Object.entries(imageAbortControllersRef.current).forEach(([captureId, controller]) => {
      if (!latestCaptureIdSet.has(captureId)) {
        controller.abort();
        delete imageAbortControllersRef.current[captureId];
      }
    });

    const nextImageUrls = {};
    let hasImageUrlChanges = false;

    Object.entries(imageUrlsRef.current).forEach(([captureId, url]) => {
      if (latestCaptureIdSet.has(captureId)) {
        nextImageUrls[captureId] = url;
        return;
      }

      hasImageUrlChanges = true;

      if (url) {
        window.URL.revokeObjectURL(url);
      }
    });

    if (hasImageUrlChanges) {
      imageUrlsRef.current = nextImageUrls;
      setImageUrls(nextImageUrls);
    }

    const nextImageLoadStates = {};
    let hasImageLoadStateChanges = false;

    Object.entries(imageLoadStatesRef.current).forEach(([captureId, status]) => {
      if (latestCaptureIdSet.has(captureId)) {
        nextImageLoadStates[captureId] = status;
        return;
      }

      hasImageLoadStateChanges = true;
    });

    if (hasImageLoadStateChanges) {
      imageLoadStatesRef.current = nextImageLoadStates;
      setImageLoadStates(nextImageLoadStates);
    }
  }, [latestCaptureIdSet]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      imageQueueRef.current = [];
      queuedImageIdsRef.current.clear();
      activeImageLoadCountRef.current = 0;

      Object.values(imageAbortControllersRef.current).forEach((controller) => controller.abort());
      imageAbortControllersRef.current = {};

      Object.values(imageUrlsRef.current).forEach((url) => {
        if (url) {
          window.URL.revokeObjectURL(url);
        }
      });

      imageUrlsRef.current = {};
      imageLoadStatesRef.current = {};
    };
  }, []);

  const handleCapture = async (site) => {
    try {
      setError("");
      setNotice("");
      setBusySiteId(site.id);
      await captureScreenshotSiteApi(site.id);
      setNotice(copy.page.captureQueued);
      await refreshStatus({ includeSites: true, includeStorage: canViewImageStorage });
    } catch (err) {
      setError(err.response?.data?.message || copy.page.captureError);
    } finally {
      setBusySiteId("");
    }
  };

  const handleRemove = async (site) => {
    if (!window.confirm(copy.page.removeConfirm(site.domain))) {
      return;
    }

    try {
      setError("");
      setNotice("");
      setBusySiteId(site.id);
      await removeScreenshotSiteApi(site.id);
      setNotice(copy.page.removeSuccess);
      await loadScreenshotTaker();
    } catch (err) {
      setError(err.response?.data?.message || copy.page.removeError);
    } finally {
      setBusySiteId("");
    }
  };

  const handleClearImages = async (password) => {
    try {
      setError("");
      setNotice("");
      setClearImagesBusy(true);
      const response = await clearScreenshotImagesApi({ password });
      const summary = response.data?.item || {};

      setPreviewSite(null);
      imageQueueRef.current = [];
      queuedImageIdsRef.current.clear();
      Object.values(imageAbortControllersRef.current).forEach((controller) => controller.abort());
      imageAbortControllersRef.current = {};
      Object.values(imageUrlsRef.current).forEach((url) => {
        if (url) {
          window.URL.revokeObjectURL(url);
        }
      });
      imageUrlsRef.current = {};
      imageLoadStatesRef.current = {};
      setImageUrls({});
      setImageLoadStates({});
      setIsClearImagesModalOpen(false);
      setNotice(copy.page.clearImagesSuccess(
        summary.removedFileCount,
        formatBytes(summary.removedBytes, locale, copy.helpers.byteFallback),
        summary.failedFileCount
      ));
      await loadScreenshotTaker();
    } catch (err) {
      setError(
        err.response?.data?.message
          || err.response?.data?.details
          || err.message
          || copy.page.clearImagesError
      );
    } finally {
      setClearImagesBusy(false);
    }
  };

  const saveSchedule = async (schedulePatch, successMessage) => {
    const nextSchedule = {
      ...schedule,
      ...schedulePatch,
    };

    try {
      setError("");
      setNotice("");
      setScheduleBusy(true);
      const scheduleToSave = canManageTelegramBot
        ? nextSchedule
        : {
            ...nextSchedule,
            telegram: undefined,
          };
      const response = await updateScreenshotScheduleApi(scheduleToSave);
      const nextStatus = response.data?.status || scannerStatus;

      setSchedule(normalizeSchedule(response.data?.item || nextSchedule));
      setScannerStatus(nextStatus);
      setServerClockOffsetMs(getServerClockOffset(nextStatus));
      setNotice(successMessage);
      await refreshStatus({ includeSites: true, includeStorage: canViewImageStorage });
    } catch (err) {
      setError(err.response?.data?.message || copy.page.scheduleUpdateError);
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleScheduleToggle = (enabled) => {
    void saveSchedule(
      { enabled },
      enabled ? copy.page.scheduleStarted : copy.page.scheduleStopped
    );
  };

  const handleScheduleSettingsSave = () => {
    void saveSchedule({ enabled: schedule.enabled }, copy.page.scheduleSaved);
  };

  const handleOpenSite = (event, site) => {
    event.stopPropagation();

    if (site.url) {
      window.open(site.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleOpenAllSites = () => {
    const sitesToOpen = sites.filter((site) => site.url);

    if (!sitesToOpen.length) {
      setError(copy.page.noAssignedUrls);
      return;
    }

    let openedCount = 0;

    sitesToOpen.forEach((site) => {
      const openedWindow = window.open(site.url, "_blank");

      if (openedWindow) {
        openedWindow.opener = null;
        openedCount += 1;
      }
    });

    if (openedCount < sitesToOpen.length) {
      setError(copy.page.popupBlocked);
      return;
    }

    setNotice(copy.page.openedSites(openedCount));
  };

  const handlePreviewAction = (event, site) => {
    event.stopPropagation();
    setPreviewSite(site);
  };

  const handleOpenPreviewImage = () => {
    if (modalImageUrl) {
      window.open(modalImageUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleDownloadPreviewImage = () => {
    if (!modalImageUrl || !activePreviewSite || !previewCapture) {
      return;
    }

    const link = document.createElement("a");
    link.href = modalImageUrl;
    link.download = buildScreenshotDownloadName(activePreviewSite, previewCapture);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeBatch = scannerStatus?.currentBatch;
  const activeJob = scannerStatus?.activeJob;
  const activeJobs = scannerStatus?.activeJobs || (activeJob ? [activeJob] : []);
  const scheduledQueueCount = (scannerStatus?.queue || []).filter((job) => job.source === "schedule").length;
  const scheduleIsActive = Boolean(schedule.enabled);
  const scheduleScanLabel = getScheduleScanLabel(activeJobs, activeBatch, copy);
  const scheduleProgressLabel = getScheduleProgressLabel(activeBatch, scheduledQueueCount, copy);
  const nextScanCountdownLabel = getNextScanCountdownLabel({
    enabled: scheduleIsActive,
    nextRunAt: schedule.nextRunAt,
    batchStatus: activeBatch?.status,
    isScheduleJobRunning: activeJobs.some((job) => job?.source === "schedule"),
    nowMs: countdownNowMs - serverClockOffsetMs,
    copy,
  });
  const nextScanAtLabel = formatDateTime(schedule.nextRunAt, locale);
  const activePreviewSite = previewSite
    ? sortedSites.find((site) => site.id === previewSite.id) || previewSite
    : null;
  const previewCapture = activePreviewSite?.latestCapture || null;
  const previewCaptureId = previewCapture?.status === "success" && previewCapture.id ? String(previewCapture.id) : "";
  const previewImageUrl = previewCaptureId ? imageUrls[previewCaptureId] : "";
  const previewImageStatus = previewCaptureId ? imageLoadStates[previewCaptureId] : "";
  const imageStorageUsagePercent = Math.min(100, Number(imageStorage?.usagePercentCapped || 0));
  const imageStorageUsageLabel = imageStorage
    ? `${formatStorageBytes(imageStorage.totalBytes, locale, copy.helpers.storageByteFallback)} of ${formatStorageBytes(
      imageStorage.maxBytes,
      locale,
      copy.helpers.storageByteFallback
    )}`
    : copy.page.storage.totalUnavailable;
  const imageStorageRemainingLabel = imageStorage
    ? copy.page.storage.remaining(formatStorageBytes(imageStorage.remainingBytes, locale, copy.helpers.storageByteFallback))
    : copy.page.storage.refreshToLoadTotals;
  const imageStorageLastCleanup = imageStorage?.lastCleanupAt
    ? formatDateTime(imageStorage.lastCleanupAt, locale)
    : copy.page.storage.noCleanupYet;
  const imageStorageCleanup = imageStorage?.lastCleanupResult || null;

  useEffect(() => {
    if (previewCaptureId && !previewImageUrl) {
      requestScreenshotImage(previewCaptureId, {
        forceRetry: previewImageStatus === "failed",
        priority: true,
      });
    }
  }, [previewCaptureId, previewImageStatus, previewImageUrl, requestScreenshotImage]);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;

    if (!activePreviewSite || !previewCaptureId) {
      setModalImageUrl("");
      setModalImageStatus("");
      return undefined;
    }

    const controller = new AbortController();

    setModalImageUrl("");
    setModalImageStatus("loading");

    fetchScreenshotOriginalImageBlobApi(previewCaptureId, {
      signal: controller.signal,
      timeout: SCREENSHOT_IMAGE_REQUEST_TIMEOUT_MS,
    })
      .then((blob) => {
        objectUrl = window.URL.createObjectURL(blob);

        if (!cancelled) {
          setModalImageUrl(objectUrl);
          setModalImageStatus("loaded");
        } else {
          window.URL.revokeObjectURL(objectUrl);
        }
      })
      .catch((err) => {
        const isCanceled =
          controller.signal.aborted || err?.code === "ERR_CANCELED" || err?.name === "CanceledError";

        if (!cancelled && !isCanceled) {
          setModalImageUrl("");
          setModalImageStatus("failed");
        }
      });

    return () => {
      cancelled = true;
      controller.abort();

      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [activePreviewSite?.id, previewCaptureId]);

  return (
    <div className="management-page screenshot-taker-page">
      <section className="app-panel management-header screenshot-taker-hero">
        <div>
          <span className="management-badge">{copy.page.badge}</span>
          <h1>{copy.page.title}</h1>
          <p>{copy.page.description}</p>
        </div>
        <div className="management-header-actions">
          {canScheduleCaptures ? (
            <button
              type="button"
              className={`management-button-secondary screenshot-taker-schedule-trigger${scheduleIsActive ? " is-active" : ""}`}
              onClick={() => setIsScheduleModalOpen(true)}
              disabled={scheduleBusy}
            >
              {scheduleIsActive ? copy.page.autoScheduleOn : copy.page.autoSchedule}
            </button>
          ) : null}
          <button
            type="button"
            className="management-button-secondary"
            onClick={loadScreenshotTaker}
            disabled={loading}
          >
            {loading ? copy.common.refreshing : copy.common.refresh}
          </button>
        </div>
      </section>

      <ToastNotice message={error} onClose={() => setError("")} />
      <ToastNotice message={notice} tone="success" onClose={() => setNotice("")} />

      {canScheduleCaptures ? (
        <section className="app-panel screenshot-taker-live-status">
          <div className="screenshot-taker-next-run">
            <span>{copy.page.live.autoSchedule}</span>
            <strong>{scheduleIsActive ? copy.page.live.running : copy.page.live.stopped}</strong>
          </div>

          <div className="screenshot-taker-next-run">
            <span>{copy.page.live.scanStatus}</span>
            <strong>{scheduleScanLabel}</strong>
          </div>

          <div className="screenshot-taker-next-run">
            <span>{copy.page.live.progress}</span>
            <strong>{scheduleProgressLabel}</strong>
          </div>

          <div className="screenshot-taker-next-run">
            <span>{copy.page.live.nextScanIn}</span>
            <strong>{nextScanCountdownLabel}</strong>
            <small className="screenshot-taker-next-detail">{copy.page.live.nextAt(nextScanAtLabel)}</small>
          </div>

          <div className="screenshot-taker-live-actions">
            {scheduleIsActive ? (
              <button
                type="button"
                className="management-button-secondary is-danger"
                disabled={scheduleBusy}
                onClick={() => handleScheduleToggle(false)}
              >
                {copy.page.live.stopSchedule}
              </button>
            ) : (
              <></>
            )}
          </div>
        </section>
      ) : null}

      {canViewImageStorage ? (
        <section
          className={`app-panel screenshot-taker-storage-panel${imageStorage?.isOverLimit ? " is-over-limit" : ""}`}
        >
          <div>
            <span className={imageStorage?.isOverLimit ? "management-badge is-inactive" : "management-badge is-active"}>
              {copy.page.storage.badge}
            </span>
            <h2>{copy.page.storage.title}</h2>
            <p>{copy.page.storage.description}</p>
          </div>

          <div className="screenshot-taker-storage-meter">
            <div className="screenshot-taker-storage-meter-header">
              <strong>{imageStorageUsageLabel}</strong>
              <span>
                {imageStorage
                  ? copy.page.storage.percentUsed(formatNumber(imageStorage.usagePercent || 0, locale, 2, 2))
                  : copy.common.loading}
              </span>
            </div>
            <div
              className="screenshot-taker-storage-track"
              role="progressbar"
              aria-label={copy.page.storage.usageAria}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(imageStorageUsagePercent)}
            >
              <span style={{ width: `${imageStorageUsagePercent}%` }} />
            </div>

            <div className="screenshot-taker-storage-stats">
              <span>{imageStorageRemainingLabel}</span>
              <span>{copy.page.storage.fileCount(Number(imageStorage?.fileCount || 0))}</span>
              <span>{copy.page.storage.protectedBatches(Number(imageStorage?.retainedScanBatchCount || 0))}</span>
              <span>{copy.page.storage.lastCleanup(imageStorageLastCleanup)}</span>
              {imageStorageCleanup?.triggered ? (
                <span>
                  {copy.page.storage.removedFiles(
                    Number(imageStorageCleanup.removedFileCount || 0),
                    formatStorageBytes(imageStorageCleanup.removedBytes, locale, copy.helpers.storageByteFallback)
                  )}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              className="management-button-secondary"
              onClick={() => void loadImageStorage()}
              disabled={imageStorageBusy}
            >
              {imageStorageBusy ? copy.page.storage.checking : copy.page.storage.refresh}
            </button>
          </div>
        </section>
      ) : null}

      <section className="app-panel screenshot-taker-filter-panel">
        <div>
          <span className="management-badge">{copy.page.filters.badge}</span>
          <h2>{copy.page.filters.title}</h2>
          <p>{copy.page.filters.summary(displaySites.length, sites.length)}</p>
        </div>

        <div className="screenshot-taker-filter-controls">
          <label className="management-field screenshot-taker-search-field" htmlFor="screenshot-taker-search">
            <span>{copy.common.search}</span>
            <input
              id="screenshot-taker-search"
              type="search"
              value={scanSearch}
              onChange={(event) => setScanSearch(event.target.value)}
              placeholder={copy.page.filters.searchPlaceholder}
            />
          </label>

          <label className="management-field" htmlFor="screenshot-taker-scan-filter">
            <span>{copy.common.status}</span>
            <select
              id="screenshot-taker-scan-filter"
              value={scanFilter}
              onChange={(event) => setScanFilter(event.target.value)}
            >
              {scanFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="screenshot-taker-filter-stats">
            <span>{copy.page.filters.scanned(scanSummary.scannedCount)}</span>
            <span>{copy.page.filters.success(scanSummary.successCount)}</span>
            <span>{copy.page.filters.failed(scanSummary.failedCount)}</span>
          </div>

          <div className="screenshot-taker-filter-actions">
            {scanFilter !== "all" || scanSearch.trim() ? (
              <button
                type="button"
                className="management-button-secondary"
                onClick={() => {
                  setScanFilter("all");
                  setScanSearch("");
                }}
              >
                {copy.common.reset}
              </button>
            ) : null}
            {canClearImages ? (
              <button
                type="button"
                className="management-button-secondary is-danger"
                onClick={() => setIsClearImagesModalOpen(true)}
                disabled={clearImagesBusy || !scanSummary.scannedCount}
              >
                {copy.page.filters.clearImages}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="app-panel management-table">
        <div className="management-section-header">
          <div>
            <h2>{copy.page.table.title}</h2>
            <p>{copy.page.table.description}</p>
          </div>
          <div className="management-inline-actions">
            <button
              type="button"
              className="management-button-secondary"
              onClick={handleOpenAllSites}
              disabled={!sites.length}
            >
              {copy.page.table.openAllSites}
            </button>
            <span className="management-badge">{copy.page.table.assigned(sites.length)}</span>
          </div>
        </div>

        {loading ? (
          <p className="management-empty">{copy.page.table.loading}</p>
        ) : sites.length && displaySites.length ? (
          <div className="screenshot-taker-grid">
            {displaySites.map((site) => {
              const latestCapture = site.latestCapture;
              const latestCaptureId =
                latestCapture?.status === "success" && latestCapture.id ? String(latestCapture.id) : "";
              const imageUrl = latestCaptureId ? imageUrls[latestCaptureId] : "";
              const imageStatus = latestCaptureId ? imageLoadStates[latestCaptureId] : "";
              const isBusy = busySiteId === site.id;
              const scanJob = getSiteScanState(scannerStatus, site.id);
              const isScanning = scanJob?.status === "scanning";
              const isQueued = scanJob?.status === "queued";

              return (
                <article
                  key={site.id}
                  className={`screenshot-taker-card${isScanning ? " is-scanning" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPreviewSite(site)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setPreviewSite(site);
                    }
                  }}
                >
                  <div className="screenshot-taker-preview">
                    <button
                      type="button"
                      className="screenshot-taker-open-link"
                      onClick={(event) => handleOpenSite(event, site)}
                      title={copy.page.table.openTitle(site.domain)}
                      aria-label={copy.page.table.openAria(site.domain)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M14 5h5v5" />
                        <path d="M10 14 19 5" />
                        <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
                      </svg>
                    </button>
                    <ScreenshotLazyPreview
                      captureId={latestCaptureId}
                      imageUrl={imageUrl}
                      imageStatus={imageStatus}
                      alt={copy.page.table.previewAlt(site.domain)}
                      copy={copy}
                      onRequestImage={requestScreenshotImage}
                    />

                    {latestCaptureId ? (
                      <button
                        type="button"
                        className="screenshot-taker-view-image"
                        onClick={(event) => handlePreviewAction(event, site)}
                      >
                        {copy.page.table.viewOriginal}
                      </button>
                    ) : null}

                    {scanJob ? (
                      <div className="screenshot-taker-scan-overlay">
                        <span className="money-sites-screenshot-loader" />
                        <strong>
                          {scanJob.phase === "retry"
                            ? copy.page.table.retryingOverlay
                            : isScanning
                              ? copy.page.table.scanningOverlay
                              : copy.page.table.queuedNext}
                        </strong>
                        <small>
                          {scanJob.phase === "retry"
                            ? copy.page.table.retryAfterError
                            : scanJob.source === "manual"
                              ? copy.page.table.manualCapture
                              : copy.page.table.scheduledScan}
                        </small>
                      </div>
                    ) : null}
                  </div>

                  <div className="screenshot-taker-card-body">
                    <div>
                      <span className="management-badge">{site.brandName || copy.common.noBrand}</span>
                      <h3>{site.domain}</h3>
                      <p>{site.url}</p>
                    </div>

                    <div className="screenshot-taker-meta">
                      <span className={getCaptureTone(latestCapture?.status)}>
                        {getCaptureStatusLabel(latestCapture?.status, copy)}
                      </span>
                      <span>{formatDateTime(latestCapture?.capturedAt, locale)}</span>
                      <span>{formatBytes(latestCapture?.size, locale, copy.helpers.byteFallback)}</span>
                    </div>

                    {scanJob ? (
                      <div className="screenshot-taker-card-status">
                        <span className="management-badge is-progress">
                          {scanJob.phase === "retry"
                            ? copy.page.table.retryingThisSite
                            : isScanning
                              ? copy.page.table.scanningThisSite
                              : copy.page.table.queued}
                        </span>
                        <span>
                          {scanJob.phase === "retry"
                            ? copy.page.table.autoRetry
                            : scanJob.source === "manual"
                              ? copy.page.table.manualCapture
                              : copy.page.table.autoSchedule}
                        </span>
                      </div>
                    ) : null}

                    {latestCapture?.error ? <p className="management-error">{latestCapture.error}</p> : null}

                    <div className="management-inline-actions">
                      {canCaptureSites ? (
                        <button
                          type="button"
                          className="management-button-secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleCapture(site);
                          }}
                          disabled={isBusy || isScanning || isQueued}
                        >
                          {isBusy
                            ? copy.page.table.queuing
                            : isScanning
                              ? copy.page.table.scanning
                              : isQueued
                                ? copy.page.table.queued
                                : copy.page.table.captureNow}
                        </button>
                      ) : null}
                      {canManageSites ? (
                        <button
                          type="button"
                          className="management-button-secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRemove(site);
                          }}
                          disabled={isBusy}
                        >
                          {copy.page.table.remove}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={(event) => handlePreviewAction(event, site)}
                      >
                        {copy.page.table.viewOutput}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : sites.length ? (
          <p className="management-empty">
            {copy.page.table.emptyFiltered}
          </p>
        ) : (
          <p className="management-empty">
            {copy.page.table.empty}
          </p>
        )}
      </section>

      {canScheduleCaptures && isScheduleModalOpen ? (
        <ScreenshotScheduleModal
          copy={copy}
          schedule={schedule}
          scheduleBusy={scheduleBusy}
          scheduleIsActive={scheduleIsActive}
          scheduleScanLabel={scheduleScanLabel}
          scheduleProgressLabel={scheduleProgressLabel}
          nextScanCountdownLabel={nextScanCountdownLabel}
          nextScanAtLabel={nextScanAtLabel}
          canManageTelegramBot={canManageTelegramBot}
          lastError={scannerStatus?.lastError}
          onClose={() => setIsScheduleModalOpen(false)}
          onDelayMinutesChange={(delayMinutes) =>
            setSchedule((current) => ({
              ...current,
              delayMinutes,
            }))
          }
          onParallelCapturesChange={(parallelCaptures) =>
            setSchedule((current) => ({
              ...current,
              parallelCaptures,
            }))
          }
          onTelegramChange={(telegramPatch) =>
            setSchedule((current) =>
              normalizeSchedule({
                ...current,
                telegram: {
                  ...(current.telegram || {}),
                  ...telegramPatch,
                },
              })
            )
          }
          onScheduleSettingsSave={handleScheduleSettingsSave}
          onScheduleToggle={handleScheduleToggle}
        />
      ) : null}

      {activePreviewSite ? (
        <ScreenshotOutputModal
          copy={copy}
          site={activePreviewSite}
          capture={previewCapture}
          imageUrl={modalImageUrl}
          imageStatus={modalImageStatus}
          captureTone={getCaptureTone(previewCapture?.status)}
          formattedCapturedAt={formatDateTime(previewCapture?.capturedAt, locale)}
          formattedSize={formatBytes(previewCapture?.size, locale, copy.helpers.byteFallback)}
          onClose={() => setPreviewSite(null)}
          onOpenSite={(event) => handleOpenSite(event, activePreviewSite)}
          onOpenImage={handleOpenPreviewImage}
          onDownloadImage={handleDownloadPreviewImage}
        />
      ) : null}

      {isClearImagesModalOpen ? (
        <ScreenshotClearImagesModal
          copy={copy}
          busy={clearImagesBusy}
          onClose={() => setIsClearImagesModalOpen(false)}
          onConfirm={handleClearImages}
        />
      ) : null}
    </div>
  );
}
