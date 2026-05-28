import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import {
  getMoneySiteChangeFieldLabel,
  translateMoneySiteServerMessage,
} from "../constants/moneySiteLanguage";
import { useMoneySiteUiCopy } from "../hooks/useMoneySiteUiCopy";

function buildTemplateCsv() {
  return `brand,domain,note,status
B200M,b200m-slot.fun,"ads ddy","ready"
B200M,b200m-games.fun,"campaign 2","waiting review"`;
}

function formatSummary(summary = {}, copy) {
  return copy.import.previewSummary(summary);
}

function formatOptionalField(value) {
  return String(value || "").trim() || "-";
}

function formatChangeSummary(row, language) {
  if (!row?.changes?.length) {
    return "-";
  }

  return row.changes
    .map((change) => {
      const label = getMoneySiteChangeFieldLabel(language, change.field);
      return `${label}: ${change.from || "-"} -> ${change.to || "-"}`;
    })
    .join(" | ");
}

function buildPreviewRowMessage(row, copy, language, canUpdateExisting) {
  if (row?.status === "invalid") return copy.import.invalidMessage;
  if (row?.status === "new") return copy.import.newDomainMessage;
  if (row?.status === "unchanged") return copy.import.unchangedMessage;

  const changedLabels = (row?.changes || [])
    .map((change) => getMoneySiteChangeFieldLabel(language, change.field))
    .join(", ");

  if (row?.action === "update") return copy.import.changedWillUpdate(changedLabels);
  if (!canUpdateExisting) return copy.import.changedNeedsUpdatePrivilege(changedLabels);
  return copy.import.changedWillSkip(changedLabels);
}

function formatExistingStatus(row, copy) {
  if (!row?.existing) return "";
  return row.existing.isActive === false ? copy.import.inactiveRecord : copy.import.activeRecord;
}

function getActionBadgeClass(row) {
  if (row.action === "create" || row.action === "update") return "management-badge is-active";
  if (row.status === "invalid") return "management-badge is-inactive";
  return "management-badge";
}

function getActionLabel(row, copy) {
  if (row.action === "create") return copy.import.actionLabels.create;
  if (row.action === "update") return copy.import.actionLabels.update;
  if (row.status === "invalid") return copy.import.actionLabels.invalid;
  if (row.status === "unchanged") return copy.import.actionLabels.unchanged;
  return copy.import.actionLabels.skip;
}

function normalizeActionFilter(row) {
  if (row.action === "create") return "new";
  if (row.action === "update") return "update";
  if (row.status === "unchanged") return "unchanged";
  if (row.status === "invalid") return "invalid";
  return "skip";
}

function formatImportResult(result = {}, copy) {
  return copy.import.importResult(
    result.createdCount || 0,
    result.updatedCount || 0,
    result.skippedCount || 0
  );
}

function formatDeleteAllResult(result = {}, copy) {
  return copy.import.deleteAllResult(result.deletedCount || 0);
}

function formatVerificationMessage(result = {}, copy) {
  return copy.import.verificationResult(result.sentCount || 0, result.failedCount || 0);
}

function formatVerificationExpiry(expiresAt, copy, language) {
  if (!expiresAt) return "";
  const expiryDate = new Date(expiresAt);
  if (Number.isNaN(expiryDate.getTime())) return copy.import.noCodeRequested;
  return copy.import.codeExpiry(
    expiryDate.toLocaleString(language === "indonesian" ? "id-ID" : undefined)
  );
}

function countNonEmptyCsvLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function getPasswordRequiredMessage(language) {
  return translateMoneySiteServerMessage(language, "Current password is required for verification");
}

export default function MoneySiteBulkImportForm({
  busy,
  canUpdateExisting,
  canDeleteMoneySites,
  canUseTelegramVerification,
  totalMoneySites,
  initialCsvText = "",
  onBack,
  onPreview,
  onRequestVerification,
  onRequestDeleteAllVerification,
  onDeleteAllMoneySites,
  onSubmit,
}) {
  const { language, copy } = useMoneySiteUiCopy();
  const [csvText, setCsvText] = useState(() => String(initialCsvText || ""));
  const [localError, setLocalError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewData, setPreviewData] = useState(null);
  const [previewSearch, setPreviewSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [showImportEditors, setShowImportEditors] = useState(() => Boolean(String(initialCsvText || "").trim()));
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationState, setVerificationState] = useState(null);
  const [verificationMethod, setVerificationMethod] = useState("password");
  const [verificationCode, setVerificationCode] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteVerificationBusy, setDeleteVerificationBusy] = useState(false);
  const [deleteVerificationState, setDeleteVerificationState] = useState(null);
  const [deleteVerificationMethod, setDeleteVerificationMethod] = useState("password");
  const [deleteVerificationCode, setDeleteVerificationCode] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const previewRequestIdRef = useRef(0);
  const previewSectionRef = useRef(null);
  const shouldFocusPreviewRef = useRef(false);
  const existingStrategy = canUpdateExisting ? "update" : "skip";
  const templateCsv = useMemo(() => buildTemplateCsv(), []);
  const csvLineCount = useMemo(() => countNonEmptyCsvLines(csvText), [csvText]);
  const templateLineCount = useMemo(() => countNonEmptyCsvLines(templateCsv), [templateCsv]);
  const csvHasContent = Boolean(String(csvText || "").trim());

  useEffect(() => {
    const nextCsvText = String(initialCsvText || "").trim();

    if (!nextCsvText || csvText.trim()) {
      return;
    }

    setCsvText(nextCsvText);
    setShowImportEditors(true);
    shouldFocusPreviewRef.current = true;
  }, [csvText, initialCsvText]);

  const resetVerification = useCallback(() => {
    setVerificationState(null);
    setVerificationMethod("password");
    setVerificationCode("");
    setPassword("");
    setAcknowledged(false);
  }, []);

  const resetDeleteVerification = useCallback(() => {
    setDeleteVerificationState(null);
    setDeleteVerificationMethod("password");
    setDeleteVerificationCode("");
    setDeletePassword("");
    setDeleteAcknowledged(false);
  }, []);

  const runPreview = useCallback(
    async (inputText, requestId) => {
      const normalizedCsvText = String(inputText || "").trim();

      if (!normalizedCsvText) {
        setPreviewData(null);
        setPreviewError("");
        setPreviewLoading(false);
        return;
      }

      setPreviewLoading(true);
      setPreviewError("");

      try {
        const response = await onPreview({ csvText: normalizedCsvText, existingStrategy });
        if (previewRequestIdRef.current !== requestId) return;
        setPreviewData(response.data || null);
      } catch (error) {
        if (previewRequestIdRef.current !== requestId) return;
        setPreviewData(null);
        setPreviewError(
          translateMoneySiteServerMessage(
            language,
            error.response?.data?.message || copy.import.previewError
          )
        );
      } finally {
        if (previewRequestIdRef.current === requestId) setPreviewLoading(false);
      }
    },
    [copy.import.previewError, existingStrategy, language, onPreview]
  );

  useEffect(() => {
    resetVerification();
    setSuccessMessage("");
    const normalizedCsvText = String(csvText || "").trim();

    if (!normalizedCsvText) {
      setPreviewData(null);
      setPreviewError("");
      setPreviewLoading(false);
      return undefined;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    const timeoutId = window.setTimeout(() => {
      void runPreview(normalizedCsvText, requestId);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [csvText, existingStrategy, resetVerification, runPreview]);

  useEffect(() => {
    if (!shouldFocusPreviewRef.current || previewLoading) return;
    if (!csvText.trim()) {
      shouldFocusPreviewRef.current = false;
      return;
    }
    if (!previewData && !previewError) return;

    previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    shouldFocusPreviewRef.current = false;
  }, [csvText, previewData, previewError, previewLoading]);

  const refreshPreview = useCallback(async () => {
    const normalizedCsvText = String(csvText || "").trim();
    if (!normalizedCsvText) return;
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    await runPreview(normalizedCsvText, requestId);
  }, [csvText, runPreview]);

  const handleDownloadTemplate = () => {
    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8;" });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "money-sites-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setCsvText(text);
      setShowImportEditors(false);
      setLocalError("");
      setSuccessMessage("");
      shouldFocusPreviewRef.current = true;
    } catch {
      setLocalError(copy.import.fileReadError);
    }
  };

  const handleRequestVerification = async () => {
    if (!csvText.trim()) return setLocalError(copy.import.csvRequiredBeforeVerification);
    if (previewLoading) return setLocalError(copy.import.previewWaitMessage);
    if (previewError) return setLocalError(previewError);
    if (!previewData?.summary?.actionableCount) return setLocalError(copy.import.noValidRows);

    try {
      setVerificationBusy(true);
      setLocalError("");
      setSuccessMessage("");
      const response = await onRequestVerification({ csvText: csvText.trim(), existingStrategy });
      setVerificationState(response.data || null);
      setSuccessMessage(formatVerificationMessage(response.data || {}, copy));
    } catch (error) {
      setLocalError(
        translateMoneySiteServerMessage(
          language,
          error.response?.data?.message || copy.import.sendCodeError
        )
      );
    } finally {
      setVerificationBusy(false);
    }
  };

  const handleRequestDeleteVerification = async () => {
    if (!totalMoneySites) return setLocalError(copy.import.deleteAllError);

    try {
      setDeleteVerificationBusy(true);
      setLocalError("");
      setSuccessMessage("");
      const response = await onRequestDeleteAllVerification();
      setDeleteVerificationState(response.data || null);
      setSuccessMessage(formatVerificationMessage(response.data || {}, copy));
    } catch (error) {
      setLocalError(
        translateMoneySiteServerMessage(
          language,
          error.response?.data?.message || copy.import.sendCodeError
        )
      );
    } finally {
      setDeleteVerificationBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!csvText.trim()) return setLocalError(copy.import.csvRequired);
    if (previewLoading) return setLocalError(copy.import.previewWaitMessage);
    if (previewError) return setLocalError(previewError);
    if (!previewData?.summary?.actionableCount) return setLocalError(copy.import.noValidRows);
    if (!acknowledged) return setLocalError(copy.import.confirmPreviewRequired);
    if (verificationMethod === "telegram") {
      if (!verificationState?.expiresAt) return setLocalError(copy.import.requestCodeRequired);
      if (String(verificationCode || "").trim().length !== 4) {
        return setLocalError(copy.import.enterCodeRequired);
      }
    } else if (!String(password || "").trim()) {
      return setLocalError(getPasswordRequiredMessage(language));
    }

    try {
      setLocalError("");
      setSuccessMessage("");
      const response = await onSubmit({
        csvText: csvText.trim(),
        existingStrategy,
        verificationMethod,
        verificationCode: verificationMethod === "telegram" ? verificationCode : "",
        password: verificationMethod === "password" ? password : "",
      });
      setSuccessMessage(formatImportResult(response.data || {}, copy));
      setShowVerificationModal(false);
      resetVerification();
      await refreshPreview();
    } catch (error) {
      setLocalError(
        translateMoneySiteServerMessage(
          language,
          error.response?.data?.message || copy.import.importError
        )
      );
    }
  };

  const handleDeleteAllSubmit = async (event) => {
    event.preventDefault();
    if (!totalMoneySites) return setLocalError(copy.import.deleteAllError);
    if (!deleteAcknowledged) return setLocalError(copy.import.deleteAllReviewConfirmation);

    if (deleteVerificationMethod === "telegram") {
      if (!deleteVerificationState?.expiresAt) return setLocalError(copy.import.requestCodeRequired);
      if (String(deleteVerificationCode || "").trim().length !== 4) {
        return setLocalError(copy.import.enterCodeRequired);
      }
    } else if (!String(deletePassword || "").trim()) {
      return setLocalError(getPasswordRequiredMessage(language));
    }

    try {
      setLocalError("");
      setSuccessMessage("");
      const response = await onDeleteAllMoneySites({
        expectedCount: totalMoneySites,
        verificationMethod: deleteVerificationMethod,
        verificationCode: deleteVerificationMethod === "telegram" ? deleteVerificationCode : "",
        password: deleteVerificationMethod === "password" ? deletePassword : "",
      });
      setSuccessMessage(formatDeleteAllResult(response.data || {}, copy));
      setShowDeleteAllModal(false);
      resetDeleteVerification();
      await refreshPreview();
    } catch (error) {
      setLocalError(
        translateMoneySiteServerMessage(
          language,
          error.response?.data?.message || copy.import.deleteAllError
        )
      );
    }
  };

  const importTelegramAvailable = Boolean(canUseTelegramVerification);
  const deleteTelegramAvailable = Boolean(canUseTelegramVerification);

  useEffect(() => {
    if (!importTelegramAvailable && verificationMethod === "telegram") {
      setVerificationMethod("password");
    }
  }, [importTelegramAvailable, verificationMethod]);

  useEffect(() => {
    if (!deleteTelegramAvailable && deleteVerificationMethod === "telegram") {
      setDeleteVerificationMethod("password");
    }
  }, [deleteTelegramAvailable, deleteVerificationMethod]);

  const openVerificationModal = useCallback(() => {
    resetVerification();
    setShowVerificationModal(true);
  }, [resetVerification]);

  const openDeleteAllModal = useCallback(() => {
    resetDeleteVerification();
    setShowDeleteAllModal(true);
  }, [resetDeleteVerification]);

  const filteredRows = useMemo(() => {
    const rows = previewData?.rows || [];
    const normalizedSearch = String(previewSearch || "").trim().toLowerCase();

    return rows.filter((row) => {
      const actionKey = normalizeActionFilter(row);
      const matchesAction =
        actionFilter === "all"
        || actionFilter === actionKey
        || (actionFilter === "actionable" && row.willImport);
      const matchesSearch =
        !normalizedSearch
        || [
          row.brand,
          row.domain,
          row.note,
          row.statusText,
          row.message,
          row.existing?.brand,
          row.existing?.note,
          row.existing?.statusText,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      return matchesAction && matchesSearch;
    });
  }, [actionFilter, previewData, previewSearch]);

  const hasActivePreviewFilters = actionFilter !== "all" || Boolean(String(previewSearch || "").trim());

  const handleActionFilterChange = useCallback((nextFilter) => {
    setActionFilter((current) => (current === nextFilter ? "all" : nextFilter));
  }, []);

  const handleResetPreviewFilters = useCallback(() => {
    setActionFilter("all");
    setPreviewSearch("");
  }, []);

  const filteredSummary = useMemo(() => {
    return filteredRows.reduce(
      (summary, row) => {
        const key = normalizeActionFilter(row);
        summary.total += 1;
        if (key === "new") summary.newCount += 1;
        else if (key === "update") summary.updateCount += 1;
        else if (key === "unchanged") summary.unchangedCount += 1;
        else if (key === "invalid") summary.invalidCount += 1;
        return summary;
      },
      { total: 0, newCount: 0, updateCount: 0, unchangedCount: 0, invalidCount: 0 }
    );
  }, [filteredRows]);

  const readyCount = previewData?.summary?.actionableCount || 0;
  const hasPreview = Boolean(previewData);

  return (
    <div className="management-page money-site-import-page">
      <ToastNotice message={localError} onClose={() => setLocalError("")} />
      <ToastNotice message={successMessage} tone="success" onClose={() => setSuccessMessage("")} />

      <section className="app-panel management-header money-site-import-header">
        <div>
          <h1>{copy.importPage.title}</h1>
        </div>
        <div className="management-header-actions">
          <button type="button" className="management-button-secondary" onClick={onBack}>
            {copy.importPage.backButton}
          </button>
        </div>
      </section>

      <section className="app-panel management-form money-site-import-intro">
        <div className="management-section-header">
          <div className="money-site-import-section-copy">
            <h2>{copy.import.uploadTitle}</h2>
            <p>{copy.import.uploadDescription}</p>
          </div>
          <div className="management-inline-actions">
            <button
              type="button"
              className="management-button-secondary money-site-import-collapse-toggle"
              onClick={() => setShowImportEditors((current) => !current)}
              disabled={busy}
            >
              {showImportEditors ? copy.import.hideCsvView : copy.import.showCsvView}
            </button>
            <button
              type="button"
              className="management-button-secondary"
              onClick={handleDownloadTemplate}
              disabled={busy || verificationBusy}
            >
              {copy.import.downloadTemplate}
            </button>
            {canDeleteMoneySites ? (
              <button
                type="button"
                className="management-button-secondary money-site-import-delete-trigger"
                onClick={openDeleteAllModal}
                disabled={busy || !totalMoneySites}
              >
                {copy.import.deleteAllButton}
              </button>
            ) : null}
          </div>
        </div>

        <div className="money-site-import-editor-grid">
          <div className="management-field money-site-import-upload-card">
            <label htmlFor="money-site-import-file">{copy.import.csvFileLabel}</label>
            <input
              id="money-site-import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={busy}
            />
            <small className="management-help-text">{copy.import.csvFileHelp}</small>
          </div>

          <div className="money-site-import-toggle-grid">
            <div className="management-field money-site-import-collapse-card">
              <div className="money-site-import-collapse-header">
                <div className="money-site-import-collapse-copy">
                  <label htmlFor="money-site-import-text">{copy.import.csvContentTitle}</label>
                  <span className="money-site-import-collapse-meta">
                    {csvHasContent
                      ? copy.import.csvContentLoaded(csvLineCount)
                      : copy.import.csvContentEmpty}
                  </span>
                </div>
              </div>
              {showImportEditors ? (
                <div className="money-site-import-collapse-body">
                  <textarea
                    id="money-site-import-text"
                    value={csvText}
                    onChange={(event) => setCsvText(event.target.value)}
                    placeholder={templateCsv}
                    rows={16}
                    disabled={busy}
                  />
                </div>
              ) : (
                <div className="money-site-import-collapse-preview">
                  <span>{csvHasContent ? copy.import.csvContentReady : copy.import.csvContentHidden}</span>
                </div>
              )}
            </div>

            <div className="management-field money-site-import-template-card money-site-import-collapse-card">
              <div className="money-site-import-collapse-header">
                <div className="money-site-import-collapse-copy">
                  <label htmlFor="money-site-import-sample">{copy.import.templatePreviewTitle}</label>
                  <span className="money-site-import-collapse-meta">
                    {copy.import.templateSampleLines(templateLineCount)}
                  </span>
                </div>
              </div>
              {showImportEditors ? (
                <div className="money-site-import-collapse-body">
                  <textarea id="money-site-import-sample" value={templateCsv} readOnly rows={16} />
                </div>
              ) : (
                <div className="money-site-import-collapse-preview">
                  <span>{copy.import.templateHidden}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {csvText.trim() ? (
        <section
          ref={previewSectionRef}
          className="app-panel management-form money-site-import-preview-panel"
        >
          <div className="management-section-header">
            <div className="money-site-import-section-copy">
              <h2>{copy.import.previewTitle}</h2>
              <p>
                {previewLoading
                  ? copy.import.previewChecking
                  : previewError
                    ? previewError
                    : previewData
                      ? formatSummary(previewData.summary, copy)
                      : copy.import.previewEmpty}
              </p>
            </div>
            <div className="management-inline-actions money-site-import-header-actions">
              <span className="management-badge is-active money-site-import-header-badge">
                {copy.import.ready}: {readyCount}
              </span>
              <span className="management-badge money-site-import-header-badge">
                {copy.import.filtered}: {filteredSummary.total}
              </span>
              <button
                type="button"
                className="management-button-secondary money-site-import-primary-action"
                onClick={openVerificationModal}
                disabled={busy || previewLoading || !readyCount}
              >
                {copy.import.finalVerification}
              </button>
            </div>
          </div>

          {hasPreview ? (
            <div className="money-site-import-summary-grid">
              <button
                type="button"
                className={`money-site-import-summary-card is-ready ${actionFilter === "actionable" ? "is-selected" : ""}`}
                onClick={() => handleActionFilterChange("actionable")}
              >
                <span>{copy.import.readyToApply}</span>
                <strong>{readyCount}</strong>
              </button>
              <button
                type="button"
                className={`money-site-import-summary-card is-new ${actionFilter === "new" ? "is-selected" : ""}`}
                onClick={() => handleActionFilterChange("new")}
              >
                <span>{copy.import.newLabel}</span>
                <strong>{previewData.summary.newCount || 0}</strong>
              </button>
              <button
                type="button"
                className={`money-site-import-summary-card is-update ${actionFilter === "update" ? "is-selected" : ""}`}
                onClick={() => handleActionFilterChange("update")}
              >
                <span>{copy.import.updateLabel}</span>
                <strong>{previewData.summary.updateCount || 0}</strong>
              </button>
              <button
                type="button"
                className={`money-site-import-summary-card is-muted ${actionFilter === "unchanged" ? "is-selected" : ""}`}
                onClick={() => handleActionFilterChange("unchanged")}
              >
                <span>{copy.import.unchangedLabel}</span>
                <strong>{previewData.summary.unchangedCount || 0}</strong>
              </button>
              <button
                type="button"
                className={`money-site-import-summary-card is-invalid ${actionFilter === "invalid" ? "is-selected" : ""}`}
                onClick={() => handleActionFilterChange("invalid")}
              >
                <span>{copy.import.invalidLabel}</span>
                <strong>{previewData.summary.invalidCount || 0}</strong>
              </button>
            </div>
          ) : null}

          <div className="money-site-import-filter-bar">
            <div className="management-search">
              <label htmlFor="money-site-import-search">{copy.import.filterPreview}</label>
              <input
                id="money-site-import-search"
                type="search"
                value={previewSearch}
                onChange={(event) => setPreviewSearch(event.target.value)}
                placeholder={copy.import.filterPlaceholder}
                disabled={previewLoading || busy}
              />
            </div>
            <div className="money-site-import-filter-actions">
              <button
                type="button"
                className="management-button-secondary money-site-import-filter-reset"
                onClick={handleResetPreviewFilters}
                disabled={previewLoading || busy || !hasActivePreviewFilters}
                title={copy.common.reset}
                aria-label={copy.common.reset}
              >
                <span aria-hidden="true">↺</span>
              </button>
            </div>
          </div>

          {previewError ? <p className="management-error">{previewError}</p> : null}

          {filteredRows.length ? (
            <>
              <div className="management-table-wrap money-site-import-table-wrap">
                <table className="brands-management-table money-site-import-table">
                  <thead>
                    <tr>
                      <th>{copy.import.tableHeaders.row}</th>
                      <th>{copy.import.tableHeaders.incoming}</th>
                      <th>{copy.import.tableHeaders.existing}</th>
                      <th>{copy.import.tableHeaders.difference}</th>
                      <th>{copy.import.tableHeaders.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr
                        key={`${row.rowNumber}-${row.domain || "empty"}`}
                        className={`money-site-import-row is-${normalizeActionFilter(row)}`}
                      >
                        <td>
                          <div className="management-stack">
                            <strong>{copy.import.rowLabel(row.rowNumber)}</strong>
                            <span className="management-checkbox-meta">{normalizeActionFilter(row)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="management-stack money-site-import-record-cell">
                            <strong>{row.domain || "-"}</strong>
                            <span className="money-site-import-subline">{copy.common.brand}: {row.brand || "-"}</span>
                            <span className="money-site-import-subline">
                              {copy.common.note}: {formatOptionalField(row.note)}
                            </span>
                            <span className="money-site-import-subline">
                              {copy.common.statusText}: {formatOptionalField(row.statusText)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="management-stack money-site-import-record-cell">
                            <strong>{row.existing?.brand || copy.import.noExistingRecord}</strong>
                            {row.existing ? (
                              <>
                                <span className="money-site-import-subline">
                                  {`${copy.common.note}: ${formatOptionalField(row.existing.note)}`}
                                </span>
                                <span className="money-site-import-subline">
                                  {`${copy.common.statusText}: ${formatOptionalField(row.existing.statusText)}`}
                                </span>
                                <span className="money-site-import-subline">{formatExistingStatus(row, copy)}</span>
                              </>
                            ) : (
                              <span className="money-site-import-subline">{copy.import.noExistingRecord}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="management-stack money-site-import-diff-cell">
                            <strong>
                              {row.errors?.length
                                ? copy.import.needsCorrection
                                : buildPreviewRowMessage(row, copy, language, canUpdateExisting)}
                            </strong>
                            <span className="money-site-import-subline">{formatChangeSummary(row, language)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="management-stack">
                            <span className={getActionBadgeClass(row)}>{getActionLabel(row, copy)}</span>
                            <span className="money-site-import-subline">
                              {row.errors?.length
                                ? row.errors
                                  .map((message) => translateMoneySiteServerMessage(language, message))
                                  .join(" | ")
                                : row.willImport
                                  ? copy.import.willApply
                                  : copy.import.willNotChange}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="money-site-import-mobile-list">
                {filteredRows.map((row) => (
                  <article
                    key={`mobile-${row.rowNumber}-${row.domain || "empty"}`}
                    className={`money-site-import-mobile-card is-${normalizeActionFilter(row)}`}
                  >
                    <div className="money-site-import-mobile-card-header">
                      <strong>{copy.import.rowLabel(row.rowNumber)}</strong>
                      <span className={getActionBadgeClass(row)}>{getActionLabel(row, copy)}</span>
                    </div>

                    <div className="money-site-import-mobile-grid">
                      <div className="money-site-import-mobile-block">
                        <span>{copy.import.mobileIncoming}</span>
                        <strong>{row.domain || "-"}</strong>
                        <small>{copy.common.brand}: {row.brand || "-"}</small>
                        <small>{copy.common.note}: {formatOptionalField(row.note)}</small>
                        <small>{copy.common.statusText}: {formatOptionalField(row.statusText)}</small>
                      </div>

                      <div className="money-site-import-mobile-block">
                        <span>{copy.import.mobileCurrent}</span>
                        <strong>{row.existing?.brand || copy.import.noExistingRecord}</strong>
                        {row.existing ? (
                          <>
                            <small>{`${copy.common.note}: ${formatOptionalField(row.existing.note)}`}</small>
                            <small>{`${copy.common.statusText}: ${formatOptionalField(row.existing.statusText)}`}</small>
                            <small>{formatExistingStatus(row, copy)}</small>
                          </>
                        ) : (
                          <small>{copy.import.noExistingRecord}</small>
                        )}
                      </div>
                    </div>

                    <div className="money-site-import-mobile-block">
                      <span>{copy.import.mobileDifference}</span>
                      <strong>
                        {row.errors?.length
                          ? copy.import.needsCorrection
                          : buildPreviewRowMessage(row, copy, language, canUpdateExisting)}
                      </strong>
                      <small>{formatChangeSummary(row, language)}</small>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : csvText.trim() && !previewLoading && !previewError ? (
            <p className="management-empty">{copy.import.noRowsMatch}</p>
          ) : null}
        </section>
      ) : null}

      {showVerificationModal ? (
        <div className="management-modal-backdrop is-centered" role="presentation">
          <form
            onSubmit={handleSubmit}
            className="app-panel management-form management-modal money-site-import-verify-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="money-site-import-verify-title"
          >
            <div className="management-section-header">
              <div>
                <h2 id="money-site-import-verify-title">{copy.import.verificationTitle}</h2>
                <p>{copy.import.verificationDescription}</p>
              </div>
              <div className="management-inline-actions">
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => setShowVerificationModal(false)}
                  disabled={busy}
                >
                  {copy.common.close}
                </button>
              </div>
            </div>

            <section className="money-site-import-verify-card money-site-import-verify-card-single">
              <div className="money-site-import-verify-summary">
                <div className="money-site-import-verify-pill">
                  <span>{copy.import.ready}</span>
                  <strong>{previewData?.summary?.actionableCount || 0}</strong>
                </div>
                <div className="money-site-import-verify-pill">
                  <span>{copy.import.newLabel}</span>
                  <strong>{previewData?.summary?.newCount || 0}</strong>
                </div>
                <div className="money-site-import-verify-pill">
                  <span>{copy.import.updateLabel}</span>
                  <strong>{previewData?.summary?.updateCount || 0}</strong>
                </div>
              </div>

              <label className="management-checkbox money-site-import-confirmation">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  disabled={busy}
                />
                <span className="management-checkbox-copy">
                  <strong>{copy.import.reviewConfirmation}</strong>
                </span>
              </label>

              {importTelegramAvailable ? (
                <div className="money-site-import-verification-methods">
                  <span className="management-label">{copy.import.verificationMethodLabel}</span>
                  <div className="money-site-import-method-toggle">
                    <button
                      type="button"
                      className={`management-button-secondary ${verificationMethod === "password" ? "is-selected" : ""}`}
                      onClick={() => setVerificationMethod("password")}
                      disabled={busy || verificationBusy}
                    >
                      {copy.import.verificationUsePassword}
                    </button>
                    <button
                      type="button"
                      className={`management-button-secondary ${verificationMethod === "telegram" ? "is-selected" : ""}`}
                      onClick={() => setVerificationMethod("telegram")}
                      disabled={busy || verificationBusy}
                    >
                      {copy.import.verificationUseTelegram}
                    </button>
                  </div>
                </div>
              ) : null}

              {verificationMethod === "telegram" && importTelegramAvailable ? (
                <div className="management-field">
                  <label htmlFor="money-site-import-code">{copy.import.telegramCodeLabel}</label>
                  <div className="money-site-import-verification-input-row">
                    <input
                      id="money-site-import-code"
                      inputMode="numeric"
                      maxLength={4}
                      value={verificationCode}
                      onChange={(event) =>
                        setVerificationCode(String(event.target.value || "").replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="0000"
                      disabled={busy}
                    />
                    <button
                      type="button"
                      className="management-button-secondary"
                      onClick={handleRequestVerification}
                      disabled={verificationBusy || busy || previewLoading}
                    >
                      {verificationBusy
                        ? copy.import.sending
                        : verificationState?.expiresAt
                          ? copy.import.sendNewCode
                          : copy.import.sendCode}
                    </button>
                  </div>
                  <span className="money-site-import-verification-status">
                    {formatVerificationExpiry(verificationState?.expiresAt, copy, language)
                      || copy.import.noCodeRequested}
                  </span>
                </div>
              ) : (
                <div className="management-field">
                  <label htmlFor="money-site-import-password">{copy.import.passwordLabel}</label>
                  <input
                    id="money-site-import-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={copy.import.passwordPlaceholder}
                    disabled={busy}
                  />
                </div>
              )}
            </section>

            <div className="management-actions money-site-import-actions">
              <button
                type="submit"
                className="management-button"
                disabled={
                  busy
                  || previewLoading
                  || !previewData?.summary?.actionableCount
                  || !acknowledged
                  || (verificationMethod === "telegram"
                    ? String(verificationCode || "").trim().length !== 4
                    : !String(password || "").trim())
                }
              >
                {busy ? copy.import.importing : copy.import.verifyAndImport}
              </button>
              <button
                type="button"
                className="management-button-secondary"
                onClick={() => setShowVerificationModal(false)}
                disabled={busy}
              >
                {copy.common.close}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showDeleteAllModal ? (
        <div className="management-modal-backdrop is-centered" role="presentation">
          <form
            onSubmit={handleDeleteAllSubmit}
            className="app-panel management-form management-modal money-site-import-verify-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="money-site-delete-all-title"
          >
            <div className="management-section-header">
              <div>
                <h2 id="money-site-delete-all-title">{copy.import.deleteAllTitle}</h2>
                <p>{copy.import.deleteAllDescription}</p>
              </div>
              <div className="management-inline-actions">
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => setShowDeleteAllModal(false)}
                  disabled={busy}
                >
                  {copy.common.close}
                </button>
              </div>
            </div>

            <section className="money-site-import-verify-card money-site-import-verify-card-single">
              <div className="money-site-import-verify-summary">
                <div className="money-site-import-verify-pill">
                  <span>{copy.import.deleteAllCountLabel}</span>
                  <strong>{totalMoneySites || 0}</strong>
                </div>
              </div>

              <label className="management-checkbox money-site-import-confirmation">
                <input
                  type="checkbox"
                  checked={deleteAcknowledged}
                  onChange={(event) => setDeleteAcknowledged(event.target.checked)}
                  disabled={busy}
                />
                <span className="management-checkbox-copy">
                  <strong>{copy.import.deleteAllReviewConfirmation}</strong>
                </span>
              </label>

              {deleteTelegramAvailable ? (
                <div className="money-site-import-verification-methods">
                  <span className="management-label">{copy.import.verificationMethodLabel}</span>
                  <div className="money-site-import-method-toggle">
                    <button
                      type="button"
                      className={`management-button-secondary ${deleteVerificationMethod === "password" ? "is-selected" : ""}`}
                      onClick={() => setDeleteVerificationMethod("password")}
                      disabled={busy || deleteVerificationBusy}
                    >
                      {copy.import.verificationUsePassword}
                    </button>
                    <button
                      type="button"
                      className={`management-button-secondary ${deleteVerificationMethod === "telegram" ? "is-selected" : ""}`}
                      onClick={() => setDeleteVerificationMethod("telegram")}
                      disabled={busy || deleteVerificationBusy}
                    >
                      {copy.import.verificationUseTelegram}
                    </button>
                  </div>
                </div>
              ) : null}

              {deleteVerificationMethod === "telegram" && deleteTelegramAvailable ? (
                <div className="management-field">
                  <label htmlFor="money-site-delete-all-code">{copy.import.telegramCodeLabel}</label>
                  <div className="money-site-import-verification-input-row">
                    <input
                      id="money-site-delete-all-code"
                      inputMode="numeric"
                      maxLength={4}
                      value={deleteVerificationCode}
                      onChange={(event) =>
                        setDeleteVerificationCode(String(event.target.value || "").replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="0000"
                      disabled={busy}
                    />
                    <button
                      type="button"
                      className="management-button-secondary"
                      onClick={handleRequestDeleteVerification}
                      disabled={deleteVerificationBusy || busy || !totalMoneySites}
                    >
                      {deleteVerificationBusy
                        ? copy.import.sending
                        : deleteVerificationState?.expiresAt
                          ? copy.import.sendNewCode
                          : copy.import.sendCode}
                    </button>
                  </div>
                  <span className="money-site-import-verification-status">
                    {formatVerificationExpiry(deleteVerificationState?.expiresAt, copy, language)
                      || copy.import.noCodeRequested}
                  </span>
                </div>
              ) : (
                <div className="management-field">
                  <label htmlFor="money-site-delete-all-password">{copy.import.passwordLabel}</label>
                  <input
                    id="money-site-delete-all-password"
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    placeholder={copy.import.passwordPlaceholder}
                    disabled={busy}
                  />
                </div>
              )}
            </section>

            <div className="management-actions money-site-import-actions">
              <button
                type="submit"
                className="management-button"
                disabled={
                  busy
                  || !totalMoneySites
                  || !deleteAcknowledged
                  || (deleteVerificationMethod === "telegram"
                    ? String(deleteVerificationCode || "").trim().length !== 4
                    : !String(deletePassword || "").trim())
                }
              >
                {busy ? copy.import.deletingAll : copy.import.deleteAllConfirm}
              </button>
              <button
                type="button"
                className="management-button-secondary"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={busy}
              >
                {copy.common.close}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
