import { useEffect, useMemo, useState } from 'react';

const INDONESIA_TIME_ZONE = 'Asia/Jakarta';
const formatAxisDateTimeWib = (value) =>
  new Date(value).toLocaleString('id-ID', {
    timeZone: INDONESIA_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const RANGES = [
  { id: '1d', label: 'Last 24 Hours' },
  { id: '7d', label: '7 Days' },
  { id: '14d', label: '14 Days' },
  { id: '30d', label: '30 Days' },
];

const DOMAIN_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#84cc16',
];

const MAX_DOMAINS = 10;

const getBrandChipStyle = (brand) => ({
  background: brand?.backgroundCss || brand?.color || '#64748b',
  color: brand?.textColor || '#ffffff',
});

const getBrandAccentColor = (brand) => brand?.color || '#64748b';

const getTrendBadge = (trend, delta) => {
  if (trend === 'up') return { label: `↑ ${delta}`, className: 'bg-emerald-50 text-emerald-700' };
  if (trend === 'down') return { label: `↓ ${Math.abs(delta)}`, className: 'bg-rose-50 text-rose-700' };
  if (trend === 'stable') return { label: '→ Stable', className: 'bg-slate-100 text-slate-700' };
  return { label: 'No data', className: 'bg-slate-100 text-slate-500' };
};

// ─── Shared Polyline Chart ────────────────────────────────────────────────────
// Works for both brand (points use `value`) and domain (points use `rank`).
// Pass `valueKey` as the field name to read from each point.
function PolylineChart({ series, height = 280, valueKey = 'rank' }) {
  const [hovered, setHovered] = useState(null); // { seriesIdx, pointIdx }

  const svgWidth = 900;
  const paddingLeft  = 44;
  const paddingRight = 16;
  const paddingBottom = 52;
  const paddingTop   = 24;
  const chartWidth  = svgWidth - paddingLeft - paddingRight;
  const chartHeight = height - paddingBottom - paddingTop;
  const minRank = 1;
  const maxRank = 10;

  // Union of all timestamps, sorted ascending
  const allTimestamps = useMemo(() => {
    const set = new Set();
    series.forEach((s) => s.points.forEach((p) => set.add(p.checkedAt)));
    return Array.from(set).sort();
  }, [series]);

  const totalPoints = allTimestamps.length;

  const xForIndex = (i) =>
    totalPoints <= 1
      ? paddingLeft + chartWidth / 2
      : paddingLeft + (i / (totalPoints - 1)) * chartWidth;

  const yForRank = (rank) =>
    paddingTop + ((rank - minRank) / (maxRank - minRank)) * chartHeight;

  // Per-series Map<checkedAt, rankValue>
  const seriesLookup = useMemo(() =>
    series.map((s) => {
      const map = new Map();
      s.points.forEach((p) => map.set(p.checkedAt, p[valueKey]));
      return map;
    }), [series, valueKey]);

  // Split each series into continuous segments (skip gaps)
  const polylineSegments = series.map((_, si) => {
    const lookup = seriesLookup[si];
    const segments = [];
    let current = [];
    allTimestamps.forEach((ts, i) => {
      const rank = lookup.get(ts);
      if (rank != null) {
        current.push(`${xForIndex(i)},${yForRank(rank)}`);
      } else {
        if (current.length > 0) { segments.push(current.join(' ')); current = []; }
      }
    });
    if (current.length > 0) segments.push(current.join(' '));
    return segments;
  });

  const labelEvery = totalPoints <= 8 ? 1 : totalPoints <= 16 ? 2 : totalPoints <= 32 ? 4 : 6;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgWidth} ${height}`}
        className="w-full min-w-[600px]"
        style={{ height: height + 8 }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Grid lines — ranks 1–10 */}
        {Array.from({ length: 10 }, (_, i) => i + 1).map((rank) => {
          const y = yForRank(rank);
          return (
            <g key={rank}>
              <line
                x1={paddingLeft} y1={y}
                x2={svgWidth - paddingRight} y2={y}
                stroke={rank === 1 ? '#cbd5e1' : '#e2e8f0'}
                strokeWidth={rank === 1 ? 1.5 : 1}
                strokeDasharray={rank === 1 ? undefined : '4,3'}
              />
              <text x={paddingLeft - 6} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="11">
                #{rank}
              </text>
            </g>
          );
        })}

        {/* Bottom axis */}
        <line
          x1={paddingLeft} y1={paddingTop + chartHeight}
          x2={svgWidth - paddingRight} y2={paddingTop + chartHeight}
          stroke="#cbd5e1" strokeWidth="1.5"
        />

        {/* X-axis time labels */}
        {allTimestamps.map((ts, i) => {
          if (i % labelEvery !== 0) return null;
          const x = xForIndex(i);
          const label = formatAxisDateTimeWib(ts);
          return (
            <text
              key={ts}
              x={x}
              y={paddingTop + chartHeight + 28}
              textAnchor="end"
              fill="#94a3b8"
              fontSize="9"
              transform={`rotate(-40, ${x}, ${paddingTop + chartHeight + 28})`}
            >
              {label}
            </text>
          );
        })}

        {/* Polylines */}
        {series.map((s, si) => {
          const isHov = hovered?.seriesIdx === si;
          const opacity = hovered == null || isHov ? 1 : 0.2;
          return polylineSegments[si].map((pts, segIdx) => (
            <polyline
              key={`line-${si}-${segIdx}`}
              points={pts}
              fill="none"
              stroke={s.color}
              strokeWidth={isHov ? 3 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={opacity}
              style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }}
            />
          ));
        })}

        {/* Dots + invisible hit areas + tooltips */}
        {series.map((s, si) => {
          const lookup = seriesLookup[si];
          const isSeriesHov = hovered?.seriesIdx === si;
          return allTimestamps.map((ts, i) => {
            const rank = lookup.get(ts);
            if (rank == null) return null;
            const cx = xForIndex(i);
            const cy = yForRank(rank);
            const isPointHov = isSeriesHov && hovered?.pointIdx === i;
            const dotOpacity = hovered == null || isSeriesHov ? 1 : 0.2;
            const tipWidth = 128;
            const tipX = cx + 10 + tipWidth > svgWidth - paddingRight
              ? cx - tipWidth - 10
              : cx + 10;

            return (
              <g key={`dot-${si}-${i}`}>
                <circle
                  cx={cx} cy={cy}
                  r={isPointHov ? 5.5 : 3}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth={isPointHov ? 2.5 : 1.5}
                  opacity={dotOpacity}
                  style={{ transition: 'r 0.1s, opacity 0.15s' }}
                />
                {/* Hit area */}
                <circle
                  cx={cx} cy={cy} r={12}
                  fill="transparent"
                  style={{ cursor: 'crosshair' }}
                  onMouseEnter={() => setHovered({ seriesIdx: si, pointIdx: i })}
                  onMouseLeave={() => setHovered(null)}
                />
                {/* Tooltip */}
                {isPointHov && (
                  <g>
                    <rect x={tipX} y={cy - 28} width={tipWidth} height={24} rx="5" fill="#1e293b" opacity="0.92" />
                    <text
                      x={tipX + tipWidth / 2} y={cy - 12}
                      textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600"
                    >
                      {s.label} #{rank} · {formatAxisDateTimeWib(ts)}
                    </text>
                  </g>
                )}
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
}

// ─── Legend item (line + dot) ─────────────────────────────────────────────────
function LegendItem({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="22" height="10" aria-hidden="true">
        <line x1="1" y1="5" x2="21" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx="11" cy="5" r="2.5" fill={color} />
      </svg>
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </div>
  );
}

// ─── Searchable brand dropdown ────────────────────────────────────────────────
function BrandSearchDropdown({ brands, selectedIds, onAdd, placeholder = 'Search and add brand...' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return brands.filter(
      (b) =>
        !selectedIds.includes(b._id) &&
        (b.code?.toLowerCase().includes(q) || b.name?.toLowerCase().includes(q))
    );
  }, [brands, selectedIds, query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {filtered.map((b) => {
            return (
              <button
                key={b._id}
                type="button"
                onMouseDown={() => { onAdd(b); setQuery(''); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50"
              >
                <span className="rounded px-2 py-0.5 text-xs font-bold"
                  style={getBrandChipStyle(b)}>
                  {b.code}
                </span>
                <span className="text-slate-500">— {b.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {open && filtered.length === 0 && query && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg">
          No brands found.
        </div>
      )}
    </div>
  );
}

// ─── Brand vs Brand compare ───────────────────────────────────────────────────
function BrandCompare({ initialBrand, brands, onGetRankingHistory }) {
  const [range, setRange] = useState('7d');
  const [selectedBrands, setSelectedBrands] = useState([initialBrand]);
  const [dataMap, setDataMap] = useState({});
  const [loadingIds, setLoadingIds] = useState([]);

  const loadBrandData = async (brand) => {
    setLoadingIds((prev) => [...prev, brand._id]);
    try {
      const result = await onGetRankingHistory(brand._id, range);
      setDataMap((prev) => ({ ...prev, [brand._id]: result }));
    } catch (err) {
      console.error('Failed to load analytics for', brand.code, err);
    } finally {
      setLoadingIds((prev) => prev.filter((id) => id !== brand._id));
    }
  };

  useEffect(() => {
    selectedBrands.forEach((b) => loadBrandData(b));
  }, [range]);

  const addBrand = (brand) => {
    setSelectedBrands((prev) => [...prev, brand]);
    loadBrandData(brand);
  };

  const removeBrand = (brandId) => {
    if (selectedBrands.length <= 1) return;
    setSelectedBrands((prev) => prev.filter((b) => b._id !== brandId));
    setDataMap((prev) => { const n = { ...prev }; delete n[brandId]; return n; });
  };

  const summaryRows = selectedBrands.map((b) => {
    const data = dataMap[b._id];
    const points = (data?.points || []).filter((p) => p.bestOwnRank !== null);
    const latest = points[points.length - 1];
    const previous = points[points.length - 2];
    return {
      brand: b,
      currentRank: latest?.bestOwnRank ?? null,
      previousRank: previous?.bestOwnRank ?? null,
      trend: data?.trend || null,
      delta: data?.delta ?? null,
    };
  });

  // brand series: points use `value` field
  const chartSeries = selectedBrands.map((b) => {
    const color = getBrandAccentColor(b);
    const data = dataMap[b._id];
    const points = (data?.points || [])
      .filter((p) => p.bestOwnRank !== null)
      .map((p) => ({ checkedAt: p.checkedAt, value: p.bestOwnRank }));
    return { label: b.code, color, points };
  });

  const hasAnyData = chartSeries.some((s) => s.points.length > 0);

  return (
    <div className="space-y-4 p-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button key={r.id} type="button" onClick={() => setRange(r.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${range === r.id ? 'bg-black text-amber-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto w-64">
          <BrandSearchDropdown brands={brands} selectedIds={selectedBrands.map((b) => b._id)} onAdd={addBrand} placeholder="Add brand to compare..." />
        </div>
      </div>

      {/* Brand pills */}
      <div className="flex flex-wrap gap-2">
        {selectedBrands.map((b) => {
          return (
            <div key={b._id} className="flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold shadow-sm"
              style={getBrandChipStyle(b)}>
              {b.code}
              {selectedBrands.length > 1 && (
                <button type="button" onClick={() => removeBrand(b._id)} className="ml-1 opacity-70 hover:opacity-100">×</button>
              )}
            </div>
          );
        })}
        {loadingIds.length > 0 && <span className="text-xs text-slate-500 self-center">Loading data...</span>}
      </div>

      {/* Polyline chart */}
      <div className="rounded-lg border border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-700">
            Brand Rankings Over Time <span className="font-normal text-slate-400">(lower = better)</span>
          </h3>
          <div className="flex flex-wrap gap-3">
            {chartSeries.map((s) => <LegendItem key={s.label} color={s.color} label={s.label} />)}
          </div>
        </div>
        {hasAnyData ? (
          <PolylineChart series={chartSeries} height={280} valueKey="value" />
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">No ranking data available for this period.</p>
        )}
      </div>

      {/* Summary table */}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
          <h3 className="text-sm font-semibold">Brand Summary</h3>
        </div>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-2 text-left">Brand</th>
              <th className="px-4 py-2 text-left">Current Rank</th>
              <th className="px-4 py-2 text-left">Previous Rank</th>
              <th className="px-4 py-2 text-left">Movement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summaryRows.map(({ brand, currentRank, previousRank, trend, delta }) => {
              const badge = getTrendBadge(trend, delta);
              return (
                <tr key={brand._id}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded px-2 py-0.5 text-xs font-bold"
                        style={getBrandChipStyle(brand)}>
                        {brand.code}
                      </span>
                      <span className="text-xs text-slate-500">— {brand.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-semibold">{currentRank ?? '-'}</td>
                  <td className="px-4 py-2">{previousRank ?? '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Domain vs Domain compare ─────────────────────────────────────────────────
function DomainCompare({ selectedBrand, domainItems = [], allDomains = [], onGetRankingHistory }) {
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [compareDomains, setCompareDomains] = useState((domainItems ?? []).slice(0, MAX_DOMAINS));

  useEffect(() => {
    if (!selectedBrand?._id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const result = await onGetRankingHistory(selectedBrand._id, range);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedBrand?._id, range]);

  const addDomain = (domain) => {
    if (compareDomains.length >= MAX_DOMAINS) return;
    if (!compareDomains.find((d) => d._id === domain._id))
      setCompareDomains((prev) => [...prev, domain]);
  };

  const removeDomain = (id) => {
    if (compareDomains.length <= 1) return;
    setCompareDomains((prev) => prev.filter((d) => d._id !== id));
  };

  const availableDomains = allDomains.filter((d) => !compareDomains.find((c) => c._id === d._id));

  const domainTrendMap = useMemo(() => {
    const map = {};
    (data?.domainTrends || []).forEach((t) => { map[t.domain] = t; });
    return map;
  }, [data]);

  // domain series: points use `rank` field
  const polylineSeries = compareDomains.map((d, index) => {
    const color = DOMAIN_COLORS[index % DOMAIN_COLORS.length];
    const trend = domainTrendMap[d.domain];
    const points = (trend?.points || [])
      .filter((p) => p.rank !== null)
      .map((p) => ({ checkedAt: p.checkedAt, rank: p.rank }));
    return { label: d.domain, color, points };
  });

  const hasAnyData = polylineSeries.some((s) => s.points.length > 0);

  return (
    <div className="space-y-4 p-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button key={r.id} type="button" onClick={() => setRange(r.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${range === r.id ? 'bg-black text-amber-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {compareDomains.length >= MAX_DOMAINS ? (
            <span className="text-xs text-slate-400 italic">Max {MAX_DOMAINS} domains</span>
          ) : availableDomains.length > 0 ? (
            <select
              onChange={(e) => { const d = availableDomains.find((x) => x._id === e.target.value); if (d) addDomain(d); e.target.value = ''; }}
              defaultValue=""
              className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="" disabled>Add domain...</option>
              {availableDomains.map((d) => <option key={d._id} value={d._id}>{d.domain}</option>)}
            </select>
          ) : null}
        </div>
      </div>

      {/* Domain pills */}
      <div className="flex flex-wrap gap-2">
        {compareDomains.map((d, index) => {
          const color = DOMAIN_COLORS[index % DOMAIN_COLORS.length];
          return (
            <div
              key={d._id}
              className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium"
              style={{ borderColor: color, color, backgroundColor: `${color}15` }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {d.domain}
              {compareDomains.length > 1 && (
                <button type="button" onClick={() => removeDomain(d._id)} className="ml-1 text-slate-400 hover:text-red-500">×</button>
              )}
            </div>
          );
        })}
        {loading && <span className="text-xs text-slate-500 self-center">Loading...</span>}
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {/* Polyline chart */}
      <div className="rounded-lg border border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-700">
            Domain Rankings Over Time <span className="font-normal text-slate-400">(lower = better)</span>
          </h3>
          <div className="flex flex-wrap gap-3">
            {compareDomains.map((d, index) => (
              <LegendItem key={d._id} color={DOMAIN_COLORS[index % DOMAIN_COLORS.length]} label={d.domain} />
            ))}
          </div>
        </div>
        {hasAnyData ? (
          <PolylineChart series={polylineSeries} height={280} valueKey="rank" />
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">No ranking data available for this period.</p>
        )}
      </div>

      {/* Summary table */}
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
          <h3 className="text-sm font-semibold">Domain Summary</h3>
        </div>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-2 text-left">Domain</th>
              <th className="px-4 py-2 text-left">Current Rank</th>
              <th className="px-4 py-2 text-left">Previous Rank</th>
              <th className="px-4 py-2 text-left">Movement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {compareDomains.map((d, index) => {
              const color = DOMAIN_COLORS[index % DOMAIN_COLORS.length];
              const trend = domainTrendMap[d.domain];
              const badge = getTrendBadge(trend?.trend, trend?.delta);
              return (
                <tr key={d._id}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="font-medium" style={{ color }}>{d.domain}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-semibold">{trend?.currentRank ?? '-'}</td>
                  <td className="px-4 py-2">{trend?.previousRank ?? '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
function ComparePanel({ mode, selectedBrand, brands, domainItems, allDomains, onGetRankingHistory }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      {mode === 'brand' ? (
        <BrandCompare initialBrand={selectedBrand} brands={brands} onGetRankingHistory={onGetRankingHistory} />
      ) : (
        <DomainCompare selectedBrand={selectedBrand} domainItems={domainItems} allDomains={allDomains} onGetRankingHistory={onGetRankingHistory} />
      )}
    </div>
  );
}

export default ComparePanel;
