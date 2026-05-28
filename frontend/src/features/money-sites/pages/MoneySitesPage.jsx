import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import ConfirmActionModal from "../../../shared/components/ConfirmActionModal";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { getSocketBaseUrl } from "../../../shared/utils/socketBaseUrl";
import { hasAdminAccess, hasPrivilege } from "../../../shared/utils/permissions";
import { useAuth } from "../../auth/hooks/useAuth";
import { getToken } from "../../auth/utils/authStorage";
import { useBrands } from "../../brands/hooks/useBrands";
import MoneySiteForm from "../components/MoneySiteForm";
import MoneySitesSummaryCards from "../components/MoneySitesSummaryCards";
import MoneySitesTable from "../components/MoneySitesTable";
import { getMoneySiteActivityLogsApi, getMoneySitesApi } from "../api/moneySitesApi";
import {
  assignScreenshotSiteApi,
  captureLiveScreenshotApi,
  fetchScreenshotImageBlobApi,
  getScreenshotSitesApi,
  removeScreenshotSiteApi,
} from "../../screenshot-taker/api/screenshotTakerApi";
import { useMoneySiteUiCopy } from "../hooks/useMoneySiteUiCopy";
import { useMoneySites } from "../hooks/useMoneySites";
import "../../../shared/styles/management.css";

function getDateTimeLocale(language) {
  return language === "indonesian" ? "id-ID" : undefined;
}

function formatLatestBlockedPreview(event) {
  if (!event?.domains?.length) {
    return "";
  }

  return event.domains
    .slice(0, 4)
    .map((item) => item.domain)
    .join(", ");
}

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeIds(values = []) {
  return [...new Set(values.map(normalizeId).filter(Boolean))];
}

function buildScreenshotSitePayload(moneySite) {
  return {
    moneySiteId: moneySite._id,
    domain: moneySite.domain,
    url: moneySite.domain,
    brandName: moneySite.brandId?.brandName || "",
    note: moneySite.note || "",
  };
}

async function runWithConcurrency(items = [], concurrency = 5, worker) {
  const results = [];
  let currentIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (currentIndex < items.length) {
        const itemIndex = currentIndex;
        currentIndex += 1;

        try {
          results[itemIndex] = {
            status: "fulfilled",
            value: await worker(items[itemIndex], itemIndex),
          };
        } catch (error) {
          results[itemIndex] = {
            status: "rejected",
            reason: error,
          };
        }
      }
    })
  );

  return results;
}

function formatActivityTime(value, language) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(getDateTimeLocale(language));
}

function formatMoneySiteAction(action, activityCopy) {
  const actionKeys = {
    "money-site.create": "create",
    "money-site.update": "update",
    "money-site.delete": "delete",
    "money-site.import": "import",
    "money-site.delete-all": "deleteAll",
    "money-site.bulk-delete-blocked": "deleteBlocked",
  };

  const actionKey = actionKeys[action];

  if (actionKey && activityCopy?.actionLabels?.[actionKey]) {
    return activityCopy.actionLabels[actionKey];
  }

  return action || activityCopy?.fallbackAction || "Action";
}

export default function MoneySitesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { copy, language } = useMoneySiteUiCopy();
  const { brands, loading: brandsLoading, error: brandsError, hasError: hasBrandsError } = useBrands();
  const [filters, setFilters] = useState({
    search: "",
    brandId: "",
    status: "",
    screenshotAssignment: "all",
    page: 1,
    limit: 25,
  });
  const [selectedMoneySite, setSelectedMoneySite] = useState(null);
  const [pendingDeleteMoneySite, setPendingDeleteMoneySite] = useState(null);
  const [showMoneySiteModal, setShowMoneySiteModal] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkDeleteFinalConfirm, setShowBulkDeleteFinalConfirm] = useState(false);
  const [bulkDeleteConfirmationText, setBulkDeleteConfirmationText] = useState("");
  const [selectedBlockedIds, setSelectedBlockedIds] = useState([]);
  const [blockedSelectableCount, setBlockedSelectableCount] = useState(0);
  const [blockedSelectionBusy, setBlockedSelectionBusy] = useState(false);
  const [assignedScreenshotMoneySiteIds, setAssignedScreenshotMoneySiteIds] = useState([]);
  const [screenshotSitesByMoneySiteId, setScreenshotSitesByMoneySiteId] = useState({});
  const [screenshotPreview, setScreenshotPreview] = useState({
    isOpen: false,
    item: null,
    loading: false,
    error: "",
    imageUrl: "",
    capturedAt: "",
  });
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityPagination, setActivityPagination] = useState({
    page: 1,
    limit: 30,
    total: 0,
    totalPages: 1,
  });
  const [activitySearch, setActivitySearch] = useState("");
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [activityLoadFailed, setActivityLoadFailed] = useState(false);
  const [latestBlockedEvent, setLatestBlockedEvent] = useState(null);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [busyMoneySiteId, setBusyMoneySiteId] = useState("");
  const [bulkScreenshotPreparing, setBulkScreenshotPreparing] = useState("");
  const [bulkScreenshotBusy, setBulkScreenshotBusy] = useState(false);
  const [bulkScreenshotAction, setBulkScreenshotAction] = useState({
    mode: "",
    sites: [],
  });
  const [liveStatus, setLiveStatus] = useState("connecting");
  const requestFilters = useMemo(
    () => ({
      search: filters.search,
      brandId: filters.brandId,
      status: filters.status,
      screenshotAssignment: filters.screenshotAssignment,
      page: filters.page,
      limit: filters.limit,
    }),
    [filters]
  );
  const {
    moneySites,
    pagination,
    summary,
    summaryLoading,
    summaryError,
    hasSummaryError,
    loading,
    error,
    hasError: hasMoneySitesError,
    reloadMoneySites,
    reloadMoneySiteDomains,
    reloadMoneySiteSummary,
    createMoneySite,
    exportMoneySitesCsv,
    updateMoneySite,
    deleteMoneySite,
    bulkDeleteBlockedMoneySites,
  } = useMoneySites(requestFilters);
  const reloadMoneySitesRef = useRef(reloadMoneySites);
  const reloadMoneySiteDomainsRef = useRef(reloadMoneySiteDomains);
  const reloadMoneySiteSummaryRef = useRef(reloadMoneySiteSummary);
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
        (item) => !idsToDismiss.has(normalizeId(item?._id || item?.id))
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

  useEffect(() => {
    reloadMoneySitesRef.current = reloadMoneySites;
  }, [reloadMoneySites]);

  useEffect(() => {
    reloadMoneySiteDomainsRef.current = reloadMoneySiteDomains;
  }, [reloadMoneySiteDomains]);

  useEffect(() => {
    reloadMoneySiteSummaryRef.current = reloadMoneySiteSummary;
  }, [reloadMoneySiteSummary]);

  useEffect(() => {
    latestBlockedIdsRef.current = new Set(
      normalizeIds((latestBlockedEvent?.domains || []).map((item) => item?._id || item?.id))
    );
  }, [latestBlockedEvent]);

  useEffect(() => {
    setFilters((current) => (
      current.page === pagination.page
        ? current
        : { ...current, page: pagination.page }
    ));
  }, [pagination.page]);

  const displayMoneySites = useMemo(
    () => {
      return [...moneySites]
        .sort((left, right) => {
        const leftBlocked = left?.nawala?.status === "ada" ? 0 : 1;
        const rightBlocked = right?.nawala?.status === "ada" ? 0 : 1;

        if (leftBlocked !== rightBlocked) {
          return leftBlocked - rightBlocked;
        }

        return 0;
      });
    },
    [moneySites]
  );

  const selectedBlockedCount = selectedBlockedIds.length;
  const allBlockedSelected =
    blockedSelectableCount > 0 && selectedBlockedIds.length === blockedSelectableCount;

  const canCreateMoneySites = hasPrivilege(user, "CREATE_MONEY_SITES");
  const canEditMoneySites = hasPrivilege(user, "EDIT_MONEY_SITES");
  const canDeleteMoneySites = hasPrivilege(user, "DELETE_MONEY_SITES");
  const canExportMoneySites = hasPrivilege(user, "VIEW_MONEY_SITES");
  const canViewMoneySiteActivity = hasAdminAccess(user);
  const canManageScreenshots = hasPrivilege(user, "MANAGE_SCREENSHOT_TAKER");
  const canCaptureScreenshots =
    canManageScreenshots || hasPrivilege(user, "CAPTURE_SCREENSHOT_TAKER");
  const canSeeScreenshotAssignments =
    canManageScreenshots ||
    canCaptureScreenshots ||
    hasPrivilege(user, "VIEW_SCREENSHOT_TAKER") ||
    hasPrivilege(user, "SCHEDULE_SCREENSHOT_TAKER");

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === "page" ? value : 1,
    }));
  };

  const refreshBlockedSelectableCount = useCallback(async () => {
    if (filters.status && filters.status !== "ada") {
      setBlockedSelectableCount(0);
      return;
    }

    try {
      const response = await getMoneySitesApi({
        search: filters.search,
        brandId: filters.brandId,
        status: "ada",
        page: 1,
        limit: 1,
      });
      setBlockedSelectableCount(Number(response.data?.pagination?.total || 0));
    } catch {
      setBlockedSelectableCount(0);
    }
  }, [filters.brandId, filters.search, filters.status]);

  const fetchAllBlockedIdsForCurrentFilters = useCallback(async () => {
    if (filters.status && filters.status !== "ada") {
      return [];
    }

    const query = {
      search: filters.search,
      brandId: filters.brandId,
      status: "ada",
      limit: 200,
    };
    const collectedIds = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await getMoneySitesApi({
        ...query,
        page,
      });
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      const paginationInfo = response.data?.pagination || {};

      collectedIds.push(...items.map((item) => item?._id));
      totalPages = Math.max(1, Number(paginationInfo.totalPages || 1));
      page += 1;
    } while (page <= totalPages);

    return normalizeIds(collectedIds);
  }, [filters.brandId, filters.search, filters.status]);

  const loadScreenshotAssignments = useCallback(async () => {
    if (!canSeeScreenshotAssignments) {
      setAssignedScreenshotMoneySiteIds([]);
      setScreenshotSitesByMoneySiteId({});
      return {};
    }

    try {
      const response = await getScreenshotSitesApi();
      const items = response.data?.items || [];
      const nextMap = items.reduce((collection, item) => {
        if (item.moneySiteId) {
          collection[item.moneySiteId] = item;
        }
        return collection;
      }, {});

      setScreenshotSitesByMoneySiteId(nextMap);
      setAssignedScreenshotMoneySiteIds(normalizeIds(Object.keys(nextMap)));
      return nextMap;
    } catch {
      setAssignedScreenshotMoneySiteIds([]);
      setScreenshotSitesByMoneySiteId({});
      return {};
    }
  }, [canSeeScreenshotAssignments]);

  const fetchMoneySitesForCurrentFilters = useCallback(async () => {
    const collectedItems = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await getMoneySitesApi({
        search: filters.search,
        brandId: filters.brandId,
        status: filters.status,
        screenshotAssignment: filters.screenshotAssignment,
        limit: 200,
        page,
      });
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      const paginationInfo = response.data?.pagination || {};

      collectedItems.push(...items);
      totalPages = Math.max(1, Number(paginationInfo.totalPages || 1));
      page += 1;
    } while (page <= totalPages);

    return collectedItems;
  }, [filters.brandId, filters.screenshotAssignment, filters.search, filters.status]);

  const getBulkScreenshotTargets = useCallback(async (mode) => {
    const [assignmentMap, matchingMoneySites] = await Promise.all([
      loadScreenshotAssignments(),
      fetchMoneySitesForCurrentFilters(),
    ]);
    const assignedIds = new Set(Object.keys(assignmentMap));

    if (mode === "assign") {
      return matchingMoneySites.filter((item) => !assignedIds.has(String(item?._id || "")));
    }

    return matchingMoneySites.filter((item) => assignmentMap[item?._id]?.id);
  }, [fetchMoneySitesForCurrentFilters, loadScreenshotAssignments]);

  useEscapeKey(showMoneySiteModal, () => {
    setShowMoneySiteModal(false);
    setSelectedMoneySite(null);
  });
  useEscapeKey(Boolean(pendingDeleteMoneySite), () => setPendingDeleteMoneySite(null));
  useEscapeKey(showBulkDeleteConfirm, () => setShowBulkDeleteConfirm(false));
  useEscapeKey(showBulkDeleteFinalConfirm, () => setShowBulkDeleteFinalConfirm(false));
  useEscapeKey(Boolean(bulkScreenshotAction.mode), () => {
    if (!bulkScreenshotBusy) {
      setBulkScreenshotAction({ mode: "", sites: [] });
    }
  });
  useEscapeKey(showActivityModal, () => setShowActivityModal(false));

  useEffect(() => {
    void refreshBlockedSelectableCount();
  }, [refreshBlockedSelectableCount]);

  useEffect(() => {
    void loadScreenshotAssignments();
  }, [loadScreenshotAssignments]);

  useEffect(() => {
    setSelectedBlockedIds([]);
  }, [filters.brandId, filters.search, filters.status]);

  useEffect(() => {
    const visibleBlockedMap = new Map(
      moneySites.map((item) => [normalizeId(item?._id), item?.nawala?.status === "ada"])
    );

    setSelectedBlockedIds((current) => {
      const next = current.filter(
        (id) => !visibleBlockedMap.has(id) || visibleBlockedMap.get(id)
      );

      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current;
      }

      return next;
    });
  }, [moneySites]);

  useEffect(() => {
    const token = getToken();

    if (!token) {
      setLiveStatus("offline");
      return undefined;
    }

    const socket = io(`${getSocketBaseUrl()}/money-sites`, {
      auth: {
        token,
      },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      setLiveStatus("connected");
    });

    socket.on("disconnect", () => {
      setLiveStatus("offline");
    });

    socket.on("connect_error", () => {
      setLiveStatus("error");
    });

    const handleStatusRefresh = (payload = {}) => {
      const normalizedUpdatedIds = normalizeIds(payload?.updatedIds || []);
      const normalizedNewlyBlockedIds = normalizeIds(
        (payload?.newlyBlockedDomains || []).map((item) => item?._id || item?.id)
      );

      if (normalizedUpdatedIds.length) {
        const staleLatestBlockedIds = normalizedUpdatedIds.filter(
          (id) => latestBlockedIdsRef.current.has(id) && !normalizedNewlyBlockedIds.includes(id)
        );

        if (staleLatestBlockedIds.length) {
          dismissLatestBlockedDomains(staleLatestBlockedIds);
        }
      }

      if (Array.isArray(payload.newlyBlockedDomains) && payload.newlyBlockedDomains.length) {
        setLatestBlockedEvent({
          count: payload.newlyBlockedDomains.length,
          domains: payload.newlyBlockedDomains,
          receivedAt: new Date().toISOString(),
        });
      }

      void Promise.allSettled([
        reloadMoneySitesRef.current(),
        reloadMoneySiteSummaryRef.current(),
        refreshBlockedSelectableCount(),
      ]);
    };

    const handleStructureRefresh = () => {
      void Promise.allSettled([
        reloadMoneySitesRef.current(),
        reloadMoneySiteDomainsRef.current(),
        reloadMoneySiteSummaryRef.current(),
        refreshBlockedSelectableCount(),
      ]);
    };

    socket.on("money-sites:changed", handleStructureRefresh);
    socket.on("money-sites:status-updated", handleStatusRefresh);
    socket.on("money-sites:bulk-check-complete", handleStructureRefresh);

    return () => {
      socket.off("money-sites:changed", handleStructureRefresh);
      socket.off("money-sites:status-updated", handleStatusRefresh);
      socket.off("money-sites:bulk-check-complete", handleStructureRefresh);
      socket.disconnect();
    };
  }, [dismissLatestBlockedDomains, refreshBlockedSelectableCount]);

  const handleSubmit = async (form) => {
    try {
      setFormError("");
      setFormSuccess("");
      setBusy(true);

      if (selectedMoneySite) {
        await updateMoneySite(selectedMoneySite._id, form);
        setFormSuccess(copy.page.updateSuccess);
      } else {
        await createMoneySite(form);
        setFormSuccess(copy.page.createSuccess);
      }

      await refreshBlockedSelectableCount();
      setShowMoneySiteModal(false);
      setSelectedMoneySite(null);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      setFormError("");
      setFormSuccess("");
      setExportBusy(true);

      const blob = await exportMoneySitesCsv({
        search: filters.search,
        brandId: filters.brandId,
        status: filters.status,
      });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = "money-sites-export.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
      setFormSuccess(copy.page.exportSuccess);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.exportError);
    } finally {
      setExportBusy(false);
    }
  };

  const handleDelete = async (moneySite) => {
    try {
      setFormError("");
      setFormSuccess("");
      setBusyMoneySiteId(moneySite._id);
      await deleteMoneySite(moneySite._id);
      await refreshBlockedSelectableCount();
      setPendingDeleteMoneySite(null);
      setFormSuccess(copy.page.deleteSuccess);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.deleteError);
    } finally {
      setBusyMoneySiteId("");
    }
  };

  const handleToggleBlockedSelection = (id) => {
    setSelectedBlockedIds((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id]
    );
  };

  const handleToggleSelectAllBlocked = async () => {
    if (allBlockedSelected) {
      setSelectedBlockedIds([]);
      return;
    }

    try {
      setFormError("");
      setBlockedSelectionBusy(true);
      const nextIds = await fetchAllBlockedIdsForCurrentFilters();
      setSelectedBlockedIds(nextIds);
    } catch (err) {
      setFormError(err?.response?.data?.message || copy.page.bulkDeleteSelectionError);
    } finally {
      setBlockedSelectionBusy(false);
    }
  };

  const assignScreenshotSite = async (moneySite) => {
    const response = await assignScreenshotSiteApi(buildScreenshotSitePayload(moneySite));

    await loadScreenshotAssignments();
    return response.data?.item;
  };

  const closeScreenshotPreview = () => {
    setScreenshotPreview((current) => {
      if (current.imageUrl) {
        window.URL.revokeObjectURL(current.imageUrl);
      }

      return {
        isOpen: false,
        item: null,
        loading: false,
        error: "",
        imageUrl: "",
        capturedAt: "",
      };
    });
  };

  useEscapeKey(screenshotPreview.isOpen, closeScreenshotPreview);

  const getScreenshotErrorMessage = (err) => {
    if (err?.response?.data?.message) {
      return err.response.data.message;
    }

    if (err?.message === "Network Error") {
      return copy.screenshot.networkError;
    }

    return err?.message || copy.screenshot.captureFailed;
  };

  const handleAssignScreenshot = async (moneySite) => {
    if (!canManageScreenshots) {
      setFormError(copy.screenshot.permissionAssignError);
      return;
    }

    try {
      setFormError("");
      setFormSuccess("");
      setBusyMoneySiteId(moneySite._id);
      await assignScreenshotSite(moneySite);
      setFormSuccess(copy.screenshot.assignSuccess(moneySite.domain));
    } catch (err) {
      setFormError(err.response?.data?.message || copy.screenshot.assignError);
    } finally {
      setBusyMoneySiteId("");
    }
  };

  const handleOpenBulkScreenshotAction = async (mode) => {
    if (!canManageScreenshots) {
      setFormError(copy.screenshot.permissionManageError);
      return;
    }

    try {
      setFormError("");
      setFormSuccess("");
      setBulkScreenshotPreparing(mode);
      const targets = await getBulkScreenshotTargets(mode);

      if (!targets.length) {
        setFormSuccess(
          mode === "assign" ? copy.screenshot.allAssigned : copy.screenshot.noAssignedMatches
        );
        return;
      }

      setBulkScreenshotAction({ mode, sites: targets });
    } catch (err) {
      setFormError(err.response?.data?.message || copy.screenshot.prepareBulkError);
    } finally {
      setBulkScreenshotPreparing("");
    }
  };

  const handleConfirmBulkScreenshotAction = async () => {
    const mode = bulkScreenshotAction.mode;
    const sites = bulkScreenshotAction.sites;

    if (!mode || !sites.length) {
      setBulkScreenshotAction({ mode: "", sites: [] });
      return;
    }

    try {
      setFormError("");
      setFormSuccess("");
      setBulkScreenshotBusy(true);
      let targets = sites;

      if (mode === "unassign") {
        const assignmentMap = await loadScreenshotAssignments();
        targets = sites
          .map((site) => assignmentMap[site?._id])
          .filter((site) => site?.id);
      }

      if (!targets.length) {
        setBulkScreenshotAction({ mode: "", sites: [] });
        setFormSuccess(copy.screenshot.noAssignedMatches);
        return;
      }

      const results = await runWithConcurrency(targets, 6, (item) => (
        mode === "assign"
          ? assignScreenshotSiteApi(buildScreenshotSitePayload(item))
          : removeScreenshotSiteApi(item.id)
      ));
      const successCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - successCount;

      await Promise.allSettled([
        loadScreenshotAssignments(),
        reloadMoneySites(),
      ]);

      setBulkScreenshotAction({ mode: "", sites: [] });
      setFormSuccess(copy.screenshot.bulkCompleteSuccess(successCount, failedCount, mode));
    } catch (err) {
      setFormError(err.response?.data?.message || copy.screenshot.bulkCompleteError);
    } finally {
      setBulkScreenshotBusy(false);
    }
  };

  const handlePreviewScreenshot = async (moneySite) => {
    if (!canCaptureScreenshots) {
      setFormError(copy.screenshot.permissionCaptureError);
      return;
    }

    setScreenshotPreview((current) => {
      if (current.imageUrl) {
        window.URL.revokeObjectURL(current.imageUrl);
      }

      return {
        isOpen: true,
        item: moneySite,
        loading: true,
        error: "",
        imageUrl: "",
        capturedAt: "",
      };
    });

    try {
      setFormError("");
      setFormSuccess("");
      setBusyMoneySiteId(moneySite._id);
      const captureResponse = await captureLiveScreenshotApi({
        domain: moneySite.domain,
        url: moneySite.domain,
        brandName: moneySite.brandId?.brandName || "",
        note: moneySite.note || "",
      });
      const capture = captureResponse.data?.item;

      if (capture?.status !== "success" || !capture?.id) {
        throw new Error(capture?.error || copy.screenshot.captureFailed);
      }

      const blob = await fetchScreenshotImageBlobApi(capture.id);
      const imageUrl = window.URL.createObjectURL(blob);

      setScreenshotPreview({
        isOpen: true,
        item: moneySite,
        loading: false,
        error: "",
        imageUrl,
        capturedAt: capture.capturedAt || "",
      });
      await loadScreenshotAssignments();
    } catch (err) {
      setScreenshotPreview((current) => ({
        ...current,
        loading: false,
        error: getScreenshotErrorMessage(err),
      }));
    } finally {
      setBusyMoneySiteId("");
    }
  };

  const handleUnassignScreenshot = async (moneySite) => {
    const screenshotSite = screenshotSitesByMoneySiteId[moneySite._id];

    if (!screenshotSite) {
      await loadScreenshotAssignments();
      return;
    }

    if (!window.confirm(copy.screenshot.unassignConfirm(moneySite.domain))) {
      return;
    }

    try {
      setFormError("");
      setFormSuccess("");
      setBusyMoneySiteId(moneySite._id);
      await removeScreenshotSiteApi(screenshotSite.id);
      await loadScreenshotAssignments();
      setFormSuccess(copy.screenshot.unassignSuccess(moneySite.domain));
    } catch (err) {
      setFormError(err.response?.data?.message || copy.screenshot.unassignError);
    } finally {
      setBusyMoneySiteId("");
    }
  };

  const loadMoneySiteActivityLogs = useCallback(async (page = 1, search = activitySearch) => {
    if (!canViewMoneySiteActivity) {
      return;
    }

    try {
      setActivityError("");
      setActivityLoadFailed(false);
      setActivityLoading(true);
      const response = await getMoneySiteActivityLogsApi({
        page,
        limit: activityPagination.limit,
        search,
      });
      setActivityLogs(response.data?.items || []);
      setActivityPagination(response.data?.pagination || {
        page,
        limit: 30,
        total: 0,
        totalPages: 1,
      });
    } catch (err) {
      setActivityError(err.response?.data?.message || "");
      setActivityLoadFailed(true);
      setActivityLogs([]);
    } finally {
      setActivityLoading(false);
    }
  }, [activityPagination.limit, activitySearch, canViewMoneySiteActivity]);

  const openMoneySiteActivityModal = () => {
    setShowActivityModal(true);
    void loadMoneySiteActivityLogs(1, activitySearch);
  };

  const handleBulkDeleteBlocked = async () => {
    if (bulkDeleteConfirmationText.trim().toUpperCase() !== "DELETE") {
      setFormError(copy.page.bulkDeleteTypeDeleteError);
      return;
    }

    try {
      setFormError("");
      setFormSuccess("");
      setBusy(true);
      const response = await bulkDeleteBlockedMoneySites({ ids: selectedBlockedIds });
      const deletedCount = response.data?.deletedCount || 0;
      const skippedCount = response.data?.skippedCount || 0;

      setSelectedBlockedIds([]);
      setBulkDeleteConfirmationText("");
      setShowBulkDeleteFinalConfirm(false);
      setShowBulkDeleteConfirm(false);
      await refreshBlockedSelectableCount();
      setFormSuccess(copy.page.bulkDeleteSuccess(deletedCount, skippedCount));
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.bulkDeleteError);
    } finally {
      setBusy(false);
    }
  };

  const isBulkScreenshotWorking = bulkScreenshotBusy || Boolean(bulkScreenshotPreparing);
  const bulkScreenshotTargetCount = bulkScreenshotAction.sites.length;
  const bulkScreenshotTitle =
    bulkScreenshotAction.mode === "assign"
      ? copy.screenshot.bulkAssignTitle
      : copy.screenshot.bulkUnassignTitle;
  const bulkScreenshotMessage =
    bulkScreenshotAction.mode === "assign"
      ? copy.screenshot.bulkAssignMessage(bulkScreenshotTargetCount)
      : copy.screenshot.bulkUnassignMessage(bulkScreenshotTargetCount);
  const hasLoadError = hasMoneySitesError || hasBrandsError || hasSummaryError;
  const loadErrorMessage = error || brandsError || summaryError || copy.page.loadErrorFallback;

  return (
    <div className="management-page">
      <section className="app-panel management-header">
        <div>
          <h1>{copy.page.title}</h1>
          </div>
        <div className="management-header-actions">
          <span className="management-badge">
            {copy.page.liveLabel}: {copy.page.liveStatus[liveStatus] || copy.page.liveStatus.offline}
          </span>
          <span className={`management-badge${summary.blocked > 0 ? " is-inactive" : " is-active"}`}>
            {copy.page.blockedLabel}: {summary.blocked}
          </span>
          {canCreateMoneySites ? (
            <button
              type="button"
              className="management-button management-button-with-icon"
              onClick={() => {
                setFormError("");
                setFormSuccess("");
                setSelectedMoneySite(null);
                setShowMoneySiteModal(true);
              }}
            >
              <span className="management-button-icon" aria-hidden="true">+</span>
              <span>{copy.page.addDomain}</span>
            </button>
          ) : null}
          {canCreateMoneySites ? (
            <button
              type="button"
              className="management-button-secondary"
              onClick={() => {
                setFormError("");
                setFormSuccess("");
                navigate("/money-sites/import");
              }}
            >
              {copy.page.importCsv}
            </button>
          ) : null}
          {canExportMoneySites ? (
            <button
              type="button"
              className="management-button-secondary"
              onClick={handleExportCsv}
              disabled={exportBusy}
            >
              {exportBusy ? copy.page.exportingCsv : copy.page.exportCsv}
            </button>
          ) : null}
          {canViewMoneySiteActivity ? (
            <button
              type="button"
              className="management-button-secondary"
              onClick={openMoneySiteActivityModal}
            >
              {copy.page.activityLogButton}
            </button>
          ) : null}
        </div>
      </section>

      <ToastNotice message={formError} onClose={() => setFormError("")} />
      <ToastNotice message={formSuccess} tone="success" onClose={() => setFormSuccess("")} />
      {hasLoadError ? <p className="management-error">{loadErrorMessage}</p> : null}

      {!summaryLoading ? (
        <MoneySitesSummaryCards summary={summary} />
      ) : null}

      {latestBlockedEvent?.domains?.length ? (
        <section className="app-panel money-sites-live-alert">
          <div>
            <strong>
              {copy.page.latestBlockedDetected(latestBlockedEvent.count)}
            </strong>
            <p>{formatLatestBlockedPreview(latestBlockedEvent)}</p>
          </div>
          <div className="management-inline-actions">
            <button
              type="button"
              className="management-button-secondary"
              onClick={() => setFilters((current) => ({ ...current, status: "ada", page: 1 }))}
            >
              {copy.page.showBlocked}
            </button>
            <button
              type="button"
              className="management-button-secondary"
              onClick={() => setLatestBlockedEvent(null)}
            >
              {copy.page.dismiss}
            </button>
          </div>
        </section>
      ) : null}

      <section className="app-panel management-form">
        <div className="management-section-header">
          <div>
            <h2>{copy.page.filtersTitle}</h2>
          </div>
          {canManageScreenshots ? (
            <div className="money-sites-screenshot-bulk-actions" aria-label={copy.screenshot.bulkAriaLabel}>
              <span className="management-badge">
                {copy.screenshot.assignedSummary(assignedScreenshotMoneySiteIds.length)}
              </span>
              <button
                type="button"
                className="management-button-secondary money-sites-bulk-screenshot-button"
                onClick={() => handleOpenBulkScreenshotAction("assign")}
                disabled={isBulkScreenshotWorking || loading}
                title={copy.screenshot.bulkAssignTooltip}
              >
                {bulkScreenshotPreparing === "assign"
                  ? copy.screenshot.bulkChecking
                  : copy.screenshot.bulkAssignButton}
              </button>
              <button
                type="button"
                className="management-button-secondary money-sites-bulk-screenshot-button is-danger"
                onClick={() => handleOpenBulkScreenshotAction("unassign")}
                disabled={isBulkScreenshotWorking || loading}
                title={copy.screenshot.bulkUnassignTooltip}
              >
                {bulkScreenshotPreparing === "unassign"
                  ? copy.screenshot.bulkChecking
                  : copy.screenshot.bulkUnassignButton}
              </button>
            </div>
          ) : null}
        </div>

        <div className="activity-logs-filter-grid money-sites-filter-grid">
          <div className="management-field">
            <label htmlFor="money-sites-search">{copy.page.searchLabel}</label>
            <input
              id="money-sites-search"
              type="search"
              value={filters.search}
              onChange={(event) => handleFilterChange("search", event.target.value)}
              placeholder={copy.page.searchPlaceholder}
            />
          </div>

          <div className="management-field">
            <label htmlFor="money-sites-brand">{copy.page.brandLabel}</label>
            <select
              id="money-sites-brand"
              value={filters.brandId}
              onChange={(event) => handleFilterChange("brandId", event.target.value)}
            >
              <option value="">{copy.page.allBrands}</option>
              {brands.map((brand) => (
                <option key={brand._id} value={brand._id}>
                  {brand.brandName}
                </option>
              ))}
            </select>
          </div>

          <div className="management-field">
            <label htmlFor="money-sites-status">{copy.page.nawalaStatusLabel}</label>
            <select
              id="money-sites-status"
              value={filters.status}
              onChange={(event) => handleFilterChange("status", event.target.value)}
            >
              <option value="">{copy.page.allStatuses}</option>
              <option value="unknown">{copy.common.statusLabels.unknown}</option>
              <option value="ada">{copy.common.statusLabels.ada}</option>
              <option value="tidak ada">{copy.common.statusLabels["tidak ada"]}</option>
            </select>
          </div>

          <div className="management-field">
            <label htmlFor="money-sites-limit">{copy.page.rowsPerPage}</label>
            <select
              id="money-sites-limit"
              value={filters.limit}
              onChange={(event) => handleFilterChange("limit", Number(event.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {canSeeScreenshotAssignments ? (
            <div className="management-field">
              <label htmlFor="money-sites-assignment-filter">{copy.page.assignmentFilterLabel}</label>
              <select
                id="money-sites-assignment-filter"
                value={filters.screenshotAssignment}
                onChange={(event) => handleFilterChange("screenshotAssignment", event.target.value)}
              >
                <option value="all">{copy.page.assignmentFilterAll}</option>
                <option value="assigned">{copy.page.assignmentFilterAssigned}</option>
                <option value="unassigned">{copy.page.assignmentFilterUnassigned}</option>
              </select>
            </div>
          ) : null}

          <div className="money-sites-filter-actions">
            <button
              type="button"
              className="management-button-secondary money-sites-filter-reset-button"
              onClick={() =>
                setFilters({
                  search: "",
                  brandId: "",
                  status: "",
                  screenshotAssignment: "all",
                  page: 1,
                  limit: 25,
                })
              }
            >
              {copy.page.reset}
            </button>
          </div>
        </div>
      </section>

      {showMoneySiteModal ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <MoneySiteForm
              brands={brands}
              selectedMoneySite={selectedMoneySite}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowMoneySiteModal(false);
                setSelectedMoneySite(null);
              }}
              busy={busy}
              showCancel
            />
          </div>
        </div>
      ) : null}

      {pendingDeleteMoneySite ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <ConfirmActionModal
              title={copy.page.deleteModalTitle}
              message={copy.page.deleteModalMessage(pendingDeleteMoneySite.domain)}
              confirmLabel={copy.common.delete}
              busy={busyMoneySiteId === pendingDeleteMoneySite._id}
              onConfirm={() => handleDelete(pendingDeleteMoneySite)}
              onCancel={() => setPendingDeleteMoneySite(null)}
            />
          </div>
        </div>
      ) : null}

      {showBulkDeleteConfirm ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <ConfirmActionModal
              title={copy.page.bulkDeleteTitle}
              message={copy.page.bulkDeleteMessage(selectedBlockedCount)}
              confirmLabel={copy.page.continueButton}
              busy={busy}
              onConfirm={() => {
                setShowBulkDeleteConfirm(false);
                setBulkDeleteConfirmationText("");
                setShowBulkDeleteFinalConfirm(true);
              }}
              onCancel={() => setShowBulkDeleteConfirm(false)}
            />
          </div>
        </div>
      ) : null}

      {showBulkDeleteFinalConfirm ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <section className="app-panel management-form">
              <h2>{copy.page.finalConfirmationTitle}</h2>
              <p>
                {copy.page.finalConfirmationMessage(selectedBlockedCount)}
              </p>

              <div className="management-field">
                <label htmlFor="money-sites-bulk-delete-confirm">{copy.page.typeDeleteLabel}</label>
                <input
                  id="money-sites-bulk-delete-confirm"
                  value={bulkDeleteConfirmationText}
                  onChange={(event) => setBulkDeleteConfirmationText(event.target.value)}
                  placeholder="DELETE"
                  disabled={busy}
                />
              </div>

              <div className="management-actions">
                <button
                  type="button"
                  className="management-button"
                  onClick={handleBulkDeleteBlocked}
                  disabled={busy || bulkDeleteConfirmationText.trim().toUpperCase() !== "DELETE"}
                >
                  {busy ? copy.page.deletingButton : copy.page.deleteBlockedButton}
                </button>
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => {
                    setShowBulkDeleteFinalConfirm(false);
                    setBulkDeleteConfirmationText("");
                  }}
                  disabled={busy}
                >
                  {copy.common.cancel}
                </button>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {bulkScreenshotAction.mode ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <ConfirmActionModal
              title={bulkScreenshotTitle}
              message={bulkScreenshotMessage}
              confirmLabel={
                bulkScreenshotAction.mode === "assign"
                  ? copy.screenshot.bulkAssignButton
                  : copy.screenshot.bulkUnassignButton
              }
              busy={bulkScreenshotBusy}
              onConfirm={handleConfirmBulkScreenshotAction}
              onCancel={() => setBulkScreenshotAction({ mode: "", sites: [] })}
            />
          </div>
        </div>
      ) : null}

      {showActivityModal ? (
        <div className="management-modal-backdrop">
          <div className="management-modal management-modal-wide money-sites-activity-modal" onClick={(event) => event.stopPropagation()}>
            <section className="app-panel management-form">
              <div className="management-section-header">
                <div>
                  <h2>{copy.activity.title}</h2>
                  <p>{copy.activity.description}</p>
                </div>
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => setShowActivityModal(false)}
                >
                  {copy.common.close}
                </button>
              </div>

              <div className="money-sites-activity-toolbar">
                <div className="management-field">
                  <label htmlFor="money-sites-activity-search">{copy.activity.searchLabel}</label>
                  <input
                    id="money-sites-activity-search"
                    type="search"
                    value={activitySearch}
                    onChange={(event) => setActivitySearch(event.target.value)}
                    placeholder={copy.activity.searchPlaceholder}
                  />
                </div>
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => loadMoneySiteActivityLogs(1, activitySearch)}
                  disabled={activityLoading}
                >
                  {activityLoading ? copy.activity.loadingButton : copy.activity.searchButton}
                </button>
              </div>

              {activityLoadFailed ? (
                <p className="management-error">{activityError || copy.activity.loadErrorFallback}</p>
              ) : null}

              {activityLoading ? (
                <p className="management-empty">{copy.activity.loading}</p>
              ) : activityLogs.length ? (
                <div className="management-table-wrap money-sites-activity-table-wrap">
                  <table className="brands-management-table money-sites-activity-table">
                    <thead>
                      <tr>
                        <th>{copy.activity.headers.time}</th>
                        <th>{copy.activity.headers.user}</th>
                        <th>{copy.activity.headers.action}</th>
                        <th>{copy.activity.headers.target}</th>
                        <th>{copy.activity.headers.summary}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLogs.map((log) => (
                        <tr key={log._id}>
                          <td>{formatActivityTime(log.occurredAt, language)}</td>
                          <td>
                            <strong>{log.actorName || copy.activity.unknownUser}</strong>
                            <span>{log.actorEmail || "-"}</span>
                          </td>
                          <td>
                            <span className="management-badge">
                              {formatMoneySiteAction(log.action, copy.activity)}
                            </span>
                          </td>
                          <td>{log.targetLabel || log.targetId || "-"}</td>
                          <td>
                            <strong>{log.summary || "-"}</strong>
                            {log.details ? <span>{log.details}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="management-empty">{copy.activity.empty}</p>
              )}

              <div className="activity-logs-pagination">
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => loadMoneySiteActivityLogs(Math.max(1, activityPagination.page - 1), activitySearch)}
                  disabled={activityLoading || activityPagination.page <= 1}
                >
                  {copy.common.previous}
                </button>
                <span>
                  {copy.activity.paginationSummary(
                    activityPagination.page,
                    activityPagination.totalPages,
                    activityPagination.total
                  )}
                </span>
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => loadMoneySiteActivityLogs(Math.min(activityPagination.totalPages, activityPagination.page + 1), activitySearch)}
                  disabled={activityLoading || activityPagination.page >= activityPagination.totalPages}
                >
                  {copy.common.next}
                </button>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {screenshotPreview.isOpen ? (
        <div className="management-modal-backdrop">
          <div
            className="management-modal management-modal-wide money-sites-screenshot-preview-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="money-sites-screenshot-preview-title"
          >
            <section className="app-panel management-form">
              <div className="management-section-header">
                <div>
                  <span className="management-badge">
                    {screenshotPreview.loading
                      ? copy.screenshot.previewBadgeLoading
                      : copy.screenshot.previewBadgeReady}
                  </span>
                  <h2 id="money-sites-screenshot-preview-title">
                    {screenshotPreview.item?.domain || copy.screenshot.previewTitleFallback}
                  </h2>
                  <p>
                    {screenshotPreview.capturedAt
                      ? copy.screenshot.previewCapturedAt(
                        formatActivityTime(screenshotPreview.capturedAt, language)
                      )
                      : copy.screenshot.previewWaiting}
                  </p>
                </div>
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={closeScreenshotPreview}
                >
                  {copy.common.close}
                </button>
              </div>

              <div className="money-sites-screenshot-preview-frame">
                {screenshotPreview.loading ? (
                  <div className="money-sites-screenshot-preview-state">
                    <span className="money-sites-screenshot-loader" aria-hidden="true" />
                    <strong>{copy.screenshot.previewLoadingTitle}</strong>
                    <span>{copy.screenshot.previewLoadingDescription}</span>
                  </div>
                ) : screenshotPreview.error ? (
                  <div className="money-sites-screenshot-preview-state is-error">
                    <strong>{copy.screenshot.previewFailedTitle}</strong>
                    <span>{screenshotPreview.error}</span>
                  </div>
                ) : screenshotPreview.imageUrl ? (
                  <img
                    src={screenshotPreview.imageUrl}
                    alt={copy.screenshot.previewAlt(screenshotPreview.item?.domain)}
                  />
                ) : (
                  <div className="money-sites-screenshot-preview-state">
                    <strong>{copy.screenshot.previewEmptyTitle}</strong>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      <div className="management-grid is-single-column">
        {loading || brandsLoading ? (
          <section className="app-panel management-state">
            <h2>{copy.page.loadingTitle}</h2>
            <p>{copy.page.loadingDescription}</p>
          </section>
        ) : (
          <MoneySitesTable
            moneySites={displayMoneySites}
            canEditMoneySites={canEditMoneySites}
            canDeleteMoneySites={canDeleteMoneySites}
            canManageScreenshots={canManageScreenshots}
            canCaptureScreenshots={canCaptureScreenshots}
            assignedScreenshotMoneySiteIds={assignedScreenshotMoneySiteIds}
            busyMoneySiteId={busyMoneySiteId}
            blockedSelectableCount={blockedSelectableCount}
            selectedBlockedIds={selectedBlockedIds}
            selectedBlockedCount={selectedBlockedCount}
            allBlockedSelected={allBlockedSelected}
            blockedSelectionBusy={blockedSelectionBusy}
            onEdit={(item) => {
              if (!canEditMoneySites) {
                setFormError(copy.page.editPermissionError);
                return;
              }

              setSelectedMoneySite(item);
              setShowMoneySiteModal(true);
            }}
            onDelete={(item) => {
              if (!canDeleteMoneySites) {
                setFormError(copy.page.deletePermissionError);
                return;
              }

              setPendingDeleteMoneySite(item);
            }}
            onAssignScreenshot={(item) => {
              if (!canManageScreenshots) {
                setFormError(copy.screenshot.permissionAssignError);
                return;
              }

              void handleAssignScreenshot(item);
            }}
            onPreviewScreenshot={(item) => {
              if (!canCaptureScreenshots) {
                setFormError(copy.screenshot.permissionCaptureError);
                return;
              }

              void handlePreviewScreenshot(item);
            }}
            onUnassignScreenshot={(item) => {
              if (!canManageScreenshots) {
                setFormError(copy.screenshot.permissionUnassignError);
                return;
              }

              void handleUnassignScreenshot(item);
            }}
            onToggleBlockedSelection={handleToggleBlockedSelection}
            onToggleSelectAllBlocked={handleToggleSelectAllBlocked}
            onBulkDeleteBlocked={() => {
              if (!selectedBlockedCount) {
                setFormError(copy.page.bulkDeleteSelectionError);
                return;
              }

              setShowBulkDeleteConfirm(true);
            }}
          />
        )}

        {!loading && pagination.total > 0 ? (
          <div className="activity-logs-pagination">
            <button
              type="button"
              className="management-button-secondary"
              onClick={() => handleFilterChange("page", Math.max(1, pagination.page - 1))}
              disabled={pagination.page <= 1}
            >
              {copy.common.previous}
            </button>
            <span>
              {copy.page.paginationSummary(
                pagination.page,
                pagination.totalPages,
                moneySites.length,
                pagination.total
              )}
            </span>
            <button
              type="button"
              className="management-button-secondary"
              onClick={() => handleFilterChange("page", Math.min(pagination.totalPages, pagination.page + 1))}
              disabled={pagination.page >= pagination.totalPages}
            >
              {copy.common.next}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
