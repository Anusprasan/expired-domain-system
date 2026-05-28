import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useArticlePoolUiCopy } from "../hooks/useArticlePoolUiCopy";

function buildTemplateCsv() {
  return [
    "Brand,Title,Description,Content,Note,Logo,Banner,Favicon,Button",
    'B200M,"Best online casino safety guide","Short summary for the article","<p>Write the full article content here.</p>","Optional internal note","https://blogger.googleusercontent.com/img/logo.png","https://blogger.googleusercontent.com/img/banner.png","https://blogger.googleusercontent.com/img/favicon.png","https://blogger.googleusercontent.com/img/button.gif"',
    'B200M,"Slot review checklist","Short review intro","<p>Start with the main article body here.</p>","Use one row per content item","","","",""',
  ].join("\n");
}

function countNonEmptyCsvLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function normalizeActionFilter(row) {
  if (row.action === "create") return "new";
  if (row.action === "update") return "update";
  if (row.status === "unchanged") return "unchanged";
  if (row.status === "invalid") return "invalid";
  return "skip";
}

function formatSummary(summary = {}, copy) {
  return copy.importForm.summary(summary);
}

function formatImportResult(result = {}, copy) {
  return copy.importForm.importResult(
    result.createdCount,
    result.updatedCount,
    result.skippedCount
  );
}

function formatOptionalField(value) {
  return String(value || "").trim() || "-";
}

function formatChangeSummary(row) {
  if (!row?.changes?.length) {
    return "-";
  }

  return row.changes.map((change) => change.label).join(" | ");
}

function formatResourceSummary(resources = {}, copy) {
  return copy.importForm.resourceSummary(resources);
}

function buildPreviewRowMessage(row, canUpdateExisting, copy) {
  if (row?.status === "invalid") return copy.importForm.previewMessages.invalid;
  if (row?.status === "new") return copy.importForm.previewMessages.create;
  if (row?.status === "unchanged") return copy.importForm.previewMessages.unchanged;

  const changedLabels = (row?.changes || []).map((change) => change.label).join(", ");

  if (row?.action === "update") return copy.importForm.previewMessages.update(changedLabels);
  if (!canUpdateExisting) return copy.importForm.previewMessages.needsPrivilege(changedLabels);
  return copy.importForm.previewMessages.skipped(changedLabels);
}

function getActionBadgeClass(row) {
  if (row.action === "create" || row.action === "update") return "management-badge is-active";
  if (row.status === "invalid") return "management-badge is-inactive";
  return "management-badge";
}

function getActionLabel(row, copy) {
  if (row.action === "create") return copy.importForm.actionLabels.create;
  if (row.action === "update") return copy.importForm.actionLabels.update;
  if (row.status === "invalid") return copy.importForm.actionLabels.invalid;
  if (row.status === "unchanged") return copy.importForm.actionLabels.unchanged;
  return copy.importForm.actionLabels.skip;
}

export default function ContentPoolBulkImportForm({
  busy,
  canUpdateExisting,
  onBack,
  onPreview,
  onSubmit,
}) {
  const { copy } = useArticlePoolUiCopy();
  const [csvText, setCsvText] = useState("");
  const [localError, setLocalError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewData, setPreviewData] = useState(null);
  const [previewSearch, setPreviewSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [showImportEditors, setShowImportEditors] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const previewRequestIdRef = useRef(0);
  const previewSectionRef = useRef(null);
  const shouldFocusPreviewRef = useRef(false);
  const existingStrategy = canUpdateExisting ? "update" : "skip";
  const templateCsv = useMemo(() => buildTemplateCsv(), []);
  const csvLineCount = useMemo(() => countNonEmptyCsvLines(csvText), [csvText]);
  const templateLineCount = useMemo(() => countNonEmptyCsvLines(templateCsv), [templateCsv]);
  const csvHasContent = Boolean(String(csvText || "").trim());

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
        if (previewRequestIdRef.current !== requestId) {
          return;
        }

        setPreviewData(response.data || null);
      } catch (error) {
        if (previewRequestIdRef.current !== requestId) {
          return;
        }

        setPreviewData(null);
        setPreviewError(error.response?.data?.message || copy.importForm.previewError);
      } finally {
        if (previewRequestIdRef.current === requestId) {
          setPreviewLoading(false);
        }
      }
    },
    [copy.importForm.previewError, existingStrategy, onPreview]
  );

  useEffect(() => {
    setSuccessMessage("");
    setAcknowledged(false);
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
  }, [csvText, existingStrategy, runPreview]);

  useEffect(() => {
    if (!shouldFocusPreviewRef.current || previewLoading) {
      return;
    }

    if (!csvText.trim()) {
      shouldFocusPreviewRef.current = false;
      return;
    }

    if (!previewData && !previewError) {
      return;
    }

    previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    shouldFocusPreviewRef.current = false;
  }, [csvText, previewData, previewError, previewLoading]);

  const refreshPreview = useCallback(async () => {
    const normalizedCsvText = String(csvText || "").trim();

    if (!normalizedCsvText) {
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    await runPreview(normalizedCsvText, requestId);
  }, [csvText, runPreview]);

  const handleDownloadTemplate = () => {
    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8;" });
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = "content-pool-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setCsvText(text);
      setShowImportEditors(false);
      setLocalError("");
      setSuccessMessage("");
      shouldFocusPreviewRef.current = true;
    } catch {
      setLocalError(copy.importForm.readFileError);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!csvText.trim()) {
      setLocalError(copy.importForm.csvRequired);
      return;
    }

    if (previewLoading) {
      setLocalError(copy.importForm.waitForPreview);
      return;
    }

    if (previewError) {
      setLocalError(previewError);
      return;
    }

    if (!previewData?.summary?.actionableCount) {
      setLocalError(copy.importForm.noValidRows);
      return;
    }

    if (!acknowledged) {
      setLocalError(copy.importForm.reviewRequired);
      return;
    }

    try {
      setLocalError("");
      setSuccessMessage("");
      const response = await onSubmit({
        csvText: csvText.trim(),
        existingStrategy,
      });
      setSuccessMessage(formatImportResult(response.data || {}, copy));
      setShowConfirmModal(false);
      setAcknowledged(false);
      await refreshPreview();
    } catch (error) {
      setLocalError(error.response?.data?.message || copy.importForm.importError);
    }
  };

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
          row.brandName,
          row.title,
          row.description,
          row.note,
          row.message,
          row.existing?.brandName,
          row.existing?.title,
          row.existing?.description,
          row.existing?.note,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      return matchesAction && matchesSearch;
    });
  }, [actionFilter, previewData, previewSearch]);

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
  const hasActivePreviewFilters =
    actionFilter !== "all" || Boolean(String(previewSearch || "").trim());

  const handleActionFilterChange = useCallback((nextFilter) => {
    setActionFilter((current) => (current === nextFilter ? "all" : nextFilter));
  }, []);

  const handleResetPreviewFilters = useCallback(() => {
    setActionFilter("all");
    setPreviewSearch("");
  }, []);

  return (
    <div className="management-page money-site-import-page content-pool-import-page">
      <ToastNotice message={localError} onClose={() => setLocalError("")} />
      <ToastNotice message={successMessage} tone="success" onClose={() => setSuccessMessage("")} />

      <section className="app-panel management-header money-site-import-header">
        <div>
          <h1>{copy.importForm.title}</h1>
        </div>
        <div className="management-header-actions">
          <button type="button" className="management-button-secondary" onClick={onBack}>
            {copy.importPage.backToList}
          </button>
        </div>
      </section>

      <section className="app-panel management-form money-site-import-intro">
        <div className="management-section-header">
          <div className="money-site-import-section-copy">
            <h2>{copy.importForm.uploadTitle}</h2>
            <p>{copy.importForm.uploadDescription}</p>
          </div>
          <div className="management-inline-actions">
            <button
              type="button"
              className="management-button-secondary money-site-import-collapse-toggle"
              onClick={() => setShowImportEditors((current) => !current)}
              disabled={busy}
            >
              {showImportEditors ? copy.importForm.hideCsvView : copy.importForm.showCsvView}
            </button>
            <button
              type="button"
              className="management-button-secondary"
              onClick={handleDownloadTemplate}
              disabled={busy}
            >
              {copy.importForm.downloadTemplate}
            </button>
          </div>
        </div>

        <div className="money-site-import-editor-grid">
          <div className="management-field money-site-import-upload-card">
            <label htmlFor="content-pool-import-file">{copy.importForm.chooseFile}</label>
            <input
              id="content-pool-import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={busy}
            />
            <small className="management-help-text">
              {copy.importForm.fileHelp}
            </small>
          </div>

          <div className="money-site-import-toggle-grid">
            <div className="management-field money-site-import-collapse-card">
              <div className="money-site-import-collapse-header">
                <div className="money-site-import-collapse-copy">
                  <label htmlFor="content-pool-import-text">{copy.importForm.csvContent}</label>
                  <span className="money-site-import-collapse-meta">
                    {csvHasContent
                      ? copy.importForm.loadedLines(csvLineCount)
                      : copy.importForm.noCsvLoaded}
                  </span>
                </div>
              </div>
              {showImportEditors ? (
                <div className="money-site-import-collapse-body">
                  <textarea
                    id="content-pool-import-text"
                    value={csvText}
                    onChange={(event) => setCsvText(event.target.value)}
                    placeholder={templateCsv}
                    rows={16}
                    disabled={busy}
                  />
                </div>
              ) : (
                <div className="money-site-import-collapse-preview">
                  <span>{csvHasContent ? copy.importForm.csvReady : copy.importForm.csvHidden}</span>
                </div>
              )}
            </div>

            <div className="management-field money-site-import-template-card money-site-import-collapse-card">
              <div className="money-site-import-collapse-header">
                <div className="money-site-import-collapse-copy">
                  <label htmlFor="content-pool-import-sample">{copy.importForm.templatePreview}</label>
                  <span className="money-site-import-collapse-meta">
                    {copy.importForm.templateLines(templateLineCount)}
                  </span>
                </div>
              </div>
              {showImportEditors ? (
                <div className="money-site-import-collapse-body">
                  <textarea id="content-pool-import-sample" value={templateCsv} readOnly rows={16} />
                </div>
              ) : (
                <div className="money-site-import-collapse-preview">
                  <span>{copy.importForm.templateHidden}</span>
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
              <h2>{copy.importForm.importPreview}</h2>
              <p>
                {previewLoading
                  ? copy.importForm.checkingRows
                  : previewError
                    ? previewError
                    : previewData
                      ? formatSummary(previewData.summary, copy)
                      : copy.importForm.uploadToPreview}
              </p>
            </div>
            <div className="management-inline-actions money-site-import-header-actions">
              <span className="management-badge is-active money-site-import-header-badge">
                {copy.importForm.readyCount(readyCount)}
              </span>
              <span className="management-badge money-site-import-header-badge">
                {copy.importForm.filteredCount(filteredSummary.total)}
              </span>
              <button
                type="button"
                className="management-button-secondary money-site-import-primary-action"
                onClick={() => {
                  setAcknowledged(false);
                  setShowConfirmModal(true);
                }}
                disabled={busy || previewLoading || !readyCount}
              >
                {copy.importForm.importAction}
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
                <span>{copy.importForm.cards.ready}</span>
                <strong>{readyCount}</strong>
              </button>
              <button
                type="button"
                className={`money-site-import-summary-card is-new ${actionFilter === "new" ? "is-selected" : ""}`}
                onClick={() => handleActionFilterChange("new")}
              >
                <span>{copy.importForm.cards.new}</span>
                <strong>{previewData.summary.newCount || 0}</strong>
              </button>
              <button
                type="button"
                className={`money-site-import-summary-card is-update ${actionFilter === "update" ? "is-selected" : ""}`}
                onClick={() => handleActionFilterChange("update")}
              >
                <span>{copy.importForm.cards.update}</span>
                <strong>{previewData.summary.updateCount || 0}</strong>
              </button>
              <button
                type="button"
                className={`money-site-import-summary-card is-muted ${actionFilter === "unchanged" ? "is-selected" : ""}`}
                onClick={() => handleActionFilterChange("unchanged")}
              >
                <span>{copy.importForm.cards.unchanged}</span>
                <strong>{previewData.summary.unchangedCount || 0}</strong>
              </button>
              <button
                type="button"
                className={`money-site-import-summary-card is-invalid ${actionFilter === "invalid" ? "is-selected" : ""}`}
                onClick={() => handleActionFilterChange("invalid")}
              >
                <span>{copy.importForm.cards.invalid}</span>
                <strong>{previewData.summary.invalidCount || 0}</strong>
              </button>
            </div>
          ) : null}

          {hasPreview ? (
            <div className="money-site-import-filter-bar">
              <div className="management-search">
                <label htmlFor="content-pool-import-search">{copy.importForm.searchPreview}</label>
                <input
                  id="content-pool-import-search"
                  type="search"
                  value={previewSearch}
                  onChange={(event) => setPreviewSearch(event.target.value)}
                  placeholder={copy.importForm.searchPlaceholder}
                />
              </div>
              <div className="money-site-import-filter-actions">
                <div className="money-site-import-filter-pills">
                  <button
                    type="button"
                    className={`money-site-import-filter-pill ${actionFilter === "all" ? "is-active" : ""}`}
                    onClick={() => setActionFilter("all")}
                  >
                    <span>{copy.importForm.all}</span>
                    <strong>{previewData.summary.totalRows || 0}</strong>
                  </button>
                  <button
                    type="button"
                    className={`money-site-import-filter-pill ${actionFilter === "actionable" ? "is-active" : ""}`}
                    onClick={() => handleActionFilterChange("actionable")}
                  >
                    <span>{copy.importForm.ready}</span>
                    <strong>{readyCount}</strong>
                  </button>
                  <button
                    type="button"
                    className={`money-site-import-filter-pill ${actionFilter === "new" ? "is-active" : ""}`}
                    onClick={() => handleActionFilterChange("new")}
                  >
                    <span>{copy.importForm.cards.new}</span>
                    <strong>{previewData.summary.newCount || 0}</strong>
                  </button>
                  <button
                    type="button"
                    className={`money-site-import-filter-pill ${actionFilter === "update" ? "is-active" : ""}`}
                    onClick={() => handleActionFilterChange("update")}
                  >
                    <span>{copy.importForm.cards.update}</span>
                    <strong>{previewData.summary.updateCount || 0}</strong>
                  </button>
                  <button
                    type="button"
                    className={`money-site-import-filter-pill ${actionFilter === "unchanged" ? "is-active" : ""}`}
                    onClick={() => handleActionFilterChange("unchanged")}
                  >
                    <span>{copy.importForm.cards.unchanged}</span>
                    <strong>{previewData.summary.unchangedCount || 0}</strong>
                  </button>
                  <button
                    type="button"
                    className={`money-site-import-filter-pill ${actionFilter === "invalid" ? "is-active" : ""}`}
                    onClick={() => handleActionFilterChange("invalid")}
                  >
                    <span>{copy.importForm.cards.invalid}</span>
                    <strong>{previewData.summary.invalidCount || 0}</strong>
                  </button>
                </div>
                {hasActivePreviewFilters ? (
                  <button
                    type="button"
                    className="management-button-secondary money-site-import-filter-reset"
                    onClick={handleResetPreviewFilters}
                    title={copy.importForm.resetPreviewFilters}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {hasPreview && filteredRows.length ? (
            <>
              <div className="management-table-wrap money-site-import-table-wrap">
                <table className="brands-management-table money-site-import-table">
                  <thead>
                    <tr>
                      <th>{copy.importForm.tableHeaders.row}</th>
                      <th>{copy.importForm.tableHeaders.incoming}</th>
                      <th>{copy.importForm.tableHeaders.current}</th>
                      <th>{copy.importForm.tableHeaders.difference}</th>
                      <th>{copy.importForm.tableHeaders.result}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr
                        key={`row-${row.rowNumber}-${row.brandName}-${row.title}`}
                        className={`money-site-import-row is-${normalizeActionFilter(row)}`}
                      >
                        <td>
                          <div className="management-stack">
                            <strong>{copy.importForm.rowLabel(row.rowNumber)}</strong>
                            <span className={getActionBadgeClass(row)}>{getActionLabel(row, copy)}</span>
                            <span className="management-checkbox-meta">{normalizeActionFilter(row)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="management-stack money-site-import-record-cell">
                            <strong>{row.title || "-"}</strong>
                            <span className="money-site-import-subline">{`${copy.importForm.fieldLabels.brand}: ${row.brandName || "-"}`}</span>
                            <span className="money-site-import-subline">{`${copy.importForm.fieldLabels.description}: ${formatOptionalField(row.description)}`}</span>
                            <span className="money-site-import-subline">{`${copy.importForm.fieldLabels.note}: ${formatOptionalField(row.note)}`}</span>
                            <span className="money-site-import-subline">{`${copy.importForm.fieldLabels.content}: ${copy.common.words(row.contentWordCount || 0)}`}</span>
                            <span className="money-site-import-subline">{`${copy.importForm.fieldLabels.preview}: ${formatOptionalField(row.contentPreview)}`}</span>
                            <span className="money-site-import-subline">{formatResourceSummary(row.resources, copy)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="management-stack money-site-import-record-cell">
                            <strong>{row.existing?.title || copy.importForm.noExistingRecord}</strong>
                            {row.existing ? (
                              <>
                                <span className="money-site-import-subline">{`${copy.importForm.fieldLabels.brand}: ${row.existing.brandName || "-"}`}</span>
                                <span className="money-site-import-subline">{`${copy.importForm.fieldLabels.description}: ${formatOptionalField(row.existing.description)}`}</span>
                                <span className="money-site-import-subline">{`${copy.importForm.fieldLabels.note}: ${formatOptionalField(row.existing.note)}`}</span>
                                <span className="money-site-import-subline">{`${copy.importForm.fieldLabels.content}: ${copy.common.words(row.existing.contentWordCount || 0)}`}</span>
                                <span className="money-site-import-subline">{`${copy.importForm.fieldLabels.preview}: ${formatOptionalField(row.existing.contentPreview)}`}</span>
                                <span className="money-site-import-subline">{formatResourceSummary(row.existing.resources, copy)}</span>
                              </>
                            ) : (
                              <span className="money-site-import-subline">{copy.importForm.noExistingRecord}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="management-stack money-site-import-diff-cell">
                            <strong>
                              {row.errors?.length
                                ? copy.importForm.needsCorrection
                                : buildPreviewRowMessage(row, canUpdateExisting, copy)}
                            </strong>
                            <span className="money-site-import-subline">{formatChangeSummary(row)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="management-stack">
                            <span className={getActionBadgeClass(row)}>{getActionLabel(row, copy)}</span>
                            <span className="money-site-import-subline">
                              {row.errors?.length
                                ? row.errors.join(" | ")
                                : row.willImport
                                  ? copy.importForm.rowWillBeApplied
                                  : copy.importForm.rowWillNotChange}
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
                    key={`mobile-${row.rowNumber}-${row.brandName}-${row.title}`}
                    className={`money-site-import-mobile-card is-${normalizeActionFilter(row)}`}
                  >
                    <div className="money-site-import-mobile-card-header">
                      <strong>{copy.importForm.rowLabel(row.rowNumber)}</strong>
                      <span className={getActionBadgeClass(row)}>{getActionLabel(row, copy)}</span>
                    </div>

                    <div className="money-site-import-mobile-grid">
                      <div className="money-site-import-mobile-block">
                        <span>{copy.importForm.incoming}</span>
                        <strong>{row.title || "-"}</strong>
                        <small>{`${copy.importForm.fieldLabels.brand}: ${row.brandName || "-"}`}</small>
                        <small>{`${copy.importForm.fieldLabels.description}: ${formatOptionalField(row.description)}`}</small>
                        <small>{`${copy.importForm.fieldLabels.note}: ${formatOptionalField(row.note)}`}</small>
                        <small>{`${copy.importForm.fieldLabels.content}: ${copy.common.words(row.contentWordCount || 0)}`}</small>
                        <small>{`${copy.importForm.fieldLabels.preview}: ${formatOptionalField(row.contentPreview)}`}</small>
                        <small>{formatResourceSummary(row.resources, copy)}</small>
                      </div>

                      <div className="money-site-import-mobile-block">
                        <span>{copy.importForm.current}</span>
                        <strong>{row.existing?.title || copy.importForm.noExistingRecord}</strong>
                        {row.existing ? (
                          <>
                            <small>{`${copy.importForm.fieldLabels.brand}: ${row.existing.brandName || "-"}`}</small>
                            <small>{`${copy.importForm.fieldLabels.description}: ${formatOptionalField(row.existing.description)}`}</small>
                            <small>{`${copy.importForm.fieldLabels.note}: ${formatOptionalField(row.existing.note)}`}</small>
                            <small>{`${copy.importForm.fieldLabels.content}: ${copy.common.words(row.existing.contentWordCount || 0)}`}</small>
                            <small>{`${copy.importForm.fieldLabels.preview}: ${formatOptionalField(row.existing.contentPreview)}`}</small>
                            <small>{formatResourceSummary(row.existing.resources, copy)}</small>
                          </>
                        ) : (
                          <small>{copy.importForm.noExistingRecord}</small>
                        )}
                      </div>
                    </div>

                    <div className="money-site-import-mobile-block">
                      <span>{copy.importForm.tableHeaders.difference}</span>
                      <strong>
                        {row.errors?.length
                          ? copy.importForm.needsCorrection
                          : buildPreviewRowMessage(row, canUpdateExisting, copy)}
                      </strong>
                      <small>{formatChangeSummary(row)}</small>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : csvText.trim() && !previewLoading && !previewError ? (
            <p className="management-empty">{copy.importForm.noRowsMatch}</p>
          ) : null}
        </section>
      ) : null}

      {showConfirmModal ? (
        <div className="management-modal-backdrop is-centered" role="presentation">
          <form
            onSubmit={handleSubmit}
            className="app-panel management-form management-modal money-site-import-verify-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="content-pool-import-confirm-title"
          >
            <div className="management-section-header">
              <div>
                <h2 id="content-pool-import-confirm-title">{copy.importForm.confirmTitle}</h2>
                <p>{copy.importForm.confirmDescription}</p>
              </div>
              <div className="management-inline-actions">
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={busy}
                >
                  {copy.common.close}
                </button>
              </div>
            </div>

            <section className="money-site-import-verify-card money-site-import-verify-card-single">
              <div className="money-site-import-verify-summary">
                <div className="money-site-import-verify-pill">
                  <span>{copy.importForm.ready}</span>
                  <strong>{previewData?.summary?.actionableCount || 0}</strong>
                </div>
                <div className="money-site-import-verify-pill">
                  <span>{copy.importForm.cards.new}</span>
                  <strong>{previewData?.summary?.newCount || 0}</strong>
                </div>
                <div className="money-site-import-verify-pill">
                  <span>{copy.importForm.cards.update}</span>
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
                  <strong>{copy.importForm.reviewedConfirmation}</strong>
                </span>
              </label>
            </section>

            <div className="management-actions money-site-import-actions">
              <button
                type="submit"
                className="management-button"
                disabled={busy || !previewData?.summary?.actionableCount || !acknowledged}
              >
                {busy ? copy.importForm.importing : copy.importForm.importAction}
              </button>
              <button
                type="button"
                className="management-button-secondary"
                onClick={() => setShowConfirmModal(false)}
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
