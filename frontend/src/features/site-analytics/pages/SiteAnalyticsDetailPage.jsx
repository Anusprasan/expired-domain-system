import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import { hasPrivilege } from "../../../shared/utils/permissions";
import {
  blockTrackedSiteAnalyticsUrlApi,
  clearTrackedSiteAnalyticsUrlStatsApi,
  deleteTrackedSiteAnalyticsUrlApi,
  getSiteAnalyticsDetailApi,
  getSiteAnalyticsSummaryApi,
  unblockTrackedSiteAnalyticsUrlApi,
} from "../api/siteAnalyticsApi";
import "../../../shared/styles/management.css";

const RECENT_PAGE_SIZE = 50;

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

function calculatePercent(value, total) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeValue = Math.max(0, Number(value) || 0);

  if (!safeTotal) {
    return 0;
  }

  return Math.max(0, Math.min(100, (safeValue / safeTotal) * 100));
}

function formatPercent(value, locale) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    Math.max(0, Number(value) || 0)
  )}%`;
}

function getMaxCount(items = []) {
  return items.reduce((maxValue, item) => Math.max(maxValue, Number(item?.count) || 0), 0);
}

function getBarWidth(value, maxValue) {
  const safeMaxValue = Math.max(0, Number(maxValue) || 0);
  const safeValue = Math.max(0, Number(value) || 0);

  if (!safeMaxValue || !safeValue) {
    return "0%";
  }

  return `${Math.max(10, Math.min(100, (safeValue / safeMaxValue) * 100))}%`;
}

function formatSourceLabel(value, copy) {
  if (value === "amp") {
    return copy.amp;
  }

  if (value === "pixel") {
    return copy.pixel;
  }

  return copy.script;
}

function formatTrafficLabel(value, copy) {
  if (value === "bot") {
    return copy.bot;
  }

  if (value === "unknown") {
    return copy.unknown;
  }

  return copy.human;
}

function formatDeviceType(value, copy, fallback = "Unknown") {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return copy?.[normalizedValue] || copy?.unknown || fallback;
}

function truncateDeviceId(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "-";
  }

  if (normalizedValue.length <= 18) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 8)}...${normalizedValue.slice(-6)}`;
}

function summarizeUserAgent(value, fallback = "-") {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (!normalizedValue) {
    return fallback;
  }

  const browser =
    (normalizedValue.includes("edg/") && "Edge")
    || (normalizedValue.includes("chrome/") && "Chrome")
    || (normalizedValue.includes("firefox/") && "Firefox")
    || (
      normalizedValue.includes("safari/")
      && !normalizedValue.includes("chrome/")
      && "Safari"
    )
    || ((normalizedValue.includes("opera") || normalizedValue.includes("opr/")) && "Opera")
    || "";

  const platform =
    (normalizedValue.includes("iphone") && "iPhone")
    || (normalizedValue.includes("ipad") && "iPad")
    || (normalizedValue.includes("android") && "Android")
    || (normalizedValue.includes("windows") && "Windows")
    || ((normalizedValue.includes("mac os") || normalizedValue.includes("macintosh")) && "macOS")
    || (normalizedValue.includes("linux") && "Linux")
    || "";

  return [browser, platform].filter(Boolean).join(" / ") || fallback;
}

function ComparisonBar({ label, value, maxValue, meta, tone = "default" }) {
  return (
    <div className="site-analytics-comparison-row">
      <div className="site-analytics-comparison-copy">
        <span>{label}</span>
        <strong>{meta}</strong>
      </div>
      <div className="site-analytics-comparison-track">
        <span
          className={`site-analytics-comparison-fill is-${tone}`}
          style={{ width: getBarWidth(value, maxValue) }}
        />
      </div>
    </div>
  );
}

export default function SiteAnalyticsDetailPage() {
  const { copy, language } = useUiLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const analyticsCopy = copy.siteAnalytics;
  const commonCopy = copy.common;
  const locale = language === "indonesian" ? "id-ID" : "en-US";
  const canManageAnalytics = hasPrivilege(user, "MANAGE_SITE_ANALYTICS");
  const selectedMainUrl = searchParams.get("mainUrl") || "";

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [recentPage, setRecentPage] = useState(1);
  const [summaryData, setSummaryData] = useState(createEmptySummaryData);
  const [detailData, setDetailData] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedSummaryItem = useMemo(
    () => (summaryData.items || []).find((item) => item.mainUrl === selectedMainUrl) || null,
    [selectedMainUrl, summaryData.items]
  );

  const fetchSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      setError("");
      const response = await getSiteAnalyticsSummaryApi();
      setSummaryData(response.data || createEmptySummaryData());
    } catch (requestError) {
      setError(requestError.response?.data?.message || analyticsCopy.page.loadErrorFallback);
      setSummaryData(createEmptySummaryData());
    } finally {
      setSummaryLoading(false);
    }
  }, [analyticsCopy.page.loadErrorFallback]);

  const fetchDetail = useCallback(
    async (mainUrl, pageNumber = 1) => {
      if (!mainUrl) {
        setDetailData(null);
        setDetailLoading(false);
        return;
      }

      try {
        setDetailLoading(true);
        setError("");
        const response = await getSiteAnalyticsDetailApi(mainUrl, {
          page: pageNumber,
          pageSize: RECENT_PAGE_SIZE,
        });
        setDetailData(response.data || null);
      } catch (requestError) {
        setError(requestError.response?.data?.message || analyticsCopy.detail.loadErrorFallback);
        setDetailData(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [analyticsCopy.detail.loadErrorFallback]
  );

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (summaryLoading) {
      return;
    }

    const items = summaryData.items || [];

    if (!items.length) {
      return;
    }

    const hasSelectedUrl = items.some((item) => item.mainUrl === selectedMainUrl);

    if (!selectedMainUrl || !hasSelectedUrl) {
      setRecentPage(1);
      setSearchParams({ mainUrl: items[0].mainUrl }, { replace: true });
    }
  }, [selectedMainUrl, setSearchParams, summaryData.items, summaryLoading]);

  useEffect(() => {
    if (!selectedMainUrl) {
      return;
    }

    void fetchDetail(selectedMainUrl, recentPage);
  }, [fetchDetail, recentPage, selectedMainUrl]);

  const refreshSummarySelection = useCallback(
    async (preferredMainUrl = selectedMainUrl) => {
      const response = await getSiteAnalyticsSummaryApi();
      const nextSummaryData = response.data || createEmptySummaryData();
      setSummaryData(nextSummaryData);

      const nextItems = nextSummaryData.items || [];

      if (!nextItems.length) {
        navigate("/site-analytics", { replace: true });
        return "";
      }

      const nextMainUrl = nextItems.some((item) => item.mainUrl === preferredMainUrl)
        ? preferredMainUrl
        : nextItems[0].mainUrl;

      if (nextMainUrl !== selectedMainUrl) {
        setRecentPage(1);
        setSearchParams({ mainUrl: nextMainUrl }, { replace: true });
      }

      return nextMainUrl;
    },
    [navigate, selectedMainUrl, setSearchParams]
  );

  const handleRefreshDetail = useCallback(async () => {
    try {
      setSummaryLoading(true);
      setError("");
      const nextMainUrl = await refreshSummarySelection(selectedMainUrl);

      if (nextMainUrl) {
        await fetchDetail(nextMainUrl, recentPage);
      } else {
        setDetailData(null);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || analyticsCopy.detail.loadErrorFallback);
    } finally {
      setSummaryLoading(false);
    }
  }, [
    analyticsCopy.detail.loadErrorFallback,
    fetchDetail,
    recentPage,
    refreshSummarySelection,
    selectedMainUrl,
  ]);

  const handleSelectMainUrl = (value) => {
    setRecentPage(1);
    setSearchParams({ mainUrl: value });
  };

  const handleManagedAction = async (action) => {
    if (!selectedMainUrl || !canManageAnalytics) {
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
      setActionLoading(action);
      setError("");
      setSuccessMessage("");

      await config.apiCall({
        mainUrl: selectedMainUrl,
        pageTitle: selectedSummaryItem?.pageTitle || detailData?.summary?.pageTitle || "",
      });

      const nextMainUrl = await refreshSummarySelection(selectedMainUrl);

      if (nextMainUrl && nextMainUrl === selectedMainUrl) {
        setRecentPage(1);
        await fetchDetail(nextMainUrl, 1);
      }

      setSuccessMessage(config.successText);
    } catch (requestError) {
      setError(requestError.response?.data?.message || config.pendingText);
    } finally {
      setActionLoading("");
    }
  };

  const selectedSummary = detailData?.summary || selectedSummaryItem || null;
  const trafficBreakdownMap = useMemo(() => {
    const map = {
      human: 0,
      bot: 0,
      unknown: 0,
    };

    for (const entry of detailData?.trafficBreakdown || []) {
      if (entry?.trafficType && Object.hasOwn(map, entry.trafficType)) {
        map[entry.trafficType] = Number(entry.count) || 0;
      }
    }

    return map;
  }, [detailData?.trafficBreakdown]);
  const trafficComparison = useMemo(
    () => [
      {
        key: "human",
        label: analyticsCopy.filters.human,
        count: trafficBreakdownMap.human,
        tone: "success",
      },
      {
        key: "bot",
        label: analyticsCopy.filters.bot,
        count: trafficBreakdownMap.bot,
        tone: "danger",
      },
      {
        key: "unknown",
        label: analyticsCopy.filters.unknown,
        count: trafficBreakdownMap.unknown,
        tone: "muted",
      },
    ],
    [
      analyticsCopy.filters.bot,
      analyticsCopy.filters.human,
      analyticsCopy.filters.unknown,
      trafficBreakdownMap.bot,
      trafficBreakdownMap.human,
      trafficBreakdownMap.unknown,
    ]
  );
  const sourceComparison = useMemo(
    () =>
      ["script", "amp", "pixel"].map((sourceKey) => ({
        key: sourceKey,
        label: formatSourceLabel(sourceKey, analyticsCopy.sources),
        count:
          detailData?.sourceBreakdown?.find((entry) => entry.source === sourceKey)?.count || 0,
        tone: sourceKey === "script" ? "primary" : sourceKey === "amp" ? "accent" : "muted",
      })),
    [analyticsCopy.sources, detailData?.sourceBreakdown]
  );
  const engagementComparison = useMemo(
    () => [
      {
        key: "pageviews",
        label: analyticsCopy.detail.summary.pageviews,
        count: Number(selectedSummary?.pageviews) || 0,
        tone: "primary",
      },
      {
        key: "uniqueViews",
        label: analyticsCopy.detail.summary.uniqueViews,
        count: Number(selectedSummary?.uniqueViews) || 0,
        tone: "accent",
      },
      {
        key: "clicks",
        label: analyticsCopy.detail.summary.clicks,
        count: Number(selectedSummary?.clicks) || 0,
        tone: "success",
      },
    ],
    [
      analyticsCopy.detail.summary.clicks,
      analyticsCopy.detail.summary.pageviews,
      analyticsCopy.detail.summary.uniqueViews,
      selectedSummary?.clicks,
      selectedSummary?.pageviews,
      selectedSummary?.uniqueViews,
    ]
  );
  const trafficTotal = useMemo(
    () => trafficComparison.reduce((total, item) => total + (Number(item.count) || 0), 0),
    [trafficComparison]
  );
  const clickRate = calculatePercent(selectedSummary?.clicks, selectedSummary?.pageviews);
  const returningViewRate = calculatePercent(
    (Number(selectedSummary?.pageviews) || 0) - (Number(selectedSummary?.uniqueViews) || 0),
    selectedSummary?.pageviews
  );
  const humanTrafficRate = calculatePercent(trafficBreakdownMap.human, trafficTotal);
  const topClickMax = getMaxCount(detailData?.topClicks || []);
  const topReferrerMax = getMaxCount(detailData?.topReferrers || []);
  const topDevicePageMax = getMaxCount(detailData?.topDevicePages || []);
  const topVisitMax = getMaxCount(detailData?.topVisits || []);
  const mostClickedLink = detailData?.topClicks?.[0] || null;
  const recentPagination = detailData?.recentPagination || {
    page: 1,
    totalPages: 1,
    totalItems: 0,
    latestLimit: 1000,
  };

  return (
    <div className="management-page site-analytics-page site-analytics-detail-page">
      <section className="app-panel management-header">
        <div>
          <h1>{analyticsCopy.detail.pageTitle}</h1>
          <p>{analyticsCopy.detail.pageDescription}</p>
        </div>
        <div className="management-header-actions">
          <button
            type="button"
            className="management-button-secondary site-analytics-header-action"
            onClick={() => navigate("/site-analytics")}
          >
            {analyticsCopy.detail.backToList}
          </button>
          <button
            type="button"
            className="management-button-secondary site-analytics-header-action"
            onClick={() => void handleRefreshDetail()}
            disabled={summaryLoading || detailLoading}
          >
            {analyticsCopy.detail.refresh}
          </button>
        </div>
      </section>

      <ToastNotice message={error} onClose={() => setError("")} />
      <ToastNotice
        message={successMessage}
        tone="success"
        onClose={() => setSuccessMessage("")}
      />

      {summaryLoading ? (
        <section className="app-panel management-state">
          <h2>{commonCopy.loading}</h2>
          <p>{analyticsCopy.page.loadingDescription}</p>
        </section>
      ) : !(summaryData.items || []).length ? (
        <section className="app-panel management-state">
          <h2>{analyticsCopy.table.title}</h2>
          <p>{analyticsCopy.table.empty}</p>
        </section>
      ) : (
        <>
          <section className="app-panel management-form">
            <div className="site-analytics-detail-toolbar">
              <div className="management-search site-analytics-detail-select">
                <label htmlFor="site-analytics-detail-select">
                  {analyticsCopy.detail.selectUrl}
                </label>
                <select
                  id="site-analytics-detail-select"
                  value={selectedMainUrl}
                  onChange={(event) => handleSelectMainUrl(event.target.value)}
                >
                  {(summaryData.items || []).map((item) => (
                    <option key={item.mainUrl} value={item.mainUrl}>
                      {item.pageTitle || analyticsCopy.detail.unknownTitle} - {item.mainUrl}
                    </option>
                  ))}
                </select>
              </div>

              <div className="site-analytics-detail-actions">
                {selectedMainUrl ? (
                  <a
                    className="management-button-secondary site-analytics-header-action site-analytics-link-action"
                    href={selectedMainUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {analyticsCopy.detail.openUrl}
                  </a>
                ) : null}

                {canManageAnalytics ? (
                  <>
                    <button
                      type="button"
                      className="management-button-secondary site-analytics-header-action"
                      onClick={() => void handleManagedAction("clear")}
                      disabled={actionLoading !== "" || !selectedSummary?.totalEvents}
                    >
                      {actionLoading === "clear"
                        ? analyticsCopy.detail.actions.clearing
                        : analyticsCopy.detail.actions.clearStats}
                    </button>
                    <button
                      type="button"
                      className="management-button-secondary site-analytics-header-action"
                      onClick={() =>
                        void handleManagedAction(selectedSummary?.isBlocked ? "unblock" : "block")
                      }
                      disabled={actionLoading !== ""}
                    >
                      {actionLoading === "block"
                        ? analyticsCopy.detail.actions.blocking
                        : actionLoading === "unblock"
                          ? analyticsCopy.detail.actions.unblocking
                          : selectedSummary?.isBlocked
                            ? analyticsCopy.detail.actions.unblock
                            : analyticsCopy.detail.actions.block}
                    </button>
                    <button
                      type="button"
                      className="management-button-secondary is-danger site-analytics-header-action"
                      onClick={() => void handleManagedAction("delete")}
                      disabled={actionLoading !== ""}
                    >
                      {actionLoading === "delete"
                        ? analyticsCopy.detail.actions.deleting
                        : analyticsCopy.detail.actions.deleteUrl}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          {detailLoading || !selectedSummary ? (
            <section className="app-panel management-state">
              <h2>{commonCopy.loading}</h2>
              <p>{analyticsCopy.detail.loadingDescription}</p>
            </section>
          ) : (
            <>
              <section className="app-panel management-form site-analytics-fullview-panel">
                <section className="site-analytics-hero-card">
                  <div className="site-analytics-hero-copy">
                    <span className="site-analytics-hero-eyebrow">
                      {analyticsCopy.detail.fullView}
                    </span>
                    <h3>{selectedSummary.pageTitle || analyticsCopy.detail.unknownTitle}</h3>
                    <p className="site-analytics-url">{selectedSummary.mainUrl}</p>
                    <div className="site-analytics-badge-row">
                      <span
                        className={`management-badge${
                          selectedSummary.isBlocked ? " is-inactive" : " is-active"
                        }`}
                      >
                        {selectedSummary.isBlocked
                          ? analyticsCopy.detail.statusBlocked
                          : analyticsCopy.detail.statusActive}
                      </span>
                    </div>
                  </div>
                  <div className="site-analytics-hero-meta">
                    <div className="site-analytics-hero-meta-card">
                      <span>{analyticsCopy.detail.firstSeen}</span>
                      <strong>{formatDateTime(selectedSummary.firstSeenAt, locale)}</strong>
                    </div>
                    <div className="site-analytics-hero-meta-card">
                      <span>{analyticsCopy.detail.lastSeen}</span>
                      <strong>{formatDateTime(selectedSummary.lastSeenAt, locale)}</strong>
                    </div>
                  </div>
                </section>

                <div className="management-overview-grid">
                  <section className="management-overview-card">
                    <div className="management-overview-card-header">
                      <strong>{analyticsCopy.detail.summary.pageviews}</strong>
                      <span>{formatCount(selectedSummary.pageviews, locale)}</span>
                    </div>
                  </section>
                  <section className="management-overview-card">
                    <div className="management-overview-card-header">
                      <strong>{analyticsCopy.detail.summary.uniqueViews}</strong>
                      <span>{formatCount(selectedSummary.uniqueViews, locale)}</span>
                    </div>
                  </section>
                  <section className="management-overview-card">
                    <div className="management-overview-card-header">
                      <strong>{analyticsCopy.detail.summary.clicks}</strong>
                      <span>{formatCount(selectedSummary.clicks, locale)}</span>
                    </div>
                  </section>
                  <section className="management-overview-card">
                    <div className="management-overview-card-header">
                      <strong>{analyticsCopy.detail.summary.uniqueDevices}</strong>
                      <span>{formatCount(selectedSummary.uniqueDeviceCount, locale)}</span>
                    </div>
                  </section>
                </div>

                <section className="site-analytics-detail-card">
                  <div className="site-analytics-card-heading">
                    <h3>{analyticsCopy.detail.topVisitsTitle}</h3>
                  </div>
                  <p>{analyticsCopy.detail.topVisitsDescription}</p>

                  {detailData.topVisits?.length ? (
                    <div className="site-analytics-list">
                      {detailData.topVisits.map((entry) => (
                        <div key={entry.mainUrl} className="site-analytics-list-row">
                          <div className="site-analytics-device-page-copy">
                            <strong>{entry.pageTitle || analyticsCopy.detail.unknownTitle}</strong>
                            <span className="site-analytics-url">{entry.mainUrl}</span>
                            <div className="site-analytics-device-page-meta">
                              {entry.mainUrl === selectedSummary.mainUrl ? (
                                <span className="management-badge">
                                  {analyticsCopy.detail.currentUrl}
                                </span>
                              ) : null}
                              <span>
                                {formatCount(entry.uniqueDeviceCount, locale)}{" "}
                                {analyticsCopy.detail.deviceStats.devices}
                              </span>
                            </div>
                          </div>
                          <div className="site-analytics-mini-track">
                            <span
                              className={`site-analytics-mini-fill${
                                entry.mainUrl === selectedSummary.mainUrl
                                  ? " is-success"
                                  : " is-accent"
                              }`}
                              style={{ width: getBarWidth(entry.count, topVisitMax) }}
                            />
                          </div>
                          <strong>{formatCount(entry.count, locale)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="management-empty">{analyticsCopy.detail.topVisitsEmpty}</p>
                  )}
                </section>

                <div className="site-analytics-visual-grid">
                  <section className="site-analytics-detail-card">
                    <div className="site-analytics-card-heading">
                      <h3>{analyticsCopy.detail.trafficMixTitle}</h3>
                    </div>
                    <div className="site-analytics-comparison-list">
                      {trafficComparison.map((item) => (
                        <ComparisonBar
                          key={item.key}
                          label={item.label}
                          value={item.count}
                          maxValue={Math.max(1, trafficTotal)}
                          meta={`${formatCount(item.count, locale)} / ${formatPercent(
                            calculatePercent(item.count, trafficTotal),
                            locale
                          )}`}
                          tone={item.tone}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="site-analytics-detail-card">
                    <div className="site-analytics-card-heading">
                      <h3>{analyticsCopy.detail.sourceMixTitle}</h3>
                    </div>
                    <div className="site-analytics-comparison-list">
                      {sourceComparison.map((item) => (
                        <ComparisonBar
                          key={item.key}
                          label={item.label}
                          value={item.count}
                          maxValue={Math.max(1, ...sourceComparison.map((entry) => entry.count))}
                          meta={formatCount(item.count, locale)}
                          tone={item.tone}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="site-analytics-detail-card">
                    <div className="site-analytics-card-heading">
                      <h3>{analyticsCopy.detail.engagementTitle}</h3>
                    </div>
                    <div className="site-analytics-comparison-list">
                      {engagementComparison.map((item) => (
                        <ComparisonBar
                          key={item.key}
                          label={item.label}
                          value={item.count}
                          maxValue={Math.max(1, ...engagementComparison.map((entry) => entry.count))}
                          meta={formatCount(item.count, locale)}
                          tone={item.tone}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="site-analytics-detail-card">
                    <div className="site-analytics-card-heading">
                      <h3>{analyticsCopy.detail.ratioTitle}</h3>
                    </div>
                    <div className="site-analytics-ratio-grid">
                      <article className="site-analytics-ratio-card">
                        <span>{analyticsCopy.detail.ratios.clickRate}</span>
                        <strong>{formatPercent(clickRate, locale)}</strong>
                      </article>
                      <article className="site-analytics-ratio-card">
                        <span>{analyticsCopy.detail.ratios.returnRate}</span>
                        <strong>{formatPercent(returningViewRate, locale)}</strong>
                      </article>
                      <article className="site-analytics-ratio-card">
                        <span>{analyticsCopy.detail.ratios.cleanTraffic}</span>
                        <strong>{formatPercent(humanTrafficRate, locale)}</strong>
                      </article>
                    </div>
                  </section>
                </div>

                <div className="site-analytics-detail-grid">
                  <section className="site-analytics-detail-card">
                    <h3>{analyticsCopy.table.headers.url}</h3>
                    <p className="site-analytics-url">{selectedSummary.mainUrl}</p>
                    <div className="site-analytics-badge-row">
                      <span className="management-badge">
                        {formatTrafficLabel("human", analyticsCopy.filters)}:{" "}
                        {formatCount(trafficBreakdownMap.human, locale)}
                      </span>
                      <span className="management-badge is-inactive">
                        {formatTrafficLabel("bot", analyticsCopy.filters)}:{" "}
                        {formatCount(trafficBreakdownMap.bot, locale)}
                      </span>
                      <span className="management-badge">
                        {formatTrafficLabel("unknown", analyticsCopy.filters)}:{" "}
                        {formatCount(trafficBreakdownMap.unknown, locale)}
                      </span>
                    </div>
                    <p className="management-help-text">
                      {selectedSummary.pageTitle || analyticsCopy.detail.unknownTitle}
                    </p>
                  </section>

                  <section className="site-analytics-detail-card">
                    <h3>{analyticsCopy.detail.sourcesTitle}</h3>
                    <div className="site-analytics-list">
                      {(detailData.sourceBreakdown || []).map((entry) => (
                        <div key={entry.source} className="site-analytics-list-row">
                          <span>{formatSourceLabel(entry.source, analyticsCopy.sources)}</span>
                          <strong>{formatCount(entry.count, locale)}</strong>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="site-analytics-detail-card">
                    <h3>{analyticsCopy.detail.referrersTitle}</h3>
                    {detailData.topReferrers?.length ? (
                      <div className="site-analytics-list">
                        {detailData.topReferrers.map((entry) => (
                          <div key={entry.referrer} className="site-analytics-list-row">
                            <div className="site-analytics-list-copy">
                              <span className="site-analytics-url">
                                {entry.referrer || analyticsCopy.detail.direct}
                              </span>
                              <strong>{formatCount(entry.count, locale)}</strong>
                            </div>
                            <div className="site-analytics-mini-track">
                              <span
                                className="site-analytics-mini-fill is-accent"
                                style={{ width: getBarWidth(entry.count, topReferrerMax) }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="management-empty">{analyticsCopy.detail.referrersEmpty}</p>
                    )}
                  </section>

                  <section className="site-analytics-detail-card">
                    <h3>{analyticsCopy.detail.clicksTitle}</h3>
                    {detailData.topClicks?.length ? (
                      <div className="site-analytics-list">
                        {detailData.topClicks.map((entry) => (
                          <div key={entry.clickUrl} className="site-analytics-click-row">
                            <div className="site-analytics-list-copy">
                              <a href={entry.clickUrl} target="_blank" rel="noreferrer">
                                {entry.clickUrl}
                              </a>
                              <span>{entry.clickText || analyticsCopy.detail.internalClick}</span>
                              <strong>{formatCount(entry.count, locale)}</strong>
                            </div>
                            <div className="site-analytics-mini-track">
                              <span
                                className="site-analytics-mini-fill is-success"
                                style={{ width: getBarWidth(entry.count, topClickMax) }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="management-empty">{analyticsCopy.detail.clicksEmpty}</p>
                    )}
                  </section>
                </div>
              </section>

       

              <section className="app-panel management-table site-analytics-recent-panel">
                <div className="management-section-header">
                  <div>
                    <h3>{analyticsCopy.detail.recentTitle}</h3>
                    <p>
                      {analyticsCopy.detail.recentLimitNotice}{" "}
                      {formatCount(recentPagination.latestLimit, locale)}
                    </p>
                  </div>
                </div>

                {detailData.recentEvents?.length ? (
                  <>
                    {mostClickedLink ? (
                      <section className="site-analytics-detail-card site-analytics-most-clicked-card">
                        <div className="site-analytics-card-heading">
                          <h3>{analyticsCopy.detail.mostClickedLinkTitle}</h3>
                          <strong>
                            {formatCount(mostClickedLink.count, locale)}{" "}
                            {analyticsCopy.detail.summary.clicks}
                          </strong>
                        </div>
                        <p>{analyticsCopy.detail.mostClickedLinkDescription}</p>
                        <a
                          className="site-analytics-url"
                          href={mostClickedLink.clickUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {mostClickedLink.clickUrl}
                        </a>
                        <div className="site-analytics-most-clicked-meta">
                          <span>{mostClickedLink.clickText || analyticsCopy.detail.internalClick}</span>
                          <span>
                            {analyticsCopy.detail.lastClicked}:{" "}
                            {formatDateTime(mostClickedLink.lastClickedAt, locale)}
                          </span>
                        </div>
                      </section>
                    ) : null}

                    <div className="management-table-wrap">
                      <table className="site-analytics-events-table">
                        <thead>
                          <tr>
                            <th>{analyticsCopy.detail.headers.time}</th>
                            <th>{analyticsCopy.detail.headers.type}</th>
                            <th>{analyticsCopy.detail.headers.traffic}</th>
                            <th>{analyticsCopy.detail.headers.device}</th>
                            <th>{analyticsCopy.detail.headers.click}</th>
                            <th>{analyticsCopy.detail.headers.referrer}</th>
                            <th>{analyticsCopy.detail.headers.source}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailData.recentEvents.map((event) => (
                            <tr key={event._id}>
                              <td>{formatDateTime(event.occurredAt, locale)}</td>
                              <td>
                                {event.eventType === "click"
                                  ? analyticsCopy.detail.clickEvent
                                  : analyticsCopy.detail.viewEvent}
                              </td>
                              <td>
                                <span
                                  className={`management-badge${
                                    event.trafficType === "bot"
                                      ? " is-inactive"
                                      : event.trafficType === "human"
                                        ? " is-active"
                                        : ""
                                  }`}
                                >
                                  {formatTrafficLabel(event.trafficType, analyticsCopy.filters)}
                                </span>
                              </td>
                              <td>
                                <div className="management-stack">
                                  <span>{truncateDeviceId(event.deviceId)}</span>
                                  <div className="site-analytics-device-page-meta">
                                    <span className="management-badge">
                                      {formatDeviceType(
                                        event.deviceType,
                                        analyticsCopy.detail.deviceTypes
                                      )}
                                    </span>
                                    {event.isUniqueView ? (
                                      <span>{analyticsCopy.detail.uniqueBadge}</span>
                                    ) : null}
                                  </div>
                                  <span>
                                    {summarizeUserAgent(
                                      event.userAgent,
                                      analyticsCopy.detail.deviceProfileUnknown
                                    )}
                                  </span>
                                </div>
                              </td>
                              <td>
                                {event.clickUrl ? (
                                  <div className="management-stack">
                                    <a href={event.clickUrl} target="_blank" rel="noreferrer">
                                      {event.clickUrl}
                                    </a>
                                    <span>{event.clickText || "-"}</span>
                                  </div>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td>{event.referrer || analyticsCopy.detail.direct}</td>
                              <td>{formatSourceLabel(event.source, analyticsCopy.sources)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="site-analytics-pagination">
                      <span>
                        {analyticsCopy.detail.pagination.pageLabel(
                          recentPagination.page,
                          recentPagination.totalPages
                        )}
                      </span>
                      <span>
                        {formatCount(recentPagination.totalItems, locale)} /{" "}
                        {formatCount(recentPagination.latestLimit, locale)}
                      </span>
                      <div className="management-inline-actions">
                        <button
                          type="button"
                          className="management-button-secondary"
                          onClick={() => setRecentPage((currentPage) => Math.max(1, currentPage - 1))}
                          disabled={recentPagination.page <= 1 || detailLoading}
                        >
                          {analyticsCopy.detail.pagination.previous}
                        </button>
                        <button
                          type="button"
                          className="management-button-secondary"
                          onClick={() =>
                            setRecentPage((currentPage) =>
                              Math.min(recentPagination.totalPages, currentPage + 1)
                            )
                          }
                          disabled={
                            recentPagination.page >= recentPagination.totalPages || detailLoading
                          }
                        >
                          {analyticsCopy.detail.pagination.next}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="management-empty">{analyticsCopy.detail.recentEmpty}</p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
