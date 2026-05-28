import { useEffect, useMemo, useState } from 'react';
import AnalyticsPanel from './AnalyticsPanel';
import ComparePanel from './ComparePanel';

const toExternalUrl = (domain) => {
  if (!domain) return '#';
  if (domain.startsWith('http://') || domain.startsWith('https://')) return domain;
  return `https://${domain}`;
};

const formatBrandLabel = (brand) => {
  if (!brand) return '-';
  const code = String(brand.code || '').trim();
  const name = String(brand.name || '').trim();
  if (!code && !name) return '-';
  if (!code) return name;
  if (!name) return code;
  if (code.toLowerCase() === name.toLowerCase()) return code;
  return `${code} - ${name}`;
};

const getDomainHostLabel = (domainItem) => {
  if (!domainItem) return '';
  if (domainItem.domainHostKey) return domainItem.domainHostKey;
  return String(domainItem.domain || '').split('/')[0];
};

// ─── Add-domain form (admin only) ─────────────────────────────────────────────
function AddDomainForm({ selectedBrand, onCreateDomain, onRefresh }) {
  const [domain, setDomain] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedBrand) return;
    setSubmitting(true);
    setError('');
    try {
      await onCreateDomain({ domain, brandId: selectedBrand._id, note });
      setDomain('');
      setNote('');
      await onRefresh();
    } catch (err) {
      setError(err.message || 'Failed to add domain');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-blue-400 bg-white p-4 shadow-md">
      <form onSubmit={submit} className="mt-1 grid gap-3 lg:grid-cols-[220px_1fr_1fr_auto]">
        <div className="flex items-center gap-2 rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: selectedBrand?.color || '#64748b' }}
          />
          <span className="truncate text-sm font-semibold text-indigo-700">
            {selectedBrand ? formatBrandLabel(selectedBrand) : 'No brand selected'}
          </span>
        </div>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting || !selectedBrand}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
        >
          {submitting ? 'Adding...' : 'Add Domain'}
        </button>
      </form>
      {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

// ─── Analytics panel wrapper ───────────────────────────────────────────────────
function AnalyticsInline({ brand, domainItem, onGetRankingHistory }) {
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!brand?._id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await onGetRankingHistory(brand._id, range);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [brand?._id, range]);

  const displayData = useMemo(() => {
    if (!data) return null;
    if (!domainItem) return data;
    const domainHost = getDomainHostLabel(domainItem);
    const filteredTrends = (data.domainTrends || []).filter(
      (t) => t.domain === domainHost || t.domainHostKey === domainHost
    );
    return { ...data, domainTrends: filteredTrends };
  }, [data, domainItem]);

  return (
    <AnalyticsPanel
      selectedBrand={brand}
      data={displayData}
      range={range}
      onRangeChange={setRange}
      loading={loading}
      error={error}
      focusedDomain={getDomainHostLabel(domainItem) || null}
    />
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
function DomainManagementPanel({
  brands,
  selectedBrand,
  canAddDomains,
  canDeleteDomains,
  onLoadDomains,
  onCreateDomain,
  onDeleteDomain,
  onGetRankingHistory,
}) {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('brand');
  const [checkedIds, setCheckedIds] = useState([]);

  useEffect(() => {
    setView('brand');
    setCheckedIds([]);
    setSearch('');
  }, [selectedBrand?._id]);

  const loadDomains = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await onLoadDomains();
      setDomains(list);
    } catch (err) {
      setError(err.message || 'Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDomains(); }, []);

  const remove = async (id) => {
    const target = domains.find((item) => item._id === id);
    if (!window.confirm(`Delete domain "${target?.domain || ''}"? This cannot be undone.`)) return;
    try {
      await onDeleteDomain(id);
      setCheckedIds((prev) => prev.filter((c) => c !== id));
      if (view?._id === id) setView('brand');
      await loadDomains();
    } catch (err) {
      setError(err.message || 'Failed to delete domain');
    }
  };

  const brandDomains = useMemo(() => {
    if (!selectedBrand) return [];
    const q = search.trim().toLowerCase();
    return domains.filter((d) => {
      const brandId = typeof d.brand === 'object' ? d.brand?._id : d.brand;
      if (brandId !== selectedBrand._id) return false;
      if (!q) return true;
      return d.domain?.toLowerCase().includes(q) || (d.note || '').toLowerCase().includes(q);
    });
  }, [domains, selectedBrand, search]);

  const checkedDomains = useMemo(
    () => brandDomains.filter((d) => checkedIds.includes(d._id)),
    [brandDomains, checkedIds]
  );

  const toggleCheck = (id) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleBrandHeaderClick = () => {
    setView((prev) => (prev === 'brand' ? null : 'brand'));
    setCheckedIds([]);
  };

  const handleDomainSelect = (domainItem) => {
    setView((prev) => prev?._id === domainItem._id ? null : domainItem);
  };

  const handleDomainCompare = () => {
    setView({ compare: 'domain', items: checkedDomains });
  };

  const handleBrandCompare = () => {
    setView({ compare: 'brand' });
  };

  const viewIsBrand = view === 'brand';
  const viewIsDomain = view && view !== 'brand' && !view.compare;
  const viewIsCompare = view?.compare != null;
  const compareMode = view?.compare;
  const showAnalytics = viewIsBrand || viewIsDomain;

  const analyticsLabel = viewIsBrand
    ? `${selectedBrand?.code}`
    : viewIsDomain
    ? view.domain
    : '';

  return (
    <section className="p-3 lg:p-5 space-y-4">
      {canAddDomains && (
        <AddDomainForm
          selectedBrand={selectedBrand}
          onCreateDomain={onCreateDomain}
          onRefresh={loadDomains}
        />
      )}

      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {selectedBrand ? (
        <div className="flex min-h-[70vh] flex-col gap-4 lg:flex-row">

          {/* ── Domain vertical list ── */}
          <div className="w-full shrink-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:w-72">
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleBrandHeaderClick}
                className={`rounded-md px-3 py-1.5 text-sm font-bold transition ${
                  viewIsBrand
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-800 hover:bg-indigo-600 hover:text-white'
                }`}
                title="Click to view brand analytics"
              >
                {selectedBrand.code}
              </button>

              <button
                type="button"
                onClick={handleBrandCompare}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  compareMode === 'brand'
                    ? 'bg-black text-amber-100 shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-indigo-600 hover:text-white'
                }`}
                title="Compare brands"
              >
                Compare
              </button>

              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 shrink-0">
                {brandDomains.length}
              </span>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search domains..."
              className="mb-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />

            {checkedIds.length >= 2 && (
              <button
                type="button"
                onClick={handleDomainCompare}
                className={`mb-2 w-full rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  compareMode === 'domain'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-500 hover:text-white'
                }`}
              >
                Compare {checkedIds.length} Domains
              </button>
            )}

            <button
              type="button"
              onClick={loadDomains}
              disabled={loading}
              className="mb-3 w-full rounded bg-slate-100 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>

            {brandDomains.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                {loading ? 'Loading…' : 'No domains yet.'}
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto lg:max-h-[calc(100vh-320px)]">
                {brandDomains.map((item) => {
                  const isSelected = viewIsDomain && view?._id === item._id;
                  const isChecked = checkedIds.includes(item._id);
                  return (
                    <div
                      key={item._id}
                      onClick={() => handleDomainSelect(item)}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50'
                          : isChecked
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => { e.stopPropagation(); toggleCheck(item._id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-amber-500"
                      />
                      <span
                        className="truncate text-sm font-medium text-indigo-700"
                      >
                        {getDomainHostLabel(item)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right panel: analytics or compare ── */}
          <div className="min-w-0 flex-1">
            {showAnalytics && (
              <div className="rounded-lg border border-indigo-200 bg-white shadow-sm overflow-hidden h-full">
                <div className="flex flex-wrap items-center gap-2 border-b border-indigo-100 bg-indigo-50 px-3 py-3 lg:px-4">
                  <div className="flex min-w-0 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 shadow-sm lg:px-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                      {viewIsBrand ? 'Brand Analytics' : 'Domain Analytics'}
                    </span>
                    <span className="h-4 w-px bg-indigo-400" />
                    <span className="truncate text-sm font-bold text-white lg:text-base">{analyticsLabel}</span>
                  </div>
                  {viewIsDomain && (
                    <a
                      href={toExternalUrl(view.domain)}
                      target="_blank"
                      rel="noreferrer"
                      title="Go to Page"
                      aria-label="Go to Page"
                      className="inline-flex h-7 w-7 items-center justify-center rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
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
                  )}
                  <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                    {viewIsDomain && canDeleteDomains && (
                      <button
                        type="button"
                        onClick={() => remove(view._id)}
                        className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
                      >
                        Delete Domain
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setView(null)}
                      className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-200"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <AnalyticsInline
                  brand={selectedBrand}
                  domainItem={viewIsDomain ? view : null}
                  onGetRankingHistory={onGetRankingHistory}
                />
              </div>
            )}

            {viewIsCompare && (
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-blue-50 px-3 py-3 lg:px-4">
                  <div className="flex min-w-0 items-center gap-2 rounded-lg bg-black px-3 py-2 shadow-sm lg:px-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-100">
                      {compareMode === 'brand' ? 'Brand Compare' : 'Domain Compare'}
                    </span>
                    <span className="h-4 w-px bg-amber-300" />
                    <span className="truncate text-sm font-bold text-white lg:text-base">
                      {compareMode === 'brand' ? selectedBrand.code : `${checkedDomains.length} Domains`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setView('brand'); setCheckedIds([]); }}
                    className="ml-auto rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
                  >
                    Close
                  </button>
                </div>
                <ComparePanel
                  mode={compareMode}
                  selectedBrand={selectedBrand}
                  brands={brands}
                  domainItems={compareMode === 'domain' ? view.items : []}
                  allDomains={brandDomains}
                  onGetRankingHistory={onGetRankingHistory}
                />
              </div>
            )}

            {!showAnalytics && !viewIsCompare && (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                Select a domain or click the brand name to view analytics.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-40 rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-500">
          Select a brand from the sidebar to view its domains.
        </div>
      )}
    </section>
  );
}

export default DomainManagementPanel;
