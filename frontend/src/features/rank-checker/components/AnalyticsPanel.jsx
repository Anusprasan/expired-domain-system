import { useEffect, useMemo, useState } from 'react';

const RANGES = [
  { id: '1d', label: 'Last 24 Hours' },
  { id: '7d', label: '7 Days' },
  { id: '14d', label: '14 Days' },
  { id: '30d', label: '30 Days' },
];
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

// rank 1 = top (y=0), rank 10 = bottom (y=height)
const buildPolylinePoints = (points, width, height, rankField, topOffset = 0, plotHeight = height) => {
  if (!points.length) return '';
  const stepX = points.length > 1 ? width / (points.length - 1) : width / 2;
  return points
    .map((point, index) => {
      const rank = point[rankField];
      const x = points.length > 1 ? index * stepX : width / 2;
      const y = topOffset + ((rank - 1) / 9) * plotHeight; // rank 1 → top, rank 10 → bottom
      return `${x},${y}`;
    })
    .join(' ');
};

const getTrendBadge = (trend, delta) => {
  if (trend === 'up') return { label: `Up (${delta})`, className: 'bg-emerald-50 text-emerald-700' };
  if (trend === 'down') return { label: `Down (${Math.abs(delta)})`, className: 'bg-rose-50 text-rose-700' };
  if (trend === 'stable') return { label: 'Stable', className: 'bg-slate-100 text-slate-700' };
  return { label: 'No data', className: 'bg-slate-100 text-slate-500' };
};

function AnalyticsPanel({ selectedBrand, data, range, onRangeChange, loading, error, focusedDomain }) {
  const [selectedDomainHostKey, setSelectedDomainHostKey] = useState('');
  const showDomainOnly = Boolean(focusedDomain);

  const rankedPoints = (data?.points || []).filter((item) => item.bestOwnRank !== null);
  const domainTrends = [...(data?.domainTrends || [])].sort((a, b) => {
    if (a.currentRank === null && b.currentRank === null) return a.domain.localeCompare(b.domain);
    if (a.currentRank === null) return 1;
    if (b.currentRank === null) return -1;
    return a.currentRank - b.currentRank;
  });

  useEffect(() => {
    if (!domainTrends.length) { setSelectedDomainHostKey(''); return; }
    if (focusedDomain) {
      const match = domainTrends.find(
        (item) => item.domain === focusedDomain || item.domainHostKey?.includes(focusedDomain)
      );
      if (match) { setSelectedDomainHostKey(match.domainHostKey); return; }
    }
    const exists = domainTrends.some((item) => item.domainHostKey === selectedDomainHostKey);
    if (!exists) setSelectedDomainHostKey(domainTrends[0].domainHostKey);
  }, [selectedDomainHostKey, domainTrends, focusedDomain]);

  const selectedDomain = useMemo(
    () => domainTrends.find((item) => item.domainHostKey === selectedDomainHostKey) || null,
    [domainTrends, selectedDomainHostKey]
  );

  const selectedDomainPoints = (selectedDomain?.points || []).filter((item) => item.rank !== null);

  const svgWidth = 720;
  const svgHeight = 270;
  const plotTop = 8;
  const plotHeight = 165;
  const axisY = plotTop + plotHeight;

  const overallPolylinePoints = buildPolylinePoints(
    rankedPoints,
    svgWidth,
    svgHeight,
    'bestOwnRank',
    plotTop,
    plotHeight
  );
  const domainPolylinePoints = buildPolylinePoints(
    selectedDomainPoints,
    svgWidth,
    svgHeight,
    'rank',
    plotTop,
    plotHeight
  );

  // Grid ranks: 1 at top, 10 at bottom
  const gridRanks = [1, 3, 5, 7, 10];

  const rankToY = (rank) => plotTop + ((rank - 1) / 9) * plotHeight;
  const getLabelEvery = (size) => (size <= 8 ? 1 : size <= 16 ? 2 : size <= 32 ? 4 : 6);

  return (
    <section className="p-4 lg:p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ranking Analytics</h2>
          <div className="flex flex-wrap gap-2">
            {RANGES.map((item) => (
              <button key={item.id} type="button" onClick={() => onRangeChange(item.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  range === item.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!selectedBrand && <p className="mt-4 text-sm text-slate-500">Select a brand first.</p>}
        {loading && <p className="mt-4 text-sm text-slate-500">Loading analytics...</p>}
        {error && <p className="mt-4 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        {selectedBrand && data && !loading && (
          <div className="mt-4 space-y-4">
            {/* Summary stats */}
            {!showDomainOnly && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Overall Trend</p>
                  <p className="mt-1 text-lg font-semibold uppercase">{data.trend}</p>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Overall Rank Change</p>
                  <p className="mt-1 text-lg font-semibold">{data.delta ?? '-'}</p>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Overall Data Points</p>
                  <p className="mt-1 text-lg font-semibold">{data.points.length}</p>
                </div>
              </div>
            )}

            {/* Overall Brand Graph */}
            {!showDomainOnly && (
              <div className="rounded border border-slate-200 p-3">
                <h3 className="mb-2 text-sm font-semibold">Overall Brand Rank Graph</h3>
                <div className="overflow-x-auto">
                  {rankedPoints.length > 0 ? (
                    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="h-64 w-full min-w-[700px]">
                      {gridRanks.map((rank) => {
                        const y = rankToY(rank);
                        return (
                          <g key={rank}>
                            <line x1="0" y1={y} x2={svgWidth} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,3" />
                            <text x="4" y={Math.max(12, y - 4)} fill="#64748b" fontSize="11">#{rank}</text>
                          </g>
                        );
                      })}
                      <line x1="0" y1={axisY} x2={svgWidth} y2={axisY} stroke="#cbd5e1" strokeWidth="1.5" />
                      <polyline fill="none" stroke="#059669" strokeWidth="3" points={overallPolylinePoints} />
                      {rankedPoints.map((point, index) => {
                        const x = rankedPoints.length > 1 ? (index * svgWidth) / (rankedPoints.length - 1) : svgWidth / 2;
                        const y = rankToY(point.bestOwnRank);
                        return <circle key={`${point.checkedAt}-${index}`} cx={x} cy={y} r="4" fill="#059669" />;
                      })}
                      {rankedPoints.map((point, index) => {
                        const labelEvery = getLabelEvery(rankedPoints.length);
                        if (index % labelEvery !== 0) return null;
                        const x = rankedPoints.length > 1 ? (index * svgWidth) / (rankedPoints.length - 1) : svgWidth / 2;
                        const y = axisY + 40;
                        return (
                          <text
                            key={`axis-overall-${point.checkedAt}-${index}`}
                            x={x}
                            y={y}
                            textAnchor="end"
                            fill="#94a3b8"
                            fontSize="9"
                            transform={`rotate(-40, ${x}, ${y})`}
                          >
                            {formatAxisDateTimeWib(point.checkedAt)}
                          </text>
                        );
                      })}
                    </svg>
                  ) : (
                    <p className="text-sm text-slate-500">No overall ranking records available for this period.</p>
                  )}
                </div>
              </div>
            )}

            {/* Domain Graph */}
            <div className="rounded border border-slate-200 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Select Domain</h3>
                <select value={selectedDomainHostKey} onChange={(e) => setSelectedDomainHostKey(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                  {domainTrends.map((item) => (
                    <option key={item.domainHostKey} value={item.domainHostKey}>{item.domain}</option>
                  ))}
                </select>
              </div>

              {selectedDomain ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">Domain:</span>
                    <span>{selectedDomain.domain}</span>
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${getTrendBadge(selectedDomain.trend, selectedDomain.delta).className}`}>
                      {getTrendBadge(selectedDomain.trend, selectedDomain.delta).label}
                    </span>
                    <span className="text-slate-500">Current rank: {selectedDomain.currentRank ?? '-'}</span>
                  </div>
                  <div className="overflow-x-auto">
                    {selectedDomainPoints.length > 0 ? (
                      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="h-64 w-full min-w-[700px]">
                        {gridRanks.map((rank) => {
                          const y = rankToY(rank);
                          return (
                            <g key={rank}>
                              <line x1="0" y1={y} x2={svgWidth} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4,3" />
                              <text x="4" y={Math.max(12, y - 4)} fill="#64748b" fontSize="11">#{rank}</text>
                            </g>
                          );
                        })}
                        <line x1="0" y1={axisY} x2={svgWidth} y2={axisY} stroke="#cbd5e1" strokeWidth="1.5" />
                        <polyline fill="none" stroke={selectedBrand?.color || '#2563eb'} strokeWidth="3" points={domainPolylinePoints} />
                        {selectedDomainPoints.map((point, index) => {
                          const x = selectedDomainPoints.length > 1 ? (index * svgWidth) / (selectedDomainPoints.length - 1) : svgWidth / 2;
                          const y = rankToY(point.rank);
                          return <circle key={`${point.checkedAt}-${index}`} cx={x} cy={y} r="4" fill={selectedBrand?.color || '#2563eb'} />;
                        })}
                        {selectedDomainPoints.map((point, index) => {
                          const labelEvery = getLabelEvery(selectedDomainPoints.length);
                          if (index % labelEvery !== 0) return null;
                          const x = selectedDomainPoints.length > 1 ? (index * svgWidth) / (selectedDomainPoints.length - 1) : svgWidth / 2;
                          const y = axisY + 40;
                          return (
                            <text
                              key={`axis-domain-${point.checkedAt}-${index}`}
                              x={x}
                              y={y}
                              textAnchor="end"
                              fill="#94a3b8"
                              fontSize="9"
                              transform={`rotate(-40, ${x}, ${y})`}
                            >
                              {formatAxisDateTimeWib(point.checkedAt)}
                            </text>
                          );
                        })}
                      </svg>
                    ) : (
                      <p className="text-sm text-slate-500">No ranking records for this domain in selected period.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No domains available for this brand.</p>
              )}
            </div>

            {/* Domain Rank Movement Table */}
            {!showDomainOnly && (
              <div className="rounded border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <h3 className="text-sm font-semibold">Domain Rank Movement</h3>
                </div>
                <div className="overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left">Domain</th>
                        <th className="px-3 py-2 text-left">Current Rank</th>
                        <th className="px-3 py-2 text-left">Previous Rank</th>
                        <th className="px-3 py-2 text-left">Movement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {domainTrends.map((item) => {
                        const badge = getTrendBadge(item.trend, item.delta);
                        const isSelected = item.domainHostKey === selectedDomainHostKey;
                        return (
                          <tr key={item.domainHostKey}
                            className={`cursor-pointer ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                            onClick={() => setSelectedDomainHostKey(item.domainHostKey)}>
                            <td className="px-3 py-2 font-medium">{item.domain}</td>
                            <td className="px-3 py-2">{item.currentRank ?? '-'}</td>
                            <td className="px-3 py-2">{item.previousRank ?? '-'}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded px-2 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {domainTrends.length === 0 && (
                    <p className="p-3 text-sm text-slate-500">No active domains found for this brand.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export default AnalyticsPanel;
