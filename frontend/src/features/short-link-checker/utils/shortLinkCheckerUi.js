import { getShortLinkCheckerLocale } from "../constants/shortLinkCheckerLanguage";

export const DEFAULT_ALERT_STATUS_CODES = [400, 401, 403, 404, 408, 429, 500, 502, 503, 504];
export const SCAN_MODE_CAPTURE = "capture";
export const SCAN_MODE_STATUS_ONLY = "status-only";
export const STATUS_CLOUDFLARE = "cloudflare";
export const STATUS_SECURITY_VERIFICATION = "security-verification";

const BASE_ALERT_STATUS_OPTIONS = [
  { code: 0, label: "Unavailable" },
  { code: 400, label: "400 Bad Request" },
  { code: 401, label: "401 Unauthorized" },
  { code: 403, label: "403 Forbidden" },
  { code: 404, label: "404 Not Found" },
  { code: 408, label: "408 Timeout" },
  { code: 410, label: "410 Gone" },
  { code: 429, label: "429 Too Many Requests" },
  { code: 500, label: "500 Server Error" },
  { code: 502, label: "502 Bad Gateway" },
  { code: 503, label: "503 Unavailable" },
  { code: 504, label: "504 Timeout" },
];

export const EMPTY_FORM = {
  id: "",
  title: "",
  shortUrl: "",
  moneySiteId: "",
  moneySiteDomain: "",
  note: "",
  active: true,
};

export const EMPTY_IMPORT_FORM = {
  text: "",
  fileName: "",
  rows: [],
  active: true,
};

export const EMPTY_TELEGRAM = {
  enabled: false,
  chatId: "",
  botToken: "",
  hasBotToken: false,
  lastSentAt: null,
  lastError: "",
  sentCount: 0,
  failedCount: 0,
  alertStatusCodes: DEFAULT_ALERT_STATUS_CODES,
  customAlertStatusCodes: [],
  notifyCloudflareVerification: false,
  notifySecurityVerification: false,
};

export const EMPTY_SCHEDULE = {
  enabled: false,
  delayMinutes: 60,
  parallelChecks: 2,
  scanMode: SCAN_MODE_CAPTURE,
  nextRunAt: null,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: "",
};

export const EMPTY_STATUS = {
  running: false,
  stopRequested: false,
  currentBatch: null,
  serverNow: null,
  schedule: EMPTY_SCHEDULE,
};

export function getScanModeOptions(copy) {
  return [
    { value: SCAN_MODE_CAPTURE, label: copy.filters.captureAndStatus },
    { value: SCAN_MODE_STATUS_ONLY, label: copy.filters.statusOnly },
  ];
}

export function getAlertStatusOptions(copy) {
  return BASE_ALERT_STATUS_OPTIONS.map((option) =>
    option.code === 0 ? { ...option, label: copy.alerts.unavailable } : option
  );
}

export function getFilterOptions(copy) {
  return [
    { value: "all", label: copy.filters.all },
    { value: "success", label: copy.filters.success },
    { value: "error", label: copy.filters.error },
    { value: STATUS_CLOUDFLARE, label: copy.filters.cloudflare },
    { value: STATUS_SECURITY_VERIFICATION, label: copy.filters.securityVerification },
    { value: "not-checked", label: copy.filters.notChecked },
  ];
}

export function getActiveFilterOptions(copy) {
  return [
    { value: "all", label: copy.filters.allLinks },
    { value: "active", label: copy.filters.active },
    { value: "inactive", label: copy.filters.inactive },
  ];
}

export function formatDateTime(value, language) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString(getShortLinkCheckerLocale(language));
}

export function getTimeMs(value) {
  if (!value) {
    return 0;
  }

  const timeMs = new Date(value).getTime();
  return Number.isNaN(timeMs) ? 0 : timeMs;
}

export function formatCountdownMs(valueMs) {
  const totalSeconds = Math.max(0, Math.ceil(Number(valueMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getServerClockOffset(status) {
  const serverNowMs = getTimeMs(status?.serverNow);
  return serverNowMs ? Date.now() - serverNowMs : 0;
}

export function getNextCheckCountdownLabel({ enabled, nextRunAt, running, nowMs, copy }) {
  if (!enabled) {
    return copy.helpers.notScheduled;
  }

  if (running) {
    return copy.helpers.runningNow;
  }

  const nextRunMs = getTimeMs(nextRunAt);

  if (!nextRunMs) {
    return copy.helpers.calculating;
  }

  const remainingMs = nextRunMs - nowMs;

  return remainingMs <= 0 ? copy.helpers.starting : formatCountdownMs(remainingMs);
}

export function normalizeStatusCodes(value) {
  const codes = Array.isArray(value) ? value : DEFAULT_ALERT_STATUS_CODES;
  const normalized = codes
    .map((code) => Number(code))
    .filter((code) => Number.isInteger(code) && code >= 0 && code <= 599);

  return [...new Set(normalized)].sort((left, right) => left - right);
}

export function normalizeCustomAlertStatusCodes(value) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => ({
      code: Number(item?.code),
      name: String(item?.name || "").trim().replace(/\s+/g, " ").slice(0, 40),
    }))
    .filter((item) => Number.isInteger(item.code) && item.code >= 0 && item.code <= 599 && item.name);
  const byCode = new Map();

  normalized.forEach((item) => {
    byCode.set(item.code, item);
  });

  return [...byCode.values()].sort((left, right) => left.code - right.code);
}

export function getAlertStatusLabel(code, customStatusCodes = [], copy = null) {
  const normalizedCode = Number(code);
  const customStatus = normalizeCustomAlertStatusCodes(customStatusCodes).find((item) => item.code === normalizedCode);

  if (customStatus) {
    return `${customStatus.code} ${customStatus.name}`;
  }

  const option = BASE_ALERT_STATUS_OPTIONS.find((item) => item.code === normalizedCode);

  if (!option) {
    return String(normalizedCode);
  }

  if (option.code === 0 && copy) {
    return copy.alerts.unavailable;
  }

  return option.label;
}

export function normalizeScanMode(value) {
  return value === SCAN_MODE_STATUS_ONLY ? SCAN_MODE_STATUS_ONLY : SCAN_MODE_CAPTURE;
}

export function normalizeTelegram(value) {
  return {
    ...EMPTY_TELEGRAM,
    ...(value || {}),
    botToken: "",
    alertStatusCodes: normalizeStatusCodes(value?.alertStatusCodes),
    customAlertStatusCodes: normalizeCustomAlertStatusCodes(value?.customAlertStatusCodes),
    notifyCloudflareVerification: Boolean(value?.notifyCloudflareVerification),
    notifySecurityVerification: Boolean(value?.notifySecurityVerification),
  };
}

export function normalizeSchedule(value) {
  return {
    ...EMPTY_SCHEDULE,
    ...(value || {}),
    delayMinutes: Number(value?.delayMinutes || EMPTY_SCHEDULE.delayMinutes),
    parallelChecks: Number(value?.parallelChecks || EMPTY_SCHEDULE.parallelChecks),
    scanMode: normalizeScanMode(value?.scanMode),
  };
}

export function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .toLowerCase();
}

export function getStatusTone(status) {
  if (status === "success") {
    return "management-badge is-active";
  }

  if (status === STATUS_CLOUDFLARE || status === STATUS_SECURITY_VERIFICATION) {
    return "management-badge is-progress";
  }

  if (status === "error") {
    return "management-badge is-inactive";
  }

  return "management-badge";
}

export function getStatusLabel(status, copy) {
  if (status === STATUS_CLOUDFLARE) {
    return copy.common.statuses.cloudflare;
  }

  if (status === STATUS_SECURITY_VERIFICATION) {
    return copy.common.statuses.securityVerification;
  }

  if (status === "success") {
    return copy.common.statuses.success;
  }

  if (status === "error") {
    return copy.common.statuses.error;
  }

  return status || copy.common.statuses.notChecked;
}

export function getHttpTone(statusCode) {
  const status = Number(statusCode || 0);

  if (!status) {
    return "management-badge";
  }

  if (status >= 400) {
    return "management-badge is-inactive";
  }

  if (status >= 300) {
    return "management-badge is-progress";
  }

  return "management-badge is-active";
}

export function getMoneySiteId(site) {
  return String(site?._id || site?.id || "");
}

export function getMoneySiteBrandName(site) {
  return site?.brandId?.brandName || site?.brandName || "";
}

export function getMoneySiteLabel(site, copy) {
  return `${getMoneySiteBrandName(site) || copy.common.noBrand} - ${site?.domain || copy.common.noDomain}`;
}

export function getSelectedMoneySite(moneySites, moneySiteId) {
  return moneySites.find((site) => getMoneySiteId(site) === String(moneySiteId || "")) || null;
}

export function getMoneySiteByDomain(moneySites, domain) {
  return getMoneySitesByDomain(moneySites, domain)[0] || null;
}

export function getMoneySitesByDomain(moneySites, domain) {
  const normalizedDomain = normalizeDomain(domain);

  if (!normalizedDomain) {
    return [];
  }

  return moneySites.filter((site) => normalizeDomain(site.domain) === normalizedDomain);
}

export function splitImportLine(line) {
  const trimmedLine = String(line || "").replace(/\r$/, "");

  if (!trimmedLine) {
    return [];
  }

  const delimiter = trimmedLine.includes("\t") && !trimmedLine.includes(",") ? "\t" : ",";
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < trimmedLine.length; index += 1) {
    const character = trimmedLine[index];
    const nextCharacter = trimmedLine[index + 1];

    if (character === "\"" && inQuotes && nextCharacter === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (character === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());

  return cells;
}

export function looksLikeLink(value) {
  return /^https?:\/\//i.test(String(value || "")) || /\.[a-z]{2,}(\/|$)/i.test(String(value || ""));
}

function normalizeHeaderName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getHeaderIndex(headers, names) {
  const normalizedNames = names.map(normalizeHeaderName);
  return headers.findIndex((header) => normalizedNames.includes(normalizeHeaderName(header)));
}

function hasImportHeader(columns) {
  return columns.some((column) =>
    ["shorturl", "shortlink", "link", "url", "moneysitedomain", "domain", "title", "name", "note", "active"].includes(
      normalizeHeaderName(column)
    )
  ) && !columns.some((column) => looksLikeLink(column));
}

function getCell(columns, index) {
  return index >= 0 ? columns[index] || "" : "";
}

export function parseImportRows(text) {
  const rawRows = String(text || "")
    .split(/\r?\n/)
    .map((line) => ({ rawLine: line.trim(), columns: splitImportLine(line) }))
    .filter((row) => row.rawLine && row.columns.length);

  if (!rawRows.length) {
    return [];
  }

  const headerColumns = hasImportHeader(rawRows[0].columns) ? rawRows[0].columns : null;
  const dataRows = headerColumns ? rawRows.slice(1) : rawRows;

  if (headerColumns) {
    const titleIndex = getHeaderIndex(headerColumns, ["title", "name", "campaign"]);
    const shortUrlIndex = getHeaderIndex(headerColumns, ["shortUrl", "shortLink", "link", "url"]);
    const moneySiteDomainIndex = getHeaderIndex(headerColumns, ["moneySiteDomain", "moneySite", "domain"]);
    const noteIndex = getHeaderIndex(headerColumns, ["note", "notes"]);
    const activeIndex = getHeaderIndex(headerColumns, ["active", "enabled"]);

    return dataRows.map(({ rawLine, columns }, index) => ({
      importId: `${Date.now()}-${index}`,
      rawLine,
      title: getCell(columns, titleIndex),
      shortUrl: getCell(columns, shortUrlIndex),
      moneySiteDomain: getCell(columns, moneySiteDomainIndex),
      note: getCell(columns, noteIndex),
      active: !["false", "0", "no", "inactive"].includes(getCell(columns, activeIndex).toLowerCase()),
    }));
  }

  return dataRows.map(({ rawLine, columns }, index) => {
    const urlIndex = columns.findIndex((column) => looksLikeLink(column));

    if (urlIndex > 0) {
      return {
        importId: `${Date.now()}-${index}`,
        rawLine,
        title: columns[0] || "",
        shortUrl: columns[urlIndex] || "",
        moneySiteDomain: columns[urlIndex + 1] || "",
        note: columns.slice(urlIndex + 2).filter(Boolean).join(" "),
        active: true,
      };
    }

    return {
      importId: `${Date.now()}-${index}`,
      rawLine,
      shortUrl: columns[0] || rawLine,
      moneySiteDomain: columns[1] || "",
      title: columns[2] || "",
      note: columns.slice(3).filter(Boolean).join(" "),
      active: true,
    };
  });
}

export function buildShortLinkPayload(form, moneySites) {
  const selectedById = getSelectedMoneySite(moneySites, form.moneySiteId);
  const selectedByDomain = selectedById || getMoneySiteByDomain(moneySites, form.moneySiteDomain);

  return {
    title: form.title,
    shortUrl: form.shortUrl,
    note: form.note,
    active: form.active,
    moneySiteId: selectedByDomain ? getMoneySiteId(selectedByDomain) : "",
    moneySiteDomain: selectedByDomain?.domain || form.moneySiteDomain || "",
    brandName: selectedByDomain ? getMoneySiteBrandName(selectedByDomain) : "",
  };
}

export function buildImportItems(importRows, moneySites) {
  return importRows.map((row) => {
    const selectedSite = getSelectedMoneySite(moneySites, row.moneySiteId);
    const domainMatches = getMoneySitesByDomain(moneySites, row.moneySiteDomain);
    const matchedSite = selectedSite || (domainMatches.length === 1 ? domainMatches[0] : null);

    return {
      title: row.title,
      shortUrl: row.shortUrl,
      note: row.note,
      active: row.active !== false,
      moneySiteId: matchedSite ? getMoneySiteId(matchedSite) : "",
      moneySiteDomain: matchedSite?.domain || row.moneySiteDomain || "",
      brandName: matchedSite ? getMoneySiteBrandName(matchedSite) : "",
      rawLine: row.rawLine,
    };
  });
}

export function matchesFilter(link, filter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "not-checked") {
    return !link.latestCheck?.checkedAt;
  }

  return link.latestCheck?.status === filter;
}

export function matchesSearch(link, searchTerm) {
  const term = String(searchTerm || "").trim().toLowerCase();

  if (!term) {
    return true;
  }

  return [
    link.title,
    link.shortUrl,
    link.moneySiteDomain,
    link.brandName,
    link.note,
    link.latestCheck?.finalUrl,
    link.latestCheck?.error,
    link.latestCheck?.verificationName,
    link.latestCheck?.verificationReason,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term));
}

export function getScheduleScanLabel(status, copy) {
  const batch = status?.currentBatch;

  if (status?.running && batch?.status === "stopping") {
    return copy.helpers.stopping;
  }

  if (status?.running && batch?.source === "schedule") {
    return copy.helpers.autoChecking;
  }

  if (status?.running) {
    return copy.helpers.checking;
  }

  if (batch?.status === "completed") {
    return copy.helpers.completed;
  }

  if (batch?.status === "failed") {
    return copy.helpers.failed;
  }

  if (batch?.status === "stopped") {
    return copy.helpers.stopped;
  }

  return copy.helpers.idle;
}

export function getScheduleProgressLabel(status, copy) {
  const batch = status?.currentBatch;
  const completedCount = Number(batch?.completedCount || 0);
  const totalCount = Number(batch?.totalCount || 0);
  const stoppedCount = Number(batch?.stoppedCount || 0);

  if (!batch) {
    return copy.helpers.zeroQueued;
  }

  return stoppedCount
    ? copy.helpers.stoppedSuffix(completedCount, totalCount, stoppedCount)
    : `${completedCount}/${totalCount}`;
}

export function getLiveScanningLabel(status, copy) {
  const activeItems = Array.isArray(status?.currentBatch?.activeItems) ? status.currentBatch.activeItems : [];

  if (!activeItems.length) {
    return status?.running ? copy.helpers.starting : copy.helpers.idle;
  }

  const labels = activeItems
    .map((item) => item.shortUrl || item.title || item.linkId || "")
    .filter(Boolean);

  return labels.length ? labels.join(" | ") : copy.helpers.runningShort;
}

export function buildCaptureDownloadName(link, check) {
  const name = String(link?.title || link?.moneySiteDomain || link?.shortUrl || "short-link")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "short-link";
  const time = new Date(check?.checkedAt || Date.now()).toISOString().replace(/[:.]/g, "-");

  return `${name}_${time}.png`;
}
