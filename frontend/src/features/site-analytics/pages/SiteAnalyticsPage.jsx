import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import { hasPrivilege } from "../../../shared/utils/permissions";
import {
  blockTrackedSiteAnalyticsUrlApi,
  clearTrackedSiteAnalyticsUrlStatsApi,
  deleteTrackedSiteAnalyticsUrlApi,
  getSiteAnalyticsSummaryApi,
  unblockTrackedSiteAnalyticsUrlApi,
} from "../api/siteAnalyticsApi";
import "../../../shared/styles/management.css";

function createEmptySummaryData() {
  return {
    items: [],
    topVisits: [],
    stats: {
      totalUrls: 0,
      totalEvents: 0,
      pageviews: 0,
      uniqueViews: 0,
      clicks: 0,
      botEvents: 0,
      unknownEvents: 0,
      uniqueDeviceCount: 0,
    },
  };
}

function formatDateTime(value, locale, fallback = "-") {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCount(value, locale) {
  return new Intl.NumberFormat(locale).format(Math.max(0, Number(value) || 0));
}

function getMaxCount(items = []) {
  return items.reduce((maxValue, item) => Math.max(maxValue, Number(item?.pageviews || item?.count) || 0), 0);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function buildAbsoluteApiUrl(pathname) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
  return new URL(
    `${String(apiBaseUrl).replace(/\/$/, "")}${pathname}`,
    window.location.origin
  ).toString();
}

export default function SiteAnalyticsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { copy, language } = useUiLanguage();
  const analyticsCopy = copy.siteAnalytics;
  const commonCopy = copy.common;
  const locale = language === "indonesian" ? "id-ID" : "en-US";
  const canManageAnalytics = hasPrivilege(user, "MANAGE_SITE_ANALYTICS");

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [search, setSearch] = useState("");
  const [trafficFilter, setTrafficFilter] = useState("all");
  const [summaryData, setSummaryData] = useState(createEmptySummaryData);
  const [snippetModal, setSnippetModal] = useState("");

  const trackerScriptUrl = useMemo(
    () => buildAbsoluteApiUrl("/site-analytics/tracker.js"),
    []
  );
  const trackerPixelUrl = useMemo(
    () => buildAbsoluteApiUrl("/site-analytics/pixel.gif"),
    []
  );

  const htmlSnippet = useMemo(
    () => `<script defer src="${trackerScriptUrl}"></script>`,
    [trackerScriptUrl]
  );
  const ampSnippet = useMemo(() => {
    const canonicalUrl = "${canonicalUrl}";
    const title = "${title}";
    const referrer = "${documentReferrer}";
    const clientId = "${clientId(m200-site-analytics)}";
    const ampConfig = {
      requests: {
        pageview: `${trackerPixelUrl}?event=pageview&source=amp&mainUrl=${canonicalUrl}&pageTitle=${title}&referrer=${referrer}&deviceId=${clientId}`,
        click: `${trackerPixelUrl}?event=click&source=amp&mainUrl=${canonicalUrl}&pageTitle=${title}&referrer=${referrer}&deviceId=${clientId}`,
      },
      triggers: {
        trackPageview: {
          on: "visible",
          request: "pageview",
        },
        trackLinkClicks: {
          on: "click",
          selector: "a",
          request: "click",
        },
      },
      transport: {
        beacon: false,
        xhrpost: false,
        image: true,
      },
    };

    return [
      '<script async custom-element="amp-analytics" src="https://cdn.ampproject.org/v0/amp-analytics-0.1.js"></script>',
      "<amp-analytics>",
      '<script type="application/json">',
      JSON.stringify(ampConfig, null, 2),
      "</script>",
      "</amp-analytics>",
    ].join("\n");
  }, [trackerPixelUrl]);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await getSiteAnalyticsSummaryApi();
      setSummaryData(response.data || createEmptySummaryData());
    } catch (requestError) {
      setError(requestError.response?.data?.message || analyticsCopy.page.loadErrorFallback);
      setSummaryData(createEmptySummaryData());
    } finally {
      setLoading(false);
    }
  }, [analyticsCopy.page.loadErrorFallback]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEscapeKey(Boolean(snippetModal), () => setSnippetModal(""));

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return (summaryData.items || []).filter((item) => {
      const trafficMatches =
        trafficFilter === "all"
        || (trafficFilter === "human" && (Number(item.pageviews) || 0) > 0)
        || (trafficFilter === "bot" && (Number(item.botEvents) || 0) > 0)
        || (trafficFilter === "unknown" && (Number(item.unknownEvents) || 0) > 0);

      if (!trafficMatches) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        item.mainUrl,
        item.pageTitle,
        item.pageHost,
        item.pagePath,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [search, summaryData.items, trafficFilter]);

  const topVisits = useMemo(() => summaryData.topVisits || [], [summaryData.topVisits]);
  const topVisitMax = useMemo(() => getMaxCount(topVisits), [topVisits]);

  const snippetModalConfig = useMemo(() => {
    if (snippetModal === "html") {
      return {
        title: analyticsCopy.install.modalTitleHtml,
        description: analyticsCopy.install.modalDescriptionHtml,
        snippet: htmlSnippet,
        copyLabel: analyticsCopy.install.copyHtml,
        copySuccess: analyticsCopy.install.copiedHtml,
      };
    }

    if (snippetModal === "amp") {
      return {
        title: analyticsCopy.install.modalTitleAmp,
        description: analyticsCopy.install.modalDescriptionAmp,
        snippet: ampSnippet,
        copyLabel: analyticsCopy.install.copyAmp,
        copySuccess: analyticsCopy.install.copiedAmp,
      };
    }

    return null;
  }, [ampSnippet, analyticsCopy.install, htmlSnippet, snippetModal]);

  const handleCopySnippet = async (text, successLabel) => {
    try {
      setError("");
      setSuccessMessage("");
      await copyText(text);
      setSuccessMessage(successLabel);
    } catch {
      setError(analyticsCopy.install.copyFailed);
    }
  };

  const handleManagedAction = async (action, item) => {
    if (!item?.mainUrl || !canManageAnalytics) {
      return;
    }

    const actionMap = {
      clear: {
        confirmText: analyticsCopy.detail.confirmations.clearStats,
        successText: analyticsCopy.detail.actionSuccess.clearStats,
        pendingText: analyticsCopy.detail.actions.clearing,
        apiCall: clearTrackedSiteAnalyticsUrlStatsApi,
      },
      delete: {
        confirmText: analyticsCopy.detail.confirmations.deleteUrl,
        successText: analyticsCopy.detail.actionSuccess.deleteUrl,
        pendingText: analyticsCopy.detail.actions.deleting,
        apiCall: deleteTrackedSiteAnalyticsUrlApi,
      },
      block: {
        confirmText: analyticsCopy.detail.confirmations.blockUrl,
        successText: analyticsCopy.detail.actionSuccess.blockUrl,
        pendingText: analyticsCopy.detail.actions.blocking,
        apiCall: blockTrackedSiteAnalyticsUrlApi,
      },
      unblock: {
        confirmText: analyticsCopy.detail.confirmations.unblockUrl,
        successText: analyticsCopy.detail.actionSuccess.unblockUrl,
        pendingText: analyticsCopy.detail.actions.unblocking,
        apiCall: unblockTrackedSiteAnalyticsUrlApi,
      },
    };

    const config = actionMap[action];

    if (!config || !window.confirm(config.confirmText)) {
      return;
    }

    try {
      setActionLoading(`${action}:${item.mainUrl}`);
      setError("");
      setSuccessMessage("");
      await config.apiCall({
        mainUrl: item.mainUrl,
        pageTitle: item.pageTitle || "",
      });
      await loadSummary();
      setSuccessMessage(config.successText);
    } catch (requestError) {
      setError(requestError.response?.data?.message || config.pendingText);
    } finally {
      setActionLoading("");
    }
  };

  return (
    <div className="management-page site-analytics-page">
      <section className="app-panel management-header">
        <div>
          <h1>{analyticsCopy.page.title}</h1>
          <p>{analyticsCopy.page.description}</p>
        </div>
        <div className="management-header-actions">
          <button
            type="button"
            className="management-button-secondary site-analytics-header-action"
            onClick={() => setSnippetModal("html")}
          >
            {analyticsCopy.install.openHtml}
          </button>
          <button
            type="button"
            className="management-button-secondary site-analytics-header-action"
            onClick={() => setSnippetModal("amp")}
          >
            {analyticsCopy.install.openAmp}
          </button>
          <button
            type="button"
            className="management-button-secondary site-analytics-header-action"
            onClick={() => void loadSummary()}
            disabled={loading}
          >
            {loading ? analyticsCopy.page.refreshing : analyticsCopy.page.refresh}
          </button>
        </div>
      </section>

      <ToastNotice message={error} onClose={() => setError("")} />
      <ToastNotice
        message={successMessage}
        tone="success"
        onClose={() => setSuccessMessage("")}
      />

      {loading ? (
        <section className="app-panel management-state">
          <h2>{commonCopy.loading}</h2>
          <p>{analyticsCopy.page.loadingDescription}</p>
        </section>
      ) : (
        <>
          <div className="management-overview-grid">
            <section className="management-overview-card">
              <div className="management-overview-card-header">
                <strong>{analyticsCopy.page.totalUrls}</strong>
                <span>{formatCount(summaryData.stats.totalUrls, locale)}</span>
              </div>
            </section>
            <section className="management-overview-card">
              <div className="management-overview-card-header">
                <strong>{analyticsCopy.page.totalPageviews}</strong>
                <span>{formatCount(summaryData.stats.pageviews, locale)}</span>
              </div>
            </section>
            <section className="management-overview-card">
              <div className="management-overview-card-header">
                <strong>{analyticsCopy.page.totalUniqueDevices}</strong>
                <span>{formatCount(summaryData.stats.uniqueDeviceCount, locale)}</span>
              </div>
            </section>
            <section className="management-overview-card">
              <div className="management-overview-card-header">
                <strong>{analyticsCopy.page.totalBotEvents}</strong>
                <span>
                  {formatCount(
                    (Number(summaryData.stats.botEvents) || 0)
                    + (Number(summaryData.stats.unknownEvents) || 0),
                    locale
                  )}
                </span>
              </div>
            </section>
          </div>

          <section className="app-panel management-form">
            <div className="management-section-header">
              <div>
                <h2>{analyticsCopy.page.topVisitsTitle}</h2>
                <p>{analyticsCopy.page.topVisitsDescription}</p>
              </div>
            </div>

            {topVisits.length ? (
              <div className="site-analytics-list">
                {topVisits.map((item) => (
                  <div key={item.mainUrl} className="site-analytics-list-row">
                    <div className="site-analytics-device-page-copy">
                      <strong>{item.pageTitle || analyticsCopy.detail.unknownTitle}</strong>
                      <span className="site-analytics-url">{item.mainUrl}</span>
                      <div className="site-analytics-device-page-meta">
                        {item.isBlocked ? (
                          <span className="management-badge is-inactive">
                            {analyticsCopy.table.blocked}
                          </span>
                        ) : null}
                        <span>
                          {formatCount(item.uniqueDeviceCount, locale)}{" "}
                          {analyticsCopy.detail.deviceStats.devices}
                        </span>
                      </div>
                    </div>
                    <div className="site-analytics-mini-track">
                      <span
                        className={`site-analytics-mini-fill${
                          item.isBlocked ? " is-danger" : " is-success"
                        }`}
                        style={{
                          width: `${Math.max(
                            10,
                            Math.min(100, ((Number(item.pageviews) || 0) / Math.max(1, topVisitMax)) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                    <strong>{formatCount(item.pageviews, locale)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="management-empty">{analyticsCopy.page.topVisitsEmpty}</p>
            )}
          </section>

          <section className="app-panel management-table">
            <div className="management-section-header site-analytics-section-header">
              <div>
                <h2>{analyticsCopy.table.title}</h2>
                <p>{analyticsCopy.table.description}</p>
              </div>
              <div className="site-analytics-toolbar">
                <div className="management-search">
                  <label htmlFor="site-analytics-search">{analyticsCopy.filters.search}</label>
                  <input
                    id="site-analytics-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={analyticsCopy.filters.searchPlaceholder}
                  />
                </div>
                <div className="management-search">
                  <label htmlFor="site-analytics-traffic">{analyticsCopy.filters.traffic}</label>
                  <select
                    id="site-analytics-traffic"
                    value={trafficFilter}
                    onChange={(event) => setTrafficFilter(event.target.value)}
                  >
                    <option value="all">{analyticsCopy.filters.allTraffic}</option>
                    <option value="human">{analyticsCopy.filters.human}</option>
                    <option value="bot">{analyticsCopy.filters.bot}</option>
                    <option value="unknown">{analyticsCopy.filters.unknown}</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredItems.length ? (
              <div className="management-table-wrap">
                <table className="site-analytics-table">
                  <thead>
                    <tr>
                      <th>{analyticsCopy.table.headers.url}</th>
                      <th>{analyticsCopy.table.headers.title}</th>
                      <th>{analyticsCopy.table.headers.pageviews}</th>
                      <th>{analyticsCopy.table.headers.uniqueDevices}</th>
                      <th>{analyticsCopy.table.headers.clicks}</th>
                      <th>{analyticsCopy.table.headers.bots}</th>
                      <th>{analyticsCopy.table.headers.lastSeen}</th>
                      <th>{analyticsCopy.table.headers.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item) => {
                      const actionToken = `${item.mainUrl}`;
                      return (
                        <tr key={item.mainUrl}>
                          <td>
                            <div className="management-stack">
                              <strong className="site-analytics-url">{item.mainUrl}</strong>
                              <span>{item.pageHost || "-"}</span>
                              {item.isBlocked ? (
                                <span className="management-badge is-inactive">
                                  {analyticsCopy.table.blocked}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td>{item.pageTitle || analyticsCopy.detail.unknownTitle}</td>
                          <td>{formatCount(item.pageviews, locale)}</td>
                          <td>{formatCount(item.uniqueDeviceCount, locale)}</td>
                          <td>{formatCount(item.clicks, locale)}</td>
                          <td>
                            {formatCount(
                              (Number(item.botEvents) || 0) + (Number(item.unknownEvents) || 0),
                              locale
                            )}
                          </td>
                          <td>{formatDateTime(item.lastSeenAt, locale)}</td>
                          <td>
                            <div className="management-inline-actions site-analytics-row-actions">
                              <button
                                type="button"
                                className="management-button-secondary"
                                onClick={() =>
                                  navigate(
                                    `/site-analytics/details?mainUrl=${encodeURIComponent(item.mainUrl)}`
                                  )
                                }
                              >
                                {analyticsCopy.table.open}
                              </button>

                              {canManageAnalytics ? (
                                <>
                                  <button
                                    type="button"
                                    className="management-button-secondary"
                                    onClick={() => void handleManagedAction("clear", item)}
                                    disabled={
                                      actionLoading !== "" || !(Number(item.totalEvents) || Number(item.pageviews) || Number(item.clicks))
                                    }
                                  >
                                    {actionLoading === `clear:${actionToken}`
                                      ? analyticsCopy.detail.actions.clearing
                                      : analyticsCopy.table.clearStats}
                                  </button>
                                  <button
                                    type="button"
                                    className="management-button-secondary"
                                    onClick={() =>
                                      void handleManagedAction(item.isBlocked ? "unblock" : "block", item)
                                    }
                                    disabled={actionLoading !== ""}
                                  >
                                    {actionLoading === `block:${actionToken}`
                                      ? analyticsCopy.detail.actions.blocking
                                      : actionLoading === `unblock:${actionToken}`
                                        ? analyticsCopy.detail.actions.unblocking
                                        : item.isBlocked
                                          ? analyticsCopy.table.unblock
                                          : analyticsCopy.table.block}
                                  </button>
                                  <button
                                    type="button"
                                    className="management-button-secondary is-danger"
                                    onClick={() => void handleManagedAction("delete", item)}
                                    disabled={actionLoading !== ""}
                                  >
                                    {actionLoading === `delete:${actionToken}`
                                      ? analyticsCopy.detail.actions.deleting
                                      : analyticsCopy.table.deleteUrl}
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
            ) : (
              <p className="management-empty">{analyticsCopy.table.empty}</p>
            )}
          </section>
        </>
      )}

      {snippetModalConfig ? (
        <div
          className="management-modal-backdrop is-centered"
          onClick={() => setSnippetModal("")}
        >
          <div
            className="management-modal site-analytics-snippet-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="app-panel management-form">
              <div className="management-section-header">
                <div>
                  <h2>{snippetModalConfig.title}</h2>
                  <p>{snippetModalConfig.description}</p>
                </div>
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => setSnippetModal("")}
                >
                  {analyticsCopy.detail.close}
                </button>
              </div>

              <div className="site-analytics-snippet-modal-body">
                <textarea value={snippetModalConfig.snippet} readOnly rows={18} />
                <div className="management-actions">
                  <button
                    type="button"
                    className="management-button"
                    onClick={() =>
                      void handleCopySnippet(
                        snippetModalConfig.snippet,
                        snippetModalConfig.copySuccess
                      )
                    }
                  >
                    {snippetModalConfig.copyLabel}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
