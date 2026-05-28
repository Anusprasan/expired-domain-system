import crypto from "crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../users/user.model.js";
import Brand from "../brands/brand.model.js";
import ActivityLog from "../activity-logs/activityLog.model.js";
import {
  getAuthenticatedUserTelegramVerificationState,
  sendMoneySiteDeleteAllVerificationCodeToTelegram,
  sendMoneySiteImportVerificationCodeToTelegram,
} from "../auth/auth.telegram.service.js";
import MoneySite from "./moneySite.model.js";

const MAX_LIMIT = 200;
const IMPORT_VERIFICATION_TTL_MS = 5 * 60 * 1000;
const moneySiteImportVerificationStore = new Map();
const SCREENSHOT_SYNC_TIMEOUT_MS = Math.max(
  3000,
  Number(process.env.SCREENSHOT_SYNC_TIMEOUT_MS || 15000)
);

const BRAND_POPULATE = {
  path: "brandId",
  select: "brandName backgroundCss textColor cssClassName",
};

const CSV_HEADER_MAP = {
  brand: "brand",
  brandname: "brand",
  "brand name": "brand",
  code: "brand",
  domain: "domain",
  url: "domain",
  moneysite: "domain",
  "money site": "domain",
  note: "note",
  notes: "note",
  noto: "note",
  status: "statusText",
  statuses: "statusText",
  "site status": "statusText",
  "money site status": "statusText",
};

function getScreenshotTakerConfig() {
  const serviceUrl = String(process.env.SCREENSHOT_TAKER_SERVICE_URL || "").trim().replace(/\/+$/, "");
  const sharedSecret = String(process.env.SCREENSHOT_TAKER_PROXY_SECRET || "").trim();

  if (!serviceUrl || !sharedSecret) {
    return null;
  }

  return {
    serviceUrl,
    sharedSecret,
  };
}

async function requestScreenshotTaker(path, { method = "GET", body } = {}) {
  const config = getScreenshotTakerConfig();

  if (!config) {
    return null;
  }

  const requestHeaders = {
    "x-screenshot-proxy-secret": config.sharedSecret,
  };

  if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
  }

  const timeoutSignal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(SCREENSHOT_SYNC_TIMEOUT_MS)
      : undefined;

  const response = await fetch(`${config.serviceUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: timeoutSignal,
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(`Screenshot sync failed (${response.status}): ${responseText || "Unknown error"}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json().catch(() => null);
}

async function listAssignedScreenshotSites() {
  const siteListResponse = await requestScreenshotTaker("/api/sites");
  return Array.isArray(siteListResponse?.data?.items) ? siteListResponse.data.items : [];
}

function getMoneySiteId(item) {
  return String(item?._id || item?.id || "").trim();
}

function buildScreenshotAssignmentPayload(moneySite) {
  return {
    moneySiteId: getMoneySiteId(moneySite),
    domain: moneySite.domain,
    url: moneySite.domain,
    brandName: moneySite.brandId?.brandName || "",
    note: moneySite.note || "",
    active: moneySite.isActive !== false,
  };
}

async function syncScreenshotAssignmentsForMoneySites(moneySites = []) {
  const items = (Array.isArray(moneySites) ? moneySites : [moneySites])
    .filter(Boolean)
    .filter((item) => getMoneySiteId(item));

  if (!items.length) {
    return;
  }

  const config = getScreenshotTakerConfig();

  if (!config) {
    return;
  }

  try {
    const screenshotSites = await listAssignedScreenshotSites();
    const assignedMoneySiteIds = new Set(
      screenshotSites
        .map((site) => String(site?.moneySiteId || "").trim())
        .filter(Boolean)
    );
    const itemsToSync = items.filter((item) => assignedMoneySiteIds.has(getMoneySiteId(item)));

    if (!itemsToSync.length) {
      return;
    }

    const results = await Promise.allSettled(
      itemsToSync.map((item) =>
        requestScreenshotTaker("/api/sites", {
          method: "POST",
          body: buildScreenshotAssignmentPayload(item),
        })
      )
    );
    const failedCount = results.filter((result) => result.status === "rejected").length;

    if (failedCount) {
      console.warn(`[money-sites] Failed to sync ${failedCount} screenshot assignment update(s)`);
    }
  } catch (error) {
    console.warn("[money-sites] Failed to sync screenshot assignments after update:", error.message);
  }
}

async function removeScreenshotAssignmentsForMoneySiteIds(moneySiteIds = []) {
  const ids = [...new Set((moneySiteIds || []).map((item) => String(item || "").trim()).filter(Boolean))];

  if (!ids.length) {
    return;
  }

  const config = getScreenshotTakerConfig();

  if (!config) {
    return;
  }

  try {
    const screenshotSites = await listAssignedScreenshotSites();
    const matchingSites = screenshotSites.filter((site) => ids.includes(String(site?.moneySiteId || "").trim()));

    if (!matchingSites.length) {
      return;
    }

    await Promise.allSettled(
      matchingSites.map((site) =>
        requestScreenshotTaker(`/api/sites/${encodeURIComponent(String(site.id || ""))}`, {
          method: "DELETE",
        })
      )
    );
  } catch (error) {
    console.warn("[money-sites] Failed to sync screenshot assignments after deletion:", error.message);
  }
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeOptionalMoneySiteText(value) {
  const normalizedValue = normalizeText(value);
  return normalizedValue === "-" ? "" : normalizedValue;
}

function formatOptionalMoneySiteText(value) {
  return normalizeOptionalMoneySiteText(value) || "-";
}

function normalizeDomain(value) {
  const rawValue = String(value || "").trim().toLowerCase();

  if (!rawValue) {
    throw new Error("Domain is required");
  }

  try {
    const parsed = new URL(
      /^[a-z][a-z\d+\-.]*:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`
    );

    if (!parsed.hostname) {
      throw new Error("Domain is invalid");
    }

    const normalizedPath = parsed.pathname && parsed.pathname !== "/"
      ? parsed.pathname.replace(/\/+$/, "")
      : "";

    return `${parsed.hostname.toLowerCase()}${normalizedPath}${parsed.search || ""}`;
  } catch {
    throw new Error("Domain must be a valid domain or URL");
  }
}

function ensureObjectId(value, message) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ""))) {
    throw new Error(message);
  }
}

function mapNawalaStatus(status) {
  if (status === "ada") {
    return "Blocked";
  }

  if (status === "tidak ada") {
    return "Not Blocked";
  }

  return "Not Checked";
}

function buildPagination({ page = 1, limit = 25 } = {}) {
  const requestedPage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || 25));

  return {
    requestedPage,
    limit: safeLimit,
  };
}

function serializeMoneySite(item) {
  const value = typeof item.toObject === "function" ? item.toObject() : { ...item };

  return {
    ...value,
    nawalaLabel: mapNawalaStatus(value.nawala?.status),
  };
}

async function ensureBrandExists(brandId) {
  ensureObjectId(brandId, "Brand is invalid");

  const brand = await Brand.findById(brandId);

  if (!brand) {
    throw new Error("Brand not found");
  }

  return brand;
}

async function ensureUniqueDomain(domain, excludeId = null) {
  const query = excludeId ? { _id: { $ne: excludeId } } : {};
  const existing = await MoneySite.findOne({
    ...query,
    domain,
  }).select("_id domain");

  if (existing) {
    throw new Error("Domain already exists");
  }
}

function sanitizeMoneySitePayload(payload, { partial = false } = {}) {
  const sanitized = {};

  if (!partial || payload.brandId !== undefined) {
    if (!payload.brandId) {
      throw new Error("Brand is required");
    }

    sanitized.brandId = payload.brandId;
  }

  if (!partial || payload.domain !== undefined) {
    sanitized.domain = normalizeDomain(payload.domain);
  }

  if (payload.note !== undefined || !partial) {
    sanitized.note = normalizeOptionalMoneySiteText(payload.note);
  }

  if (payload.statusText !== undefined || !partial) {
    sanitized.statusText = normalizeOptionalMoneySiteText(payload.statusText);
  }

  if (payload.isActive !== undefined) {
    sanitized.isActive =
      payload.isActive === true
      || payload.isActive === "true"
      || payload.isActive === 1
      || payload.isActive === "1";
  }

  return sanitized;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function mapCsvHeaders(headerCells = []) {
  return headerCells.map((header) => {
    const normalizedHeader = normalizeText(header).toLowerCase();
    return CSV_HEADER_MAP[normalizedHeader] || "";
  });
}

function parseMoneySiteCsv(csvText) {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return {
      rows: [],
      hasHeaderRow: false,
    };
  }

  const firstRow = parseCsvLine(lines[0]);
  const mappedHeaders = mapCsvHeaders(firstRow);
  const hasHeaderRow = mappedHeaders.some(Boolean);
  const dataLines = hasHeaderRow ? lines.slice(1) : lines;

  return {
    hasHeaderRow,
    rows: dataLines.map((line, index) => {
      const cells = parseCsvLine(line);

      if (hasHeaderRow) {
        return mappedHeaders.reduce((result, headerKey, headerIndex) => {
          if (headerKey) {
            result[headerKey] = cells[headerIndex] || "";
          }

          return result;
        }, { __rowNumber: index + 2 });
      }

      return {
        brand: "",
        domain: cells[0] || "",
        note: cells[1] || "",
        statusText: cells[2] || "",
        __rowNumber: index + 1,
      };
    }),
  };
}

function normalizeExistingStrategy(value) {
  return String(value || "").trim().toLowerCase() === "update" ? "update" : "skip";
}

function buildImportChange(field, label, from, to, { optionalText = false } = {}) {
  return {
    field,
    label,
    from: optionalText ? formatOptionalMoneySiteText(from) : normalizeText(from),
    to: optionalText ? formatOptionalMoneySiteText(to) : normalizeText(to),
  };
}

function buildMoneySiteCsvRowMessage({ status, action, changes, allowUpdates }) {
  if (status === "invalid") {
    return "Row has validation errors";
  }

  if (status === "new") {
    return "New domain will be imported";
  }

  if (status === "unchanged") {
    return "Existing domain already matches current data";
  }

  const changedLabels = changes.map((change) => change.label).join(", ");

  if (action === "update") {
    return `Existing domain will update: ${changedLabels}`;
  }

  if (!allowUpdates) {
    return `Change detected (${changedLabels}) but update requires Edit Money Sites privilege`;
  }

  return `Change detected (${changedLabels}) and will be skipped`;
}

function buildMoneySiteCsvPreviewSummary(rows = []) {
  const summary = {
    totalRows: rows.length,
    newCount: 0,
    updateCount: 0,
    changedCount: 0,
    unchangedCount: 0,
    skippedCount: 0,
    invalidCount: 0,
    actionableCount: 0,
  };

  rows.forEach((row) => {
    if (row.status === "invalid") {
      summary.invalidCount += 1;
      return;
    }

    if (row.status === "new") {
      summary.newCount += 1;
    }

    if (row.status === "changed") {
      summary.changedCount += 1;
    }

    if (row.status === "unchanged") {
      summary.unchangedCount += 1;
    }

    if (row.action === "create" || row.action === "update") {
      summary.actionableCount += 1;
    } else {
      summary.skippedCount += 1;
    }

    if (row.action === "update") {
      summary.updateCount += 1;
    }
  });

  return summary;
}

function serializeMoneySiteCsvPreviewRow(row) {
  return {
    rowNumber: row.rowNumber,
    brand: row.brand,
    domain: row.domain,
    note: row.note,
    statusText: row.statusText,
    status: row.status,
    action: row.action,
    willImport: row.willImport,
    message: row.message,
    errors: row.errors,
    changes: row.changes,
    existing: row.existing,
  };
}

async function buildMoneySiteCsvImportPlan({
  csvText,
  defaultBrandId,
  existingStrategy,
  allowUpdates = false,
} = {}) {
  const parsedCsv = parseMoneySiteCsv(csvText);
  const rows = parsedCsv.rows;

  if (!rows.length) {
    throw new Error("CSV content is required");
  }

  let defaultBrand = null;

  if (defaultBrandId) {
    defaultBrand = await ensureBrandExists(defaultBrandId);
  }

  const brands = await Brand.find().select("_id brandName").lean();
  const brandMap = new Map(
    brands.map((brand) => [normalizeText(brand.brandName).toLowerCase(), brand])
  );
  const brandNameById = new Map(
    brands.map((brand) => [String(brand._id), brand.brandName])
  );
  const existingSites = await MoneySite.find()
    .select("_id brandId domain note statusText isActive")
    .lean();
  const existingSiteByDomain = new Map(
    existingSites.map((item) => [item.domain, item])
  );
  const seenDomains = new Set();
  const normalizedStrategy = normalizeExistingStrategy(existingStrategy);

  const planRows = rows.map((row) => {
    const rowNumber = row.__rowNumber;
    const errors = [];
    const note = normalizeOptionalMoneySiteText(row.note);
    const statusText = normalizeOptionalMoneySiteText(row.statusText);
    const brandName = normalizeText(row.brand);
    const resolvedBrand = brandName
      ? brandMap.get(brandName.toLowerCase())
      : defaultBrand;
    let domain = "";

    if (!resolvedBrand) {
      errors.push("Brand is required or could not be matched");
    }

    try {
      domain = normalizeDomain(row.domain);
    } catch (error) {
      errors.push(error.message);
    }

    if (domain) {
      if (seenDomains.has(domain)) {
        errors.push("Duplicate domain inside this upload");
      } else {
        seenDomains.add(domain);
      }
    }

    if (errors.length) {
      return {
        rowNumber,
        brand: resolvedBrand?.brandName || brandName || "-",
        domain: domain || normalizeText(row.domain),
        note,
        statusText,
        status: "invalid",
        action: "invalid",
        willImport: false,
        message: "Row has validation errors",
        errors,
        changes: [],
        existing: null,
        brandId: resolvedBrand?._id || null,
        existingSiteId: null,
      };
    }

    const existingSite = existingSiteByDomain.get(domain);

    if (!existingSite) {
      return {
        rowNumber,
        brand: resolvedBrand.brandName,
        domain,
        note,
        statusText,
        status: "new",
        action: "create",
        willImport: true,
        message: "New domain will be imported",
        errors: [],
        changes: [],
        existing: null,
        brandId: resolvedBrand._id,
        existingSiteId: null,
      };
    }

    const existingBrandId = String(existingSite.brandId || "");
    const existingBrandName = brandNameById.get(existingBrandId) || "Unknown";
    const normalizedExistingNote = normalizeOptionalMoneySiteText(existingSite.note);
    const normalizedExistingStatusText = normalizeOptionalMoneySiteText(existingSite.statusText);
    const changes = [];

    if (existingBrandId !== String(resolvedBrand._id)) {
      changes.push(buildImportChange("brand", "Brand", existingBrandName, resolvedBrand.brandName));
    }

    if (normalizedExistingNote !== note) {
      changes.push(buildImportChange("note", "Note", existingSite.note, note, { optionalText: true }));
    }

    if (normalizedExistingStatusText !== statusText) {
      changes.push(
        buildImportChange("statusText", "Status", existingSite.statusText, statusText, {
          optionalText: true,
        })
      );
    }

    if (!changes.length) {
      return {
        rowNumber,
        brand: resolvedBrand.brandName,
        domain,
        note,
        statusText,
        status: "unchanged",
        action: "skip",
        willImport: false,
        message: "Existing domain already matches current data",
        errors: [],
        changes: [],
        existing: {
          id: String(existingSite._id),
          brand: existingBrandName,
          note: normalizedExistingNote,
          statusText: normalizedExistingStatusText,
          isActive: existingSite.isActive !== false,
        },
        brandId: resolvedBrand._id,
        existingSiteId: String(existingSite._id),
      };
    }

    const shouldUpdate = normalizedStrategy === "update" && allowUpdates;
    const message = buildMoneySiteCsvRowMessage({
      status: "changed",
      action: shouldUpdate ? "update" : "skip",
      changes,
      allowUpdates,
    });

    return {
      rowNumber,
      brand: resolvedBrand.brandName,
      domain,
      note,
      statusText,
      status: "changed",
      action: shouldUpdate ? "update" : "skip",
      willImport: shouldUpdate,
      message,
      errors: [],
      changes,
      existing: {
        id: String(existingSite._id),
        brand: existingBrandName,
        note: normalizedExistingNote,
        statusText: normalizedExistingStatusText,
        isActive: existingSite.isActive !== false,
      },
      brandId: resolvedBrand._id,
      existingSiteId: String(existingSite._id),
    };
  });

  return {
    hasHeaderRow: parsedCsv.hasHeaderRow,
    existingStrategy: normalizedStrategy,
    canUpdateExisting: allowUpdates,
    rows: planRows,
    summary: buildMoneySiteCsvPreviewSummary(planRows),
  };
}

function escapeCsvCell(value) {
  const stringValue = String(value ?? "");

  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
}

function normalizeVerificationCode(value) {
  return String(value || "").trim().replace(/\D/g, "").slice(0, 4);
}

function buildMoneySiteImportFingerprint({
  csvText,
  defaultBrandId,
  existingStrategy,
  allowUpdates = false,
} = {}) {
  const normalizedCsvText = String(csvText || "").replace(/\r\n/g, "\n").trim();

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        csvText: normalizedCsvText,
        defaultBrandId: String(defaultBrandId || "").trim(),
        existingStrategy: normalizeExistingStrategy(existingStrategy),
        allowUpdates: Boolean(allowUpdates),
      })
    )
    .digest("hex");
}

function buildMoneySiteDeleteAllFingerprint({ totalCount } = {}) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        totalCount: Math.max(0, Number(totalCount) || 0),
      })
    )
    .digest("hex");
}

function buildMoneySiteVerificationKey(userId, fingerprint, actionType = "import") {
  return `${String(actionType || "import").trim()}:${String(userId || "").trim()}:${fingerprint}`;
}

function cleanupExpiredMoneySiteImportVerifications() {
  const now = Date.now();

  for (const [key, entry] of moneySiteImportVerificationStore.entries()) {
    if (!entry?.expiresAt || entry.expiresAt <= now) {
      moneySiteImportVerificationStore.delete(key);
    }
  }
}

function invalidateMoneySiteImportVerificationsForUser(userId, actionType = null) {
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    return;
  }

  for (const key of moneySiteImportVerificationStore.keys()) {
    if (
      key.includes(`:${normalizedUserId}:`)
      && (!actionType || key.startsWith(`${String(actionType).trim()}:`))
    ) {
      moneySiteImportVerificationStore.delete(key);
    }
  }
}

async function assertMoneySitePasswordVerification({ userId, password }) {
  const normalizedPassword = String(password || "");

  if (!normalizedPassword) {
    throw new Error("Current password is required for verification");
  }

  const user = await User.findById(userId).select("status passwordHash");

  if (!user || user.status !== "active") {
    throw new Error("User account is not active for verification");
  }

  const isMatch = await bcrypt.compare(normalizedPassword, user.passwordHash);

  if (!isMatch) {
    throw new Error("Password is incorrect");
  }
}

function buildMoneySiteImportVerificationTelegramMessage(summary = {}, code) {
  const lines = [
    "200M Web App money-site import verification",
    "",
    `Code: ${code}`,
    "Expires in: 5 minutes",
    "",
    `New domains: ${summary.newCount || 0}`,
    `Updated domains: ${summary.updateCount || 0}`,
    `Unchanged domains: ${summary.unchangedCount || 0}`,
    `Invalid rows: ${summary.invalidCount || 0}`,
    "",
    `Requested at: ${new Date().toLocaleString("en-GB", { hour12: false })}`,
  ];

  return lines.join("\n");
}
function buildMoneySiteDeleteAllVerificationTelegramMessage(totalCount, code) {
  const lines = [
    "200M Web App money-site delete-all verification",
    "",
    `Code: ${code}`,
    "Expires in: 5 minutes",
    "",
    `Current total money sites: ${totalCount || 0}`,
    "",
    `Requested at: ${new Date().toLocaleString("en-GB", { hour12: false })}`,
  ];

  return lines.join("\n");
}

async function sendMoneySiteVerificationCode({
  userId,
  fingerprint,
  text,
  actionType = "import",
  sendToTelegram,
}) {
  cleanupExpiredMoneySiteImportVerifications();
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const { sentCount, failedCount } = await sendToTelegram({
    userId,
    text: text(code),
  });

  const requestedAt = Date.now();
  const expiresAt = requestedAt + IMPORT_VERIFICATION_TTL_MS;

  invalidateMoneySiteImportVerificationsForUser(userId, actionType);
  moneySiteImportVerificationStore.set(
    buildMoneySiteVerificationKey(userId, fingerprint, actionType),
    {
      code,
      requestedAt,
      expiresAt,
      sentCount,
      failedCount,
    }
  );

  return {
    requestedAt: new Date(requestedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    sentCount,
    failedCount,
  };
}

function assertMoneySiteTelegramVerification({
  userId,
  fingerprint,
  verificationCode,
  actionType = "import",
}) {
  cleanupExpiredMoneySiteImportVerifications();

  const normalizedCode = normalizeVerificationCode(verificationCode);

  if (normalizedCode.length !== 4) {
    throw new Error("Enter the 4-digit Telegram verification code");
  }

  const entry = moneySiteImportVerificationStore.get(
    buildMoneySiteVerificationKey(userId, fingerprint, actionType)
  );

  if (!entry) {
    throw new Error("Request a new Telegram verification code before continuing");
  }

  if (entry.expiresAt <= Date.now()) {
    moneySiteImportVerificationStore.delete(
      buildMoneySiteVerificationKey(userId, fingerprint, actionType)
    );
    throw new Error("Telegram verification code expired. Request a new code");
  }

  if (entry.code !== normalizedCode) {
    throw new Error("Telegram verification code is incorrect");
  }

  moneySiteImportVerificationStore.delete(
    buildMoneySiteVerificationKey(userId, fingerprint, actionType)
  );
}

function resolveCheckerBlockedValue(scanResult = {}) {
  const summary = scanResult?.summary || {};

  if (typeof summary.officialBlocked === "boolean") {
    return summary.officialBlocked;
  }

  if (typeof summary.blocked === "boolean") {
    return summary.blocked;
  }

  if (typeof scanResult?.isBlocked === "boolean") {
    return scanResult.isBlocked;
  }

  return false;
}

function resolveBatchResultBlockedValue(result = {}) {
  if (typeof result?.blocked === "boolean") {
    return result.blocked;
  }

  if (typeof result?.isBlocked === "boolean") {
    return result.isBlocked;
  }

  if (typeof result?.officialBlocked === "boolean") {
    return result.officialBlocked;
  }

  return resolveCheckerBlockedValue(result?.scanResult || result);
}

function resolveBatchResultBlockedId(result = {}, payload = {}, index = 0, isBlocked = false) {
  if (!isBlocked) {
    return null;
  }

  const blockedId = normalizeText(
    result?.blockedId
    || result?.blocked_id
    || result?.scanResult?.summary?.blockedId
    || result?.scanResult?.blockedId
  );

  if (blockedId) {
    return blockedId;
  }

  const scanId = normalizeText(payload?.scanId, 120) || "scan";
  const batchNumber = Math.max(1, Number(payload?.batchNumber) || 1);
  return `${scanId}_${batchNumber}_${index + 1}`;
}

function resolveBatchResultCheckedAt(result = {}, payload = {}) {
  return (
    result?.checkedAt
    || result?.checked_at
    || result?.lastChecked
    || result?.timestamp
    || result?.scanResult?.checkedAt
    || result?.scanResult?.summary?.checkedAt
    || payload?.checkedAt
    || payload?.summary?.checkedAt
    || new Date().toISOString()
  );
}

function resolveBlockedIdentifier(update = {}, isBlocked) {
  if (!isBlocked) {
    return null;
  }

  return normalizeText(
    update.blockedId
    || update.scanResult?.summary?.blockedId
    || update.scanResult?.blockedId
    || `scan_${Date.now()}`
  ) || `scan_${Date.now()}`;
}

function resolveCheckedAt(update = {}) {
  const rawValue = update.checkedAt || update.scanResult?.checkedAt || update.scanResult?.summary?.checkedAt;
  const dateValue = rawValue ? new Date(rawValue) : new Date();

  if (Number.isNaN(dateValue.getTime())) {
    return new Date();
  }

  return dateValue;
}

function buildDefaultBatchSummary(results = []) {
  const blocked = results.filter((result) => resolveBatchResultBlockedValue(result)).length;

  return {
    total: results.length,
    blocked,
    notBlocked: Math.max(0, results.length - blocked),
  };
}

function normalizeBatchPayload(payload = {}) {
  if (Array.isArray(payload)) {
    return {
      scanId: "",
      batchId: "",
      batchNumber: 1,
      totalBatches: 1,
      isComplete: true,
      summary: buildDefaultBatchSummary(payload),
      totalDomains: payload.length,
      blockedDomains: [],
      updates: payload,
    };
  }

  const rawResults = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.updates)
      ? payload.updates
      : null;

  if (!rawResults?.length) {
    throw new Error("Results array is required");
  }

  const batchNumber = Math.max(1, Number(payload?.batchNumber) || 1);
  const totalBatches = Math.max(batchNumber, Number(payload?.totalBatches) || batchNumber);
  const hasExplicitCompletion = typeof payload?.isComplete === "boolean";
  const updates = Array.isArray(payload?.results)
    ? payload.results.map((result, index) => {
        const isBlocked = resolveBatchResultBlockedValue(result);
        const blockedId = resolveBatchResultBlockedId(result, payload, index, isBlocked);
        const checkedAt = resolveBatchResultCheckedAt(result, payload);

        return {
          id: result?.id,
          domain: result?.domain || result?.Domain || "",
          blockedId,
          checkedAt,
          scanResult: {
            isBlocked,
            checkedAt,
            summary: {
              officialBlocked: isBlocked,
              blockedId,
              checkedAt,
            },
          },
        };
      })
    : rawResults;
  const derivedBlockedDomains = Array.isArray(payload?.blockedDomains) && payload.blockedDomains.length
    ? payload.blockedDomains
    : rawResults
        .filter((result) => resolveBatchResultBlockedValue(result))
        .map((result) => ({
          domain: normalizeText(result?.domain || result?.Domain, 240),
          id: String(result?.id || "").trim(),
        }))
        .filter((item) => item.domain || item.id);

  return {
    scanId: normalizeText(payload?.scanId, 120),
    batchId: normalizeText(payload?.batchId, 120),
    batchNumber,
    totalBatches,
    isComplete: hasExplicitCompletion ? payload.isComplete : batchNumber === totalBatches,
    summary: payload?.summary && typeof payload.summary === "object"
      ? payload.summary
      : buildDefaultBatchSummary(rawResults),
    totalDomains: Math.max(0, Number(payload?.totalDomains) || rawResults.length),
    blockedDomains: derivedBlockedDomains,
    updates,
  };
}

async function findMoneySiteForUpdate(update = {}) {
  const candidateId = String(update?.id || "").trim();
  const hasValidId = mongoose.Types.ObjectId.isValid(candidateId);

  if (hasValidId) {
    const moneySite = await MoneySite.findById(candidateId);

    if (moneySite) {
      return moneySite;
    }
  }

  const candidateDomain = String(update?.domain || update?.Domain || "").trim();

  if (candidateDomain) {
    const normalizedDomain = normalizeDomain(candidateDomain);
    const moneySite = await MoneySite.findOne({ domain: normalizedDomain });

    if (moneySite) {
      return moneySite;
    }
  }

  if (candidateId && !hasValidId && !candidateDomain) {
    throw new Error("Money site id is invalid");
  }

  throw new Error("Money site not found");
}

function buildMoneySiteFilters(filters = {}) {
  const query = {};

  if (filters.brandId) {
    ensureObjectId(filters.brandId, "Brand filter is invalid");
    query.brandId = filters.brandId;
  }

  if (filters.status && ["unknown", "ada", "tidak ada"].includes(filters.status)) {
    query["nawala.status"] = filters.status;
  }

  if (filters.search) {
    const search = normalizeText(filters.search);
    if (search) {
      query.$or = [
        { domain: { $regex: search, $options: "i" } },
        { note: { $regex: search, $options: "i" } },
        { statusText: { $regex: search, $options: "i" } },
      ];
    }
  }

  return query;
}

function normalizeScreenshotAssignmentFilter(value) {
  const normalizedValue = String(value || "all").trim().toLowerCase();

  if (normalizedValue === "assigned" || normalizedValue === "unassigned") {
    return normalizedValue;
  }

  return "all";
}

async function listAssignedScreenshotMoneySiteIds() {
  const config = getScreenshotTakerConfig();

  if (!config) {
    return [];
  }

  try {
    const screenshotSites = await listAssignedScreenshotSites();

    return [...new Set(
      screenshotSites
        .map((site) => String(site?.moneySiteId || "").trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )];
  } catch (error) {
    console.warn("[money-sites] Failed to load screenshot assignments for filtering:", error.message);
    return [];
  }
}

export async function getMoneySitesService(filters = {}) {
  const query = buildMoneySiteFilters(filters);
  const screenshotAssignment = normalizeScreenshotAssignmentFilter(filters.screenshotAssignment);

  if (screenshotAssignment !== "all") {
    const assignedMoneySiteIds = await listAssignedScreenshotMoneySiteIds();

    if (screenshotAssignment === "assigned") {
      if (!assignedMoneySiteIds.length) {
        return {
          items: [],
          pagination: {
            page: 1,
            limit: Math.min(MAX_LIMIT, Math.max(1, Number(filters.limit) || 25)),
            total: 0,
            totalPages: 1,
          },
        };
      }

      query._id = {
        $in: assignedMoneySiteIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    if (screenshotAssignment === "unassigned" && assignedMoneySiteIds.length) {
      query._id = {
        $nin: assignedMoneySiteIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }
  }

  const { requestedPage, limit } = buildPagination(filters);
  const total = await MoneySite.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);
  const skip = (page - 1) * limit;

  const items = await MoneySite.find(query)
    .populate(BRAND_POPULATE)
    .sort({ "nawala.status": 1, "nawala.lastChecked": -1, updatedAt: -1, domain: 1 })
    .skip(skip)
    .limit(limit);

  return {
    items: items.map((item) => serializeMoneySite(item)),
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export async function getMoneySiteActivityLogsService({ page = 1, limit = 30, search = "" } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const normalizedSearch = normalizeText(search);
  const query = {
    module: "money-sites",
    action: {
      $in: [
        "money-site.create",
        "money-site.update",
        "money-site.delete",
        "money-site.import",
        "money-site.delete-all",
        "money-site.bulk-delete-blocked",
      ],
    },
  };

  if (normalizedSearch) {
    query.$or = [
      { actorName: { $regex: normalizedSearch, $options: "i" } },
      { actorEmail: { $regex: normalizedSearch, $options: "i" } },
      { summary: { $regex: normalizedSearch, $options: "i" } },
      { targetLabel: { $regex: normalizedSearch, $options: "i" } },
      { details: { $regex: normalizedSearch, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    ActivityLog.find(query)
      .sort({ occurredAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    ActivityLog.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

export async function listMoneySiteDomainsService() {
  const items = await MoneySite.find()
    .select("domain")
    .sort({ domain: 1 })
    .lean();

  return items.map((item) => item.domain);
}

export async function getMoneySiteSummaryService({ recentBlockedLimit = 8 } = {}) {
  const safeBlockedLimit = Math.min(25, Math.max(1, Number(recentBlockedLimit) || 8));

  const [
    total,
    blocked,
    notBlocked,
    unknown,
    blockedItems,
  ] = await Promise.all([
    MoneySite.countDocuments(),
    MoneySite.countDocuments({ "nawala.status": "ada" }),
    MoneySite.countDocuments({ "nawala.status": "tidak ada" }),
    MoneySite.countDocuments({ "nawala.status": "unknown" }),
    MoneySite.find({ "nawala.status": "ada" })
      .populate(BRAND_POPULATE)
      .sort({ "nawala.lastChecked": -1, updatedAt: -1, domain: 1 })
      .limit(safeBlockedLimit),
  ]);

  return {
    total,
    blocked,
    notBlocked,
    unknown,
    blockedItems: blockedItems.map((item) => serializeMoneySite(item)),
  };
}

export async function createMoneySiteService(payload) {
  const sanitized = sanitizeMoneySitePayload(payload);
  await ensureBrandExists(sanitized.brandId);
  await ensureUniqueDomain(sanitized.domain);

  const moneySite = await MoneySite.create({
    ...sanitized,
    nawala: {
      status: "unknown",
      blockedId: null,
      lastChecked: null,
    },
  });

  const populated = await MoneySite.findById(moneySite._id).populate(BRAND_POPULATE);
  return serializeMoneySite(populated);
}

export async function updateMoneySiteService(id, payload) {
  ensureObjectId(id, "Money site is invalid");

  const moneySite = await MoneySite.findById(id);

  if (!moneySite) {
    throw new Error("Money site not found");
  }

  const sanitized = sanitizeMoneySitePayload(payload, { partial: true });

  if (sanitized.brandId) {
    await ensureBrandExists(sanitized.brandId);
  }

  if (sanitized.domain && sanitized.domain !== moneySite.domain) {
    await ensureUniqueDomain(sanitized.domain, id);
  }

  Object.assign(moneySite, sanitized);
  await moneySite.save();

  const populated = await MoneySite.findById(moneySite._id).populate(BRAND_POPULATE);
  await syncScreenshotAssignmentsForMoneySites(populated);

  return serializeMoneySite(populated);
}

export async function deleteMoneySiteService(id) {
  ensureObjectId(id, "Money site is invalid");

  const moneySite = await MoneySite.findById(id);

  if (!moneySite) {
    throw new Error("Money site not found");
  }

  const deletedSnapshot = serializeMoneySite(moneySite);
  await moneySite.deleteOne();
  await removeScreenshotAssignmentsForMoneySiteIds([String(moneySite._id)]);
  return deletedSnapshot;
}

export async function bulkDeleteBlockedMoneySitesService({ ids = [] } = {}) {
  if (!Array.isArray(ids) || !ids.length) {
    throw new Error("Blocked money site ids are required");
  }

  const uniqueIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];

  if (!uniqueIds.length) {
    throw new Error("Blocked money site ids are required");
  }

  const invalidId = uniqueIds.find((id) => !mongoose.Types.ObjectId.isValid(id));

  if (invalidId) {
    throw new Error("One or more money site ids are invalid");
  }

  const items = await MoneySite.find({ _id: { $in: uniqueIds } }).select("_id domain nawala.status");
  const itemById = new Map(items.map((item) => [String(item._id), item]));
  const blockedItems = [];
  const skippedItems = [];

  uniqueIds.forEach((id) => {
    const item = itemById.get(id);

    if (!item) {
      skippedItems.push({
        id,
        domain: "",
        reason: "Money site not found",
      });
      return;
    }

    if (item.nawala?.status !== "ada") {
      skippedItems.push({
        id,
        domain: item.domain,
        reason: "Only blocked money sites can be deleted in bulk",
      });
      return;
    }

    blockedItems.push(item);
  });

  if (!blockedItems.length) {
    throw new Error("No blocked money sites were eligible for deletion");
  }

  const blockedIds = blockedItems.map((item) => item._id);
  await MoneySite.deleteMany({ _id: { $in: blockedIds } });
  await removeScreenshotAssignmentsForMoneySiteIds(blockedIds.map((item) => String(item)));

  return {
    deletedCount: blockedItems.length,
    deletedIds: blockedItems.map((item) => String(item._id)),
    deletedDomains: blockedItems.map((item) => item.domain),
    skippedCount: skippedItems.length,
    skippedItems,
  };
}

export async function previewMoneySitesCsvImportService({
  userId,
  csvText,
  defaultBrandId,
  existingStrategy,
  allowUpdates = false,
} = {}) {
  const plan = await buildMoneySiteCsvImportPlan({
    csvText,
    defaultBrandId,
    existingStrategy,
    allowUpdates,
  });

  const verificationOptions = userId
    ? await getAuthenticatedUserTelegramVerificationState({ userId })
    : { telegramAvailable: false };

  return {
    hasHeaderRow: plan.hasHeaderRow,
    existingStrategy: plan.existingStrategy,
    canUpdateExisting: plan.canUpdateExisting,
    summary: plan.summary,
    rows: plan.rows.map((row) => serializeMoneySiteCsvPreviewRow(row)),
    verificationOptions: {
      passwordAvailable: true,
      telegramAvailable: Boolean(verificationOptions.telegramAvailable),
    },
  };
}

export async function requestMoneySitesCsvImportVerificationService({
  userId,
  csvText,
  defaultBrandId,
  existingStrategy,
  allowUpdates = false,
} = {}) {
  if (!userId) {
    throw new Error("User is required for import verification");
  }

  cleanupExpiredMoneySiteImportVerifications();

  const plan = await buildMoneySiteCsvImportPlan({
    csvText,
    defaultBrandId,
    existingStrategy,
    allowUpdates,
  });

  if (!plan.summary.actionableCount) {
    throw new Error("No valid rows are ready to import");
  }

  const fingerprint = buildMoneySiteImportFingerprint({
    csvText,
    defaultBrandId,
    existingStrategy: plan.existingStrategy,
    allowUpdates,
  });
  const delivery = await sendMoneySiteVerificationCode({
    userId,
    fingerprint,
    actionType: "import",
    text: (code) => buildMoneySiteImportVerificationTelegramMessage(plan.summary, code),
    sendToTelegram: sendMoneySiteImportVerificationCodeToTelegram,
  });
  const verificationOptions = await getAuthenticatedUserTelegramVerificationState({ userId });

  return {
    ...delivery,
    summary: plan.summary,
    verificationOptions: {
      passwordAvailable: true,
      telegramAvailable: Boolean(verificationOptions.telegramAvailable),
    },
  };
}

export async function importMoneySitesCsvService({
  userId,
  csvText,
  defaultBrandId,
  existingStrategy,
  allowUpdates = false,
  verificationMethod,
  password,
  verificationCode,
} = {}) {
  const plan = await buildMoneySiteCsvImportPlan({
    csvText,
    defaultBrandId,
    existingStrategy,
    allowUpdates,
  });

  if (!plan.summary.actionableCount) {
    throw new Error("No valid rows are ready to import");
  }

  const fingerprint = buildMoneySiteImportFingerprint({
    csvText,
    defaultBrandId,
    existingStrategy: plan.existingStrategy,
    allowUpdates,
  });

  if (!userId) {
    throw new Error("User is required for import");
  }

  const normalizedVerificationMethod =
    String(verificationMethod || "").trim().toLowerCase() === "telegram"
      ? "telegram"
      : "password";

  if (normalizedVerificationMethod === "telegram") {
    assertMoneySiteTelegramVerification({
      userId,
      fingerprint,
      verificationCode,
      actionType: "import",
    });
  } else {
    await assertMoneySitePasswordVerification({
      userId,
      password,
    });
  }

  const rowsToCreate = plan.rows.filter((row) => row.action === "create");
  const rowsToUpdate = plan.rows.filter((row) => row.action === "update");
  const skippedRows = plan.rows
    .filter((row) => !row.willImport)
    .map((row) => ({
      rowNumber: row.rowNumber,
      domain: row.domain,
      error: row.errors.length ? row.errors.join(" | ") : row.message,
    }));

  if (rowsToCreate.length) {
    await MoneySite.insertMany(
      rowsToCreate.map((row) => ({
        brandId: row.brandId,
        domain: row.domain,
        note: row.note,
        statusText: row.statusText,
        isActive: true,
        nawala: {
          status: "unknown",
          blockedId: null,
          lastChecked: null,
        },
      }))
    );
  }

  if (rowsToUpdate.length) {
    await Promise.all(
      rowsToUpdate.map((row) =>
        MoneySite.updateOne(
          { _id: row.existingSiteId },
          {
            $set: {
              brandId: row.brandId,
              note: row.note,
              statusText: row.statusText,
            },
          }
        )
      )
    );

    const updatedMoneySites = await MoneySite.find({
      _id: { $in: rowsToUpdate.map((row) => row.existingSiteId).filter(Boolean) },
    }).populate(BRAND_POPULATE);

    await syncScreenshotAssignmentsForMoneySites(updatedMoneySites);
  }

  return {
    createdCount: rowsToCreate.length,
    updatedCount: rowsToUpdate.length,
    skippedCount: skippedRows.length,
    invalidCount: plan.summary.invalidCount,
    unchangedCount: plan.summary.unchangedCount,
    changedCount: plan.summary.changedCount,
    existingStrategy: plan.existingStrategy,
    skippedRows,
  };
}

export async function requestDeleteAllMoneySitesVerificationService({
  userId,
} = {}) {
  if (!userId) {
    throw new Error("User is required for delete verification");
  }

  const totalCount = await MoneySite.countDocuments();

  if (!totalCount) {
    throw new Error("No money sites available to delete");
  }

  const fingerprint = buildMoneySiteDeleteAllFingerprint({ totalCount });
  const delivery = await sendMoneySiteVerificationCode({
    userId,
    fingerprint,
    actionType: "delete-all",
    text: (code) => buildMoneySiteDeleteAllVerificationTelegramMessage(totalCount, code),
    sendToTelegram: sendMoneySiteDeleteAllVerificationCodeToTelegram,
  });
  const verificationOptions = await getAuthenticatedUserTelegramVerificationState({ userId });

  return {
    ...delivery,
    totalCount,
    verificationOptions: {
      passwordAvailable: true,
      telegramAvailable: Boolean(verificationOptions.telegramAvailable),
    },
  };
}

export async function deleteAllMoneySitesService({
  userId,
  expectedCount,
  verificationMethod,
  password,
  verificationCode,
} = {}) {
  if (!userId) {
    throw new Error("User is required for delete all");
  }

  const totalCount = await MoneySite.countDocuments();

  if (!totalCount) {
    throw new Error("No money sites available to delete");
  }

  const normalizedExpectedCount = Math.max(0, Number(expectedCount) || 0);

  if (normalizedExpectedCount && normalizedExpectedCount !== totalCount) {
    throw new Error("Money site total changed. Review and request a new verification before deleting.");
  }

  const fingerprint = buildMoneySiteDeleteAllFingerprint({
    totalCount: normalizedExpectedCount || totalCount,
  });
  const normalizedVerificationMethod =
    String(verificationMethod || "").trim().toLowerCase() === "telegram"
      ? "telegram"
      : "password";

  if (normalizedVerificationMethod === "telegram") {
    assertMoneySiteTelegramVerification({
      userId,
      fingerprint,
      verificationCode,
      actionType: "delete-all",
    });
  } else {
    await assertMoneySitePasswordVerification({
      userId,
      password,
    });
  }

  const items = await MoneySite.find().select("_id domain").lean();
  await MoneySite.deleteMany({});
  await removeScreenshotAssignmentsForMoneySiteIds(items.map((item) => String(item._id)));

  return {
    deletedCount: items.length,
    deletedIds: items.map((item) => String(item._id)),
    deletedDomains: items.map((item) => item.domain),
  };
}

export async function exportMoneySitesCsvService(filters = {}) {
  const query = buildMoneySiteFilters(filters);
  const items = await MoneySite.find(query)
    .populate(BRAND_POPULATE)
    .sort({ domain: 1, updatedAt: -1 });

  const headers = [
    "brand",
    "domain",
    "note",
    "status",
    "active",
    "nawala_status",
    "blocked_id",
    "last_checked",
  ];
  const rows = items.map((item) => {
    const serialized = serializeMoneySite(item);

    return [
      serialized.brandId?.brandName || "",
      serialized.domain || "",
      formatOptionalMoneySiteText(serialized.note),
      formatOptionalMoneySiteText(serialized.statusText),
      serialized.isActive ? "Yes" : "No",
      serialized.nawalaLabel || "Not Checked",
      serialized.nawala?.blockedId || "",
      serialized.nawala?.lastChecked
        ? new Date(serialized.nawala.lastChecked).toISOString()
        : "",
    ].map((value) => escapeCsvCell(value)).join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}

export async function getMoneySiteUrlsForCheckerService() {
  const items = await MoneySite.find({ isActive: true })
    .populate({ path: "brandId", select: "brandName" })
    .select("domain brandId note")
    .sort({ domain: 1 });

  return items.map((item) => ({
    id: String(item._id),
    brand: item.brandId?.brandName || "Unknown",
    Domain: item.domain,
    noto: item.note || "",
  }));
}

export async function bulkUpdateMoneySiteStatusesService(payload = {}) {
  const batch = normalizeBatchPayload(payload);

  const results = {
    success: 0,
    failed: 0,
    errors: [],
    updatedIds: [],
    newlyBlockedDomains: [],
    scanId: batch.scanId,
    batchId: batch.batchId,
    batchNumber: batch.batchNumber,
    totalBatches: batch.totalBatches,
    isComplete: batch.isComplete,
    summary: batch.summary,
    totalDomains: batch.totalDomains,
    blockedDomains: batch.blockedDomains,
  };

  const chunkSize = 10;

  for (let index = 0; index < batch.updates.length; index += chunkSize) {
    const chunk = batch.updates.slice(index, index + chunkSize);

    await Promise.all(
      chunk.map(async (update) => {
        try {
          const moneySite = await findMoneySiteForUpdate(update);
          const wasBlocked = moneySite.nawala?.status === "ada";

          const isBlocked = resolveCheckerBlockedValue(update.scanResult);

          moneySite.nawala = {
            status: isBlocked ? "ada" : "tidak ada",
            blockedId: resolveBlockedIdentifier(update, isBlocked),
            lastChecked: resolveCheckedAt(update),
          };

          await moneySite.save();
          results.success += 1;
          results.updatedIds.push(String(moneySite._id));

          if (isBlocked && !wasBlocked) {
            results.newlyBlockedDomains.push({
              id: String(moneySite._id),
              domain: moneySite.domain,
            });
          }
        } catch (error) {
          results.failed += 1;
          results.errors.push({
            id: String(update?.id || ""),
            domain: String(update?.domain || update?.Domain || ""),
            error: error.message,
          });
        }
      })
    );
  }

  return results;
}
