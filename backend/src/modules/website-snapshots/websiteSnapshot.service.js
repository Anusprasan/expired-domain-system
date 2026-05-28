import JSZip from "jszip";
import mongoose from "mongoose";
import WebsiteSnapshotHistory, {
  WebsiteSnapshotViewState,
} from "./websiteSnapshotHistory.model.js";

const WAYBACK_BASE_URL = String(process.env.WAYBACK_BASE_URL || "https://web.archive.org").replace(/\/$/, "");
const CDX_SEARCH_URL = String(
  process.env.WAYBACK_CDX_URL || `${WAYBACK_BASE_URL}/cdx/search/cdx`
).replace(/\/$/, "");
const DEFAULT_RESULT_LIMIT = 5000;
const MAX_RESULT_LIMIT = 15000;
const MAX_ASSETS_PER_ZIP = 120;
const ASSET_CONCURRENCY = 6;
const MAX_HTML_BYTES = 15 * 1024 * 1024;
const MAX_ASSET_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 90 * 1024 * 1024;
const WAYBACK_TIMEOUT_MS = Math.max(10000, Number(process.env.WAYBACK_TIMEOUT_MS) || 45000);
const WAYBACK_RETRY_COUNT = Math.min(5, Math.max(0, Number(process.env.WAYBACK_RETRY_COUNT) || 2));
const WAYBACK_CDX_CACHE_TTL_MS = Math.max(
  60000,
  Number(process.env.WAYBACK_CDX_CACHE_TTL_MS) || 15 * 60 * 1000
);
const WAYBACK_CDX_CACHE_MAX_ENTRIES = Math.max(
  20,
  Number(process.env.WAYBACK_CDX_CACHE_MAX_ENTRIES) || 150
);
const cdxRecordsCache = new Map();

const DOWNLOADABLE_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".css",
  ".csv",
  ".doc",
  ".docx",
  ".eot",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".svg",
  ".ttf",
  ".txt",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".xml",
]);

const MIME_EXTENSION_MAP = new Map([
  ["text/css", ".css"],
  ["application/javascript", ".js"],
  ["text/javascript", ".js"],
  ["application/json", ".json"],
  ["application/pdf", ".pdf"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/svg+xml", ".svg"],
  ["image/webp", ".webp"],
  ["font/woff", ".woff"],
  ["font/woff2", ".woff2"],
  ["application/font-woff", ".woff"],
  ["application/vnd.ms-fontobject", ".eot"],
]);

class WebsiteSnapshotError extends Error {
  constructor(message, statusCode = 400, code = "WEBSITE_SNAPSHOT_ERROR") {
    super(message);
    this.name = "WebsiteSnapshotError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function createArchiveConnectionError(error) {
  const host = (() => {
    try {
      return new URL(CDX_SEARCH_URL).hostname;
    } catch {
      return "web.archive.org";
    }
  })();
  const errorName = error?.name || "NetworkError";
  const errorCode = error?.cause?.code || error?.code || "";
  const suffix = errorCode ? ` (${errorCode})` : "";

  return new WebsiteSnapshotError(
    `Unable to connect to the Wayback Machine from this server (${host}). Check the server firewall, DNS, hosting outbound access, or proxy settings. You can also set WAYBACK_BASE_URL / WAYBACK_CDX_URL in .env if your server must use a proxy endpoint. Last error: ${errorName}${suffix}.`,
    503,
    "WAYBACK_UNREACHABLE"
  );
}

function createArchiveHttpError(statusCode) {
  if (statusCode === 429) {
    return new WebsiteSnapshotError(
      "The Wayback Machine is rate limiting this server right now. Please wait a little and try again.",
      429,
      "WAYBACK_RATE_LIMITED"
    );
  }

  if ([500, 502, 503, 504].includes(statusCode)) {
    return new WebsiteSnapshotError(
      `The Wayback Machine is temporarily unavailable. It returned status ${statusCode}.`,
      503,
      "WAYBACK_TEMPORARILY_UNAVAILABLE"
    );
  }

  return new WebsiteSnapshotError(
    `Wayback snapshot request failed with status ${statusCode}.`,
    statusCode >= 400 && statusCode < 500 ? 400 : 503,
    "WAYBACK_HTTP_ERROR"
  );
}

function normalizeText(value, maxLength = 300) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function getActorSnapshot(user) {
  return {
    actorUserId: user?._id || user?.id || null,
    actorName: normalizeText(user?.fullName, 120),
    actorEmail: normalizeText(user?.email, 160).toLowerCase(),
  };
}

function normalizeScope(value) {
  return ["exact", "prefix", "domain"].includes(value) ? value : "exact";
}

function normalizeLimit(value) {
  const numericValue = Number(value) || DEFAULT_RESULT_LIMIT;
  return Math.min(MAX_RESULT_LIMIT, Math.max(1, Math.floor(numericValue)));
}

function normalizeDateStamp(value, endOfDay = false) {
  const rawValue = normalizeText(value, 20);
  if (!rawValue) {
    return "";
  }

  if (/^\d{4,14}$/.test(rawValue)) {
    return rawValue;
  }

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}${endOfDay ? "235959" : "000000"}`;
}

function normalizeTimestamp(value) {
  const timestamp = normalizeText(value, 20);
  if (!/^\d{14}$/.test(timestamp)) {
    throw new Error("Select a valid 14-digit Wayback snapshot timestamp before downloading.");
  }

  return timestamp;
}

function parseWaybackTimestamp(timestamp) {
  if (!/^\d{14}$/.test(String(timestamp || ""))) {
    return null;
  }

  const parts = {
    year: Number(timestamp.slice(0, 4)),
    month: Number(timestamp.slice(4, 6)) - 1,
    day: Number(timestamp.slice(6, 8)),
    hour: Number(timestamp.slice(8, 10)),
    minute: Number(timestamp.slice(10, 12)),
    second: Number(timestamp.slice(12, 14)),
  };
  const date = new Date(Date.UTC(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  ));

  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeWebsiteUrl(value) {
  const rawValue = normalizeText(value, 2048);
  if (!rawValue) {
    throw new WebsiteSnapshotError("Enter a website URL before searching snapshots.");
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawValue)
    ? rawValue
    : `https://${rawValue}`;

  let parsedUrl;
  try {
    parsedUrl = new URL(withProtocol);
  } catch {
    throw new WebsiteSnapshotError("Enter a valid website URL, for example https://example.com.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new WebsiteSnapshotError("Only HTTP and HTTPS website URLs can be searched.");
  }

  parsedUrl.hash = "";

  const pathname = parsedUrl.pathname || "/";
  const queryUrl = `${parsedUrl.hostname}${pathname}${parsedUrl.search}`;

  return {
    href: parsedUrl.toString(),
    host: parsedUrl.hostname,
    pathname,
    queryUrl,
  };
}

function buildCdxUrl({ queryUrl, scope, fromDate, toDate, limit }) {
  const params = new URLSearchParams();
  params.set("url", queryUrl);
  params.set("output", "json");
  params.set("fl", "timestamp,original,mimetype,statuscode,digest,length");
  params.append("filter", "statuscode:200");
  params.set("collapse", "timestamp:6");
  params.set("limit", String(limit));

  if (scope !== "exact") {
    params.set("matchType", scope);
  }

  const from = normalizeDateStamp(fromDate);
  const to = normalizeDateStamp(toDate, true);

  if (from) {
    params.set("from", from);
  }

  if (to) {
    params.set("to", to);
  }

  return `${CDX_SEARCH_URL}?${params.toString()}`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cloneRecords(records = []) {
  return records.map((record) => ({ ...record }));
}

function getCdxCacheEntry(cacheKey) {
  const entry = cdxRecordsCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.createdAt > WAYBACK_CDX_CACHE_TTL_MS) {
    cdxRecordsCache.delete(cacheKey);
    return null;
  }

  return {
    records: cloneRecords(entry.records),
    cached: true,
  };
}

function setCdxCacheEntry(cacheKey, records) {
  cdxRecordsCache.set(cacheKey, {
    createdAt: Date.now(),
    records: cloneRecords(records),
  });

  while (cdxRecordsCache.size > WAYBACK_CDX_CACHE_MAX_ENTRIES) {
    const oldestKey = cdxRecordsCache.keys().next().value;
    cdxRecordsCache.delete(oldestKey);
  }
}

function shouldRetryResponse(response) {
  return [408, 425, 429, 500, 502, 503, 504].includes(response.status);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = WAYBACK_TIMEOUT_MS) {
  let lastError = null;

  for (let attempt = 0; attempt <= WAYBACK_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: "*/*",
          "User-Agent": "200M-Web-App Website Snapshot Downloader",
          ...(options.headers || {}),
        },
      });

      if (attempt < WAYBACK_RETRY_COUNT && shouldRetryResponse(response)) {
        await sleep(600 * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt >= WAYBACK_RETRY_COUNT) {
        throw createArchiveConnectionError(error);
      }

      await sleep(700 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw createArchiveConnectionError(lastError);
}

async function fetchCdxRecords(requestUrl, options = {}) {
  if (options.cache !== false) {
    const cachedEntry = getCdxCacheEntry(requestUrl);
    if (cachedEntry) {
      return cachedEntry;
    }
  }

  const response = await fetchWithTimeout(requestUrl);

  if (!response.ok) {
    throw createArchiveHttpError(response.status);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new WebsiteSnapshotError(
      "The Wayback Machine returned an unreadable response. Please try again.",
      502,
      "WAYBACK_INVALID_RESPONSE"
    );
  }

  if (!Array.isArray(payload) || payload.length <= 1) {
    setCdxCacheEntry(requestUrl, []);
    return {
      records: [],
      cached: false,
    };
  }

  const header = payload[0];
  const records = payload
    .slice(1)
    .filter((row) => Array.isArray(row) && row.length >= header.length)
    .map((row) =>
      header.reduce((record, key, index) => {
        record[key] = row[index];
        return record;
      }, {})
    );

  setCdxCacheEntry(requestUrl, records);

  return {
    records,
    cached: false,
  };
}

function normalizeOriginalUrl(value) {
  const url = String(value || "").trim();
  if (url.startsWith("http://")) {
    return "https://" + url.slice(7);
  }
  return url;
}

function buildSnapshotViewKey(timestamp, originalUrl) {
  return `${timestamp}:${normalizeOriginalUrl(originalUrl)}`;
}

function normalizeViewStateSnapshot(value = {}) {
  const timestamp = normalizeTimestamp(value.timestamp);
  const originalUrl = normalizeOriginalUrl(normalizeText(value.originalUrl, 2048));

  if (!originalUrl) {
    throw new WebsiteSnapshotError("Select a valid snapshot URL before saving viewed state.");
  }

  return {
    timestamp,
    originalUrl,
    snapshotKey: buildSnapshotViewKey(timestamp, originalUrl),
  };
}

function buildSnapshot(record) {
  const timestamp = String(record.timestamp || "");
  const captureDate = parseWaybackTimestamp(timestamp);
  const originalUrl = normalizeOriginalUrl(normalizeText(record.original, 2048));

  return {
    timestamp,
    originalUrl,
    mimetype: normalizeText(record.mimetype, 120) || "text/html",
    statusCode: Number(record.statuscode) || 0,
    digest: normalizeText(record.digest, 120),
    length: Number(record.length) || 0,
    capturedAt: captureDate ? captureDate.toISOString() : "",
    archiveUrl: `${WAYBACK_BASE_URL}/web/${timestamp}/${originalUrl}`,
    previewArchiveUrl: `${WAYBACK_BASE_URL}/web/${timestamp}if_/${originalUrl}`,
    rawArchiveUrl: `${WAYBACK_BASE_URL}/web/${timestamp}id_/${originalUrl}`,
  };
}

function buildSearchSummary(items) {
  const years = items
    .map((item) => item.timestamp?.slice(0, 4))
    .filter(Boolean);

  return {
    totalSnapshots: items.length,
    newestYear: years[0] || "",
    oldestYear: years[years.length - 1] || "",
  };
}

function getUniquePageCount(items = []) {
  return new Set(items.map((item) => item.originalUrl).filter(Boolean)).size;
}

function toHistoryCapture(snapshot) {
  return {
    timestamp: snapshot.timestamp || "",
    originalUrl: snapshot.originalUrl || "",
    capturedAt: snapshot.capturedAt ? new Date(snapshot.capturedAt) : null,
    archiveUrl: snapshot.archiveUrl || "",
    previewArchiveUrl: snapshot.previewArchiveUrl || "",
    rawArchiveUrl: snapshot.rawArchiveUrl || "",
    mimetype: snapshot.mimetype || "",
    statusCode: Number(snapshot.statusCode) || 0,
    length: Number(snapshot.length) || 0,
    digest: snapshot.digest || "",
  };
}

function dedupeSnapshots(records) {
  const seen = new Set();

  return records
    .map(buildSnapshot)
    .filter((snapshot) => {
      const key = `${snapshot.timestamp}:${snapshot.originalUrl}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return Boolean(snapshot.timestamp && snapshot.originalUrl);
    })
    .sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
}

function getSearchQueryCandidates(normalizedUrl, scope) {
  if (scope !== "exact" || normalizedUrl.pathname !== "/") {
    return [normalizedUrl.queryUrl];
  }

  const candidates = [normalizedUrl.queryUrl];
  if (!normalizedUrl.host.startsWith("www.")) {
    candidates.push(`www.${normalizedUrl.host}/`);
  }

  return candidates;
}

export async function searchWebsiteSnapshotsService(filters = {}) {
  const normalizedUrl = normalizeWebsiteUrl(filters.url);
  const scope = normalizeScope(filters.scope);
  const limit = normalizeLimit(filters.limit);
  const queryCandidates = getSearchQueryCandidates(normalizedUrl, scope);
  const records = [];
  let cachedRequests = 0;
  let liveRequests = 0;

  for (const queryUrl of queryCandidates) {
    const requestUrl = buildCdxUrl({
      queryUrl,
      scope,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      limit,
    });
    const result = await fetchCdxRecords(requestUrl);
    records.push(...result.records);

    if (result.cached) {
      cachedRequests += 1;
    } else {
      liveRequests += 1;
    }

    if (result.records.length && scope === "exact") {
      break;
    }
  }

  const items = dedupeSnapshots(records).slice(0, limit);

  return {
    items,
    summary: buildSearchSummary(items),
    query: {
      url: normalizedUrl.href,
      scope,
      limit,
      fromDate: normalizeDateStamp(filters.fromDate),
      toDate: normalizeDateStamp(filters.toDate, true),
    },
    cache: {
      ttlMs: WAYBACK_CDX_CACHE_TTL_MS,
      cachedRequests,
      liveRequests,
    },
  };
}

export async function recordWebsiteSnapshotSearchHistory({
  actorUser,
  req,
  requestedUrl,
  result,
}) {
  if (!result?.query) {
    return null;
  }

  return WebsiteSnapshotHistory.create({
    type: "search",
    ...getActorSnapshot(actorUser),
    requestedUrl: normalizeText(requestedUrl, 2048),
    normalizedUrl: normalizeText(result.query.url, 2048),
    scope: result.query.scope || "",
    fromDate: result.query.fromDate || "",
    toDate: result.query.toDate || "",
    limit: Number(result.query.limit) || 0,
    totalSnapshots: Number(result.summary?.totalSnapshots) || 0,
    uniquePageCount: getUniquePageCount(result.items),
    cachedRequests: Number(result.cache?.cachedRequests) || 0,
    liveRequests: Number(result.cache?.liveRequests) || 0,
    snapshots: (result.items || []).slice(0, MAX_RESULT_LIMIT).map(toHistoryCapture),
    ipAddress: normalizeText(req?.ip, 80),
    userAgent: normalizeText(req?.headers?.["user-agent"], 400),
  });
}

export async function recordWebsiteSnapshotDownloadHistory({
  actorUser,
  req,
  requestedUrl,
  payload,
  result,
}) {
  return WebsiteSnapshotHistory.create({
    type: "download",
    ...getActorSnapshot(actorUser),
    requestedUrl: normalizeText(requestedUrl, 2048),
    normalizedUrl: normalizeText(result?.manifest?.originalUrl || payload?.originalUrl || payload?.url, 2048),
    selectedOriginalUrl: normalizeText(result?.manifest?.originalUrl || payload?.originalUrl, 2048),
    selectedTimestamp: normalizeText(result?.manifest?.timestamp || payload?.timestamp, 40),
    includeAssets: result?.manifest?.includeAssets !== false,
    downloadedAssets: Number(result?.manifest?.downloadedAssets?.length) || 0,
    skippedAssets: Number(result?.manifest?.skippedAssets?.length) || 0,
    ipAddress: normalizeText(req?.ip, 80),
    userAgent: normalizeText(req?.headers?.["user-agent"], 400),
  });
}

export async function listWebsiteSnapshotHistoryService(filters = {}) {
  const limit = Math.min(30, Math.max(1, Number(filters.limit) || 10));
  const query = {};

  if (filters.type && ["search", "download"].includes(filters.type)) {
    query.type = filters.type;
  }

  const items = await WebsiteSnapshotHistory.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    items,
  };
}

export async function listWebsiteSnapshotViewStatesService(payload = {}) {
  const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  const normalizedSnapshots = snapshots
    .slice(0, MAX_RESULT_LIMIT)
    .map((snapshot) => {
      try {
        return normalizeViewStateSnapshot(snapshot);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const snapshotKeys = Array.from(new Set(normalizedSnapshots.map((snapshot) => snapshot.snapshotKey)));

  if (!snapshotKeys.length) {
    return {
      items: [],
      viewedKeys: [],
    };
  }

  const items = await WebsiteSnapshotViewState.find({
    snapshotKey: { $in: snapshotKeys },
    viewed: true,
  })
    .select("snapshotKey timestamp originalUrl viewed viewedAt viewedByName viewedByEmail")
    .lean();

  return {
    items,
    viewedKeys: items.map((item) => item.snapshotKey),
  };
}

export async function setWebsiteSnapshotViewStateService(payload = {}, actorUser = null) {
  const snapshot = normalizeViewStateSnapshot(payload);
  const shouldMarkViewed = payload.viewed !== false;

  if (!shouldMarkViewed) {
    await WebsiteSnapshotViewState.findOneAndDelete({
      snapshotKey: snapshot.snapshotKey,
    });

    return {
      viewed: false,
      snapshotKey: snapshot.snapshotKey,
    };
  }

  const actor = getActorSnapshot(actorUser);
  const item = await WebsiteSnapshotViewState.findOneAndUpdate(
    { snapshotKey: snapshot.snapshotKey },
    {
      $set: {
        ...snapshot,
        viewed: true,
        viewedAt: new Date(),
        viewedByUserId: actor.actorUserId,
        viewedByName: actor.actorName,
        viewedByEmail: actor.actorEmail,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  return {
    viewed: true,
    snapshotKey: snapshot.snapshotKey,
    item,
  };
}

export async function deleteWebsiteSnapshotHistoryService(historyId) {
  if (!mongoose.Types.ObjectId.isValid(historyId)) {
    throw new WebsiteSnapshotError("Select a valid snapshot history record before deleting.");
  }

  const deletedRecord = await WebsiteSnapshotHistory.findByIdAndDelete(historyId).lean();

  if (!deletedRecord) {
    throw new WebsiteSnapshotError("Snapshot history record was not found.", 404);
  }

  return {
    deleted: true,
    item: deletedRecord,
  };
}

export async function checkWebsiteSnapshotArchiveStatusService(filters = {}) {
  const normalizedUrl = normalizeWebsiteUrl(filters.url || "example.com");
  const requestUrl = buildCdxUrl({
    queryUrl: normalizedUrl.queryUrl,
    scope: "exact",
    limit: 1,
  });
  const startedAt = Date.now();
  const result = await fetchCdxRecords(requestUrl, { cache: false });

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    endpoint: (() => {
      try {
        return new URL(CDX_SEARCH_URL).hostname;
      } catch {
        return CDX_SEARCH_URL;
      }
    })(),
    sampleUrl: normalizedUrl.href,
    sampleSnapshotCount: result.records.length,
  };
}

function buildRawArchiveUrl(timestamp, originalUrl) {
  return `${WAYBACK_BASE_URL}/web/${timestamp}id_/${originalUrl}`;
}

function isSafeWaybackRedirect(url) {
  try {
    return new URL(url).hostname === "web.archive.org";
  } catch {
    return false;
  }
}

async function fetchWaybackResource(url, options = {}, redirectCount = 0) {
  const response = await fetchWithTimeout(
    url,
    {
      ...options,
      redirect: "manual",
    },
    options.timeoutMs || WAYBACK_TIMEOUT_MS
  );

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location || redirectCount >= 5) {
      throw new WebsiteSnapshotError("Wayback returned too many redirects for this file.", 502);
    }

    const nextUrl = new URL(location, url).toString();
    if (!isSafeWaybackRedirect(nextUrl)) {
      throw new WebsiteSnapshotError("Wayback attempted to redirect outside the archive.", 502);
    }

    return fetchWaybackResource(nextUrl, options, redirectCount + 1);
  }

  return response;
}

function getExtensionFromPath(pathname) {
  const match = String(pathname || "").toLowerCase().match(/\.[a-z0-9]{1,8}$/);
  return match?.[0] || "";
}

function isDownloadableAssetUrl(value) {
  let parsedUrl;

  try {
    parsedUrl = new URL(value);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return false;
  }

  const extension = getExtensionFromPath(parsedUrl.pathname);
  return DOWNLOADABLE_EXTENSIONS.has(extension);
}

function resolveAssetUrl(value, baseUrl) {
  const rawValue = String(value || "").trim();
  if (
    !rawValue
    || rawValue.startsWith("#")
    || /^(?:data|blob|mailto|tel|javascript):/i.test(rawValue)
  ) {
    return null;
  }

  try {
    return new URL(rawValue, baseUrl).toString();
  } catch {
    return null;
  }
}

function collectAssetReferences(html, pageUrl) {
  const references = new Map();
  const addReference = (rawValue, type) => {
    const absoluteUrl = resolveAssetUrl(rawValue, pageUrl);
    if (!absoluteUrl || !isDownloadableAssetUrl(absoluteUrl)) {
      return;
    }

    if (!references.has(absoluteUrl)) {
      references.set(absoluteUrl, {
        absoluteUrl,
        originalValues: new Set(),
        type,
      });
    }

    references.get(absoluteUrl).originalValues.add(String(rawValue || "").trim());
  };

  const attributePattern =
    /\b(?:src|href|poster|data-src|data-original)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let attributeMatch = attributePattern.exec(html);
  while (attributeMatch) {
    addReference(attributeMatch[1] || attributeMatch[2] || attributeMatch[3], "attribute");
    attributeMatch = attributePattern.exec(html);
  }

  const srcsetPattern = /\b(?:srcset|data-srcset)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let srcsetMatch = srcsetPattern.exec(html);
  while (srcsetMatch) {
    const srcset = srcsetMatch[1] || srcsetMatch[2] || "";
    srcset
      .split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .forEach((entryUrl) => addReference(entryUrl, "srcset"));
    srcsetMatch = srcsetPattern.exec(html);
  }

  const cssUrlPattern = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\s*\)/gi;
  let cssMatch = cssUrlPattern.exec(html);
  while (cssMatch) {
    addReference(cssMatch[1] || cssMatch[2] || cssMatch[3], "css");
    cssMatch = cssUrlPattern.exec(html);
  }

  return Array.from(references.values())
    .map((reference) => ({
      ...reference,
      originalValues: Array.from(reference.originalValues),
    }))
    .slice(0, MAX_ASSETS_PER_ZIP);
}

function sanitizePathSegment(value, fallback = "file") {
  const decodedValue = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })();

  return String(decodedValue || fallback)
    .replace(/[<>:"\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+$/, fallback)
    .slice(0, 120)
    || fallback;
}

function getExtensionForContentType(contentType) {
  const normalizedType = String(contentType || "").split(";")[0].trim().toLowerCase();
  return MIME_EXTENSION_MAP.get(normalizedType) || "";
}

function buildAssetZipPath(assetUrl, contentType, usedPaths) {
  const parsedUrl = new URL(assetUrl);
  const host = sanitizePathSegment(parsedUrl.hostname, "host");
  const pathSegments = parsedUrl.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => sanitizePathSegment(part));
  let fileName = pathSegments.pop() || "index";

  if (!getExtensionFromPath(fileName)) {
    fileName = `${fileName}${getExtensionForContentType(contentType) || ".asset"}`;
  }

  const directory = ["assets", host, ...pathSegments].join("/");
  let zipPath = `${directory}/${fileName}`;
  let duplicateCounter = 2;

  while (usedPaths.has(zipPath)) {
    const extension = getExtensionFromPath(fileName);
    const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
    zipPath = `${directory}/${baseName}-${duplicateCounter}${extension}`;
    duplicateCounter += 1;
  }

  usedPaths.add(zipPath);
  return zipPath;
}

function rewriteHtmlAssetReferences(html, downloadedAssets) {
  let rewrittenHtml = html;

  downloadedAssets.forEach((asset) => {
    asset.originalValues.forEach((originalValue) => {
      if (!originalValue || !asset.zipPath) {
        return;
      }

      rewrittenHtml = rewrittenHtml.split(originalValue).join(asset.zipPath);
    });
  });

  return rewrittenHtml;
}

async function fetchArchiveText(timestamp, originalUrl) {
  const response = await fetchWaybackResource(buildRawArchiveUrl(timestamp, originalUrl), {
    timeoutMs: WAYBACK_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new Error(`Could not download archived HTML. Wayback returned ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length")) || 0;
  if (contentLength > MAX_HTML_BYTES) {
    throw new Error("The archived HTML is too large to download safely.");
  }

  return response.text();
}

async function fetchArchiveAsset(reference, timestamp, usedPaths) {
  const response = await fetchWaybackResource(buildRawArchiveUrl(timestamp, reference.absoluteUrl), {
    timeoutMs: WAYBACK_TIMEOUT_MS,
  });

  if (!response.ok) {
    throw new Error(`Wayback returned ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length")) || 0;
  if (contentLength > MAX_ASSET_BYTES) {
    throw new Error("File is larger than the safe per-asset limit.");
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_ASSET_BYTES) {
    throw new Error("File is larger than the safe per-asset limit.");
  }

  const contentType = response.headers.get("content-type") || "";

  return {
    ...reference,
    buffer,
    size: buffer.length,
    contentType,
    zipPath: buildAssetZipPath(reference.absoluteUrl, contentType, usedPaths),
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = [];
  let index = 0;

  async function runNext() {
    const currentIndex = index;
    index += 1;

    if (currentIndex >= items.length) {
      return;
    }

    results[currentIndex] = await worker(items[currentIndex], currentIndex);
    await runNext();
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runNext())
  );

  return results;
}

function buildDownloadFileName(host, timestamp) {
  const safeHost = sanitizePathSegment(host || "website", "website");
  return `${safeHost}-wayback-${timestamp}.zip`;
}

export async function downloadWebsiteSnapshotService(payload = {}) {
  const timestamp = normalizeTimestamp(payload.timestamp);
  const normalizedUrl = normalizeWebsiteUrl(payload.originalUrl || payload.url);
  const includeAssets = payload.includeAssets !== false;
  const html = await fetchArchiveText(timestamp, normalizedUrl.href);
  const assetReferences = includeAssets ? collectAssetReferences(html, normalizedUrl.href) : [];
  const zip = new JSZip();
  const usedPaths = new Set();
  const downloadedAssets = [];
  const skippedAssets = [];
  let totalAssetBytes = 0;

  await mapWithConcurrency(assetReferences, ASSET_CONCURRENCY, async (reference) => {
    try {
      const asset = await fetchArchiveAsset(reference, timestamp, usedPaths);

      if (totalAssetBytes + asset.size > MAX_TOTAL_ASSET_BYTES) {
        skippedAssets.push({
          url: reference.absoluteUrl,
          reason: "Skipped because the ZIP asset size safety limit was reached.",
        });
        return null;
      }

      totalAssetBytes += asset.size;
      downloadedAssets.push(asset);
      zip.file(asset.zipPath, asset.buffer);
      return asset;
    } catch (error) {
      skippedAssets.push({
        url: reference.absoluteUrl,
        reason: error.message,
      });
      return null;
    }
  });

  const rewrittenHtml = rewriteHtmlAssetReferences(html, downloadedAssets);
  const manifest = {
    createdAt: new Date().toISOString(),
    requestedUrl: payload.url || "",
    originalUrl: normalizedUrl.href,
    timestamp,
    archiveUrl: `${WAYBACK_BASE_URL}/web/${timestamp}/${normalizedUrl.href}`,
    rawArchiveUrl: buildRawArchiveUrl(timestamp, normalizedUrl.href),
    includeAssets,
    limits: {
      maxAssetsPerZip: MAX_ASSETS_PER_ZIP,
      maxAssetBytes: MAX_ASSET_BYTES,
      maxTotalAssetBytes: MAX_TOTAL_ASSET_BYTES,
    },
    downloadedAssets: downloadedAssets.map((asset) => ({
      url: asset.absoluteUrl,
      path: asset.zipPath,
      size: asset.size,
      contentType: asset.contentType,
    })),
    skippedAssets,
  };

  zip.file("index.html", rewrittenHtml);
  zip.file("index.original.html", html);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const archiveBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    archiveBuffer,
    fileName: buildDownloadFileName(normalizedUrl.host, timestamp),
    manifest,
  };
}
