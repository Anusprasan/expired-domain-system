import { useEffect, useMemo, useState } from 'react';
import { getSerperAvailabilityAlertClassName } from '../utils/serperAvailabilityUi';

const INDONESIA_TIME_ZONE = 'Asia/Jakarta';
const formatDateTimeWib = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    timeZone: INDONESIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

function StatCard({ emoji, value, label, color = '#f59e0b' }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <span className="text-3xl">{emoji}</span>
      <span className="text-3xl font-bold" style={{ color }}>{value ?? 0}</span>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

const formatRunTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('id-ID', {
    timeZone: INDONESIA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const getBrandAccentColor = (brand) => brand?.color || '#6366f1';
const getBrandTextColor = (brand) => brand?.textColor || '#ffffff';
const AUTO_CHECK_COMPARISON_BUCKETS = [
  {
    key: 'top3',
    label: 'OWN in Top 3',
    maxRank: 3,
    latestColor: '#14b8a6',
    previousColor: '#99f6e4',
    chipClassName: 'bg-teal-50 text-teal-700 border border-teal-200',
  },
  {
    key: 'top5',
    label: 'OWN in Top 5',
    maxRank: 5,
    latestColor: '#3b82f6',
    previousColor: '#bfdbfe',
    chipClassName: 'bg-sky-50 text-sky-700 border border-sky-200',
  },
  {
    key: 'top10',
    label: 'OWN in Top 10',
    maxRank: 10,
    latestColor: '#8b5cf6',
    previousColor: '#ddd6fe',
    chipClassName: 'bg-violet-50 text-violet-700 border border-violet-200',
  },
];

const countOwnResultsWithinRank = (run, maxRank) =>
  (run?.results || []).filter(
    (row) => row?.badge === 'OWN' && Number.isFinite(Number(row?.rank)) && Number(row.rank) <= maxRank
  ).length;

const buildAutoCheckCoverageMetrics = (run) =>
  AUTO_CHECK_COMPARISON_BUCKETS.reduce((accumulator, bucket) => {
    accumulator[bucket.key] = countOwnResultsWithinRank(run, bucket.maxRank);
    return accumulator;
  }, {});

const normalizeDomainValue = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const withProtocol = raw.includes('://') ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.replace(/\.$/, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  }
};

const getResultUrlLabel = (row) => {
  const domainHost = String(row?.domainHost || '').trim();
  if (domainHost) return domainHost;

  const link = String(row?.link || '').trim();
  if (!link) return '';

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
        .filter((row) => row?.badge === 'OWN' && Number.isFinite(Number(row?.rank)) && Number(row.rank) <= maxRank)
        .map((row) => getResultUrlLabel(row))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));

const isDomainMatched = (configuredDomain, matchedUrls) => {
  const normalizedConfigured = normalizeDomainValue(configuredDomain);
  if (!normalizedConfigured) return false;

  return matchedUrls.some((item) => {
    const normalizedItem = normalizeDomainValue(item);
    if (!normalizedItem) return false;
    return (
      normalizedItem === normalizedConfigured ||
      normalizedItem.endsWith(`.${normalizedConfigured}`) ||
      normalizedConfigured.endsWith(`.${normalizedItem}`)
    );
  });
};

// ── Modal ────────────────────────────────────────────────────────────────────
function RunModal({ selected, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!selected?.brand || !selected?.run) return null;
  const { brand, run } = selected;
  const results = (run.results || []).slice(0, 10);

  const badgeStyle = (badge) => {
    if (badge === 'OWN') return { bg: '#d1fae5', color: '#065f46', label: 'OWN' };
    return { bg: '#f1f5f9', color: '#475569', label: '?' };
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-800">Auto-Check Summary</h2>
              <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                {brand.code}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{formatDateTimeWib(run.checkedAt)}</p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
          {[
            { label: 'Best Rank', value: run.bestOwnRank ? `#${run.bestOwnRank}` : '-', color: '#6366f1' },
            { label: 'Own', value: run.ownCount ?? 0, color: '#10b981' },
            { label: 'Unknown', value: run.unknownCount ?? 0, color: '#94a3b8' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-center py-3 px-2">
              <span className="text-xl font-bold" style={{ color }}>{value}</span>
              <span className="mt-0.5 text-[10px] text-slate-400 text-center">{label}</span>
            </div>
          ))}
        </div>

        {/* Compact ranked list */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No results available.</p>
          ) : (
            results.map((row, idx) => {
              const bs = badgeStyle(row.badge);
              const cleanedTitle = String(row.title || '-').replace(/\s*(\.\.\.|…)\s*$/, '').trim() || '-';
              return (
                <div
                  key={`${row.rank}-${idx}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                  style={{ border: '1px solid #f1f5f9' }}
                >
                  {/* Rank bubble */}
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: '#f8fafc',
                      color: '#64748b',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    {row.rank}
                  </span>

                  {/* Domain + title + visit */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-700 break-all">
                        {row.domainHost || '-'}
                      </p>
                      <a
                        href={row.link || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className={`shrink-0 rounded-sm p-1 transition ${
                          row.link
                            ? 'bg-transparent text-sky-700 hover:text-black'
                            : 'pointer-events-none bg-slate-200 text-slate-400'
                        }`}
                        title={row.link ? 'Visit link' : 'No link available'}
                        aria-label={row.link ? `Visit result ${row.rank}` : `No link for result ${row.rank}`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M14 3h7v7" />
                          <path d="M10 14 21 3" />
                          <path d="M21 14v7h-7" />
                          <path d="M3 10V3h7" />
                          <path d="M3 21h7v-7" />
                        </svg>
                      </a>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400 break-words leading-snug">
                      {cleanedTitle}
                    </p>
                  </div>

                  {/* Badge pill */}
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                    style={{ backgroundColor: bs.bg, color: bs.color }}
                  >
                    {bs.label}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-slate-100">
          <p className="text-center text-xs text-slate-400">Press <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono">Esc</kbd> or click outside to close</p>
        </div>
      </div>
    </div>
  );
}

// ── Carousel Card ────────────────────────────────────────────────────────────
function BrandCarouselCard({ brand, active, depth = 2, selectedRunId, onSelectRun }) {
  const brandColor = getBrandAccentColor(brand);
  const brandTextColor = getBrandTextColor(brand);

  const rankBadge = brand.currentRank ? { label: `#${brand.currentRank}` } : { label: 'No data' };
  const trendBadge =
    brand.trend === 'up'
      ? { label: `Up ${brand.delta}`, bg: '#dcfce7', color: '#166534' }
      : brand.trend === 'down'
      ? { label: `Down ${Math.abs(brand.delta)}`, bg: '#fee2e2', color: '#991b1b' }
      : brand.trend === 'new'
      ? { label: 'New', bg: '#dbeafe', color: '#1d4ed8' }
      : brand.trend === 'missing'
      ? { label: 'Not found', bg: '#ffedd5', color: '#c2410c' }
      : brand.trend === 'stable'
      ? { label: 'Stable', bg: '#e2e8f0', color: '#334155' }
      : { label: 'No data', bg: '#f1f5f9', color: '#64748b' };

  const recentRuns = brand.recentAutoChecks || [];

  const cardOpacity = active ? 1 : depth === 1 ? 0.72 : 0.58;
  const cardScale = active ? 1.04 : depth === 1 ? 0.95 : 0.9;
  const cardTranslateY = active ? -10 : depth === 1 ? 14 : 26;
  const cardShadow = active
    ? '0 24px 42px rgba(15,23,42,0.28)'
    : depth === 1
    ? '0 12px 20px rgba(15,23,42,0.16)'
    : '0 8px 16px rgba(15,23,42,0.1)';

  return (
    <div
      className="relative flex select-none flex-col overflow-hidden rounded-2xl shadow-lg transition-all duration-300"
      style={{
        backgroundColor: '#ffffff',
        border: active ? '1px solid #cbd5e1' : '1px solid #e2e8f0',
        opacity: cardOpacity,
        transform: `translateY(${cardTranslateY}px) scale(${cardScale})`,
        minHeight: '440px',
        boxShadow: cardShadow,
        zIndex: active ? 30 : depth === 1 ? 20 : 10,
      }}
    >
      <div
        className="flex basis-1/5 flex-col justify-center gap-2 px-5 py-4"
        style={{ background: `linear-gradient(135deg, ${brandColor} 0%, #0f172a 170%)` }}
      >
        <span className="text-xl font-extrabold tracking-wide" style={{ color: brandTextColor }}>
          {brand.code}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-semibold text-white">
            {rankBadge.label}
          </span>
          <span className="rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: trendBadge.bg, color: trendBadge.color }}>
            {trendBadge.label}
          </span>
        </div>
      </div>

      <div className="flex basis-4/5 flex-col px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Last 5 Auto Checks
        </p>

        {recentRuns.length === 0 ? (
          <p className="mt-8 text-sm text-slate-500">No auto checks yet</p>
        ) : (
          <div className="mt-8 flex flex-1 flex-col gap-2">
            {recentRuns.map((run) => {
              const isSelected = selectedRunId === run._id;
              const rankLabel = run.bestOwnRank ? `#${run.bestOwnRank}` : '-';
              return (
                <button
                  key={run._id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRun(brand, run);
                  }}
                  className="group rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all duration-200"
                  style={{
                    backgroundColor: isSelected ? '#ffffff' : '#f1f5f9',
                    color: '#334155',
                    border: isSelected ? `1px solid ${brandColor}` : '1px solid #e2e8f0',
                    boxShadow: isSelected ? '0 8px 18px rgba(15,23,42,0.14)' : '0 4px 10px rgba(15,23,42,0.06)',
                  }}
                  title={`Best rank: ${rankLabel} | Own: ${run.ownCount ?? 0}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="tracking-wide text-slate-700">{formatRunTime(run.checkedAt)}</span>
                    <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                      {rankLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Carousel ─────────────────────────────────────────────────────────────────
function BrandCarousel({ brands, selectedRunId, onSelectRun, focusedBrandId = '' }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= brands.length) setIndex(0);
  }, [brands.length, index]);

  useEffect(() => {
    if (!focusedBrandId || !brands.length) return;
    const focusedIndex = brands.findIndex((brand) => brand._id === focusedBrandId);
    if (focusedIndex >= 0) {
      setIndex(focusedIndex);
    }
  }, [focusedBrandId, brands]);

  if (!brands.length) return null;

  const prev = () => setIndex((i) => (i - 1 + brands.length) % brands.length);
  const next = () => setIndex((i) => (i + 1) % brands.length);
  const getCard = (offset) => brands[(index + offset + brands.length) % brands.length];
  const maxIndex = Math.max(0, brands.length - 1);
  const hasSingle = brands.length === 1;
  const hasTwo = brands.length === 2;
  const hasThree = brands.length === 3;
  const desktopOffsets = hasSingle ? [0] : hasTwo ? [-1, 0] : hasThree ? [-1, 0, 1] : [-2, -1, 0, 1, 2];
  const desktopGridClass = hasSingle
    ? 'hidden flex-1 grid-cols-1 items-stretch gap-3 lg:grid lg:justify-items-center perspective-[1400px]'
    : hasTwo
      ? 'hidden flex-1 grid-cols-2 items-stretch gap-3 lg:grid perspective-[1400px]'
      : hasThree
        ? 'hidden flex-1 grid-cols-3 items-stretch gap-3 lg:grid perspective-[1400px]'
        : 'hidden flex-1 grid-cols-5 items-stretch gap-3 lg:grid perspective-[1400px]';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        {!hasSingle && (
          <button
            type="button"
            onClick={prev}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow transition hover:bg-slate-50"
          >
            {'<'}
          </button>
        )}

        <div className={desktopGridClass}>
          {desktopOffsets.map((offset) => {
            const isActive = offset === 0;
            const brand = getCard(offset);
            const onEdge = offset < 0 ? prev : next;
            return (
              <div
                key={`${brand._id || brand.code}-${offset}`}
                className={`${!isActive ? 'cursor-pointer' : ''} w-full max-w-[340px]`}
                onClick={!isActive ? onEdge : undefined}
              >
                <BrandCarouselCard
                  brand={brand}
                  active={isActive}
                  depth={Math.abs(offset)}
                  selectedRunId={selectedRunId}
                  onSelectRun={onSelectRun}
                />
              </div>
            );
          })}
        </div>

        <div className={`flex-1 lg:hidden ${hasSingle ? 'mx-auto w-full max-w-[340px]' : ''}`}>
          <BrandCarouselCard brand={getCard(0)} active={true} depth={0} selectedRunId={selectedRunId} onSelectRun={onSelectRun} />
        </div>

        {!hasSingle && (
          <button
            type="button"
            onClick={next}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xl text-slate-500 shadow transition hover:bg-slate-50"
          >
            {'>'}
          </button>
        )}
      </div>

      {!hasSingle && (
        <div className="mx-auto mt-12 w-full max-w-xl px-4">
          <div className="rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <input
              type="range"
              min={0}
              max={maxIndex}
              step={1}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              aria-label="Carousel slider"
              className="h-2 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-slate-500 [&::-moz-range-thumb]:shadow [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-500 [&::-webkit-slider-thumb]:shadow"
              style={{
                background: '#e2e8f0',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}


// ── Main Dashboard ────────────────────────────────────────────────────────────
function AutoCheckCoverageComparisonCard({ brand }) {
  const latestRun = brand?.recentAutoChecks?.[0] || null;
  const previousRun = brand?.recentAutoChecks?.[1] || null;
  const configuredDomainCount = Math.max(0, Number(brand?.domainCount) || 0);
  const configuredDomains = Array.isArray(brand?.configuredDomains) ? brand.configuredDomains : [];

  if (!brand) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white px-6 py-5 shadow-sm">
        <div className="flex min-h-[220px] items-center justify-center text-center text-sm text-slate-500">
          Select a brand to compare the latest and previous auto checks.
        </div>
      </div>
    );
  }

  if (!latestRun || !previousRun) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white px-6 py-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">Latest vs Previous Auto Check</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Coverage comparison for {brand.code || brand.name || 'the selected brand'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: `${getBrandAccentColor(brand)}18`, color: getBrandAccentColor(brand) }}
            >
              {brand.code || brand.name || 'Selected brand'}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              Configured Domains: {configuredDomainCount}
            </span>
          </div>
        </div>
        <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
          At least two auto-check runs are needed before this comparison graph can be shown.
        </div>
      </div>
    );
  }

  const latestMetrics = buildAutoCheckCoverageMetrics(latestRun);
  const previousMetrics = buildAutoCheckCoverageMetrics(previousRun);
  const chartMaxValue = Math.max(
    1,
    ...AUTO_CHECK_COMPARISON_BUCKETS.map((bucket) =>
      Math.max(bucket.maxRank, latestMetrics[bucket.key] || 0, previousMetrics[bucket.key] || 0)
    )
  );
  const comparisonRows = AUTO_CHECK_COMPARISON_BUCKETS.map((bucket) => {
    const latestValue = latestMetrics[bucket.key] || 0;
    const previousValue = previousMetrics[bucket.key] || 0;
    const difference = latestValue - previousValue;
    const thresholdUrls = getThresholdUrls(latestRun, bucket.maxRank);

    return {
      ...bucket,
      latestValue,
      previousValue,
      difference,
      thresholdUrls,
      latestHeight: `${(latestValue / chartMaxValue) * 100}%`,
      previousHeight: `${(previousValue / chartMaxValue) * 100}%`,
    };
  });
  const top10Urls = getThresholdUrls(latestRun, 10);
  const missingTop10Urls = configuredDomains.filter((domain) => !isDomainMatched(domain, top10Urls));
  const yAxisTicks = Array.from(
    new Set([
      chartMaxValue,
      Math.max(1, Math.round(chartMaxValue * 0.66)),
      Math.max(1, Math.round(chartMaxValue * 0.33)),
      0,
    ])
  ).sort((left, right) => right - left);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-6 py-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800">Latest vs Previous Auto Check</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Top-10 own-domain coverage for {brand.code || brand.name || 'the selected brand'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">
            Configured Domains: {configuredDomainCount}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
            Latest: {formatDateTimeWib(latestRun.checkedAt)}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            Previous: {formatDateTimeWib(previousRun.checkedAt)}
          </span>
        </div>
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-3">
        {comparisonRows.map((row) => {
          const latestPct = (row.latestValue / row.maxRank) * 100;
          const previousPct = (row.previousValue / row.maxRank) * 100;
          const deltaText = row.difference > 0 ? `+${row.difference}` : String(row.difference);
          const deltaTone =
            row.difference > 0 ? 'text-emerald-700' : row.difference < 0 ? 'text-rose-700' : 'text-slate-500';

          return (
            <div key={`${row.key}-detail`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{row.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    OWN results ranked at #{row.maxRank} or better
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.chipClassName}`}>
                  {deltaText}
                </span>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold">
                    <span className="text-slate-600">Latest</span>
                    <span className="text-slate-900">{row.latestValue} / {row.maxRank}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${latestPct}%`, backgroundColor: row.latestColor }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold">
                    <span className="text-slate-600">Previous</span>
                    <span className="text-slate-900">{row.previousValue} / {row.maxRank}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${previousPct}%`, backgroundColor: row.previousColor }}
                    />
                  </div>
                </div>
              </div>

              <p className={`mt-3 text-xs font-semibold ${deltaTone}`}>
                {row.difference === 0
                  ? 'No change from the previous auto check.'
                  : row.difference > 0
                    ? `${row.difference} more OWN result${row.difference !== 1 ? 's' : ''} than the previous auto check.`
                    : `${Math.abs(row.difference)} fewer OWN result${Math.abs(row.difference) !== 1 ? 's' : ''} than the previous auto check.`}
              </p>

              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  URLs in this stage
                </p>
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

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Configured URLs Not in Top 10</h3>
            <p className="mt-1 text-xs text-slate-500">
              Brand URLs currently not represented in the latest Top 10 OWN results
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            {missingTop10Urls.length} missing
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {missingTop10Urls.length ? (
            missingTop10Urls.map((url) => (
              <span
                key={`missing-top10-${url}`}
                className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700"
              >
                {url}
              </span>
            ))
          ) : (
            <span className="text-sm text-emerald-700">All configured URLs are represented in the latest Top 10.</span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Comparison Graph</h3>
            <p className="mt-1 text-xs text-slate-500">
              Latest and previous OWN-result counts across Top 3, Top 5, and Top 10
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
              Latest
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
              Previous
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-[auto_1fr] gap-4">
            <div className="flex h-72 flex-col justify-between pb-10 text-[11px] font-semibold text-slate-400">
              {yAxisTicks.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-10">
                {yAxisTicks.map((tick) => (
                  <div key={`grid-${tick}`} className="border-t border-dashed border-slate-200" />
                ))}
              </div>

              <div className="relative grid h-72 grid-cols-3 gap-6 pt-3">
                {comparisonRows.map((row) => {
                  const deltaTone =
                    row.difference > 0 ? 'text-emerald-700' : row.difference < 0 ? 'text-rose-700' : 'text-slate-500';
                  const deltaText = row.difference > 0 ? `+${row.difference}` : String(row.difference);

                  return (
                    <div key={row.key} className="flex h-full flex-col justify-end">
                      <div className="flex flex-1 items-end justify-center gap-4">
                        <div className="flex w-16 flex-col items-center gap-2">
                          <span className="text-xs font-semibold text-slate-700">{row.latestValue}</span>
                          <div className="flex h-44 w-full items-end rounded-t-xl">
                            <div
                              className="w-full rounded-t-xl transition-all"
                              style={{
                                height: row.latestHeight,
                                backgroundColor: row.latestColor,
                                minHeight: row.latestValue > 0 ? '12px' : '0px',
                              }}
                            />
                          </div>
                        </div>

                        <div className="flex w-16 flex-col items-center gap-2">
                          <span className="text-xs font-semibold text-slate-700">{row.previousValue}</span>
                          <div className="flex h-44 w-full items-end rounded-t-xl">
                            <div
                              className="w-full rounded-t-xl transition-all"
                              style={{
                                height: row.previousHeight,
                                backgroundColor: row.previousColor,
                                minHeight: row.previousValue > 0 ? '12px' : '0px',
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-slate-100 pt-3 text-center">
                        <p className="text-sm font-semibold text-slate-800">{row.label}</p>
                        <p className={`mt-1 text-xs font-semibold ${deltaTone}`}>{deltaText}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Latest {row.latestValue} vs Previous {row.previousValue}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {comparisonRows.map((row) => {
              const deltaTone =
                row.difference > 0 ? 'text-emerald-700' : row.difference < 0 ? 'text-rose-700' : 'text-slate-500';

              return (
                <div key={`${row.key}-summary`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">{row.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Threshold: rank #{row.maxRank} or better
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${deltaTone}`}>
                    {row.difference === 0
                      ? 'No change'
                      : row.difference > 0
                        ? `${row.difference} more than previous`
                        : `${Math.abs(row.difference)} fewer than previous`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserDashboard({
  username = 'User',
  brands = [],
  totalDomains = 0,
  focusedBrandId = '',
  serperAvailability = null,
  serperAvailabilityLoading = false,
}) {
  const totalBrands = brands.length;
  const searchedToday = brands.filter((b) => b.lastChecked).length;
  const inTop10 = brands.filter((b) => b.currentRank !== null && b.currentRank <= 10).length;
  const rankedFirst = brands.filter((b) => b.currentRank === 1).length;
  const [brandSearch, setBrandSearch] = useState('');
  const [modalRun, setModalRun] = useState(null); // { brand, run } | null

  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((brand) => {
      const code = String(brand.code || '').toLowerCase();
      const name = String(brand.name || '').toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [brands, brandSearch]);
  const comparisonBrand = useMemo(
    () => brands.find((brand) => brand._id === focusedBrandId) || brands[0] || null,
    [brands, focusedBrandId]
  );

  // Track which chip is visually "selected" in the carousel (for highlight only)
  const [selectedRunId, setSelectedRunId] = useState('');

  const handleSelectRun = (brand, run) => {
    setSelectedRunId(run._id);
    setModalRun({ brand, run });
  };

  return (
    <section className="min-h-screen w-full space-y-4 overflow-hidden bg-slate-100 p-4 lg:p-6">
      {/* Modal */}
      {modalRun && (
        <RunModal selected={modalRun} onClose={() => setModalRun(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-6 py-5 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Welcome back, {username}!</h1>
          <p className="mt-0.5 text-sm text-slate-500">Here is what is happening with your brands today.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">{username}</span>
      </div>

      {serperAvailabilityLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-700 shadow-sm">
          Checking Serper API status...
        </div>
      ) : null}

      {serperAvailability?.available === false ? (
        <div className={`rounded-2xl px-6 py-4 text-sm shadow-sm ${getSerperAvailabilityAlertClassName(serperAvailability)}`}>
          {serperAvailability?.message || 'Rank Checker is unavailable right now.'}
        </div>
      ) : null}

      {/* Stat cards */}
      <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-5">
        <StatCard emoji="🏷️" value={totalBrands} label="Total Brands" color="#f59e0b" />
        <StatCard emoji="🌐" value={totalDomains} label="Total Domains" color="#6366f1" />
        <StatCard emoji="🔍" value={searchedToday} label="Searched Today" color="#f59e0b" />
        <StatCard emoji="🏆" value={inTop10} label="In Top 10" color="#10b981" />
        <StatCard emoji="🥇" value={rankedFirst} label="Ranked #1" color="#8b5cf6" />
      </div>

      {/* Carousel */}
      <div className="rounded-2xl border border-slate-100 bg-white px-6 py-5 shadow-sm min-h-[680px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">Brand Status Overview</h2>
            <p className="text-xs text-slate-400 mt-0.5">Click a time chip on any card to view its run details</p>
          </div>
          <input
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            placeholder="Search brand code/name..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-72"
          />
        </div>

        {filteredBrands.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="font-semibold text-slate-700">No brands added yet.</p>
            <p className="text-sm text-slate-400">
              {brands.length === 0
                ? 'Go to Brand Management to add your first brand.'
                : 'No brands match your search.'}
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <BrandCarousel
              brands={filteredBrands}
              selectedRunId={selectedRunId}
              onSelectRun={handleSelectRun}
              focusedBrandId={focusedBrandId}
            />
          </div>
        )}
      </div>

      <AutoCheckCoverageComparisonCard brand={comparisonBrand} />
      
    </section>
  );
}

export default UserDashboard;
