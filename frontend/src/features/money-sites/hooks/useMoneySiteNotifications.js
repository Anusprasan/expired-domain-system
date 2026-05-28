import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getSocketBaseUrl } from "../../../shared/utils/socketBaseUrl";
import { getToken } from "../../auth/utils/authStorage";
import { getMoneySiteSummaryApi } from "../api/moneySitesApi";

const MONEY_SITE_NOTIFICATION_READS_STORAGE_KEY = "money_site_notification_reads_v1";
const MONEY_SITE_NOTIFICATION_RECENT_ALERTS_STORAGE_KEY = "money_site_recent_blocked_alerts_v1";
const MONEY_SITE_NOTIFICATION_PERMISSION_PROMPTED_STORAGE_KEY =
  "money_site_notification_permission_prompted_v1";
const RECENT_ALERT_RETENTION_MS = 15 * 1000;

const EMPTY_SUMMARY = {
  total: 0,
  blocked: 0,
  notBlocked: 0,
  unknown: 0,
  blockedItems: [],
};

function normalizeBlockedNotificationItem(item = {}) {
  const normalizedItemId = normalizeId(item?._id || item?.id || item?.domain);
  const brandName =
    item?.brandId?.brandName || item?.brand?.brandName || item?.brandName || "Unknown brand";

  return {
    ...item,
    _id: normalizedItemId,
    id: normalizedItemId,
    domain: String(item?.domain || "").trim(),
    brandId:
      item?.brandId && typeof item.brandId === "object"
        ? item.brandId
        : { _id: normalizeId(item?.brandId), brandName },
    nawala: {
      ...(item?.nawala || {}),
      lastChecked:
        item?.nawala?.lastChecked || item?.lastChecked || item?.checkedAt || new Date().toISOString(),
    },
    note: item?.note || "",
    statusText: item?.statusText || "",
  };
}

function mergeBlockedNotificationItems(currentItems = [], nextItems = []) {
  const nextById = new Map();

  nextItems.forEach((item) => {
    const normalizedItem = normalizeBlockedNotificationItem(item);

    if (!normalizedItem._id) {
      return;
    }

    nextById.set(normalizedItem._id, normalizedItem);
  });

  currentItems.forEach((item) => {
    const normalizedItem = normalizeBlockedNotificationItem(item);

    if (!normalizedItem._id || nextById.has(normalizedItem._id)) {
      return;
    }

    nextById.set(normalizedItem._id, normalizedItem);
  });

  return [...nextById.values()];
}

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeIds(values = []) {
  return [...new Set(values.map(normalizeId).filter(Boolean))];
}

function hasSameIds(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function readStoredBlockedNotificationIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MONEY_SITE_NOTIFICATION_READS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeIds(parsed) : [];
  } catch {
    return [];
  }
}

function buildBlockedAlertSignature(payload = {}, domains = []) {
  const ids = normalizeIds(domains.map((item) => item?.id || item?._id || item?.domain));
  const idsPart = ids.join("|");
  const scanPart = String(payload?.scanId || "").trim();
  const batchPart = String(payload?.batchId || payload?.batchNumber || "").trim();

  if (!idsPart && !scanPart && !batchPart) {
    return "";
  }

  return `${scanPart}::${batchPart}::${idsPart}`;
}

function readRecentBlockedAlertMap() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(MONEY_SITE_NOTIFICATION_RECENT_ALERTS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const now = Date.now();
    return Object.entries(parsed).reduce((result, [key, value]) => {
      const timestamp = Number(value);

      if (!Number.isFinite(timestamp)) {
        return result;
      }

      if (now - timestamp > RECENT_ALERT_RETENTION_MS) {
        return result;
      }

      result[key] = timestamp;
      return result;
    }, {});
  } catch {
    return {};
  }
}

function persistRecentBlockedAlertMap(map) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      MONEY_SITE_NOTIFICATION_RECENT_ALERTS_STORAGE_KEY,
      JSON.stringify(map || {})
    );
  } catch {
    // noop
  }
}

function playBlockedAlertSound() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  try {
    const context = new AudioContextClass();
    const startPlayback = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime;
      const firstEndAt = startAt + 0.13;
      const secondStartAt = startAt + 0.18;
      const endAt = secondStartAt + 0.13;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, startAt);
      oscillator.frequency.linearRampToValueAtTime(980, firstEndAt);
      oscillator.frequency.setValueAtTime(880, secondStartAt);
      oscillator.frequency.linearRampToValueAtTime(980, endAt);

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.14, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.02);
      oscillator.onended = () => {
        void context.close().catch(() => {});
      };
    };

    if (context.state === "suspended") {
      void context.resume().then(startPlayback).catch(() => {
        void context.close().catch(() => {});
      });
      return;
    }

    startPlayback();
  } catch {
    // noop
  }
}

export function useMoneySiteNotifications(enabled = true, options = {}) {
  const {
    applyLiveSummaryUpdates = false,
    enableDesktopNotifications = true,
    playSoundOnBlocked = true,
    notifyWhenVisible = true,
    autoPromptDesktopPermission = false,
  } = options;
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const [latestBlockedEvent, setLatestBlockedEvent] = useState(null);
  const [readBlockedNotificationIds, setReadBlockedNotificationIds] = useState(() =>
    readStoredBlockedNotificationIds()
  );
  const notifiedSignaturesRef = useRef(new Set());
  const blockedSummaryIdsRef = useRef(new Set());
  const latestBlockedIdsRef = useRef(new Set());

  const dismissLatestBlockedDomains = useCallback((ids = []) => {
    const idsToDismiss = new Set(normalizeIds(ids));

    if (!idsToDismiss.size) {
      setLatestBlockedEvent(null);
      return;
    }

    setLatestBlockedEvent((current) => {
      if (!current?.domains?.length) {
        return null;
      }

      const nextDomains = current.domains.filter(
        (item) => !idsToDismiss.has(normalizeId(item.id))
      );

      if (!nextDomains.length) {
        return null;
      }

      return {
        ...current,
        count: nextDomains.length,
        domains: nextDomains,
      };
    });
  }, []);

  const loadSummary = useCallback(async () => {
    if (!enabled) {
      setSummary(EMPTY_SUMMARY);
      setLoading(false);
      setError("");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await getMoneySiteSummaryApi();
      setSummary(response.data || EMPTY_SUMMARY);
    } catch (requestError) {
      setSummary(EMPTY_SUMMARY);
      setError(requestError?.response?.data?.message || "Failed to load money site notifications");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const loadSummaryRef = useRef(loadSummary);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    loadSummaryRef.current = loadSummary;
  }, [loadSummary]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const refreshSummarySafely = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    try {
      await loadSummaryRef.current();
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      MONEY_SITE_NOTIFICATION_READS_STORAGE_KEY,
      JSON.stringify(readBlockedNotificationIds)
    );
  }, [readBlockedNotificationIds]);

  useEffect(() => {
    const blockedIds = normalizeIds(summary.blockedItems.map((item) => item?._id));
    blockedSummaryIdsRef.current = new Set(blockedIds);

    setReadBlockedNotificationIds((current) => {
      const blockedIdSet = new Set(blockedIds);
      const next = current.filter((id) => blockedIdSet.has(id));

      return hasSameIds(current, next) ? current : next;
    });
  }, [summary.blockedItems]);

  useEffect(() => {
    latestBlockedIdsRef.current = new Set(
      normalizeIds((latestBlockedEvent?.domains || []).map((item) => item?._id || item?.id))
    );
  }, [latestBlockedEvent]);

  useEffect(() => {
    if (
      !enabled
      || !enableDesktopNotifications
      || !autoPromptDesktopPermission
      || typeof window === "undefined"
    ) {
      return;
    }

    if (!("Notification" in window) || window.Notification.permission !== "default") {
      return;
    }

    const alreadyPrompted =
      window.localStorage.getItem(MONEY_SITE_NOTIFICATION_PERMISSION_PROMPTED_STORAGE_KEY) ===
      "true";

    if (alreadyPrompted) {
      return;
    }

    window.localStorage.setItem(MONEY_SITE_NOTIFICATION_PERMISSION_PROMPTED_STORAGE_KEY, "true");

    const timerId = window.setTimeout(() => {
      void window.Notification.requestPermission().catch(() => {});
    }, 800);

    return () => window.clearTimeout(timerId);
  }, [autoPromptDesktopPermission, enableDesktopNotifications, enabled]);

  useEffect(() => {
    if (!enabled) {
      setLatestBlockedEvent(null);
      return undefined;
    }

    const token = getToken();

    if (!token) {
      return undefined;
    }

    const socket = io(`${getSocketBaseUrl()}/money-sites`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    const notifyBlockedEvent = (payload = {}, domains = []) => {
      if (!enableDesktopNotifications || !Array.isArray(domains) || !domains.length) {
        return;
      }

      if (playSoundOnBlocked) {
        playBlockedAlertSound();
      }

      const signature = buildBlockedAlertSignature(payload, domains);

      if (!signature) {
        return;
      }

      if (typeof window === "undefined" || !("Notification" in window)) {
        return;
      }

      if (!notifyWhenVisible && !document.hidden) {
        return;
      }

      if (window.Notification.permission !== "granted") {
        return;
      }

      if (notifiedSignaturesRef.current.has(signature)) {
        return;
      }

      const recentAlertMap = readRecentBlockedAlertMap();
      const now = Date.now();

      if (recentAlertMap[signature] && now - recentAlertMap[signature] < RECENT_ALERT_RETENTION_MS) {
        notifiedSignaturesRef.current.add(signature);
        return;
      }

      recentAlertMap[signature] = now;
      persistRecentBlockedAlertMap(recentAlertMap);
      notifiedSignaturesRef.current.add(signature);

      const title =
        domains.length === 1
          ? "Money Site Checker: 1 blocked domain"
          : `Money Site Checker: ${domains.length} blocked domains`;
      const body = domains
        .slice(0, 4)
        .map((item) => item?.domain)
        .filter(Boolean)
        .join(", ");

      try {
        const notification = new window.Notification(title, {
          body: body || "New blocked domains detected.",
          tag: `money-sites-blocked-${signature}`,
          renotify: false,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch {
        // noop
      }
    };

    const handleStatusUpdate = (payload = {}) => {
      const blockedDomainsCount = Number(payload?.blockedDomains);
      const totalDomainsCount = Number(payload?.totalDomains);
      const normalizedUpdatedIds = normalizeIds(payload?.updatedIds || []);
      const normalizedNewlyBlockedIds = normalizeIds(
        (payload?.newlyBlockedDomains || []).map((item) => item?._id || item?.id)
      );

      if (
        applyLiveSummaryUpdates
        && (Number.isFinite(blockedDomainsCount) || Number.isFinite(totalDomainsCount))
      ) {
        setSummary((current) => {
          const nextBlocked = Number.isFinite(blockedDomainsCount)
            ? Math.max(0, blockedDomainsCount)
            : Number(current?.blocked || 0);
          const nextTotal = Number.isFinite(totalDomainsCount)
            ? Math.max(0, totalDomainsCount)
            : Number(current?.total || 0);
          const nextNotBlocked = Math.max(0, nextTotal - nextBlocked);

          if (
            Number(current?.blocked || 0) === nextBlocked &&
            Number(current?.total || 0) === nextTotal &&
            Number(current?.notBlocked || 0) === nextNotBlocked
          ) {
            return current;
          }

          return {
            ...current,
            blocked: nextBlocked,
            total: nextTotal,
            notBlocked: nextNotBlocked,
          };
        });
      }

      if (normalizedUpdatedIds.length) {
        const staleLatestBlockedIds = normalizedUpdatedIds.filter(
          (id) => latestBlockedIdsRef.current.has(id) && !normalizedNewlyBlockedIds.includes(id)
        );

        if (staleLatestBlockedIds.length) {
          dismissLatestBlockedDomains(staleLatestBlockedIds);
        }
      }

      if (Array.isArray(payload.newlyBlockedDomains) && payload.newlyBlockedDomains.length) {
        const normalizedBlockedDomains = payload.newlyBlockedDomains.map(
          normalizeBlockedNotificationItem
        );
        const unreadIds = normalizeIds(
          normalizedBlockedDomains.map((item) => item?._id || item?.id)
        );

        setSummary((current) => {
          const blockedItems = mergeBlockedNotificationItems(
            current?.blockedItems || [],
            normalizedBlockedDomains
          );
          const blockedCount = Number(payload?.blockedDomains);
          const totalCount = Number(payload?.totalDomains);
          const nextBlocked = Number.isFinite(blockedCount)
            ? Math.max(0, blockedCount)
            : Math.max(Number(current?.blocked || 0), blockedItems.length);
          const nextTotal = Number.isFinite(totalCount)
            ? Math.max(0, totalCount)
            : Number(current?.total || 0);

          return {
            ...current,
            blocked: nextBlocked,
            total: nextTotal,
            notBlocked: Math.max(0, nextTotal - nextBlocked),
            blockedItems,
          };
        });

        setReadBlockedNotificationIds((current) =>
          current.filter((id) => !unreadIds.includes(id))
        );
        setLatestBlockedEvent({
          count: normalizedBlockedDomains.length,
          domains: normalizedBlockedDomains,
          receivedAt: new Date().toISOString(),
        });
        void refreshSummarySafely();

        notifyBlockedEvent(payload, normalizedBlockedDomains);
        return;
      }

      const touchesVisibleBlockedItems = normalizedUpdatedIds.some(
        (id) => blockedSummaryIdsRef.current.has(id) || latestBlockedIdsRef.current.has(id)
      );

      if (touchesVisibleBlockedItems) {
        void refreshSummarySafely();
      }
    };

    const handleStructureChange = () => {
      void refreshSummarySafely();
    };

    socket.on("money-sites:status-updated", handleStatusUpdate);
    socket.on("money-sites:bulk-check-complete", handleStructureChange);
    socket.on("money-sites:changed", handleStructureChange);

    return () => {
      socket.off("money-sites:status-updated", handleStatusUpdate);
      socket.off("money-sites:bulk-check-complete", handleStructureChange);
      socket.off("money-sites:changed", handleStructureChange);
      socket.disconnect();
    };
  }, [
    applyLiveSummaryUpdates,
    enableDesktopNotifications,
    enabled,
    notifyWhenVisible,
    playSoundOnBlocked,
    refreshSummarySafely,
  ]);

  const clearLatestBlockedEvent = useCallback(() => {
    setLatestBlockedEvent(null);
  }, []);

  const unreadBlockedItems = useMemo(
    () =>
      summary.blockedItems.filter(
        (item) => !readBlockedNotificationIds.includes(normalizeId(item?._id))
      ),
    [readBlockedNotificationIds, summary.blockedItems]
  );

  const markBlockedNotificationRead = useCallback(
    (id) => {
      const normalizedId = normalizeId(id);

      if (!normalizedId) {
        return;
      }

      setReadBlockedNotificationIds((current) =>
        current.includes(normalizedId) ? current : [...current, normalizedId]
      );
      dismissLatestBlockedDomains([normalizedId]);
    },
    [dismissLatestBlockedDomains]
  );

  const markAllBlockedNotificationsRead = useCallback(() => {
    const blockedIds = normalizeIds(summary.blockedItems.map((item) => item?._id));

    setReadBlockedNotificationIds((current) => {
      const next = normalizeIds([...current, ...blockedIds]);
      return hasSameIds(current, next) ? current : next;
    });
    dismissLatestBlockedDomains(blockedIds);
  }, [dismissLatestBlockedDomains, summary.blockedItems]);

  return {
    summary,
    loading,
    error,
    latestBlockedEvent,
    unreadBlockedItems,
    unreadBlockedCount: unreadBlockedItems.length,
    clearLatestBlockedEvent,
    markBlockedNotificationRead,
    markAllBlockedNotificationsRead,
    reloadSummary: loadSummary,
  };
}
