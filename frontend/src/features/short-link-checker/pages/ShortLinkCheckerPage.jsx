import React, { useCallback, useEffect, useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import { hasPrivilege } from "../../../shared/utils/permissions";
import { useAuth } from "../../auth/hooks/useAuth";
import { getMoneySitesApi } from "../../money-sites/api/moneySitesApi";
import {
  getShortLinkCheckerUiCopy,
  normalizeShortLinkCheckerLanguage,
} from "../constants/shortLinkCheckerLanguage";
import ShortLinkCaptureModal from "../components/ShortLinkCaptureModal";
import ShortLinkEntryModal from "../components/ShortLinkEntryModal";
import ShortLinkImportModal from "../components/ShortLinkImportModal";
import ShortLinkScheduleModal from "../components/ShortLinkScheduleModal";
import ShortLinkTelegramModal from "../components/ShortLinkTelegramModal";
import {
  clearShortLinkCheckImagesApi,
  checkAllShortLinksApi,
  checkShortLinkApi,
  createShortLinkApi,
  deleteAllShortLinksApi,
  deleteShortLinkApi,
  fetchShortLinkCheckImageBlobApi,
  getShortLinkCheckerStatusApi,
  getShortLinksApi,
  importShortLinksApi,
  toggleShortLinkScheduleApi,
  updateShortLinkApi,
  updateShortLinkScheduleApi,
  updateShortLinkTelegramApi,
} from "../api/shortLinkCheckerApi";
import {
  EMPTY_FORM,
  EMPTY_IMPORT_FORM,
  EMPTY_SCHEDULE,
  EMPTY_STATUS,
  SCAN_MODE_CAPTURE,
  SCAN_MODE_STATUS_ONLY,
  buildCaptureDownloadName,
  buildImportItems,
  buildShortLinkPayload,
  formatDateTime,
  getActiveFilterOptions,
  getFilterOptions,
  getHttpTone,
  getNextCheckCountdownLabel,
  getScheduleProgressLabel,
  getScheduleScanLabel,
  getScanModeOptions,
  getServerClockOffset,
  getStatusLabel,
  getStatusTone,
  normalizeSchedule,
  normalizeTelegram,
  parseImportRows,
} from "../utils/shortLinkCheckerUi";
import "../../../shared/styles/management.css";
import "../styles/shortLinkChecker.css";

export default function ShortLinkCheckerPage() {
  const { user } = useAuth();
  const language = normalizeShortLinkCheckerLanguage(user?.preferredLanguage || user?.moneySiteLanguage);
  const copy = getShortLinkCheckerUiCopy(language);
  const canManageLinks = hasPrivilege(user, "MANAGE_SHORT_LINK_CHECKER");
  const canCheckLinks = hasPrivilege(user, "CHECK_SHORT_LINKS") || canManageLinks;
  const canManageTelegram = hasPrivilege(user, "MANAGE_SHORT_LINK_TELEGRAM");
  const canScheduleLinks = hasPrivilege(user, "SCHEDULE_SHORT_LINK_CHECKER") || canManageLinks;
  const [links, setLinks] = useState([]);
  const [moneySites, setMoneySites] = useState([]);
  const [telegram, setTelegram] = useState(normalizeTelegram());
  const [telegramForm, setTelegramForm] = useState(normalizeTelegram());
  const [schedule, setSchedule] = useState(EMPTY_SCHEDULE);
  const [checkerStatus, setCheckerStatus] = useState(EMPTY_STATUS);
  const [form, setForm] = useState(EMPTY_FORM);
  const [importForm, setImportForm] = useState(EMPTY_IMPORT_FORM);
  const [importResult, setImportResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [clearingImages, setClearingImages] = useState(false);
  const [deletingAllLinks, setDeletingAllLinks] = useState(false);
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState(null);
  const [destructivePassword, setDestructivePassword] = useState("");
  const [checkingId, setCheckingId] = useState("");
  const [checkingAll, setCheckingAll] = useState(false);
  const [scanFilter, setScanFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [scanSearch, setScanSearch] = useState("");
  const [scanMode, setScanMode] = useState(SCAN_MODE_CAPTURE);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalItems: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [tableSummary, setTableSummary] = useState({
    totalCount: 0,
    activeCount: 0,
    checkedCount: 0,
    successCount: 0,
    errorCount: 0,
    cloudflareCount: 0,
    securityVerificationCount: 0,
  });
  const [countdownNowMs, setCountdownNowMs] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [previewLink, setPreviewLink] = useState(null);
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const filterOptions = getFilterOptions(copy);
  const activeFilterOptions = getActiveFilterOptions(copy);
  const scanModeOptions = getScanModeOptions(copy);

  const previewCheck = previewLink?.latestCheck || null;

  const summary = tableSummary;
  const scheduleScanLabel = getScheduleScanLabel(checkerStatus, copy);
  const scheduleProgressLabel = getScheduleProgressLabel(checkerStatus, copy);
  const activeBatchItems = Array.isArray(checkerStatus?.currentBatch?.activeItems)
    ? checkerStatus.currentBatch.activeItems
    : [];
  const currentActiveItem = activeBatchItems[0] || null;
  const currentScanningLabel =
    currentActiveItem?.shortUrl ||
    currentActiveItem?.title ||
    currentActiveItem?.linkId ||
    (checkerStatus.running ? copy.helpers.preparingNextLink : copy.helpers.noActiveLinkRightNow);
  const scanningLinkIds = new Set(activeBatchItems.map((item) => item.linkId));
  const latestCompleted = checkerStatus?.currentBatch?.latestCompleted || null;
  const nextCheckCountdownLabel = getNextCheckCountdownLabel({
    enabled: schedule.enabled,
    nextRunAt: schedule.nextRunAt,
    running: checkerStatus.running,
    nowMs: countdownNowMs - serverClockOffsetMs,
    copy,
  });
  const nextCheckAtLabel = schedule.nextRunAt
    ? copy.page.nextAt(formatDateTime(schedule.nextRunAt, language))
    : copy.page.noNextRun;
  const destructiveLockMessage = schedule.enabled
    ? copy.page.destructiveLockSchedule
    : checkerStatus.running || checkingAll || checkingId
      ? copy.page.destructiveLockRunning
      : "";
  const destructiveActionsLocked = Boolean(destructiveLockMessage);
  const deleteAllCount = summary.totalCount || pagination.totalItems || links.length;
  const destructiveActionBusy = pendingDestructiveAction === "clear-images" ? clearingImages : deletingAllLinks;
  const destructiveActionTitle = pendingDestructiveAction === "clear-images"
    ? copy.page.destructive.clearTitle
    : copy.page.destructive.deleteTitle;
  const destructiveActionDescription = pendingDestructiveAction === "clear-images"
    ? copy.page.destructive.clearDescription
    : copy.page.destructive.deleteDescription(deleteAllCount);
  const destructiveActionButton = pendingDestructiveAction === "clear-images"
    ? copy.page.destructive.clearButton
    : copy.page.destructive.deleteButton;

  const loadShortLinks = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) {
        setLoading(true);
        setError("");
      }
      const moneySitesRequest = canManageLinks
        ? getMoneySitesApi({ page: 1, limit: 500 })
        : Promise.resolve({ data: { items: [] } });
      const [linksResponse, moneySitesResponse] = await Promise.all([
        getShortLinksApi({
          page: pagination.page,
          limit: pagination.limit,
          search: scanSearch,
          status: scanFilter,
          active: activeFilter,
        }),
        moneySitesRequest,
      ]);
      const nextTelegram = normalizeTelegram(linksResponse.data?.telegram);
      const nextSchedule = normalizeSchedule(linksResponse.data?.schedule || linksResponse.data?.status?.schedule);
      const nextStatus = linksResponse.data?.status || EMPTY_STATUS;

      setLinks(linksResponse.data?.items || []);
      setPagination((current) => ({
        ...current,
        ...(linksResponse.data?.pagination || {}),
      }));
      setTableSummary((current) => ({
        ...current,
        ...(linksResponse.data?.summary || {}),
      }));
      setTelegram(nextTelegram);
      setTelegramForm(nextTelegram);
      setSchedule(nextSchedule);
      setCheckerStatus({ ...EMPTY_STATUS, ...nextStatus, schedule: nextSchedule });
      setServerClockOffsetMs(getServerClockOffset(nextStatus));
      setMoneySites(canManageLinks ? moneySitesResponse.data?.items || [] : []);
    } catch (err) {
      if (!quiet) {
        setError(err.response?.data?.message || copy.page.loadErrorFallback);
      }
    } finally {
      if (!quiet) {
        setLoading(false);
      }
    }
  }, [activeFilter, canManageLinks, copy.page.loadErrorFallback, pagination.limit, pagination.page, scanFilter, scanSearch]);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await getShortLinkCheckerStatusApi();
      const nextStatus = response.data?.item || EMPTY_STATUS;
      const nextSchedule = normalizeSchedule(nextStatus.schedule || schedule);

      setCheckerStatus({ ...EMPTY_STATUS, ...nextStatus, schedule: nextSchedule });
      setSchedule(nextSchedule);
      setServerClockOffsetMs(getServerClockOffset(nextStatus));
    } catch {
      // Keep background polling quiet; manual refresh reports load errors.
    }
  }, [schedule]);

  useEffect(() => {
    void loadShortLinks();
  }, [loadShortLinks]);

  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!schedule.enabled && !checkerStatus.running && !checkingAll && !checkingId) {
      return undefined;
    }

    const statusTimer = window.setInterval(() => {
      void refreshStatus();
    }, 2500);

    return () => {
      window.clearInterval(statusTimer);
    };
  }, [checkerStatus.running, checkingAll, checkingId, refreshStatus, schedule.enabled]);

  useEffect(() => {
    if (!checkerStatus.running && !checkingAll && !checkingId) {
      return undefined;
    }

    const linksTimer = window.setInterval(() => {
      void loadShortLinks({ quiet: true });
    }, 3000);

    return () => {
      window.clearInterval(linksTimer);
    };
  }, [checkerStatus.running, checkingAll, checkingId, loadShortLinks]);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;

    async function loadPreviewImage() {
      if (!previewCheck?.id || !previewCheck.screenshotEndpoint) {
        setPreviewImageUrl("");
        return;
      }

      try {
        setPreviewLoading(true);
        const blob = await fetchShortLinkCheckImageBlobApi(previewCheck.id);
        objectUrl = window.URL.createObjectURL(blob);

        if (!cancelled) {
          setPreviewImageUrl(objectUrl);
        } else {
          window.URL.revokeObjectURL(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setPreviewImageUrl("");
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }

    void loadPreviewImage();

    return () => {
      cancelled = true;

      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [previewCheck]);

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsEntryModalOpen(true);
  };

  const handleCsvText = (text, fileName = "") => {
    const rows = parseImportRows(text);

    setImportResult(null);
    setImportForm({
      text,
      fileName,
      active: true,
      rows,
    });
  };

  const handleImportRowChange = (importId, patch) => {
    setImportForm((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.importId === importId ? { ...row, ...patch } : row)),
    }));
  };

  const handleImportRowRemove = (importId) => {
    setImportForm((current) => ({
      ...current,
      rows: current.rows.filter((row) => row.importId !== importId),
    }));
  };

  const handleEdit = (link) => {
    setForm({
      id: link.id,
      title: link.title || "",
      shortUrl: link.shortUrl || "",
      moneySiteId: link.moneySiteId || "",
      moneySiteDomain: link.moneySiteDomain || "",
      note: link.note || "",
      active: link.active !== false,
    });
    setIsEntryModalOpen(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!canManageLinks) {
      setError(copy.page.permissionManage);
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");
      const payload = buildShortLinkPayload(form, moneySites);

      if (form.id) {
        await updateShortLinkApi(form.id, payload);
        setNotice(copy.page.updateSuccess);
      } else {
        await createShortLinkApi(payload);
        setNotice(copy.page.createSuccess);
      }

      setIsEntryModalOpen(false);
      setForm(EMPTY_FORM);
      await loadShortLinks();
    } catch (err) {
      setError(err.response?.data?.message || copy.page.saveError);
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (event) => {
    event.preventDefault();

    if (!canManageLinks) {
      setError(copy.page.permissionImport);
      return;
    }

    const items = buildImportItems(importForm.rows, moneySites);

    if (!items.length) {
      setError(copy.page.importRequiresRows);
      return;
    }

    try {
      setImporting(true);
      setError("");
      setNotice("");
      setImportResult(null);
      const response = await importShortLinksApi({ items, active: importForm.active });
      const result = response.data?.item || {};

      setImportResult(result);
      if (result.skippedCount) {
        const skippedRows = (result.skipped || [])
          .map((item) => importForm.rows[Number(item.row || 0) - 1])
          .filter(Boolean);

        setNotice(copy.page.importReviewNotice(result.createdCount, result.skippedCount));
        if (skippedRows.length) {
          setImportForm((current) => ({ ...current, rows: skippedRows }));
        }
      } else {
        setNotice(copy.page.importSuccess(result.createdCount, 0));
        setImportForm(EMPTY_IMPORT_FORM);
        setIsImportModalOpen(false);
      }
      await loadShortLinks();
    } catch (err) {
      setError(err.response?.data?.message || copy.page.importError);
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (link) => {
    if (!window.confirm(copy.page.deleteConfirm(link.shortUrl))) {
      return;
    }

    try {
      setError("");
      setNotice("");
      await deleteShortLinkApi(link.id);
      setNotice(copy.page.deleteSuccess);
      await loadShortLinks();
    } catch (err) {
      setError(err.response?.data?.message || copy.page.deleteError);
    }
  };

  const openDestructiveAction = (action) => {
    if (!canManageLinks) {
      setError(copy.page.permissionManage);
      return;
    }

    if (destructiveActionsLocked) {
      setError(destructiveLockMessage);
      return;
    }

    if (action === "delete-links" && !deleteAllCount) {
      return;
    }

    setError("");
    setNotice("");
    setDestructivePassword("");
    setPendingDestructiveAction(action);
  };

  const closeDestructiveAction = () => {
    if (destructiveActionBusy) {
      return;
    }

    setPendingDestructiveAction(null);
    setDestructivePassword("");
  };

  const handleConfirmDestructiveAction = async (event) => {
    event.preventDefault();

    if (!String(destructivePassword || "").trim()) {
      setError(copy.page.destructivePasswordRequired);
      return;
    }

    if (destructiveActionsLocked) {
      setError(destructiveLockMessage);
      setPendingDestructiveAction(null);
      setDestructivePassword("");
      return;
    }

    if (pendingDestructiveAction === "clear-images") {
      try {
        setClearingImages(true);
        setError("");
        setNotice("");
        const response = await clearShortLinkCheckImagesApi({ password: destructivePassword });
        const result = response.data?.item || {};

        setNotice(copy.page.clearImagesSuccess(result.removedFiles));
        setPendingDestructiveAction(null);
        setDestructivePassword("");
        await loadShortLinks({ quiet: true });
      } catch (err) {
        setError(err.response?.data?.message || copy.page.clearImagesError);
      } finally {
        setClearingImages(false);
      }

      return;
    }

    try {
      setDeletingAllLinks(true);
      setError("");
      setNotice("");
      const response = await deleteAllShortLinksApi({ password: destructivePassword });
      const result = response.data?.item || {};

      setPreviewLink(null);
      setPagination((current) => ({ ...current, page: 1 }));
      setPendingDestructiveAction(null);
      setDestructivePassword("");
      setNotice(copy.page.deleteAllSuccess(result.removedLinks, result.removedChecks, result.removedFiles));
      await loadShortLinks({ quiet: true });
    } catch (err) {
      setError(err.response?.data?.message || copy.page.deleteAllError);
    } finally {
      setDeletingAllLinks(false);
    }
  };

  const handleCheck = async (link) => {
    if (checkerStatus.running) {
      setError(copy.page.waitForCurrentCheck);
      return;
    }

    try {
      setCheckingId(link.id);
      setError("");
      setNotice("");
      const response = await checkShortLinkApi(link.id, { scanMode });
      const check = response.data?.item;

      if (check?.status === "cloudflare") {
        setNotice(copy.page.checkCloudflareNotice);
      } else if (check?.status === "security-verification") {
        setNotice(copy.page.checkSecurityNotice);
      } else {
        setNotice(check?.status === "error" ? copy.page.checkErrorNotice : copy.page.checkSuccessNotice);
      }
      await loadShortLinks();
    } catch (err) {
      setError(err.response?.data?.message || copy.page.checkError);
    } finally {
      setCheckingId("");
    }
  };

  const handleCheckAll = async () => {
    if (schedule.enabled) {
      setError(copy.page.stopScheduleBeforeCheckAll);
      return;
    }

    if (checkerStatus.running) {
      setError(copy.page.waitForCurrentCheck);
      return;
    }

    try {
      setCheckingAll(true);
      setError("");
      setNotice("");
      const response = await checkAllShortLinksApi({ scanMode });
      const result = response.data?.item || {};

      setNotice(copy.page.checkAllSuccess(result.totalCount, result.errorCount));
      await loadShortLinks();
    } catch (err) {
      setError(err.response?.data?.message || copy.page.checkAllError);
    } finally {
      setCheckingAll(false);
    }
  };

  const handleTelegramSave = async (event) => {
    event.preventDefault();

    try {
      setTelegramSaving(true);
      setError("");
      setNotice("");
      const response = await updateShortLinkTelegramApi({
        enabled: telegramForm.enabled,
        chatId: telegramForm.chatId,
        botToken: telegramForm.botToken,
        alertStatusCodes: telegramForm.alertStatusCodes,
        customAlertStatusCodes: telegramForm.customAlertStatusCodes,
        notifyCloudflareVerification: telegramForm.notifyCloudflareVerification,
        notifySecurityVerification: telegramForm.notifySecurityVerification,
      });
      const nextTelegram = normalizeTelegram(response.data?.item);

      setTelegram(nextTelegram);
      setTelegramForm(nextTelegram);
      setIsTelegramModalOpen(false);
      setNotice(copy.page.telegramSaveSuccess);
    } catch (err) {
      setError(err.response?.data?.message || copy.page.telegramSaveError);
    } finally {
      setTelegramSaving(false);
    }
  };

  const handleScheduleSettingsSave = async () => {
    try {
      setScheduleBusy(true);
      setError("");
      setNotice("");
      const response = await updateShortLinkScheduleApi({
        enabled: schedule.enabled,
        delayMinutes: schedule.delayMinutes,
        parallelChecks: schedule.parallelChecks,
        scanMode: schedule.scanMode,
      });
      const nextSchedule = normalizeSchedule(response.data?.item);

      setSchedule(nextSchedule);
      setCheckerStatus((current) => ({ ...current, ...(response.data?.status || {}), schedule: nextSchedule }));
      setNotice(copy.page.scheduleSaveSuccess);
    } catch (err) {
      setError(err.response?.data?.message || copy.page.scheduleSaveError);
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleScheduleToggle = async (enabled) => {
    try {
      setScheduleBusy(true);
      setError("");
      setNotice("");
      const response = await toggleShortLinkScheduleApi(enabled, {
        delayMinutes: schedule.delayMinutes,
        parallelChecks: schedule.parallelChecks,
        scanMode: schedule.scanMode,
      });
      const nextSchedule = normalizeSchedule(response.data?.item);
      const nextStatus = response.data?.status || {};

      setSchedule(nextSchedule);
      setCheckerStatus((current) => ({ ...current, ...nextStatus, schedule: nextSchedule }));
      setNotice(
        enabled
          ? copy.page.scheduleStarted
          : nextStatus.running
            ? copy.page.scheduleStopping
            : copy.page.scheduleStopped
      );
    } catch (err) {
      setError(err.response?.data?.message || copy.page.scheduleUpdateError);
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleOpenPreviewImage = () => {
    if (previewImageUrl) {
      window.open(previewImageUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleDownloadPreviewImage = () => {
    if (!previewImageUrl || !previewLink || !previewCheck) {
      return;
    }

    const link = document.createElement("a");
    link.href = previewImageUrl;
    link.download = buildCaptureDownloadName(previewLink, previewCheck);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="management-page short-link-checker-page">
      <section className="app-panel management-header short-link-checker-hero">
        <div>
          <span className="management-badge">{copy.page.badge}</span>
          <h1>{copy.page.title}</h1>
          <p>{copy.page.description}</p>
        </div>
        <div className="management-header-actions">
          {canScheduleLinks ? (
            <button
              type="button"
              className={`management-button-secondary short-link-checker-schedule-trigger${schedule.enabled ? " is-active" : ""}`}
              onClick={() => setIsScheduleModalOpen(true)}
              disabled={scheduleBusy}
            >
              {schedule.enabled ? copy.page.autoScheduleOn : copy.page.autoSchedule}
            </button>
          ) : null}
          {canManageTelegram ? (
            <button type="button" className="management-button-secondary" onClick={() => setIsTelegramModalOpen(true)}>
              {copy.page.telegram}
            </button>
          ) : null}
          {canManageLinks ? (
            <>
              <button type="button" className="management-button-secondary" onClick={() => setIsImportModalOpen(true)}>
                {copy.page.importLinks}
              </button>
              <button type="button" className="management-button" onClick={handleOpenAdd}>
                {copy.page.addShortLink}
              </button>
            </>
          ) : null}
          {canCheckLinks ? (
            <button
              type="button"
              className="management-button-secondary"
              onClick={handleCheckAll}
              disabled={checkingAll || loading || !summary.activeCount || schedule.enabled || checkerStatus.running}
              title={
                schedule.enabled
                  ? copy.page.stopScheduleBeforeCheckAll
                  : checkerStatus.running
                    ? copy.page.waitForCurrentCheck
                    : ""
              }
            >
              {checkingAll ? copy.page.checking : copy.page.checkAll}
            </button>
          ) : null}
          {canManageLinks ? (
            <button
              type="button"
              className="management-button-secondary is-danger"
              onClick={() => openDestructiveAction("clear-images")}
              disabled={clearingImages || loading || destructiveActionsLocked}
              title={destructiveLockMessage}
            >
              {clearingImages ? copy.page.clearing : copy.page.clearImages}
            </button>
          ) : null}
          {canManageLinks ? (
            <button
              type="button"
              className="management-button-secondary is-danger"
              onClick={() => openDestructiveAction("delete-links")}
              disabled={
                deletingAllLinks ||
                loading ||
                destructiveActionsLocked ||
                !deleteAllCount
              }
              title={destructiveLockMessage}
            >
              {deletingAllLinks ? copy.page.deleting : copy.page.deleteAllLinks}
            </button>
          ) : null}
          <button type="button" className="management-button-secondary" onClick={loadShortLinks} disabled={loading}>
            {loading ? copy.common.refreshing : copy.common.refresh}
          </button>
        </div>
      </section>

      <ToastNotice message={error} onClose={() => setError("")} />
      <ToastNotice message={notice} tone="success" onClose={() => setNotice("")} />

      {canCheckLinks ? (
        <section className="app-panel short-link-checker-live-status">
          <div className="short-link-checker-next-run">
            <span>{copy.page.live.autoSchedule}</span>
            <strong>{schedule.enabled ? copy.page.live.running : copy.page.live.stopped}</strong>
          </div>
          <div className="short-link-checker-next-run">
            <span>{copy.page.live.checkStatus}</span>
            <strong>{scheduleScanLabel}</strong>
          </div>
          <div className="short-link-checker-next-run">
            <span>{copy.page.live.progress}</span>
            <strong>{scheduleProgressLabel}</strong>
          </div>
          <div className="short-link-checker-next-run">
            <span>{copy.page.live.nextCheckIn}</span>
            <strong>{nextCheckCountdownLabel}</strong>
            <small>{nextCheckAtLabel}</small>
          </div>
          <div className="short-link-checker-next-run short-link-checker-live-current">
            <span>{copy.page.live.scanningNow}</span>
            <strong>
              {activeBatchItems.length
                ? copy.page.live.activeCount(activeBatchItems.length)
                : checkerStatus.running
                  ? copy.page.live.starting
                  : copy.page.live.idle}
            </strong>
            <small className="short-link-checker-live-current-link">{copy.page.live.current(currentScanningLabel)}</small>
            {latestCompleted ? (
              <small>
                {copy.page.live.last(
                  latestCompleted.shortUrl,
                  latestCompleted.exactStatusCode,
                  latestCompleted.finalStatusCode
                )}
              </small>
            ) : null}
          </div>
          <div className="short-link-checker-live-actions">
            {schedule.enabled ? (
              <button
                type="button"
                className="management-button-secondary is-danger"
                disabled={scheduleBusy}
                onClick={() => void handleScheduleToggle(false)}
              >
                {copy.page.live.stopSchedule}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="app-panel short-link-checker-filter-panel">
        <div>
          <span className="management-badge">{copy.filterPanel.badge}</span>
          <h2>{copy.filterPanel.title}</h2>
          <p>{copy.filterPanel.summary(links.length, pagination.totalItems)}</p>
        </div>

        <div className="short-link-checker-filter-controls">
          <label className="management-field short-link-checker-search-field" htmlFor="short-link-search">
            <span>{copy.common.search}</span>
            <input
              id="short-link-search"
              type="search"
              value={scanSearch}
              onChange={(event) => {
                setScanSearch(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
              placeholder={copy.filterPanel.searchPlaceholder}
            />
          </label>

          <label className="management-field" htmlFor="short-link-status-filter">
            <span>{copy.common.status}</span>
            <select
              id="short-link-status-filter"
              value={scanFilter}
              onChange={(event) => {
                setScanFilter(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="management-field" htmlFor="short-link-active-filter">
            <span>{copy.common.active}</span>
            <select
              id="short-link-active-filter"
              value={activeFilter}
              onChange={(event) => {
                setActiveFilter(event.target.value);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            >
              {activeFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="management-field" htmlFor="short-link-scan-mode">
            <span>{copy.common.scanMode}</span>
            <select id="short-link-scan-mode" value={scanMode} onChange={(event) => setScanMode(event.target.value)}>
              {scanModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="short-link-checker-filter-stats">
            <span>{copy.filterPanel.stats.active(summary.activeCount)}</span>
            <span>{copy.filterPanel.stats.checked(summary.checkedCount)}</span>
            <span>{copy.filterPanel.stats.success(summary.successCount)}</span>
            <span>{copy.filterPanel.stats.errors(summary.errorCount)}</span>
            <span>{copy.filterPanel.stats.cloudflare(summary.cloudflareCount || 0)}</span>
            <span>{copy.filterPanel.stats.verification(summary.securityVerificationCount || 0)}</span>
          </div>

          {scanFilter !== "all" || activeFilter !== "all" || scanSearch.trim() || scanMode !== SCAN_MODE_CAPTURE ? (
            <button
              type="button"
              className="management-button-secondary"
              onClick={() => {
                setScanFilter("all");
                setActiveFilter("all");
                setScanSearch("");
                setScanMode(SCAN_MODE_CAPTURE);
                setPagination((current) => ({ ...current, page: 1 }));
              }}
            >
              {copy.common.reset}
            </button>
          ) : null}
        </div>
      </section>

      <section className="app-panel management-table short-link-checker-results">
        <div className="management-section-header">
          <div>
            <h2>{copy.page.table.title}</h2>
            <p>{copy.page.table.description}</p>
          </div>
          <span className="management-badge">{copy.page.table.total(links.length)}</span>
        </div>

        {loading ? (
          <p className="management-empty">{copy.page.table.loading}</p>
        ) : links.length ? (
          <>
          <div className="management-table-wrap short-link-checker-table-wrap">
            <table className="short-link-checker-table">
              <thead>
                <tr>
                  <th>{copy.page.table.headers.shortLink}</th>
                  <th>{copy.page.table.headers.moneySite}</th>
                  <th>{copy.page.table.headers.shortStatus}</th>
                  <th>{copy.page.table.headers.finalStatus}</th>
                  <th>{copy.page.table.headers.lastCheck}</th>
                  <th>{copy.page.table.headers.telegram}</th>
                  <th>{copy.page.table.headers.actions}</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => {
                  const check = link.latestCheck;
                  const isChecking = checkingId === link.id;
                  const isScanningLive = scanningLinkIds.has(link.id);

                  return (
                    <tr key={link.id}>
                      <td>
                        <div className="short-link-checker-link-cell">
                          <span className={getStatusTone(check?.status)}>{getStatusLabel(check?.status, copy)}</span>
                          <strong>{link.title || link.shortUrl}</strong>
                          <a href={link.shortUrl} target="_blank" rel="noreferrer">
                            {link.shortUrl}
                          </a>
                          {link.note ? <small>{link.note}</small> : null}
                        </div>
                      </td>
                      <td>
                        <div className="short-link-checker-money-cell">
                          <strong>{link.moneySiteDomain || copy.common.noDomain}</strong>
                          <span>{link.brandName || copy.common.noBrand}</span>
                          <span>{link.active === false ? copy.common.inactive : copy.common.active}</span>
                        </div>
                      </td>
                      <td>
                        <span className={getHttpTone(check?.exactStatusCode)}>{check?.exactStatusCode || "-"}</span>
                      </td>
                      <td>
                        <div className="short-link-checker-final-cell">
                          <span className={getHttpTone(check?.finalStatusCode)}>{check?.finalStatusCode || "-"}</span>
                          {check?.scanMode === SCAN_MODE_STATUS_ONLY ? <small>{copy.page.table.statusOnlyCheck}</small> : null}
                          {check?.finalUrl ? <small>{check.finalUrl}</small> : null}
                          {check?.verificationDetected ? (
                            <small className="short-link-checker-verification-note">
                              {check.verificationName || copy.common.verification}: {check.verificationReason || copy.common.detectedOnFinalPage}
                            </small>
                          ) : null}
                          {check?.error ? <small className="management-error">{check.error}</small> : null}
                        </div>
                      </td>
                      <td>{formatDateTime(check?.checkedAt, language)}</td>
                      <td>
                        <div className="short-link-checker-telegram-cell">
                          <span>{check?.telegramSent ? copy.common.statuses.sent : copy.common.statuses.silent}</span>
                          <small>{(check?.telegramAlertMatched || []).join(", ") || copy.common.noMatchedCode}</small>
                          {check?.telegramError ? <small className="management-error">{check.telegramError}</small> : null}
                        </div>
                      </td>
                      <td>
                        <div className="management-inline-actions short-link-checker-row-actions">
                          {isScanningLive ? <span className="management-badge is-progress">{copy.page.table.scanning}</span> : null}
                          {canCheckLinks ? (
                            <button
                              type="button"
                              className="management-button-secondary"
                              onClick={() => void handleCheck(link)}
                              disabled={isChecking || checkingAll || checkerStatus.running}
                            >
                              {isChecking ? copy.page.table.checking : copy.page.table.check}
                            </button>
                          ) : null}
                          {check?.screenshotEndpoint ? (
                            <button
                              type="button"
                              className="management-button-secondary"
                              onClick={() => setPreviewLink(link)}
                            >
                              {copy.page.table.image}
                            </button>
                          ) : null}
                          {canManageLinks ? (
                            <>
                              <button
                                type="button"
                                className="management-button-secondary"
                                onClick={() => handleEdit(link)}
                              >
                                {copy.page.table.edit}
                              </button>
                              <button
                                type="button"
                                className="management-button-secondary is-danger"
                                onClick={() => void handleDelete(link)}
                              >
                                {copy.page.table.remove}
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
          <div className="short-link-checker-pagination">
            <div>
              <span>{copy.page.table.pagination(pagination.page, pagination.totalPages)}</span>
              <strong>{copy.page.table.matchingLinks(pagination.totalItems)}</strong>
            </div>
            <label className="management-field" htmlFor="short-link-page-size">
              <span>{copy.common.rows}</span>
              <select
                id="short-link-page-size"
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
                {copy.common.previous}
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
                {copy.common.next}
              </button>
            </div>
          </div>
          </>
        ) : summary.totalCount ? (
          <p className="management-empty">{copy.page.table.emptyFiltered}</p>
        ) : (
          <p className="management-empty">{copy.page.table.empty}</p>
        )}
      </section>

      {isEntryModalOpen ? (
        <ShortLinkEntryModal
          form={form}
          copy={copy}
          moneySites={moneySites}
          saving={saving}
          onClose={() => setIsEntryModalOpen(false)}
          onFormChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          onSubmit={handleSave}
        />
      ) : null}

      {isImportModalOpen ? (
        <ShortLinkImportModal
          copy={copy}
          importForm={importForm}
          importResult={importResult}
          moneySites={moneySites}
          importing={importing}
          onClose={() => {
            setImportResult(null);
            setIsImportModalOpen(false);
          }}
          onCsvText={handleCsvText}
          onImportRowChange={handleImportRowChange}
          onImportRowRemove={handleImportRowRemove}
          onSubmit={handleImport}
        />
      ) : null}

      {isTelegramModalOpen ? (
        <ShortLinkTelegramModal
          copy={copy}
          language={language}
          telegram={telegram}
          telegramForm={telegramForm}
          saving={telegramSaving}
          onClose={() => {
            setTelegramForm(telegram);
            setIsTelegramModalOpen(false);
          }}
          onTelegramChange={(patch) => setTelegramForm((current) => ({ ...current, ...patch }))}
          onSubmit={handleTelegramSave}
        />
      ) : null}

      {isScheduleModalOpen ? (
        <ShortLinkScheduleModal
          copy={copy}
          schedule={schedule}
          status={checkerStatus}
          busy={scheduleBusy}
          scheduleScanLabel={scheduleScanLabel}
          scheduleProgressLabel={scheduleProgressLabel}
          nextCheckCountdownLabel={nextCheckCountdownLabel}
          nextCheckAtLabel={nextCheckAtLabel}
          onClose={() => setIsScheduleModalOpen(false)}
          onScheduleChange={(patch) => setSchedule((current) => normalizeSchedule({ ...current, ...patch }))}
          onSave={handleScheduleSettingsSave}
          onToggle={handleScheduleToggle}
        />
      ) : null}

      {pendingDestructiveAction ? (
        <div
          className="management-modal-backdrop is-centered"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDestructiveAction();
            }
          }}
        >
          <form
            className="app-panel management-modal short-link-checker-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="short-link-delete-title"
            onSubmit={handleConfirmDestructiveAction}
          >
            <div className="short-link-checker-modal-header">
              <div>
                <span className="management-badge is-danger">{copy.common.passwordRequired}</span>
                <h2 id="short-link-delete-title">{destructiveActionTitle}</h2>
                <p>{destructiveActionDescription}</p>
              </div>
              <button
                type="button"
                className="management-button-secondary"
                onClick={closeDestructiveAction}
                disabled={destructiveActionBusy}
              >
                {copy.page.destructive.close}
              </button>
            </div>

            <p className="management-error short-link-checker-delete-warning">
              {copy.page.destructive.warning}
            </p>

            <label className="management-field" htmlFor="short-link-delete-password">
              <span>{copy.common.currentPassword}</span>
              <input
                id="short-link-delete-password"
                type="password"
                value={destructivePassword}
                onChange={(event) => setDestructivePassword(event.target.value)}
                placeholder={copy.common.currentPasswordPlaceholder}
                autoComplete="current-password"
                autoFocus
              />
            </label>

            <div className="short-link-checker-modal-actions">
              <button
                type="button"
                className="management-button-secondary"
                onClick={closeDestructiveAction}
                disabled={destructiveActionBusy}
              >
                {copy.page.destructive.cancel}
              </button>
              <button
                type="submit"
                className="management-button-secondary is-danger"
                disabled={destructiveActionBusy || !String(destructivePassword || "").trim()}
              >
                {destructiveActionBusy ? copy.page.destructive.working : destructiveActionButton}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {previewLink ? (
        <ShortLinkCaptureModal
          copy={copy}
          language={language}
          link={previewLink}
          check={previewCheck}
          imageUrl={previewImageUrl}
          loading={previewLoading}
          onClose={() => setPreviewLink(null)}
          onOpenImage={handleOpenPreviewImage}
          onDownloadImage={handleDownloadPreviewImage}
        />
      ) : null}
    </div>
  );
}
