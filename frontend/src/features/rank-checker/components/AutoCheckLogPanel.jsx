import { useEffect, useRef, useState } from 'react';
import Badge from './Badge';

const INDONESIA_TIME_ZONE = 'Asia/Jakarta';
const REFRESH_INTERVAL_MS = 5000;

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

const getActionBadgeClass = (action) => {
  if (action === 'auto_start') return 'bg-blue-100 text-blue-800';
  if (action === 'auto_stop') return 'bg-slate-200 text-slate-800';
  if (action === 'auto_check') return 'bg-indigo-100 text-indigo-800';
  return 'bg-slate-100 text-slate-700';
};

const getLogStatusLabel = (item) => {
  if (item?.action === 'auto_start') return 'started';
  if (item?.action === 'auto_stop') return 'stopped';
  if (item?.metadata?.ok === true) return 'success';
  if (item?.metadata?.ok === false) return 'failure';
  return '-';
};

const getLogStatusClass = (item) => {
  if (item?.metadata?.ok === true) {
    return 'bg-emerald-100 text-emerald-800';
  }
  if (item?.metadata?.ok === false) {
    return 'bg-rose-100 text-rose-800';
  }
  if (item?.action === 'auto_start') {
    return 'bg-blue-100 text-blue-800';
  }
  if (item?.action === 'auto_stop') {
    return 'bg-slate-200 text-slate-800';
  }
  return 'bg-slate-100 text-slate-700';
};

const getMatchedByLabel = (matchedBy) => {
  if (matchedBy === 'serpRunId') return 'Linked directly to saved run';
  if (matchedBy === 'checkedAt') return 'Matched by exact check time';
  if (matchedBy === 'closestCheckedAt') return 'Matched by nearest saved run time';
  return 'No saved scan linked';
};

const toExternalUrl = (value) => {
  if (!value) return '#';
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return `https://${value}`;
};

const getErrorMessage = (err, fallback) =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;

const getOwnStatusLabel = (badge) => (badge === 'OWN' ? 'Own' : 'Not Own');

const getOwnStatusClass = (badge) =>
  badge === 'OWN'
    ? 'bg-emerald-100 text-emerald-800'
    : 'bg-slate-100 text-slate-700';

const DetailStat = ({ label, value, tone = 'slate' }) => {
  const toneClassName = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
  }[tone] || 'border-slate-200 bg-slate-50 text-slate-900';

  return (
    <div className={`rounded-lg border p-3 ${toneClassName}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
};

function AutoCheckLogPanel({ onLoadLogs, onLoadLogDetail }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedLogId, setSelectedLogId] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedDetail, setSelectedDetail] = useState(null);
  const selectedLogIdRef = useRef('');
  const detailRequestIdRef = useRef(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await onLoadLogs(150);
      setLogs(list);

      if (selectedLogIdRef.current && !list.some((item) => item._id === selectedLogIdRef.current)) {
        selectedLogIdRef.current = '';
        setSelectedLogId('');
        setSelectedDetail(null);
        setDetailError('');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load auto-check logs'));
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (logId) => {
    if (!logId || !onLoadLogDetail) {
      return;
    }

    const requestId = detailRequestIdRef.current + 1;
    detailRequestIdRef.current = requestId;
    setSelectedLogId(logId);
    selectedLogIdRef.current = logId;
    setDetailLoading(true);
    setDetailError('');
    try {
      const detail = await onLoadLogDetail(logId);
      if (detailRequestIdRef.current !== requestId) {
        return;
      }
      setSelectedDetail(detail);
    } catch (err) {
      if (detailRequestIdRef.current !== requestId) {
        return;
      }
      setSelectedDetail(null);
      setDetailError(getErrorMessage(err, 'Failed to load scan output'));
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    selectedLogIdRef.current = selectedLogId;
  }, [selectedLogId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [onLoadLogs]);

  const selectedLog = selectedDetail?.log || logs.find((item) => item._id === selectedLogId) || null;
  const selectedScan = selectedDetail?.scan || null;
  const selectedLogNote = selectedLog?.note || '-';
  const selectedLogError = selectedLog?.metadata?.error || '';
  const ownFound = Number(selectedScan?.ownResultCount || 0);
  const unknownFound = Number(selectedScan?.unknownCount || 0);
  const resultCount = Number(selectedScan?.resultCount || 0);
  const missingReason = selectedDetail?.missingReason || null;

  return (
    <section className="p-3 lg:p-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Auto Check Logs</h2>
            <p className="text-xs text-slate-500">Click a log row to open the saved scan output for that run.</p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {error ? <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] xl:items-start">
          <div className="min-w-0 overflow-hidden rounded-md border border-slate-100 bg-white">
            <div className="max-h-[72vh] overflow-auto xl:max-h-[calc(100vh-16rem)]">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Brand</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Note</th>
                  <th className="px-3 py-2 text-left">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((item) => {
                    const isSelected = item._id === selectedLogId;

                    return (
                      <tr
                        key={item._id}
                        onClick={() => loadDetail(item._id)}
                        className={`cursor-pointer transition hover:bg-slate-50 ${
                          isSelected ? 'bg-indigo-50/70' : 'bg-white'
                        }`}
                      >
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {formatDateTimeWib(item.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${getActionBadgeClass(item.action)}`}>
                            {item.action}
                          </span>
                        </td>
                        <td className="px-3 py-2">{item.brand?.code ? `${item.brand.code} - ${item.brand.name}` : '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${getLogStatusClass(item)}`}>
                            {getLogStatusLabel(item)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{item.metadata?.source || '-'}</td>
                        <td className="max-w-[260px] px-3 py-2 text-xs text-slate-600">
                          <p className="line-clamp-2">{item.note || '-'}</p>
                          <p className="mt-1 text-[11px] font-medium text-indigo-600">
                            Click to view details
                          </p>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {item.actor?.username ? `${item.actor.username} (${item.actor.email})` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4 xl:sticky xl:top-0">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Scan Output</h3>
                <p className="text-xs text-slate-500">
                  {selectedLog ? 'Saved details for the selected auto-check log.' : 'Select a log to inspect its output.'}
                </p>
              </div>
              {selectedLog ? (
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${getActionBadgeClass(selectedLog.action)}`}>
                  {selectedLog.action}
                </span>
              ) : null}
            </div>

            {!selectedLog && !detailLoading ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                Click any auto-check log row to see the saved query output, rankings, and matched domains.
              </div>
            ) : null}

            {detailLoading ? (
              <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
                Loading saved scan output...
              </div>
            ) : null}

            {detailError ? (
              <p className="rounded bg-red-50 p-3 text-sm text-red-700">{detailError}</p>
            ) : null}

            {selectedLog && !detailLoading ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${getLogStatusClass(selectedLog)}`}>
                      {getLogStatusLabel(selectedLog)}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {selectedLog.brand?.code ? `${selectedLog.brand.code} - ${selectedLog.brand.name}` : 'No brand'}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {selectedLog.metadata?.source || 'unknown source'}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-800">Logged At:</span>{' '}
                      {formatDateTimeWib(selectedLog.createdAt)}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">Checked At:</span>{' '}
                      {formatDateTimeWib(selectedLog.metadata?.checkedAt)}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">Link Method:</span>{' '}
                      {getMatchedByLabel(selectedDetail?.matchedBy)}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">Note:</span> {selectedLogNote}
                    </p>
                    {selectedLogError ? (
                      <p className="rounded bg-rose-50 px-2 py-1 text-rose-700">
                        <span className="font-semibold">Error:</span> {selectedLogError}
                      </p>
                    ) : null}
                  </div>
                </div>

                {selectedScan ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DetailStat label="Query" value={selectedScan.query || '-'} tone="indigo" />
                      <DetailStat
                        label="Best Own Rank"
                        value={selectedScan.bestOwnRank ? `#${selectedScan.bestOwnRank}` : 'Not found'}
                        tone={selectedScan.bestOwnRank ? 'emerald' : 'rose'}
                      />
                      <DetailStat label="Own Results" value={`${ownFound}/${resultCount}`} tone="emerald" />
                      <DetailStat label="Other Results" value={String(unknownFound)} tone="slate" />
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">Top Results</h4>
                          <p className="text-xs text-slate-500">
                            Checked at {formatDateTimeWib(selectedScan.checkedAt)} for{' '}
                            {selectedScan.brand?.code || 'selected brand'}.
                          </p>
                        </div>
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          {resultCount} result{resultCount === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="overflow-auto rounded-md border border-slate-100">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left">#</th>
                              <th className="px-3 py-2 text-left">Domain</th>
                              <th className="px-3 py-2 text-left">Badge</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedScan.results.map((row) => (
                              <tr
                                key={`${selectedScan._id}-${row.rank}-${row.link}`}
                                className={row.badge === 'OWN' ? 'bg-emerald-50/80' : 'bg-white'}
                              >
                                <td className="px-3 py-2 font-semibold text-slate-800">{row.rank}</td>
                                <td className="px-3 py-2 align-top">
                                  <p className="font-mono text-xs text-slate-700">{row.domainHost || '-'}</p>
                                  <p className="mt-1 text-[11px] uppercase text-slate-400">{row.matchType || 'none'}</p>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <Badge badge={row.badge} selectedBrandColor={selectedScan.brand?.color} />
                                </td>
                             
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {missingReason === 'run-failed-before-save' ? (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
                        This auto-check failed before a SERP result was saved, so there is no result table for this row.
                        {selectedLogError ? (
                          <p className="mt-2 text-xs text-rose-800">Backend error: {selectedLogError}</p>
                        ) : null}
                      </div>
                    ) : null}

                    {missingReason === 'lifecycle-event' ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                        This is a start or stop event, so there is no saved SERP output attached to it.
                      </div>
                    ) : null}

                    {!missingReason || missingReason === 'saved-scan-missing' ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                        This log does not have a saved scan linked yet. Refresh the log after the backend relinks it,
                        or restart the rank-checker backend if it is still running older code.
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </aside>
        </div>

        {!loading && logs.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No auto-check logs yet.</p>
        ) : null}
      </div>
    </section>
  );
}

export default AutoCheckLogPanel;
