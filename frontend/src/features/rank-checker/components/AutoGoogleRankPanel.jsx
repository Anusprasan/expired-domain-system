import { useEffect, useMemo, useState } from "react";
import {
  getAutoGoogleRankRun,
  getGoogleRankAvailability,
  startAutoGoogleRankRun,
  stopAutoGoogleRankRun,
} from "../api/rankCheckerApi";

const AUTO_GOOGLE_RANK_STORAGE_KEY = "auto_google_rank_run_id";
const GOOGLE_RANK_AVAILABILITY_POLL_MS = 15000;
const COUNTRIES = [
  { code: "id", label: "Indonesia" },
  { code: "us", label: "United States" },
  { code: "in", label: "India" },
  { code: "sg", label: "Singapore" },
  { code: "my", label: "Malaysia" },
  { code: "th", label: "Thailand" },
  { code: "vn", label: "Vietnam" },
  { code: "ph", label: "Philippines" },
  { code: "au", label: "Australia" },
  { code: "gb", label: "United Kingdom" },
  { code: "ca", label: "Canada" },
  { code: "de", label: "Germany" },
  { code: "fr", label: "France" },
  { code: "jp", label: "Japan" },
  { code: "kr", label: "South Korea" },
  { code: "cn", label: "China" },
  { code: "sa", label: "Saudi Arabia" },
  { code: "ae", label: "UAE" },
  { code: "tr", label: "Turkey" },
  { code: "br", label: "Brazil" },
  { code: "ru", label: "Russia" },
  { code: "za", label: "South Africa" },
];
const LANGUAGES = [
  { code: "id", label: "Indonesian" },
  { code: "en", label: "English" },
  { code: "ms", label: "Malay" },
  { code: "th", label: "Thai" },
  { code: "vi", label: "Vietnamese" },
  { code: "tl", label: "Filipino" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "ar", label: "Arabic" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
];

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;

const getAvailabilityToneClassName = (availability) => {
  if (availability?.available === false) {
    return "border border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border border-slate-200 bg-slate-50 text-slate-700";
};

const isTerminalStatus = (status) => status === "completed" || status === "stopped" || status === "failed";

function DomainResultColumn({ title, items, tone }) {
  const toneClasses =
    tone === "own"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-slate-200 bg-slate-50 text-slate-900";

  return (
    <div className={`overflow-hidden rounded-xl border ${toneClasses}`}>
      <div className="border-b border-black/5 px-4 py-3 text-sm font-semibold">{title}</div>
      <div className="bg-white">
        {!items.length ? (
          <p className="px-4 py-4 text-sm text-slate-500">No domains found in this column.</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left">Rank</th>
                <th className="px-4 py-2 text-left">Domain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={`${item.rank}-${item.link}`}>
                  <td className="px-4 py-3 font-semibold text-slate-900">#{item.rank}</td>
                  <td className="px-4 py-3">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-700 hover:underline"
                      title={item.title || item.domain || item.domainHost}
                    >
                      {item.domain || item.domainHost || item.link}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function AutoGoogleRankPanel({ brands = [] }) {
  const [country, setCountry] = useState("id");
  const [language, setLanguage] = useState("id");
  const [isMobile, setIsMobile] = useState(true);
  const [availability, setAvailability] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [runId, setRunId] = useState("");
  const [runState, setRunState] = useState(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshAvailability = async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setAvailabilityLoading(true);
    }

    try {
      const payload = await getGoogleRankAvailability();
      setAvailability(payload);
      return payload;
    } catch {
      setAvailability(null);
      return null;
    } finally {
      if (showLoader) {
        setAvailabilityLoading(false);
      }
    }
  };

  useEffect(() => {
    const savedRunId = localStorage.getItem(AUTO_GOOGLE_RANK_STORAGE_KEY) || "";
    if (savedRunId) {
      setRunId(savedRunId);
    }
  }, []);

  useEffect(() => {
    refreshAvailability({ showLoader: true });
    const timer = window.setInterval(() => {
      refreshAvailability();
    }, GOOGLE_RANK_AVAILABILITY_POLL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!runId) {
      return undefined;
    }

    let timer = null;
    let cancelled = false;

    const poll = async () => {
      try {
        const payload = await getAutoGoogleRankRun(runId);
        if (cancelled) return;

        setRunState(payload);
        await refreshAvailability();

        if (isTerminalStatus(payload.status)) {
          if (payload.status === "failed" && payload.error) {
            setError(payload.error);
          }
          return;
        }

        timer = window.setTimeout(poll, 1000);
      } catch (requestError) {
        if (cancelled) return;
        setRunState(null);
        setRunId("");
        localStorage.removeItem(AUTO_GOOGLE_RANK_STORAGE_KEY);
        setError(getErrorMessage(requestError, "Failed to fetch Auto Google Rank progress"));
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [runId]);

  const processedBrands = Number(runState?.processedBrands || 0);
  const totalBrands = Number(runState?.totalBrands || brands.length || 0);
  const progressPercent = totalBrands > 0 ? Math.round((processedBrands / totalBrands) * 100) : 0;
  const isRunActive = runState?.status === "pending" || runState?.status === "running" || starting;
  const isUnavailable = availability?.available === false;
  const startDisabled = starting || isRunActive || availabilityLoading || isUnavailable || brands.length === 0;
  const compactCurrentKeyLabel = availability?.currentKey?.name || "-";
  const compactRemainingLabel = availability?.currentKey?.remainingRequests ?? "-";

  const ownHits = useMemo(
    () => (runState?.results || []).reduce((sum, item) => sum + Number(item.ownCount || 0), 0),
    [runState]
  );
  const unknownHits = useMemo(
    () => (runState?.results || []).reduce((sum, item) => sum + Number(item.unknownCount || 0), 0),
    [runState]
  );
  const unknownUrls = useMemo(() => {
    const values = [];

    (runState?.results || []).forEach((brandResult) => {
      (brandResult?.unknownResults || []).forEach((item) => {
        const link = String(item?.link || "").trim();
        if (!link) {
          return;
        }

        values.push(link);
      });
    });

    return values;
  }, [runState]);

  const startRun = async () => {
    try {
      setStarting(true);
      setError("");
      setNotice("");
      setRunState(null);
      setRunId("");
      localStorage.removeItem(AUTO_GOOGLE_RANK_STORAGE_KEY);
      const payload = await startAutoGoogleRankRun({
        country,
        language,
        isMobile,
      });
      setRunState(payload);
      setRunId(payload.runId);
      localStorage.setItem(AUTO_GOOGLE_RANK_STORAGE_KEY, payload.runId);
      await refreshAvailability();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to start Auto Google Rank"));
      await refreshAvailability();
    } finally {
      setStarting(false);
    }
  };

  const copyUnknownUrls = async () => {
    if (!unknownUrls.length) {
      setNotice("No unknown URLs available to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(unknownUrls.join("\n"));
      setNotice(`Copied ${unknownUrls.length} unknown URLs.`);
    } catch {
      setNotice("Copy failed. Your browser blocked clipboard access.");
    }
  };

  const stopRun = async () => {
    if (!runId) return;

    try {
      setStopping(true);
      setError("");
      const payload = await stopAutoGoogleRankRun(runId);
      setRunState(payload);
      setNotice("Stop requested. The current brand will finish, then the run will stop.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to stop Auto Google Rank"));
    } finally {
      setStopping(false);
    }
  };

  const clearRun = () => {
    setRunId("");
    setRunState(null);
    setError("");
    setNotice("");
    localStorage.removeItem(AUTO_GOOGLE_RANK_STORAGE_KEY);
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Auto Google Rank</h2>
            <p className="mt-1 text-sm text-slate-500">
              Run Google Rank checks across every brand and review OWN domains versus unknown domains in the top 10 results.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
            <p><span className="font-semibold text-slate-900">Current Key:</span> {compactCurrentKeyLabel}</p>
            <p><span className="font-semibold text-slate-900">Usage:</span> {compactRemainingLabel} remaining</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex w-full flex-col justify-end sm:w-[180px]">
            <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              disabled={isRunActive}
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
            >
              {COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex w-full flex-col justify-end sm:w-[180px]">
            <label className="mb-1 block text-sm font-medium text-slate-700">Language</label>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              disabled={isRunActive}
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
            >
              {LANGUAGES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex w-full flex-col justify-end sm:w-auto">
            <label className="mb-1 block text-sm font-medium text-slate-700">View</label>
            <div className="inline-flex h-10 rounded-md border border-slate-300 p-1">
              <button
                type="button"
                onClick={() => setIsMobile(false)}
                disabled={isRunActive}
                className={`rounded px-3 text-sm font-medium ${
                  !isMobile ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setIsMobile(true)}
                disabled={isRunActive}
                className={`rounded px-3 text-sm font-medium ${
                  isMobile ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Mobile
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={startRun}
            disabled={startDisabled}
            className="h-10 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {starting ? "Starting..." : "Start Auto Check"}
          </button>
          <button
            type="button"
            onClick={stopRun}
            disabled={!isRunActive || !runId || stopping}
            className="h-10 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stopping ? "Stopping..." : "Stop"}
          </button>
          <button
            type="button"
            onClick={clearRun}
            disabled={isRunActive}
            className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={copyUnknownUrls}
            disabled={!unknownUrls.length}
            className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Copy Unknown URLs
          </button>
        </div>

        {availabilityLoading ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Checking Google Rank SerpAPI status...
          </p>
        ) : null}

        {availability?.message ? (
          <p className={`mt-3 rounded-lg px-4 py-3 text-sm ${getAvailabilityToneClassName(availability)}`}>
            {availability.message}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : null}

        {notice ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Brands</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{totalBrands}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Processed</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{processedBrands}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">OWN Hits</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{ownHits}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Unknown Hits</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{unknownHits}</p>
        </div>
      </section>

      {runState ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Run Progress</h3>
              <p className="mt-1 text-sm text-slate-500">
                Status: {runState.status || "pending"}
                {runState.activeBrandCode ? ` | Checking: ${runState.activeBrandCode}` : ""}
                {runState.params?.gl ? ` | Country: ${String(runState.params.gl).toUpperCase()}` : ""}
                {runState.params?.hl ? ` | Language: ${String(runState.params.hl).toUpperCase()}` : ""}
                {runState.params?.device ? ` | View: ${runState.params.device}` : ""}
              </p>
            </div>
            <div className="text-sm font-semibold text-slate-700">{progressPercent}%</div>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </section>
      ) : null}

      {(runState?.results || []).map((item) => (
        <section key={`${item.brand._id}-${item.checkedAt}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{item.brand.name}</h3>
              <p className="mt-1 text-sm text-slate-500">
                Query: {item.query} | OWN: {item.ownCount} | Unknown: {item.unknownCount}
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <DomainResultColumn title="OWN Domains in Top 10" items={item.ownResults || []} tone="own" />
            <DomainResultColumn title="Unknown Domains in Top 10" items={item.unknownResults || []} tone="unknown" />
          </div>
        </section>
      ))}

      {(runState?.errors || []).length ? (
        <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Brand Errors</h3>
          <div className="mt-4 space-y-3">
            {runState.errors.map((item) => (
              <div key={`${item.brand._id}-${item.code || item.error}`} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="font-semibold text-rose-900">{item.brand.name}</p>
                <p className="mt-1 text-sm text-rose-700">{item.error}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {runState && !(runState.results || []).length && !(runState.errors || []).length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
          Auto Google Rank results will appear here as each brand is processed.
        </section>
      ) : null}
    </div>
  );
}
