import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import AdminPanel from "../components/AdminPanel";
import AutoCheckLogPanel from "../components/AutoCheckLogPanel";
import AutoGoogleRankPanel from "../components/AutoGoogleRankPanel";
import BrandSidebar from "../components/BrandSidebar";
import BulkDomainCheckerPanel from "../components/BulkDomainCheckerPanel";
import CheckPanel from "../components/CheckPanel";
import DomainActivityLogPanel from "../components/DomainActivityLogPanel";
import DomainManagementPanel from "../components/DomainManagementPanel";
import GoogleRankPanel from "../components/GoogleRankPanel";
import RankAnalyticsPanel from "../components/RankAnalyticsPanel";
import ResultsList from "../components/ResultsList";
import UserDashboard from "../components/UserDashboard";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  addAdminApiKey,
  checkTopTen,
  createDomain,
  deleteAdminApiKey,
  deleteDomain,
  getAdminAutoCheckStatus,
  getAdminDashboard,
  getAutoCheckLogDetail,
  getAutoCheckLogs,
  getBrands,
  getDomainActivityLogs,
  getDomains,
  getRankingHistory,
  getRecentAutoChecks,
  getSerperAvailability,
  runBackupNow,
  stopAutoRun,
  testAdminBackupTelegram,
  testAdminNotificationTelegram,
  updateAdminApiKey,
  updateAdminBackupSettings,
  updateAdminNotificationSettings,
  updateAdminSchedule,
} from "../api/rankCheckerApi";
import { hasAnyPrivilege, hasPrivilege } from "../../../shared/utils/permissions";

const AUTO_CHECK_STATUS_POLL_MS = 2000;
const SERPER_AVAILABILITY_POLL_MS = 10000;
const INDONESIA_TIME_ZONE = "Asia/Jakarta";

const TAB_CONFIG = [
  { id: "dashboard", label: "Dashboard" },
  { id: "checker", label: "Manual Checker" },
  { id: "bulk-checker", label: "Bulk Checker" },
  { id: "domains", label: "Domains & Analytics" },
];

const ADMIN_TAB_CONFIG = [
  { id: "domain-logs", label: "Domain Logs" },
  { id: "auto-check-logs", label: "Auto Check Logs" },
];

const EXTRA_TAB_CONFIG = [
  { id: "google-rank", label: "Google Rank" },
  { id: "auto-google-rank", label: "Auto Google Rank" },
  { id: "rank-analytics", label: "Rank Analytics" },
];

const ADMIN_CONFIG_OPTIONS = [
  { id: "rank-check", label: "Rank Check" },
  { id: "backup", label: "Backup", adminOnly: true },
  { id: "notifications", label: "Notifications", adminOnly: true },
];

const BRAND_NAVIGATION_TABS = new Set(["dashboard", "checker", "domains", "google-rank", "auto-google-rank", "rank-analytics"]);
const RANK_CHECKER_BASE_ACCESS_PRIVILEGES = [
  "SHOW_RANK_CHECKER",
  "RANK_CHECKER_ADMIN_PRIVS",
  "RANK_CHECKER_MANUAL_CHECKER",
  "RANK_CHECKER_BULK_CHECKER",
  "RANK_CHECKER_ADD_DOMAINS",
  "RANK_CHECKER_LOGS",
];

function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;
}

function getIntervalMinutes(settings) {
  const minutes = Number(settings?.checkIntervalMinutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    return minutes;
  }

  const hours = Number(settings?.checkIntervalHours || 1);
  return Number.isFinite(hours) && hours > 0 ? hours * 60 : 60;
}

function toRankOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLatestAutoCheckMovement(runs = []) {
  const latestRun = runs[0] || null;
  const previousRun = runs[1] || null;
  const currentRank = toRankOrNull(latestRun?.bestOwnRank);
  const previousRank = toRankOrNull(previousRun?.bestOwnRank);

  if (!latestRun) {
    return {
      currentRank: null,
      previousRank: null,
      delta: null,
      trend: 'no_data',
      lastChecked: null,
    };
  }

  if (previousRank === null && currentRank === null) {
    return {
      currentRank,
      previousRank,
      delta: null,
      trend: 'no_data',
      lastChecked: latestRun.checkedAt || null,
    };
  }

  if (previousRank === null && currentRank !== null) {
    return {
      currentRank,
      previousRank,
      delta: currentRank,
      trend: 'new',
      lastChecked: latestRun.checkedAt || null,
    };
  }

  if (previousRank !== null && currentRank === null) {
    return {
      currentRank,
      previousRank,
      delta: previousRank,
      trend: 'missing',
      lastChecked: latestRun.checkedAt || null,
    };
  }

  const delta = previousRank - currentRank;
  return {
    currentRank,
    previousRank,
    delta,
    trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable',
    lastChecked: latestRun.checkedAt || null,
  };
}

function getRankCheckerSocketUrl() {
  const socketUrl = String(import.meta.env.VITE_RANK_CHECKER_SOCKET_URL || "").trim();
  if (!socketUrl) {
    return null;
  }

  try {
    return new URL(socketUrl, window.location.origin).toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function formatIndonesiaLiveTime(date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: INDONESIA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/:/g, ".");
}

export default function RankCheckerPage() {
  const { user } = useAuth();
  const adminMenuRef = useRef(null);
  const [tab, setTab] = useState("dashboard");
  const [adminConfigView, setAdminConfigView] = useState("rank-check");
  const [adminConfigDropdownOpen, setAdminConfigDropdownOpen] = useState(false);
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [resultsByBrand, setResultsByBrand] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dashboardBrands, setDashboardBrands] = useState([]);
  const [totalDomains, setTotalDomains] = useState(0);
  const [adminDashboard, setAdminDashboard] = useState(null);
  const [liveAutoCheckStatus, setLiveAutoCheckStatus] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminNotice, setAdminNotice] = useState("");
  const [serperAvailability, setSerperAvailability] = useState(null);
  const [serperAvailabilityLoading, setSerperAvailabilityLoading] = useState(false);
  const [runActionLoading, setRunActionLoading] = useState(false);
  const [backupActionLoading, setBackupActionLoading] = useState(false);
  const [backupTestLoading, setBackupTestLoading] = useState(false);
  const [notificationTestLoading, setNotificationTestLoading] = useState(false);
  const [indonesiaLiveTime, setIndonesiaLiveTime] = useState(() => formatIndonesiaLiveTime());

  const canShowRankChecker = hasAnyPrivilege(user, RANK_CHECKER_BASE_ACCESS_PRIVILEGES);
  const canAddRankCheckerDomains = hasAnyPrivilege(user, ["RANK_CHECKER_ADD_DOMAINS", "RANK_CHECKER_ADMIN_PRIVS"]);
  const canUseManualChecker = hasAnyPrivilege(user, ["RANK_CHECKER_MANUAL_CHECKER", "RANK_CHECKER_ADMIN_PRIVS"]);
  const canUseBulkChecker = hasAnyPrivilege(user, ["RANK_CHECKER_BULK_CHECKER", "RANK_CHECKER_ADMIN_PRIVS"]);
  const canUseGoogleRank = hasAnyPrivilege(user, ["RANK_CHECKER_MANUAL_CHECKER", "RANK_CHECKER_ADMIN_PRIVS"]);
  const canAccessRankCheckerAdmin = hasAnyPrivilege(user, ["RANK_CHECKER_ADMIN_PRIVS"]);
  const canViewRankCheckerLogs = hasAnyPrivilege(user, ["RANK_CHECKER_LOGS", "RANK_CHECKER_ADMIN_PRIVS"]);
  const isAdmin = hasPrivilege(user, "ADMIN_ACCESS");
  const visibleTabs = useMemo(
    () =>
      TAB_CONFIG.filter((item) => {
        if (item.id === "checker") {
          return canUseManualChecker;
        }

        if (item.id === "bulk-checker") {
          return canUseBulkChecker;
        }

        if (item.id === "dashboard" || item.id === "domains") {
          return canShowRankChecker;
        }

        return false;
      }),
    [canShowRankChecker, canUseBulkChecker, canUseManualChecker]
  );
  const visibleAdminTabs = useMemo(
    () => (canViewRankCheckerLogs ? ADMIN_TAB_CONFIG : []),
    [canViewRankCheckerLogs]
  );
  const visibleExtraTabs = useMemo(
    () =>
      EXTRA_TAB_CONFIG.filter(
        (item) =>
          (item.id === "google-rank" || item.id === "auto-google-rank" || item.id === "rank-analytics") &&
          canUseGoogleRank
      ),
    [canUseGoogleRank]
  );
  const adminConfigOptions = useMemo(
    () => ADMIN_CONFIG_OPTIONS.filter((item) => isAdmin || !item.adminOnly),
    [isAdmin]
  );
  const activeAdminConfigLabel =
    adminConfigOptions.find((item) => item.id === adminConfigView)?.label || "Rank Check";
  const selectedResult = useMemo(
    () => (selectedBrand ? resultsByBrand[selectedBrand._id] || null : null),
    [resultsByBrand, selectedBrand]
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndonesiaLiveTime(formatIndonesiaLiveTime());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!visibleTabs.length && !canAccessRankCheckerAdmin && !visibleAdminTabs.length) {
      return;
    }

    const allowedTabs = new Set([
      ...visibleTabs.map((item) => item.id),
      ...(canAccessRankCheckerAdmin ? ["admin"] : []),
      ...visibleAdminTabs.map((item) => item.id),
      ...visibleExtraTabs.map((item) => item.id),
    ]);

    if (!allowedTabs.has(tab)) {
      setTab(visibleTabs[0]?.id || (canAccessRankCheckerAdmin ? "admin" : visibleAdminTabs[0]?.id || "dashboard"));
    }
  }, [canAccessRankCheckerAdmin, tab, visibleAdminTabs, visibleExtraTabs, visibleTabs]);

  useEffect(() => {
    if (!canAccessRankCheckerAdmin) {
      setAdminConfigDropdownOpen(false);
      return;
    }

    if (!adminConfigOptions.some((item) => item.id === adminConfigView)) {
      setAdminConfigView(adminConfigOptions[0]?.id || "rank-check");
    }
  }, [adminConfigOptions, adminConfigView, canAccessRankCheckerAdmin]);

  useEffect(() => {
    if (!adminConfigDropdownOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target)) {
        setAdminConfigDropdownOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [adminConfigDropdownOpen]);

  useEffect(() => {
    const loadBrands = async () => {
      try {
        setError("");
        const brandList = await getBrands();
        setBrands(brandList);
        setSelectedBrand(
          (current) => brandList.find((item) => item._id === current?._id) || brandList[0] || null
        );
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Failed to load Rank Checker brands"));
      }
    };

    loadBrands();
  }, []);

  const syncSerperAvailabilityFromError = (requestError) => {
    const availabilityPayload = requestError?.response?.data?.serperAvailability;
    if (availabilityPayload) {
      setSerperAvailability(availabilityPayload);
    }
  };

  const refreshSerperAvailability = async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setSerperAvailabilityLoading(true);
    }

    try {
      const payload = await getSerperAvailability();
      setSerperAvailability(payload);
      return payload;
    } catch (requestError) {
      syncSerperAvailabilityFromError(requestError);
      return null;
    } finally {
      if (showLoader) {
        setSerperAvailabilityLoading(false);
      }
    }
  };

  useEffect(() => {
    refreshSerperAvailability({ showLoader: true });
    const timer = window.setInterval(() => {
      refreshSerperAvailability();
    }, SERPER_AVAILABILITY_POLL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!brands.length || tab !== "dashboard") {
      return;
    }

    const loadDashboard = async () => {
      try {
        setError("");
        const domainList = await getDomains();
        setTotalDomains(domainList.length);
        const domainCountByBrandId = domainList.reduce((accumulator, item) => {
          const brandId = item?.brand?._id || item?.brand?.id || item?.brandId || item?.brand || "";
          const normalizedBrandId = String(brandId || "").trim();
          if (!normalizedBrandId) {
            return accumulator;
          }

          accumulator.set(normalizedBrandId, (accumulator.get(normalizedBrandId) || 0) + 1);
          return accumulator;
        }, new Map());
        const domainUrlsByBrandId = domainList.reduce((accumulator, item) => {
          const brandId = item?.brand?._id || item?.brand?.id || item?.brandId || item?.brand || "";
          const normalizedBrandId = String(brandId || "").trim();
          const domainValue = String(item?.domain || "").trim();
          if (!normalizedBrandId || !domainValue) {
            return accumulator;
          }

          const current = accumulator.get(normalizedBrandId) || [];
          current.push(domainValue);
          accumulator.set(normalizedBrandId, current);
          return accumulator;
        }, new Map());

        const enrichedBrands = await Promise.all(
          brands.map(async (brand) => {
            try {
              const recentAutoChecksPayload = await getRecentAutoChecks(brand._id, 5);
              const recentAutoChecks = recentAutoChecksPayload?.runs || [];
              const movement = getLatestAutoCheckMovement(recentAutoChecks);

              return {
                ...brand,
                domainCount: domainCountByBrandId.get(String(brand._id)) || 0,
                configuredDomains: Array.from(
                  new Set(domainUrlsByBrandId.get(String(brand._id)) || [])
                ).sort((left, right) => left.localeCompare(right)),
                currentRank: movement.currentRank,
                previousRank: movement.previousRank,
                delta: movement.delta,
                trend: movement.trend,
                lastChecked: movement.lastChecked,
                recentAutoChecks,
              };
            } catch {
              return {
                ...brand,
                domainCount: domainCountByBrandId.get(String(brand._id)) || 0,
                configuredDomains: Array.from(
                  new Set(domainUrlsByBrandId.get(String(brand._id)) || [])
                ).sort((left, right) => left.localeCompare(right)),
                currentRank: null,
                previousRank: null,
                delta: null,
                trend: 'no_data',
                lastChecked: null,
                recentAutoChecks: [],
              };
            }
          })
        );

        setDashboardBrands(enrichedBrands);
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Failed to load Rank Checker dashboard"));
      }
    };

    loadDashboard();
  }, [brands, tab]);

  const refreshAdminDashboard = async ({ showLoader = true } = {}) => {
    if (!canAccessRankCheckerAdmin) {
      return null;
    }

    if (showLoader) {
      setAdminLoading(true);
    }

    try {
      setAdminError("");
      const payload = await getAdminDashboard();
      setAdminDashboard(payload);
      if (payload?.serperAvailability) {
        setSerperAvailability(payload.serperAvailability);
      }
      setLiveAutoCheckStatus({
        settings: payload?.settings || null,
        schedulerStatus: payload?.schedulerStatus || null,
        scheduleWindow: payload?.autoCheckScheduleWindow || [],
      });
      return payload;
    } catch (requestError) {
      setAdminError(getErrorMessage(requestError, "Failed to load Rank Checker admin dashboard"));
      return null;
    } finally {
      if (showLoader) {
        setAdminLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!canAccessRankCheckerAdmin || tab !== "admin") {
      return;
    }

    refreshAdminDashboard({ showLoader: true });
  }, [canAccessRankCheckerAdmin, tab]);

  useEffect(() => {
    if (!canAccessRankCheckerAdmin || tab !== "admin" || adminConfigView !== "rank-check") {
      return undefined;
    }

    const refreshStatus = async () => {
      try {
        const payload = await getAdminAutoCheckStatus();
        if (payload?.serperAvailability) {
          setSerperAvailability(payload.serperAvailability);
        }
        setLiveAutoCheckStatus(payload);
      } catch {
        // Keep the last known live status visible if a refresh fails.
      }
    };

    refreshStatus();
    const socketUrl = getRankCheckerSocketUrl();
    const socket = socketUrl
      ? io(socketUrl, {
          transports: ["websocket", "polling"],
        })
      : null;

    socket?.on("admin:dashboard-updated", () => {
      refreshStatus();
    });

    const timer = window.setInterval(refreshStatus, AUTO_CHECK_STATUS_POLL_MS);
    return () => {
      window.clearInterval(timer);
      socket?.close();
    };
  }, [adminConfigView, canAccessRankCheckerAdmin, tab]);

  const runCheck = async (payload) => {
    try {
      setLoading(true);
      setError("");
      const response = await checkTopTen(payload);
      setResultsByBrand((current) => ({
        ...current,
        [payload.brandId]: response,
      }));
      refreshSerperAvailability();
    } catch (requestError) {
      syncSerperAvailabilityFromError(requestError);
      setResultsByBrand((current) => {
        const next = { ...current };
        delete next[payload.brandId];
        return next;
      });
      setError(getErrorMessage(requestError, "Failed to check SERP results"));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSchedule = async (payload) => {
    const currentSettings = adminDashboard?.settings || {};
    const currentIntervalMinutes = getIntervalMinutes(currentSettings);
    const nextIntervalMinutes = Number(payload?.checkIntervalMinutes ?? currentIntervalMinutes);
    const intervalChanged =
      Number.isFinite(nextIntervalMinutes) && nextIntervalMinutes !== currentIntervalMinutes;
    const isCurrentlyEnabled = Boolean(currentSettings.autoCheckEnabled);
    const willRemainEnabled = payload?.autoCheckEnabled !== false;

    if (isCurrentlyEnabled && willRemainEnabled && intervalChanged) {
      setAdminNotice("");
      setAdminError(
        `Auto check is active on ${currentIntervalMinutes} min. Stop auto check, save ${nextIntervalMinutes} min, then start it again.`
      );
      return;
    }

    try {
      setAdminError("");
      setAdminNotice("");
      const savedSettings = await updateAdminSchedule(payload);
      await refreshAdminDashboard();

      if (payload?.autoCheckEnabled === false) {
        setAdminNotice("Auto check schedule saved. Scheduled auto check is stopped.");
      } else if (!isCurrentlyEnabled && payload?.autoCheckEnabled === true) {
        setAdminNotice(
          `Auto check started with the saved ${getIntervalMinutes(savedSettings)} min interval.`
        );
      } else if (intervalChanged) {
        setAdminNotice(`Auto check interval saved at ${getIntervalMinutes(savedSettings)} min.`);
      } else {
        setAdminNotice("Auto check settings saved.");
      }
    } catch (requestError) {
      syncSerperAvailabilityFromError(requestError);
      setAdminError(getErrorMessage(requestError, "Failed to save auto check settings"));
      throw requestError;
    }
  };

  const handleStartAutoCheck = async () => {
    try {
      setRunActionLoading(true);
      setAdminError("");
      setAdminNotice("");
      await updateAdminSchedule({
        autoCheckEnabled: true,
      });
      const payload = await refreshAdminDashboard();
      setAdminNotice(
        `Auto check started with the saved ${getIntervalMinutes(payload?.settings)} min interval. First run is starting now.`
      );
    } catch (requestError) {
      syncSerperAvailabilityFromError(requestError);
      setAdminError(getErrorMessage(requestError, "Failed to start auto check"));
    } finally {
      setRunActionLoading(false);
    }
  };

  const handleStopAutoCheck = async () => {
    try {
      setRunActionLoading(true);
      setAdminError("");
      setAdminNotice("");
      await stopAutoRun();
      await refreshAdminDashboard();
      setAdminNotice("Auto check stopped. You can now change the interval and save it.");
    } catch (requestError) {
      setAdminError(getErrorMessage(requestError, "Failed to stop auto check"));
    } finally {
      setRunActionLoading(false);
    }
  };

  const handleSaveBackupSettings = async (payload) => {
    try {
      setAdminError("");
      await updateAdminBackupSettings(payload);
      await refreshAdminDashboard();
      setAdminNotice("Backup settings saved.");
    } catch (requestError) {
      setAdminError(getErrorMessage(requestError, "Failed to save backup settings"));
      throw requestError;
    }
  };

  const handleSaveNotificationSettings = async (payload) => {
    try {
      setAdminError("");
      await updateAdminNotificationSettings(payload);
      await refreshAdminDashboard();
      setAdminNotice("Notification settings saved.");
    } catch (requestError) {
      setAdminError(getErrorMessage(requestError, "Failed to save notification settings"));
      throw requestError;
    }
  };

  const handleRunBackupNow = async () => {
    try {
      setBackupActionLoading(true);
      setAdminNotice("");
      await runBackupNow();
      await refreshAdminDashboard();
    } catch (requestError) {
      setAdminError(getErrorMessage(requestError, "Failed to run backup"));
    } finally {
      setBackupActionLoading(false);
    }
  };

  const handleAddApiKey = async (payload) => {
    try {
      setAdminError("");
      await addAdminApiKey(payload);
      await refreshAdminDashboard();
    } catch (requestError) {
      setAdminError(getErrorMessage(requestError, "Failed to add API key"));
      throw requestError;
    }
  };

  const handleUpdateApiKey = async (keyId, payload) => {
    try {
      setAdminError("");
      await updateAdminApiKey(keyId, payload);
      await refreshAdminDashboard();
    } catch (requestError) {
      setAdminError(getErrorMessage(requestError, "Failed to update API key"));
      throw requestError;
    }
  };

  const handleDeleteApiKey = async (keyId) => {
    try {
      setAdminError("");
      await deleteAdminApiKey(keyId);
      await refreshAdminDashboard();
    } catch (requestError) {
      setAdminError(getErrorMessage(requestError, "Failed to delete API key"));
      throw requestError;
    }
  };

  const handleTestBackupTelegram = async (payload) => {
    try {
      setBackupTestLoading(true);
      setAdminError("");
      const requestPayload = Array.isArray(payload) ? { backupTelegramChatIds: payload } : payload || {};
      const result = await testAdminBackupTelegram(requestPayload);
      setAdminNotice(
        `Backup Telegram test: ${result.okCount}/${result.total} successful${result.failCount ? `, ${result.failCount} failed` : ""}.`
      );
    } catch (requestError) {
      setAdminError(getErrorMessage(requestError, "Failed to test backup Telegram"));
    } finally {
      setBackupTestLoading(false);
    }
  };

  const handleTestNotificationTelegram = async (payload) => {
    try {
      setNotificationTestLoading(true);
      setAdminError("");
      const result = await testAdminNotificationTelegram(payload);
      setAdminNotice(
        `Notification Telegram test: ${result.okCount}/${result.total} successful${result.failCount ? `, ${result.failCount} failed` : ""}.`
      );
    } catch (requestError) {
      setAdminError(getErrorMessage(requestError, "Failed to test notification Telegram"));
    } finally {
      setNotificationTestLoading(false);
    }
  };

  const renderMainContent = () => {
    if (tab === "dashboard") {
      return (
        <UserDashboard
          username={user?.fullName || user?.email || "User"}
          brands={dashboardBrands}
          totalDomains={totalDomains}
          focusedBrandId={selectedBrand?._id || ""}
          serperAvailability={serperAvailability}
          serperAvailabilityLoading={serperAvailabilityLoading}
        />
      );
    }

    if (tab === "checker") {
      return (
        <>
          <CheckPanel
            selectedBrand={selectedBrand}
            onCheck={runCheck}
            loading={loading}
            error={error}
            resultEntry={selectedResult}
            serperAvailability={serperAvailability}
            serperAvailabilityLoading={serperAvailabilityLoading}
          />
          <section className="px-4 pb-6 lg:px-6">
            <ResultsList selectedBrand={selectedBrand} payload={selectedResult} />
          </section>
        </>
      );
    }

    if (tab === "bulk-checker") {
      return (
        <BulkDomainCheckerPanel
          serperAvailability={serperAvailability}
          serperAvailabilityLoading={serperAvailabilityLoading}
          onAvailabilityChange={setSerperAvailability}
        />
      );
    }

    if (tab === "google-rank") {
      return (
        <GoogleRankPanel
          selectedBrand={selectedBrand}
          canManageKeys={canAccessRankCheckerAdmin}
        />
      );
    }

    if (tab === "auto-google-rank") {
      return <AutoGoogleRankPanel brands={brands} />;
    }

    if (tab === "rank-analytics") {
      return <RankAnalyticsPanel selectedBrand={selectedBrand} />;
    }

    if (tab === "domains") {
      return (
        <DomainManagementPanel
          brands={brands}
          selectedBrand={selectedBrand}
          canAddDomains={canAddRankCheckerDomains}
          canDeleteDomains={canAddRankCheckerDomains}
          onLoadDomains={getDomains}
          onCreateDomain={createDomain}
          onDeleteDomain={deleteDomain}
          onGetRankingHistory={getRankingHistory}
        />
      );
    }

    if (canAccessRankCheckerAdmin && tab === "admin") {
      return (
        <AdminPanel
          dashboard={adminDashboard}
          liveAutoCheckStatus={liveAutoCheckStatus}
          loading={adminLoading}
          error={adminError}
          notice={adminNotice}
          serperAvailability={serperAvailability}
          serperAvailabilityLoading={serperAvailabilityLoading}
          onSaveSchedule={handleSaveSchedule}
          onAddKey={handleAddApiKey}
          onUpdateKey={handleUpdateApiKey}
          onDeleteKey={handleDeleteApiKey}
          onStartAutoCheck={handleStartAutoCheck}
          onStopRun={handleStopAutoCheck}
          runActionLoading={runActionLoading}
          onSaveBackupSettings={handleSaveBackupSettings}
          onSaveNotificationSettings={handleSaveNotificationSettings}
          onRunBackupNow={handleRunBackupNow}
          backupActionLoading={backupActionLoading}
          onTestBackupTelegram={handleTestBackupTelegram}
          backupTestLoading={backupTestLoading}
          onTestNotificationTelegram={handleTestNotificationTelegram}
          notificationTestLoading={notificationTestLoading}
          sectionView={adminConfigView}
          isManager={!isAdmin}
        />
      );
    }

    if (canViewRankCheckerLogs && tab === "domain-logs") {
      return <DomainActivityLogPanel onLoadLogs={getDomainActivityLogs} />;
    }

    if (canViewRankCheckerLogs && tab === "auto-check-logs") {
      return <AutoCheckLogPanel onLoadLogs={getAutoCheckLogs} onLoadLogDetail={getAutoCheckLogDetail} />;
    }

    return null;
  };

  return (
    <div className="min-h-full bg-slate-100 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <section className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 shadow-sm lg:px-6">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Rank Checker</h1>
            <p className="mt-1 text-sm text-slate-500">
              Run manual checks, review brand trends, and manage the isolated Rank Checker service from the main app.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {visibleTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setAdminConfigView("rank-check");
                  setAdminConfigDropdownOpen(false);
                }}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  tab === item.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}

          

            {canAccessRankCheckerAdmin ? (
              <div className="relative" ref={adminMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setTab("admin");
                    setAdminConfigDropdownOpen((current) => !current);
                  }}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    tab === "admin"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={adminConfigDropdownOpen}
                >
                  {tab === "admin" ? `Admin Config: ${activeAdminConfigLabel}` : "Admin Config"}
                </button>

                {adminConfigDropdownOpen ? (
                  <div
                    className="absolute right-0 z-30 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                    role="menu"
                    aria-label="Admin config navigation"
                  >
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Admin Config
                    </div>
                    <div className="p-2">
                      {adminConfigOptions.map((item) => {
                        const isActive = tab === "admin" && item.id === adminConfigView;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setTab("admin");
                              setAdminConfigView(item.id);
                              setAdminConfigDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                              isActive
                                ? "bg-slate-900 text-white"
                                : "text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <span>{item.label}</span>
                            {isActive ? (
                              <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                                Active
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {visibleAdminTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setAdminConfigDropdownOpen(false);
                  }}
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${
                    tab === item.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            {visibleExtraTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setAdminConfigDropdownOpen(false);
                }}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  tab === item.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
        <div className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold tabular-nums text-emerald-950 shadow-sm">
              <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">WIB</span>
              <span>{indonesiaLiveTime}</span>
            </div>    </div>
        </div>

        {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </section>

      <div className="lg:flex lg:min-h-0 lg:flex-1">
        <BrandSidebar
          brands={brands}
          selectedBrandId={selectedBrand?._id}
          onSelect={(brand) => {
            setSelectedBrand(brand);
            if (!BRAND_NAVIGATION_TABS.has(tab)) {
              setTab("domains");
            }
          }}
        />

        <main className="min-w-0 flex-1 lg:min-h-0 lg:overflow-y-auto">
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}
