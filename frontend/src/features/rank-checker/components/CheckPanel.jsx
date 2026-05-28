import { useEffect, useState } from 'react';
import {
  getSerperAvailabilityAlertClassName,
  shouldHideDuplicateSerperError,
} from '../utils/serperAvailabilityUi';

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


const COUNTRIES = [
  { code: 'id', label: 'Indonesia' },
  { code: 'us', label: 'United States' },
  { code: 'in', label: 'India' },
  { code: 'sg', label: 'Singapore' },
  { code: 'my', label: 'Malaysia' },
  { code: 'th', label: 'Thailand' },
  { code: 'vn', label: 'Vietnam' },
  { code: 'ph', label: 'Philippines' },
  { code: 'au', label: 'Australia' },
  { code: 'gb', label: 'United Kingdom' },
  { code: 'ca', label: 'Canada' },
  { code: 'de', label: 'Germany' },
  { code: 'fr', label: 'France' },
  { code: 'jp', label: 'Japan' },
  { code: 'kr', label: 'South Korea' },
  { code: 'cn', label: 'China' },
  { code: 'sa', label: 'Saudi Arabia' },
  { code: 'ae', label: 'UAE' },
  { code: 'tr', label: 'Turkey' },
  { code: 'br', label: 'Brazil' },
  { code: 'ru', label: 'Russia' },
  { code: 'za', label: 'South Africa' },
];

const LANGUAGES = [
  { code: 'id', label: 'Indonesian' },
  { code: 'en', label: 'English' },
  { code: 'ms', label: 'Malay' },
  { code: 'th', label: 'Thai' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'tl', label: 'Filipino' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'ar', label: 'Arabic' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'tr', label: 'Turkish' },
];

function CheckPanel({
  selectedBrand,
  onCheck,
  loading,
  error,
  resultEntry,
  serperAvailability,
  serperAvailabilityLoading,
}) {
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('id');
  const [language, setLanguage] = useState('id');
  const [isMobile, setIsMobile] = useState(true);
  const isSerperBlocked = serperAvailability?.available === false;
  const actionDisabled =
    loading || serperAvailabilityLoading || isSerperBlocked || !selectedBrand || !String(query || '').trim();
  const displayError = shouldHideDuplicateSerperError(error, serperAvailability) ? '' : error;

  useEffect(() => {
    setQuery(selectedBrand?.code || selectedBrand?.name || '');
  }, [selectedBrand]);

  return (
    <section className="flex-1 p-4 lg:p-4">
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {selectedBrand ? (
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_260px_auto]">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Query</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                placeholder="Use brand code by default"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {COUNTRIES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                {LANGUAGES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Device</label>
              <div className="inline-flex rounded-md border border-slate-300 p-0.5 p-1">
                <button
                  type="button"
                  onClick={() => setIsMobile(false)}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${!isMobile ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobile(true)}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${isMobile ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  Mobile
                </button>
              </div>
            </div>
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => onCheck({ brandId: selectedBrand._id, query, country, language, isMobile })}
              className="self-end rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Checking...' : 'Check Top 10'}
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Select a brand from the sidebar.</p>
        )}

        {loading && (
          <div className="mt-3 flex items-center gap-2 text-sm text-indigo-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
            Loading SERP results...
          </div>
        )}

        {selectedBrand ? (
          <p className="mt-3 text-xs text-slate-500">
            OWN is marked only when a result matches a domain you added under this brand.
          </p>
        ) : null}

        {serperAvailabilityLoading ? (
          <p className="mt-3 rounded bg-slate-50 p-2 text-sm text-slate-700">
            Checking Serper API status...
          </p>
        ) : null}

        {isSerperBlocked ? (
          <p className={`mt-3 rounded p-2 text-sm ${getSerperAvailabilityAlertClassName(serperAvailability)}`}>
            {serperAvailability?.message || 'Rank Checker is unavailable right now.'}
          </p>
        ) : null}

        {displayError ? <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{displayError}</p> : null}

        {resultEntry?.checkedAt && (
          <p className="mt-3 text-xs text-slate-500">
            Last checked at: {formatDateTimeWib(resultEntry.checkedAt)}
            {resultEntry.cached ? ' (cached)' : ''}
            {resultEntry.params?.gl ? ` | region: ${resultEntry.params.gl.toUpperCase()}` : ''}
            {resultEntry.params?.device ? ` | device: ${resultEntry.params.device}` : ''}
          </p>
        )}
      </div>
    </section>
  );
}

export default CheckPanel;
