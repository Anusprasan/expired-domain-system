import React, { useMemo, useState } from "react";
import { HiOutlineArrowRightCircle } from "react-icons/hi2";
import DatePicker from "../../../shared/components/DatePicker";
import { useGlobalDateFilter } from "../../../shared/context/GlobalDateContext";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import { useActivityLogs } from "../hooks/useActivityLogs";
import "../../../shared/styles/management.css";

const MODULE_OPTIONS = [
  "auth",
  "navigation",
  "users",
  "groups",
  "brands",
  "money-sites",
  "database-backups",
  "development",
  "reporting",
  "content",
  "site-analytics",
  "website-snapshots",
  "password-resets",
];

const CATEGORY_OPTIONS = ["auth", "navigation", "data"];

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

function formatDuration(value) {
  const duration = Number(value) || 0;
  if (duration <= 0) {
    return "-";
  }
  if (duration < 1000) {
    return `${duration} ms`;
  }

  return `${(duration / 1000).toFixed(1)} s`;
}

function formatLabel(value, labels = {}, tokenLabels = {}) {
  if (!value) {
    return "-";
  }

  const normalizedValue = String(value).trim().toLowerCase();
  if (labels[normalizedValue]) {
    return labels[normalizedValue];
  }

  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-._\s]+/)
    .filter(Boolean)
    .map((part) => tokenLabels[part.toLowerCase()] || (part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function formatMetadata(metadata, emptyLabel, tokenLabels = {}) {
  if (!metadata || typeof metadata !== "object" || !Object.keys(metadata).length) {
    return emptyLabel;
  }

  const lines = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${formatLabel(key, {}, tokenLabels)}: ${String(value)}`)
    .join("\n");

  return lines || emptyLabel;
}

export default function ActivityLogsPage() {
  const { copy, language } = useUiLanguage();
  const logsCopy = copy.activityLogs;
  const locale = language === "indonesian" ? "id-ID" : "en-US";
  const [filters, setFilters] = useState({
    search: "",
    module: "",
    category: "",
    page: 1,
    limit: 25,
  });
  const {
    singleDate,
    useRange,
    fromDate,
    toDate,
    setSingleDate,
    setRangeMode,
    setRange,
  } = useGlobalDateFilter();
  const requestFilters = useMemo(
    () => ({
      ...filters,
      fromDate: useRange ? fromDate : singleDate,
      toDate: useRange ? (toDate || fromDate) : singleDate,
    }),
    [filters, useRange, fromDate, toDate, singleDate]
  );
  const { logs, pagination, loading, error } = useActivityLogs(requestFilters);
  const [selectedLogId, setSelectedLogId] = useState("");
  const loadError =
    error === "Failed to load activity logs" ? logsCopy.page.loadErrorFallback : error;

  const selectedLog = useMemo(
    () => logs.find((item) => item._id === selectedLogId) || null,
    [logs, selectedLogId]
  );

  useEscapeKey(Boolean(selectedLog), () => setSelectedLogId(""));

  const summary = useMemo(() => {
    const actorCount = new Set(
      logs.map((item) => item.actorUserId || item.actorEmail || item.actorName)
    ).size;
    const averageDuration = logs.length
      ? Math.round(
          logs.reduce((total, item) => total + (Number(item.durationMs) || 0), 0) / logs.length
        )
      : 0;

    return {
      actorCount,
      averageDuration,
    };
  }, [logs]);

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === "page" ? value : 1,
    }));
  };

  return (
    <div className="management-page">
      <section className="app-panel management-header">
        <div>
          <h1>{logsCopy.page.title}</h1>
          <p>{logsCopy.page.description}</p>
        </div>
        <div className="management-header-actions">
          <div className="management-summary">
            <strong>{pagination.total}</strong>
            <span>{logsCopy.page.totalMatchingRecords}</span>
          </div>
        </div>
      </section>

      {loadError ? <p className="management-error">{loadError}</p> : null}

      <section className="app-panel management-form activity-logs-filter-panel">
        <div className="management-section-header">
          <div>
            <h2>{logsCopy.filters.title}</h2>
            <p>{logsCopy.filters.description}</p>
          </div>
        </div>

        <div className="activity-logs-filter-grid">
          <div className="management-field">
            <label htmlFor="activity-logs-search">{logsCopy.filters.search}</label>
            <input
              id="activity-logs-search"
              type="search"
              value={filters.search}
              onChange={(event) => handleFilterChange("search", event.target.value)}
              placeholder={logsCopy.filters.searchPlaceholder}
            />
          </div>

          <div className="management-field">
            <label htmlFor="activity-logs-module">{logsCopy.filters.module}</label>
            <select
              id="activity-logs-module"
              value={filters.module}
              onChange={(event) => handleFilterChange("module", event.target.value)}
            >
              <option value="">{logsCopy.filters.allModules}</option>
              {MODULE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option, logsCopy.values.modules, logsCopy.values.tokens)}
                </option>
              ))}
            </select>
          </div>

          <div className="management-field">
            <label htmlFor="activity-logs-category">{logsCopy.filters.category}</label>
            <select
              id="activity-logs-category"
              value={filters.category}
              onChange={(event) => handleFilterChange("category", event.target.value)}
            >
              <option value="">{logsCopy.filters.allCategories}</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option, logsCopy.values.categories, logsCopy.values.tokens)}
                </option>
              ))}
            </select>
          </div>

          <div className="management-field">
            <DatePicker
              id="activity-logs-date"
              label={logsCopy.filters.date}
              singleDate={singleDate}
              useRange={useRange}
              fromDate={fromDate}
              toDate={toDate}
              onSingleDateChange={setSingleDate}
              onRangeModeChange={setRangeMode}
              onRangeChange={setRange}
            />
          </div>

          <div className="management-actions">
            <button
              type="button"
              className="management-button-secondary"
              onClick={() => {
                setSelectedLogId("");
                setFilters({
                  search: "",
                  module: "",
                  category: "",
                  page: 1,
                  limit: 25,
                });
              }}
            >
              {logsCopy.filters.reset}
            </button>
          </div>
        </div>
      </section>

      <div className="management-overview-grid activity-logs-summary-grid">
        <div className="management-overview-card">
          <div className="management-overview-card-header">
            <strong>{logsCopy.summary.loadedRecords}</strong>
            <span>{logs.length}</span>
          </div>
        </div>
        <div className="management-overview-card">
          <div className="management-overview-card-header">
            <strong>{logsCopy.summary.uniqueActors}</strong>
            <span>{summary.actorCount}</span>
          </div>
        </div>
        <div className="management-overview-card">
          <div className="management-overview-card-header">
            <strong>{logsCopy.summary.averageRequestTime}</strong>
            <span>{formatDuration(summary.averageDuration)}</span>
          </div>
        </div>
      </div>

      <section className="app-panel management-table activity-logs-table-panel">
        <div className="management-section-header">
          <div>
            <h2>{logsCopy.table.title}</h2>
            <p>{logsCopy.table.description}</p>
          </div>
        </div>

        {loading ? (
          <p className="management-empty">{logsCopy.table.loading}</p>
        ) : logs.length ? (
          <div className="management-table-wrap activity-logs-table-wrap">
            <table className="activity-logs-table">
              <thead>
                <tr>
                  <th>{logsCopy.table.headers.time}</th>
                  <th>{logsCopy.table.headers.user}</th>
                  <th>{logsCopy.table.headers.module}</th>
                  <th>{logsCopy.table.headers.action}</th>
                  <th>{logsCopy.table.headers.summary}</th>
                  <th>{logsCopy.table.headers.target}</th>
                  <th>{logsCopy.table.headers.duration}</th>
                  <th>{logsCopy.table.headers.details}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((item) => (
                  <tr key={item._id}>
                    <td>{formatDateTime(item.occurredAt, locale)}</td>
                    <td>
                      <div className="management-stack">
                        <strong>{item.actorName || logsCopy.detail.unknownUser}</strong>
                        <span>{item.actorEmail || "-"}</span>
                      </div>
                    </td>
                    <td>
                      <span className="management-badge">
                        {formatLabel(item.module, logsCopy.values.modules, logsCopy.values.tokens)}
                      </span>
                    </td>
                    <td>{formatLabel(item.action, logsCopy.values.actions, logsCopy.values.tokens)}</td>
                    <td>{item.summary}</td>
                    <td>{item.targetLabel || item.routePath || "-"}</td>
                    <td>{formatDuration(item.durationMs)}</td>
                    <td className="activity-logs-table-action-cell">
                      <button
                        type="button"
                        className="activity-logs-open-button"
                        onClick={() => setSelectedLogId(item._id)}
                        aria-label={logsCopy.table.openAria(item.summary)}
                      >
                        <span>{logsCopy.table.open}</span>
                        <HiOutlineArrowRightCircle aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="management-empty">{logsCopy.table.empty}</p>
        )}

        <div className="activity-logs-pagination">
          <button
            type="button"
            className="management-button-secondary"
            onClick={() => handleFilterChange("page", Math.max(1, filters.page - 1))}
            disabled={filters.page <= 1}
          >
            {logsCopy.pagination.previous}
          </button>
          <span>
            {logsCopy.pagination.pageLabel(pagination.page, pagination.totalPages)}
          </span>
          <button
            type="button"
            className="management-button-secondary"
            onClick={() => handleFilterChange("page", Math.min(pagination.totalPages, filters.page + 1))}
            disabled={filters.page >= pagination.totalPages}
          >
            {logsCopy.pagination.next}
          </button>
        </div>
      </section>

      {selectedLog ? (
        <div className="management-modal-backdrop">
          <div
            className="management-modal management-modal-wide activity-logs-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="app-panel management-form activity-logs-detail-panel">
              <div className="management-section-header">
                <div>
                  <h2>{logsCopy.detail.title}</h2>
                  <p>{logsCopy.detail.description}</p>
                </div>
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => setSelectedLogId("")}
                >
                  {logsCopy.detail.close}
                </button>
              </div>

              <div className="activity-log-detail">
                <div className="activity-log-detail-header">
                  <strong>{selectedLog.summary}</strong>
                  <span>{formatDateTime(selectedLog.occurredAt, locale)}</span>
                </div>

                <div className="activity-log-detail-tags">
                  <span className="management-badge">
                    {formatLabel(selectedLog.module, logsCopy.values.modules, logsCopy.values.tokens)}
                  </span>
                  <span className="management-badge">
                    {formatLabel(selectedLog.category, logsCopy.values.categories, logsCopy.values.tokens)}
                  </span>
                  <span className="management-badge">
                    {formatLabel(selectedLog.action, logsCopy.values.actions, logsCopy.values.tokens)}
                  </span>
                </div>

                <dl className="activity-log-detail-grid">
                  <div>
                    <dt>{logsCopy.detail.user}</dt>
                    <dd>{selectedLog.actorName || logsCopy.detail.unknownUser}</dd>
                  </div>
                  <div>
                    <dt>{logsCopy.detail.email}</dt>
                    <dd>{selectedLog.actorEmail || "-"}</dd>
                  </div>
                  <div>
                    <dt>{logsCopy.detail.target}</dt>
                    <dd>{selectedLog.targetLabel || "-"}</dd>
                  </div>
                  <div>
                    <dt>{logsCopy.detail.targetType}</dt>
                    <dd>{formatLabel(selectedLog.targetType, {}, logsCopy.values.tokens)}</dd>
                  </div>
                  <div>
                    <dt>{logsCopy.detail.http}</dt>
                    <dd>{selectedLog.httpMethod || "-"} {selectedLog.statusCode ? `(${selectedLog.statusCode})` : ""}</dd>
                  </div>
                  <div>
                    <dt>{logsCopy.detail.requestTime}</dt>
                    <dd>{formatDuration(selectedLog.durationMs)}</dd>
                  </div>
                  <div>
                    <dt>{logsCopy.detail.route}</dt>
                    <dd>{selectedLog.routePath || "-"}</dd>
                  </div>
                  <div>
                    <dt>{logsCopy.detail.ipAddress}</dt>
                    <dd>{selectedLog.ipAddress || "-"}</dd>
                  </div>
                </dl>

                <div className="activity-log-detail-section">
                  <strong>{logsCopy.detail.details}</strong>
                  <p>{selectedLog.details || logsCopy.detail.detailsEmpty}</p>
                </div>

                <div className="activity-log-detail-section">
                  <strong>{logsCopy.detail.extraContext}</strong>
                  <pre>{formatMetadata(selectedLog.metadata, logsCopy.detail.noExtraContext, logsCopy.values.tokens)}</pre>
                </div>

                <div className="activity-log-detail-section">
                  <strong>{logsCopy.detail.userAgent}</strong>
                  <p>{selectedLog.userAgent || "-"}</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
