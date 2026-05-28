import { useEffect, useMemo, useState } from "react";
import { getGoogleRankAnalyticsOverview } from "../api/rankCheckerApi";
import ResultsList from "./ResultsList";

const INDONESIA_TIME_ZONE = "Asia/Jakarta";
const COMPARISON_BUCKETS = [
  {
    key: "top3",
    label: "OWN in Top 3",
    maxRank: 3,
    latestColor: "#14b8a6",
    previousColor: "#99f6e4",
    chipClassName: "border border-teal-200 bg-teal-50 text-teal-700",
  },
  {
    key: "top5",
    label: "OWN in Top 5",
    maxRank: 5,
    latestColor: "#3b82f6",
    previousColor: "#bfdbfe",
    chipClassName: "border border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    key: "top10",
    label: "OWN in Top 10",
    maxRank: 10,
    latestColor: "#8b5cf6",
    previousColor: "#ddd6fe",
    chipClassName: "border border-violet-200 bg-violet-50 text-violet-700",
  },
];

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;

const formatDateTimeWib = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: INDONESIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

const countOwnResultsWithinRank = (run, maxRank) =>
  (run?.results || []).filter(
    (row) => row?.badge === "OWN" && Number.isFinite(Number(row?.rank)) && Number(row.rank) <= maxRank
  ).length;

const getResultUrlLabel = (row) => {
  const matchedDomain = String(row?.matchedDomain?.domain || "").trim();
  if (matchedDomain) return matchedDomain;

  const domainHost = String(row?.domainHost || "").trim();
  if (domainHost) return domainHost;

  const link = String(row?.link || "").trim();
  if (!link) return "";

  try {
    return new URL(link).hostname;
  } catch {
    return link;
  }
};

const getThresholdUrls = (run, maxRank) =>
  Array.from(
    new Set(
      (run?.results || [])
        .filter((row) => row?.badge === "OWN" && Number.isFinite(Number(row?.rank)) && Number(row.rank) <= maxRank)
        .map((row) => getResultUrlLabel(row))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));

const getDifferenceText = (difference) => {
  if (!Number.isFinite(difference) || difference === 0) {
    return "No change from the previous run.";
  }

  if (difference > 0) {
    return `${difference} more OWN result${difference !== 1 ? "s" : ""} than the previous run.`;
  }

  const absolute = Math.abs(difference);
  return `${absolute} fewer OWN result${absolute !== 1 ? "s" : ""} than the previous run.`;
};

const getDifferenceSummaryText = (difference) => {
  if (!Number.isFinite(difference) || difference === 0) {
    return "No change";
  }

  if (difference > 0) {
    return `${difference} more than previous`;
  }

  return `${Math.abs(difference)} fewer than previous`;
};

const getDifferenceToneClassName = (difference) => {
  if (!Number.isFinite(difference) || difference === 0) {
    return "text-slate-500";
  }

  return difference > 0 ? "text-emerald-700" : "text-rose-700";
};

function SummaryCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function RecentRunCard({ run, selected, onSelect }) {
  const rankLabel = run?.bestOwnRank ? `#${run.bestOwnRank}` : "Not found";

  return (
    <button
      type="button"
      onClick={() => onSelect(run?._id)}
      className={`rounded-2xl border p-4 text-left shadow-sm transition ${
        selected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${selected ? "text-slate-300" : "text-slate-500"}`}>
            Checked At
          </p>
          <p className="mt-1 text-sm font-semibold">{formatDateTimeWib(run?.checkedAt)}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            selected ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          {rankLabel}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className={`rounded-xl px-1 py-2 ${selected ? "bg-white/10 text-white" : "bg-slate-50 text-slate-700"}`}>
          <p className={selected ? "text-slate-300" : "text-slate-500"}>OWN</p>
          <p className="mt-1 text-sm font-semibold">{run?.ownCount ?? 0}</p>
        </div>
        <div className={`rounded-xl px-1 py-2 ${selected ? "bg-white/10 text-white" : "bg-slate-50 text-slate-700"}`}>
          <p className={selected ? "text-slate-300" : "text-slate-500"}>Other</p>
          <p className="mt-1 text-sm font-semibold">{run?.unknownCount ?? 0}</p>
        </div>
        <div className={`rounded-xl px-1 py-2 ${selected ? "bg-white/10 text-white" : "bg-slate-50 text-slate-700"}`}>
          <p className={selected ? "text-slate-300" : "text-slate-500"}>View</p>
          <p className="mt-1 text-sm font-semibold">{run?.params?.device || "-"}</p>
        </div>
      </div>
    </button>
  );
}

function ComparisonSection({ latestRun, previousRun, configuredDomainCount }) {
  if (!latestRun || !previousRun) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Latest vs Previous Google Rank Run</h3>
            <p className="mt-1 text-sm text-slate-500">
              At least two saved auto Google Rank runs are needed for comparison.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            Configured Domains: {configuredDomainCount}
          </span>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
          Run Auto Google Rank at least two times for this brand to unlock comparison analytics.
        </div>
      </section>
    );
  }

  const comparisonRows = COMPARISON_BUCKETS.map((bucket) => {
    const latestValue = countOwnResultsWithinRank(latestRun, bucket.maxRank);
    const previousValue = countOwnResultsWithinRank(previousRun, bucket.maxRank);
    const difference = latestValue - previousValue;

    return {
      ...bucket,
      latestValue,
      previousValue,
      difference,
      thresholdUrls: getThresholdUrls(latestRun, bucket.maxRank),
    };
  });

  const chartMax = Math.max(
    1,
    ...comparisonRows.flatMap((row) => [row.latestValue, row.previousValue, row.maxRank])
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Latest vs Previous Google Rank Run</h3>
          <p className="mt-1 text-sm text-slate-500">
            Compare OWN coverage from the latest two saved auto Google Rank runs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            Latest: {formatDateTimeWib(latestRun.checkedAt)}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            Previous: {formatDateTimeWib(previousRun.checkedAt)}
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {comparisonRows.map((row) => {
          const latestPct = (row.latestValue / row.maxRank) * 100;
          const previousPct = (row.previousValue / row.maxRank) * 100;
          const toneClassName = getDifferenceToneClassName(row.difference);

          return (
            <div key={row.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                  <p className="mt-1 text-xs text-slate-500">Threshold: rank #{row.maxRank} or better</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.chipClassName}`}>
                  {getDifferenceSummaryText(row.difference)}
                </span>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-700">
                    <span>Latest</span>
                    <span>{row.latestValue} / {row.maxRank}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${latestPct}%`, backgroundColor: row.latestColor }} />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-700">
                    <span>Previous</span>
                    <span>{row.previousValue} / {row.maxRank}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${previousPct}%`, backgroundColor: row.previousColor }} />
                  </div>
                </div>
              </div>

              <p className={`mt-3 text-xs font-semibold ${toneClassName}`}>{getDifferenceText(row.difference)}</p>

              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">URLs in this stage</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.thresholdUrls.length ? (
                    row.thresholdUrls.map((url) => (
                      <span
                        key={`${row.key}-${url}`}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
                      >
                        {url}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">No OWN URLs in this threshold.</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Comparison Graph</h4>
            <p className="mt-1 text-xs text-slate-500">Latest and previous OWN counts across Top 3, Top 5, and Top 10.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {comparisonRows.map((row) => {
            const latestHeight = `${(row.latestValue / chartMax) * 100}%`;
            const previousHeight = `${(row.previousValue / chartMax) * 100}%`;
            const toneClassName = getDifferenceToneClassName(row.difference);

            return (
              <div key={`${row.key}-graph`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex h-56 items-end justify-center gap-6">
                  <div className="flex w-16 flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">{row.latestValue}</span>
                    <div className="flex h-40 w-full items-end rounded-t-xl bg-slate-50">
                      <div
                        className="w-full rounded-t-xl"
                        style={{
                          height: latestHeight,
                          backgroundColor: row.latestColor,
                          minHeight: row.latestValue > 0 ? "12px" : "0px",
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">Latest</span>
                  </div>

                  <div className="flex w-16 flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">{row.previousValue}</span>
                    <div className="flex h-40 w-full items-end rounded-t-xl bg-slate-50">
                      <div
                        className="w-full rounded-t-xl"
                        style={{
                          height: previousHeight,
                          backgroundColor: row.previousColor,
                          minHeight: row.previousValue > 0 ? "12px" : "0px",
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">Previous</span>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 text-center">
                  <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                  <p className={`mt-1 text-xs font-semibold ${toneClassName}`}>{getDifferenceSummaryText(row.difference)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MissingDomainsSection({ missingDomains = [] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Currently Missing From Top 10</h3>
          <p className="mt-1 text-sm text-slate-500">
            Domains that are not in the latest Top 10 OWN results, and when that missing streak started.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          {missingDomains.length} missing
        </span>
      </div>

      {!missingDomains.length ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-800">
          All configured domains are represented in the latest Top 10 Google Rank results.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Domain</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Missing Since</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Missing Runs</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Last Seen</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Last Seen Rank</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {missingDomains.map((item) => (
                <tr key={item.domainHostKey || item.domain}>
                  <td className="px-4 py-3 font-medium text-slate-900 max-w-[250px] break-words">{item.domain}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDateTimeWib(item.missingSince)}</td>
                  <td className="px-4 py-3 text-slate-700">{item.missingRunCount || 0}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {item.hasEverRanked ? formatDateTimeWib(item.lastSeenAt) : "Never ranked in saved history"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{item.lastSeenRank ? `#${item.lastSeenRank}` : "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.hasEverRanked
                          ? "border border-amber-200 bg-amber-50 text-amber-700"
                          : "border border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {item.hasEverRanked ? "Dropped out" : "Never ranked"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function RankAnalyticsPanel({ selectedBrand }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState("");

  useEffect(() => {
    if (!selectedBrand?._id) {
      setData(null);
      setError("");
      setSelectedRunId("");
      return;
    }

    let cancelled = false;

    const loadOverview = async () => {
      try {
        setLoading(true);
        setError("");
        const payload = await getGoogleRankAnalyticsOverview(selectedBrand._id, 5);
        if (cancelled) return;
        setData(payload);
      } catch (requestError) {
        if (cancelled) return;
        setData(null);
        setError(getErrorMessage(requestError, "Failed to load Google Rank analytics"));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadOverview();

    return () => {
      cancelled = true;
    };
  }, [selectedBrand?._id]);

  useEffect(() => {
    const firstRunId = data?.runs?.[0]?._id || "";
    if (!firstRunId) {
      setSelectedRunId("");
      return;
    }

    const stillExists = (data?.runs || []).some((item) => item._id === selectedRunId);
    if (!stillExists) {
      setSelectedRunId(firstRunId);
    }
  }, [data, selectedRunId]);

  const runs = data?.runs || [];
  const selectedRun = useMemo(
    () => runs.find((item) => item._id === selectedRunId) || runs[0] || null,
    [runs, selectedRunId]
  );
  const latestRun = runs[0] || null;
  const previousRun = runs[1] || null;

  if (!selectedBrand) {
    return (
      <section className="p-4 lg:p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
          Select a brand from the sidebar to view Rank Analytics.
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Rank Analytics</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review saved Auto Google Rank history, compare the latest two runs, and track when configured domains fell out of the Top 10.
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: `${selectedBrand?.color || "#0f172a"}18`,
              color: selectedBrand?.color || "#0f172a",
            }}
          >
            {selectedBrand?.code || selectedBrand?.name || "Selected brand"}
          </span>
        </div>

        {loading ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Loading Google Rank analytics...
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </section>

      {!loading && !error ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Configured Domains"
              value={data?.configuredDomainCount ?? 0}
              hint="Active domains saved under this brand"
            />
            <SummaryCard
              label="Tracked Auto Runs"
              value={data?.totalRuns ?? 0}
              hint="Saved Auto Google Rank history entries"
            />
            <SummaryCard
              label="Latest Best Rank"
              value={latestRun?.bestOwnRank ? `#${latestRun.bestOwnRank}` : "Not found"}
              hint="Best OWN rank from the latest saved run"
            />
            <SummaryCard
              label="Latest Checked"
              value={data?.latestCheckedAt ? formatDateTimeWib(data.latestCheckedAt) : "-"}
              hint="Most recent saved Auto Google Rank result"
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Latest 5 Auto Google Rank Results</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Pick a saved run to inspect the Top 10 result set for this brand.
                </p>
              </div>
            </div>

            {!runs.length ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                No saved Auto Google Rank results yet for this brand.
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-5">
                {runs.map((run) => (
                  <RecentRunCard
                    key={run._id}
                    run={run}
                    selected={selectedRun?._id === run._id}
                    onSelect={setSelectedRunId}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Selected Run Details</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Top 10 Google Rank results saved for the selected auto run.
                </p>
              </div>
              {selectedRun ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    Checked: {formatDateTimeWib(selectedRun.checkedAt)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    View: {selectedRun?.params?.device || "-"}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    Region: {String(selectedRun?.params?.gl || "-").toUpperCase()}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                    Language: {String(selectedRun?.params?.hl || "-").toUpperCase()}
                  </span>
                </div>
              ) : null}
            </div>

            <ResultsList selectedBrand={selectedBrand} payload={selectedRun} />
          </section>

          <ComparisonSection
            latestRun={latestRun}
            previousRun={previousRun}
            configuredDomainCount={data?.configuredDomainCount ?? 0}
          />

          <MissingDomainsSection missingDomains={data?.missingDomains || []} />
        </>
      ) : null}
    </div>
  );
}
