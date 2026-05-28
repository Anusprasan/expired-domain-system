import { useEffect, useMemo, useState } from "react";
import {
  addGoogleRankApiKey,
  checkGoogleRank,
  deleteGoogleRankApiKey,
  getAdminSettings,
  getGoogleRankAvailability,
  updateGoogleRankApiKey,
} from "../api/rankCheckerApi";
import ResultsList from "./ResultsList";

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

const GOOGLE_RANK_AVAILABILITY_POLL_MS = 15000;

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;

const getAvailabilityToneClassName = (availability) => {
  if (availability?.available === false) {
    return "border border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border border-slate-200 bg-slate-50 text-slate-700";
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
};

export default function GoogleRankPanel({ selectedBrand, canManageKeys }) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("id");
  const [language, setLanguage] = useState("id");
  const [isMobile, setIsMobile] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [resultsByBrand, setResultsByBrand] = useState({});
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [busy, setBusy] = useState("");
  const [newKeyForm, setNewKeyForm] = useState({ name: "", key: "", isActive: true });

  const selectedResult = useMemo(
    () => (selectedBrand ? resultsByBrand[selectedBrand._id] || null : null),
    [resultsByBrand, selectedBrand]
  );
  const googleRankKeys = settings?.googleRankApiKeys || [];
  const isUnavailable = availability?.available === false;
  const searchDisabled =
    loading ||
    availabilityLoading ||
    isUnavailable ||
    !selectedBrand ||
    !String(query || "").trim();

  useEffect(() => {
    setQuery(selectedBrand?.code || selectedBrand?.name || "");
  }, [selectedBrand]);

  const refreshAvailability = async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setAvailabilityLoading(true);
    }

    try {
      const payload = await getGoogleRankAvailability();
      setAvailability(payload);
      return payload;
    } catch (requestError) {
      setAvailability(null);
      return null;
    } finally {
      if (showLoader) {
        setAvailabilityLoading(false);
      }
    }
  };

  const refreshSettings = async ({ showLoader = false } = {}) => {
    if (!canManageKeys) {
      return null;
    }

    if (showLoader) {
      setSettingsLoading(true);
    }

    try {
      setSettingsError("");
      const payload = await getAdminSettings();
      setSettings(payload);
      return payload;
    } catch (requestError) {
      setSettingsError(getErrorMessage(requestError, "Failed to load Google Rank key settings"));
      return null;
    } finally {
      if (showLoader) {
        setSettingsLoading(false);
      }
    }
  };

  useEffect(() => {
    refreshAvailability({ showLoader: true });
    const timer = window.setInterval(() => {
      refreshAvailability();
    }, GOOGLE_RANK_AVAILABILITY_POLL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!canManageKeys) {
      return;
    }

    refreshSettings({ showLoader: true });
  }, [canManageKeys]);

  const handleSearch = async () => {
    if (!selectedBrand) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResultsByBrand((current) => {
        const next = { ...current };
        delete next[selectedBrand._id];
        return next;
      });
      const payload = await checkGoogleRank({
        brandId: selectedBrand._id,
        query,
        country,
        language,
        isMobile,
      });
      setResultsByBrand((current) => ({
        ...current,
        [selectedBrand._id]: payload,
      }));
      await refreshAvailability();
      if (canManageKeys) {
        refreshSettings();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to fetch Google Rank results"));
      setResultsByBrand((current) => {
        const next = { ...current };
        delete next[selectedBrand._id];
        return next;
      });
      await refreshAvailability();
      if (canManageKeys) {
        refreshSettings();
      }
    } finally {
      setLoading(false);
    }
  };

  const runKeyAction = async (key, action) => {
    try {
      setBusy(key);
      setSettingsError("");
      await action();
      await Promise.all([refreshSettings(), refreshAvailability()]);
    } catch (requestError) {
      setSettingsError(getErrorMessage(requestError, "Google Rank key action failed"));
    } finally {
      setBusy("");
    }
  };

  const promptEditKey = async (token) => {
    const name = window.prompt("Key name", token.name || "");
    if (name === null) return;
    const key = window.prompt("New SerpAPI key value (leave blank to keep current key)", "");
    if (key === null) return;
    const active = window.confirm("Keep this SerpAPI key active?");

    await updateGoogleRankApiKey(token._id, {
      name,
      key,
      isActive: active,
    });
  };

  const hideDuplicateError = error && availability?.message && error === availability.message;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Google Rank</h2>
              <p className="mt-1 text-sm text-slate-500">
                Separate SerpAPI-based testing for top 10 Google-style results using your saved Rank Checker brands and domains.
              </p>
            </div>
            {availability?.currentKey ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                <p><span className="font-semibold text-slate-900">Current Key:</span> {availability.currentKey.name}</p>
                <p><span className="font-semibold text-slate-900">Usage:</span> {availability.currentKey.remainingRequests ?? 0} remaining</p>
              </div>
            ) : null}
          </div>

          {availabilityLoading ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Checking Google Rank SerpAPI status...
            </p>
          ) : null}

          {availability?.message ? (
            <p className={`rounded-lg px-4 py-3 text-sm ${getAvailabilityToneClassName(availability)}`}>
              {availability.message}
            </p>
          ) : null}

          {!hideDuplicateError && error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          ) : null}
        </div>
      </section>

      {canManageKeys ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">SerpAPI Keys</h3>
              <p className="mt-1 text-sm text-slate-500">
                These keys are used only by the Google Rank test tab. Each key tracks a monthly limit of 250 requests.
              </p>
            </div>
            {settingsLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
          </div>

          {settingsError ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {settingsError}
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
            <form
              className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                runKeyAction("add-google-rank-key", async () => {
                  await addGoogleRankApiKey(newKeyForm);
                  setNewKeyForm({ name: "", key: "", isActive: true });
                });
              }}
            >
              <h4 className="text-sm font-semibold text-slate-900">Add SerpAPI Key</h4>
              <input
                value={newKeyForm.name}
                onChange={(event) => setNewKeyForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Key name"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
              <textarea
                value={newKeyForm.key}
                onChange={(event) => setNewKeyForm((current) => ({ ...current, key: event.target.value }))}
                placeholder="SERPAPI key"
                className="h-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={newKeyForm.isActive}
                  onChange={(event) => setNewKeyForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                <span>Active</span>
              </label>
              <button
                type="submit"
                disabled={busy === "add-google-rank-key"}
                className="w-fit rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy === "add-google-rank-key" ? "Adding..." : "Add Key"}
              </button>
            </form>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Key</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Usage</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {googleRankKeys.map((token) => (
                    <tr key={token._id}>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{token.name}</p>
                        <p className="text-xs text-slate-500">
                          {token.maskedKey} | Last used: {formatDateTime(token.lastUsedAt)}
                        </p>
                        {token.lastError ? (
                          <p className="mt-1 text-xs text-rose-600">Last error: {token.lastError}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">{token.isActive ? "Active" : "Inactive"}</td>
                      <td className="px-3 py-3">
                        {Math.max(0, Number(token.totalRequests) || 0)}/{Number(token.monthlyLimit) || 250}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => runKeyAction(`edit-google-rank-key-${token._id}`, () => promptEditKey(token))}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              runKeyAction(`delete-google-rank-key-${token._id}`, () =>
                                deleteGoogleRankApiKey(token._id)
                              )
                            }
                            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!googleRankKeys.length ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                        No Google Rank SerpAPI keys added yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {selectedBrand ? (
          <>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_180px_180px_260px_auto]">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Query</label>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="Use brand code by default"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
                <select
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
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
                  onChange={(event) => setLanguage(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
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
                <div className="inline-flex rounded-md border border-slate-300 p-1">
                  <button
                    type="button"
                    onClick={() => setIsMobile(false)}
                    className={`rounded px-3 py-1.5 text-sm font-medium ${
                      !isMobile ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMobile(true)}
                    className={`rounded px-3 py-1.5 text-sm font-medium ${
                      isMobile ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    Mobile
                  </button>
                </div>
              </div>
              <button
                type="button"
                disabled={searchDisabled}
                onClick={handleSearch}
                className="self-end rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Checking..." : "Check Google Rank"}
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              OWN is marked only when a result matches a domain you already added under this brand.
            </p>

            {selectedResult?.checkedAt ? (
              <p className="mt-2 text-xs text-slate-500">
                Last checked at: {formatDateTime(selectedResult.checkedAt)}
                {selectedResult?.params?.gl ? ` | region: ${selectedResult.params.gl.toUpperCase()}` : ""}
                {selectedResult?.params?.hl ? ` | language: ${selectedResult.params.hl.toUpperCase()}` : ""}
                {selectedResult?.params?.device ? ` | device: ${selectedResult.params.device}` : ""}
                {selectedResult?.keyName ? ` | key: ${selectedResult.keyName}` : ""}
                {Number.isFinite(Number(selectedResult?.keyTotalRequests))
                  ? ` | usage: ${Number(selectedResult.keyTotalRequests)}/${Number(selectedResult?.keyMonthlyLimit) || 250}`
                  : ""}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-500">Select a brand from the sidebar to test Google Rank results.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <ResultsList selectedBrand={selectedBrand} payload={selectedResult} />
      </section>
    </div>
  );
}
