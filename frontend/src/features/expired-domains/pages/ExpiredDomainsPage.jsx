import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HotTable } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";
import { io } from "socket.io-client";
import ToastNotice from "../../../shared/components/ToastNotice";
import { hasAnyPrivilege, hasPrivilege } from "../../../shared/utils/permissions";
import { getSocketBaseUrl } from "../../../shared/utils/socketBaseUrl";
import { useAuth } from "../../auth/hooks/useAuth";
import { getToken } from "../../auth/utils/authStorage";
import UploadExpiredDomainsForm from "../components/UploadExpiredDomainsForm";
import {
  getCurrentExpiredDomainBatch,
  getExpiredDomainProcessSubBatchDomains,
  getExpiredDomainProcessSubBatches,
  moveExpiredDomainBatchToProcess,
  updateExpiredDomainProcessSubBatchStatus,
} from "../api/expiredDomainsApi";
import {
  addAdminApiKey,
  deleteAdminApiKey,
  getAdminDashboard,
  getSerperAvailability,
  updateAdminApiKey,
} from "../../rank-checker/api/rankCheckerApi";
import AdminPanel from "../../rank-checker/components/AdminPanel";
import BulkDomainCheckerPanel from "../../rank-checker/components/BulkDomainCheckerPanel";
import { createWaybackBatchApi } from "../../wayback-checker/api/waybackCheckerApi";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import "../../../shared/styles/management.css";

registerAllModules();

const EXPIRED_DOMAIN_TABS = [
  {
    id: "upload",
    label: "Upload Expired Domains",
    description: "Import expired-domain records in bulk.",
    requiredPrivilege: "IMPORT_EXPIRED_DOMAINS",
  },
  {
    id: "process",
    label: "Process Expired Domains",
    description: "Review and process uploaded expired-domain records.",
    requiredPrivilege: "VIEW_EXPIRED_DOMAINS",
  },
];

const PROCESS_STATUS_LABELS = {
  pending: "Pending",
  copied: "Pending",
  processed: "Bulk Checking",
  mainbatch: "Main Batch",
  bulkchecking: "Bulk Checking",
  finalstage: "Nawala Checking",
  waybackchecking: "WayBack Checking",
  skipped: "Skipped",
};

const PROCESS_STATUS_TABS = [
  { id: "copied", label: "Pending" },
  { id: "bulkchecking", label: "Bulk Checking" },
  { id: "finalstage", label: "Nawala Checking" },
];
const MAIN_BATCH_PROCESS_STATUS = "mainbatch";
const MAIN_BATCH_ADDED_STATUSES = new Set([MAIN_BATCH_PROCESS_STATUS, "bulkchecking", "finalstage", "waybackchecking", "skipped"]);
const MAIN_BATCH_READY_STATUSES = new Set([MAIN_BATCH_PROCESS_STATUS]);
const PROCESS_COMPLETE_STATUSES = new Set(["finalstage", "waybackchecking", "skipped"]);
const PENDING_PROCESS_STATUS = "copied";
const LEGACY_PENDING_PROCESS_STATUS = "pending";

const COPIED_HANDSON_COLUMNS = [
  { key: "url", label: "URL", width: 250 },
  { key: "title", label: "Title", width: 260 },
  { key: "da", label: "DA", width: 72 },
  { key: "pa", label: "PA", width: 72 },
  { key: "tbl", label: "TBL", width: 86 },
  { key: "qbl", label: "QBL", width: 86 },
  { key: "qt", label: "Q/T", width: 72 },
  { key: "os", label: "OS", width: 72 },
  { key: "mt", label: "MT", width: 72 },
  { key: "ss", label: "SS", width: 72 },
  { key: "dh", label: "DH", width: 72 },
];

const COPIED_HANDSON_STORAGE_PREFIX = "expired-domains-copied-handson";
const COPIED_HANDSON_MERGE_STORAGE_PREFIX = "expired-domains-copied-handson-merge";
const COPIED_HANDSON_MIN_ROWS = 30;
const COPIED_HANDSON_FILTERS = [
  { key: "tbl", label: "TBL", min: "0", max: "1000" },
  { key: "qbl", label: "QBL", min: "10", max: "1000" },
  { key: "qt", label: "Q/T", min: "5%", max: "100%" },
  { key: "ss", label: "SS", min: "1%", max: "11%" },
];
const COPIED_HANDSON_DEFAULT_FILTERS = COPIED_HANDSON_FILTERS.reduce((filters, filter) => {
  filters[filter.key] = { min: filter.min, max: filter.max };
  return filters;
}, {});
const SEO_CHECKER_COLUMN_COUNT = COPIED_HANDSON_COLUMNS.length;
const SEO_CHECKER_METRIC_COLUMN_COUNT = SEO_CHECKER_COLUMN_COUNT - 2;
const SEO_CHECKER_MIN_COLUMN_COUNT = SEO_CHECKER_COLUMN_COUNT;
const SERPER_AVAILABILITY_POLL_MS = 10000;
const NAWALA_CHECK_BATCH_SIZE = 5;
const TRUST_POSITIF_URL = "https://trustpositif.komdigi.go.id/";
const BULK_CHECKER_STORAGE_NAMESPACE = "expired_domains_bulk_checker";
const BULK_CHECKER_ACTIVE_RUN_STORAGE_KEY = "bulk_domain_checker_run_id";
const BULK_CHECKER_DOMAINS_TEXT_STORAGE_KEY = "bulk_domain_checker_domains_text";
const NAWALA_CHECKING_RESULT_STORAGE_KEY = "expired-domains:nawala-checking-result";
const WAYBACK_CHECKING_RESULT_STORAGE_KEY = "expired-domains:wayback-checking-result";
const SEO_CHECKER_COLUMN_ALIASES = {
  url: ["url", "domain", "domain url", "website", "site"],
  title: ["title", "page title"],
  da: ["da", "domain authority"],
  pa: ["pa", "page authority"],
  tbl: ["tbl", "total backlinks", "total backlink"],
  qbl: ["qbl", "quality backlinks", "quality backlink"],
  qt: ["q/t", "qt", "quality total", "quality/total", "quality ratio"],
  os: ["os"],
  mt: ["mt"],
  ss: ["ss", "spam score"],
  dh: ["dh", "drop history", "domain history"],
};
const SEO_CHECKER_HEADER_ALIAS_KEYS = Object.entries(SEO_CHECKER_COLUMN_ALIASES).reduce(
  (aliases, [key, values]) => {
    values.forEach((value) => {
      aliases[normalizeSeoHeaderValue(value)] = key;
    });
    return aliases;
  },
  {}
);

function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.message || error?.message || fallback;
}

function formatBatchNumber(value) {
  return String(Math.max(1, Number(value) || 1)).padStart(2, "0");
}

function getSubBatchKey(item) {
  return `${item.batchNumber || 1}-${item.subBatchNumber || 1}`;
}

function normalizeProcessStatus(value) {
  const status = String(value || PENDING_PROCESS_STATUS).trim().toLowerCase();

  return status === LEGACY_PENDING_PROCESS_STATUS ? PENDING_PROCESS_STATUS : status;
}

function isPendingProcessStatus(value) {
  return normalizeProcessStatus(value) === PENDING_PROCESS_STATUS;
}

function chunkDomains(domains = [], chunkSize = NAWALA_CHECK_BATCH_SIZE) {
  const chunks = [];

  for (let index = 0; index < domains.length; index += chunkSize) {
    chunks.push(domains.slice(index, index + chunkSize));
  }

  return chunks;
}

const toCsv = (rows) =>
  rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");

function getNawalaResultToneClassName(status) {
  if (status === "ada") return "bg-rose-100 text-rose-800";
  if (status === "tidak ada") return "bg-emerald-100 text-emerald-800";
  if (status === "error") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

function summarizeNawalaRows(rows = []) {
  return rows.reduce(
    (summary, row) => {
      if (row.status === "ada") {
        summary.blocked += 1;
      } else if (row.status === "tidak ada") {
        summary.notBlocked += 1;
      } else if (row.status === "error") {
        summary.errors += 1;
      } else {
        summary.unknown += 1;
      }

      summary.total += 1;
      return summary;
    },
    {
      total: 0,
      blocked: 0,
      notBlocked: 0,
      unknown: 0,
      errors: 0,
    }
  );
}

function getNawalaStatusLabel(status) {
  if (status === "ada") return "Blocked";
  if (status === "tidak ada") return "Not Blocked";
  if (status === "error") return "Error";
  return "Unknown";
}

function isNawalaNotBlockedResult(item) {
  if (!item) {
    return false;
  }

  const status = String(item.status || "").trim().toLowerCase();
  const label = String(item.label || "").trim().toLowerCase();

  return item.blocked === false || status === "tidak ada" || label === "not blocked";
}

function readStoredJson(key, fallback = null) {
  if (typeof window === "undefined" || !key) {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function storeJson(key, value) {
  if (typeof window === "undefined" || !key) {
    return;
  }

  try {
    if (value) {
      window.localStorage.setItem(key, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch (error) {
    // Local result persistence is best-effort only.
  }
}

function getScopedStorageKey(baseKey, storageNamespace = "") {
  const namespace = String(storageNamespace || "").trim();

  return namespace ? `${namespace}:${baseKey}` : baseKey;
}

function clearBulkCheckerStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(getScopedStorageKey(BULK_CHECKER_ACTIVE_RUN_STORAGE_KEY, BULK_CHECKER_STORAGE_NAMESPACE));
    window.localStorage.removeItem(getScopedStorageKey(BULK_CHECKER_DOMAINS_TEXT_STORAGE_KEY, BULK_CHECKER_STORAGE_NAMESPACE));
  } catch (error) {
    // Local checker state cleanup is best-effort only.
  }
}

function exportNawalaResultCsv(result) {
  const rows = result?.results || [];

  if (!rows.length) {
    return;
  }

  const csv = toCsv([
    ["Domain", "Status", "Blocked", "Batch", "Checked At", "Source Status", "Error"],
    ...rows.map((item) => [
      item.domain,
      item.label || item.status || "",
      item.blocked === true ? "Yes" : item.blocked === false ? "No" : "",
      item.batchNumber || "",
      item.checkedAt || "",
      item.sourceStatus || "",
      item.error || "",
    ]),
  ]);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `nawala-checking-results-batch-${formatBatchNumber(result.batchNumber || 1)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function getCopiedHandsonStorageKey(key) {
  return `${COPIED_HANDSON_STORAGE_PREFIX}:${key}`;
}

function getCopiedHandsonMergeStorageKey(key) {
  return `${COPIED_HANDSON_MERGE_STORAGE_PREFIX}:${key}`;
}

function normalizeDomainForMatch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .replace(/\.+$/g, "");
}

function isLikelyTruncatedSeoDomainLine(value = "") {
  const text = String(value || "").trim();

  if (!text || /\s/.test(text) || text.toLowerCase() === "n/a") {
    return false;
  }

  const host = text
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0];

  if (!/(?:\.{2,}|\u2026)$/.test(host)) {
    return false;
  }

  const visibleHost = host.replace(/(?:\.{2,}|\u2026)+$/g, "");

  return visibleHost.length >= 5
    && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(visibleHost);
}

function normalizeSeoHeaderValue(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function createCopiedHandsonRow(url = "") {
  return COPIED_HANDSON_COLUMNS.reduce((row, column) => {
    row[column.key] = column.key === "url" ? url : "";
    return row;
  }, {});
}

function normalizeCopiedHandsonRow(row = {}, fallbackUrl = "") {
  return COPIED_HANDSON_COLUMNS.reduce((normalizedRow, column) => {
    normalizedRow[column.key] = String(row[column.key] ?? (column.key === "url" ? fallbackUrl : ""));
    return normalizedRow;
  }, {});
}

function readCopiedHandsonRows(key, domains = []) {
  if (typeof window === "undefined") {
    return domains.map((domain) => createCopiedHandsonRow(domain));
  }

  try {
    const storedRows = JSON.parse(window.localStorage.getItem(getCopiedHandsonStorageKey(key)) || "null");

    if (Array.isArray(storedRows)) {
      const normalizedRows = domains.map((domain, index) =>
        normalizeCopiedHandsonRow(storedRows[index], domain)
      );
      const extraRows = storedRows
        .slice(domains.length)
        .map((row) => normalizeCopiedHandsonRow(row));

      return [...normalizedRows, ...extraRows];
    }
  } catch (error) {
    // Ignore malformed local sheet data and rebuild from the copied domains.
  }

  return domains.map((domain) => createCopiedHandsonRow(domain));
}

function storeCopiedHandsonRows(key, rows) {
  if (typeof window === "undefined" || !key) {
    return;
  }

  try {
    window.localStorage.setItem(getCopiedHandsonStorageKey(key), JSON.stringify(rows));
  } catch (error) {
    // Local persistence is best-effort only.
  }
}

function readCopiedHandsonMergeState(key, domainCount) {
  if (typeof window === "undefined" || !key) {
    return false;
  }

  try {
    const storedState = JSON.parse(window.localStorage.getItem(getCopiedHandsonMergeStorageKey(key)) || "null");
    return Boolean(storedState?.merged) && Number(storedState?.domainCount || 0) === Number(domainCount || 0);
  } catch (error) {
    return false;
  }
}

function storeCopiedHandsonMergeState(key, domainCount) {
  if (typeof window === "undefined" || !key) {
    return;
  }

  try {
    window.localStorage.setItem(
      getCopiedHandsonMergeStorageKey(key),
      JSON.stringify({
        merged: true,
        domainCount,
        mergedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    // Local persistence is best-effort only.
  }
}

function clearCopiedHandsonMergeState(key) {
  if (typeof window === "undefined" || !key) {
    return;
  }

  try {
    window.localStorage.removeItem(getCopiedHandsonMergeStorageKey(key));
  } catch (error) {
    // Local persistence is best-effort only.
  }
}

function splitDelimitedLine(line = "", delimiter = "\t") {
  const cells = [];
  let currentCell = "";
  let inQuotes = false;
  const text = String(line || "");

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === "\"") {
      if (inQuotes && text[index + 1] === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  cells.push(currentCell.trim());
  return cells;
}

function getDelimitedCellValues(value = "") {
  const text = String(value || "");

  if (text.includes("\t")) {
    return splitDelimitedLine(text, "\t");
  }

  if (text.includes(";")) {
    return splitDelimitedLine(text, ";");
  }

  if (text.includes(",")) {
    const commaCells = splitDelimitedLine(text, ",");

    if (commaCells.length >= SEO_CHECKER_MIN_COLUMN_COUNT) {
      return commaCells;
    }
  }

  return [text];
}

function parseClipboardTextRows(value = "") {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        return [];
      }

      if (trimmedLine.includes("\t")) {
        return splitDelimitedLine(trimmedLine, "\t");
      }

      if (trimmedLine.includes(";")) {
        return splitDelimitedLine(trimmedLine, ";");
      }

      if (trimmedLine.includes(",")) {
        const commaCells = splitDelimitedLine(trimmedLine, ",");

        if (commaCells.length >= SEO_CHECKER_MIN_COLUMN_COUNT) {
          return commaCells;
        }
      }

      return [trimmedLine];
    })
    .filter((row) => row.some((cell) => String(cell || "").trim()));
}

function isLikelySeoDomainLine(value = "") {
  const text = String(value || "").trim();

  return Boolean(text)
    && !/\s/.test(text)
    && text.toLowerCase() !== "n/a"
    && (
      normalizeDomainForMatch(text).includes(".")
      || isLikelyTruncatedSeoDomainLine(text)
    );
}

function normalizeSeoMetricCells(cells = []) {
  const values = cells.map((cell) => String(cell ?? "").trim()).filter(Boolean);
  const minimumMetricCount = SEO_CHECKER_METRIC_COLUMN_COUNT - 1;

  if (values.length < minimumMetricCount) {
    return [];
  }

  const hasMetricShape =
    /^\d+$/.test(values[0] || "")
    && /^\d+$/.test(values[1] || "")
    && /%$/.test(values[4] || "")
    && /^\d+\/\d+$/.test(values[6] || "");

  if (!hasMetricShape) {
    return [];
  }

  if (values.length > SEO_CHECKER_METRIC_COLUMN_COUNT) {
    return [
      ...values.slice(0, SEO_CHECKER_METRIC_COLUMN_COUNT - 1),
      values.slice(SEO_CHECKER_METRIC_COLUMN_COUNT - 1).join(" "),
    ];
  }

  while (values.length < SEO_CHECKER_METRIC_COLUMN_COUNT) {
    values.push("");
  }

  return values;
}

function parseSeoMetricLine(value = "") {
  return normalizeSeoMetricCells(String(value || "").trim().split(/\s+/));
}

function getSeoMetricCellsFromRow(row = []) {
  const cells = row.map((cell) => String(cell ?? "").trim()).filter(Boolean);

  if (cells.length === 1) {
    return parseSeoMetricLine(cells[0]);
  }

  return normalizeSeoMetricCells(cells);
}

function compactSeoRow(row = []) {
  return (Array.isArray(row) ? row : [])
    .map((cell) => String(cell ?? "").trim())
    .filter(Boolean);
}

function normalizeInlineSeoCheckerRow(value = "") {
  const cells = String(value || "").trim().split(/\s+/).filter(Boolean);

  if (cells.length < SEO_CHECKER_MIN_COLUMN_COUNT || !isLikelySeoDomainLine(cells[0])) {
    return [];
  }

  for (let metricStartIndex = 1; metricStartIndex <= cells.length - SEO_CHECKER_METRIC_COLUMN_COUNT; metricStartIndex += 1) {
    const metricCells = normalizeSeoMetricCells(
      cells.slice(metricStartIndex)
    );

    if (metricCells.length) {
      return [cells[0], cells.slice(1, metricStartIndex).join(" "), ...metricCells];
    }
  }

  return [];
}

function normalizeSeoCheckerResultRow(row = []) {
  const cells = Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [];

  if (cells.length === 1) {
    const inlineRow = normalizeInlineSeoCheckerRow(cells[0]);

    if (inlineRow.length) {
      return inlineRow;
    }
  }

  const firstCell = String(cells[0] || "").trim().toLowerCase();
  const domain = String(cells[0] || "").trim();
  const hasDomain = isLikelySeoDomainLine(domain);

  if (firstCell === "url" || (domain && !hasDomain)) {
    return [];
  }

  const metricsWithTitle = normalizeSeoMetricCells(cells.slice(2));

  if (metricsWithTitle.length) {
    return [domain, String(cells[1] || "").trim(), ...metricsWithTitle];
  }

  const metricsWithoutTitle = normalizeSeoMetricCells(cells.slice(1));

  if (metricsWithoutTitle.length) {
    return [domain, "", ...metricsWithoutTitle];
  }

  return [];
}

function getSeoCheckerHeaderMap(row = []) {
  const map = {};

  (Array.isArray(row) ? row : []).forEach((cell, index) => {
    const key = SEO_CHECKER_HEADER_ALIAS_KEYS[normalizeSeoHeaderValue(cell)];

    if (key && map[key] === undefined) {
      map[key] = index;
    }
  });

  const matchedColumnCount = COPIED_HANDSON_COLUMNS.reduce(
    (count, column) => count + (map[column.key] === undefined ? 0 : 1),
    0
  );

  return map.url !== undefined && matchedColumnCount >= 5 ? map : null;
}

function getSeoCheckerHeaderAliasCount(row = []) {
  const matchedKeys = new Set();

  (Array.isArray(row) ? row : []).forEach((cell) => {
    const key = SEO_CHECKER_HEADER_ALIAS_KEYS[normalizeSeoHeaderValue(cell)];

    if (key) {
      matchedKeys.add(key);
    }
  });

  return matchedKeys.size;
}

function normalizeSeoCheckerRowsByHeader(rows = []) {
  const headerIndex = rows.findIndex((row) => getSeoCheckerHeaderMap(row));

  if (headerIndex < 0) {
    return [];
  }

  const headerMap = getSeoCheckerHeaderMap(rows[headerIndex]);

  return rows
    .slice(headerIndex + 1)
    .map((row) =>
      COPIED_HANDSON_COLUMNS.map((column) =>
        headerMap[column.key] === undefined ? "" : String(row[headerMap[column.key]] ?? "").trim()
      )
    )
    .map((row) => normalizeSeoCheckerResultRow(row))
    .filter((row) => row.length);
}

function collectSeoMetricCellsFromRows(rows = [], startIndex = 0) {
  const collected = [];

  for (let cursor = startIndex; cursor < rows.length; cursor += 1) {
    const row = Array.isArray(rows[cursor]) ? rows[cursor] : [];
    const cells = compactSeoRow(row);

    if (!cells.length) {
      continue;
    }

    if (collected.length === 0) {
      const rowMetricCells = getSeoMetricCellsFromRow(row);

      if (rowMetricCells.length) {
        return {
          cells: rowMetricCells,
          nextIndex: cursor + 1,
        };
      }
    }

    if (cells.length === 1 && isLikelySeoDomainLine(cells[0])) {
      break;
    }

    const values = cells.length === 1
      ? String(cells[0] || "").split(/\s+/).filter(Boolean)
      : cells;

    collected.push(...values);

    const metricCells = normalizeSeoMetricCells(collected);

    if (metricCells.length) {
      return {
        cells: metricCells,
        nextIndex: cursor + 1,
      };
    }
  }

  return {
    cells: [],
    nextIndex: startIndex,
  };
}

function getNextNonEmptySeoRow(rows = [], startIndex = 0) {
  for (let cursor = startIndex; cursor < rows.length; cursor += 1) {
    const cells = compactSeoRow(rows[cursor]);

    if (cells.length) {
      return {
        cells,
        index: cursor,
      };
    }
  }

  return null;
}

function expandStackedSeoCheckerRows(rows = []) {
  const expandedRows = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = Array.isArray(rows[index]) ? rows[index] : [];
    const normalizedResultRow = normalizeSeoCheckerResultRow(row);

    if (normalizedResultRow.length) {
      expandedRows.push(normalizedResultRow);
      continue;
    }

    const compactRow = compactSeoRow(row);

    if (!compactRow.length) {
      continue;
    }

    if (compactRow.length === 1 && isLikelySeoDomainLine(compactRow[0])) {
      const nextRow = getNextNonEmptySeoRow(rows, index + 1);

      if (nextRow) {
        const metricsWithoutTitle = collectSeoMetricCellsFromRows(rows, nextRow.index);
        const metricsAfterTitle = collectSeoMetricCellsFromRows(rows, nextRow.index + 1);

        if (metricsAfterTitle.cells.length) {
          expandedRows.push([compactRow[0], nextRow.cells.join(" "), ...metricsAfterTitle.cells]);
          index = metricsAfterTitle.nextIndex - 1;
          continue;
        }

        if (metricsWithoutTitle.cells.length) {
          expandedRows.push([compactRow[0], "", ...metricsWithoutTitle.cells]);
          index = metricsWithoutTitle.nextIndex - 1;
          continue;
        }
      }
    }

    const linearMetrics = collectSeoMetricCellsFromRows(rows, index + 2);

    if (compactRow.length === 1 && isLikelySeoDomainLine(compactRow[0]) && linearMetrics.cells.length) {
      const titleRow = getNextNonEmptySeoRow(rows, index + 1);

      if (titleRow) {
        expandedRows.push([compactRow[0], titleRow.cells.join(" "), ...linearMetrics.cells]);
        index = linearMetrics.nextIndex - 1;
        continue;
      }
    }

    expandedRows.push(compactRow);
  }

  return expandedRows;
}

function normalizeSeoCheckerPasteData(data = []) {
  if (!Array.isArray(data)) {
    return [];
  }

  const normalizedRows = data.flatMap((row) => {
    if (!Array.isArray(row)) {
      return [];
    }

    if (row.length === 1) {
      const cellValue = String(row[0] ?? "");

      if (/[\t\r\n;]/.test(cellValue)) {
        return parseClipboardTextRows(cellValue);
      }
    }

    return [
      row.flatMap((cell) => getDelimitedCellValues(cell)),
    ];
  });

  const headerRows = normalizeSeoCheckerRowsByHeader(normalizedRows);

  if (headerRows.length) {
    return headerRows;
  }

  return expandStackedSeoCheckerRows(normalizedRows);
}

function getSeoCheckerRows(data = []) {
  return normalizeSeoCheckerPasteData(data)
    .filter((row) => Array.isArray(row))
    .map((row) => normalizeSeoCheckerResultRow(row))
    .filter((row) => row.length);
}

function hasDelimitedSeoCheckerPasteShape(data = []) {
  const rows = normalizeSeoCheckerPasteData(data);

  return rows.some((row) => row.length >= SEO_CHECKER_MIN_COLUMN_COUNT)
    || rows.some((row) => getSeoCheckerHeaderMap(row))
    || data.some((row) =>
      Array.isArray(row)
      && row.some((cell) => {
        const cellValue = String(cell ?? "");

        return /[\t;]/.test(cellValue)
          || (cellValue.includes(",") && splitDelimitedLine(cellValue, ",").length >= SEO_CHECKER_MIN_COLUMN_COUNT);
      })
    );
}

function hasPotentialSeoCheckerPasteShape(data = []) {
  const rows = normalizeSeoCheckerPasteData(data);
  const hasLikelyDomain = rows.some((row) =>
    compactSeoRow(row).some((cell) => isLikelySeoDomainLine(cell))
  );
  const hasLikelyMetricRow = rows.some((row) =>
    getSeoMetricCellsFromRow(row).length > 0
      || normalizeInlineSeoCheckerRow(compactSeoRow(row).join(" ")).length > 0
  );
  const hasLikelyHeader = rows.some((row) => getSeoCheckerHeaderAliasCount(row) >= 3);

  return hasDelimitedSeoCheckerPasteShape(data)
    || hasLikelyHeader
    || (hasLikelyDomain && hasLikelyMetricRow);
}

function isSeoCheckerResultRow(row = []) {
  return normalizeSeoCheckerResultRow(row).length > 0;
}

function createCopiedHandsonRowFromSeoRow(seoRow = [], copiedUrl = "") {
  return COPIED_HANDSON_COLUMNS.reduce((row, column, columnIndex) => {
    row[column.key] = column.key === "url"
      ? String(copiedUrl || seoRow[columnIndex] || "")
      : String(seoRow[columnIndex] ?? "");
    return row;
  }, {});
}

function createCopiedHandsonRowsFromSeoRows(seoRows = []) {
  return seoRows.map((seoRow) => createCopiedHandsonRowFromSeoRow(seoRow, seoRow?.[0] || ""));
}

function getCopiedHandsonFilterNumber(value = "") {
  const text = String(value || "").trim().replace(/,/g, "").toLowerCase();

  if (!text) {
    return null;
  }

  const multiplier = text.endsWith("m") ? 1000000 : text.endsWith("k") ? 1000 : 1;
  const number = Number.parseFloat(text.replace(/[%km]$/i, ""));

  return Number.isFinite(number) ? number * multiplier : null;
}

function isCopiedHandsonPercentageFilter(key) {
  return key === "qt" || key === "ss";
}

function getCopiedHandsonFilterInputValue(key, value = "") {
  const text = String(value || "");

  return isCopiedHandsonPercentageFilter(key) ? text.replace(/%/g, "") : text;
}

function normalizeCopiedHandsonFilterInputValue(key, value = "") {
  const text = String(value || "").replace(/%/g, "");

  return isCopiedHandsonPercentageFilter(key) && text ? `${text}%` : text;
}

function doesCopiedHandsonRowPassFilters(row = {}, filters = {}) {
  return COPIED_HANDSON_FILTERS.every((filter) => {
    const value = getCopiedHandsonFilterNumber(row[filter.key]);
    const min = getCopiedHandsonFilterNumber(filters[filter.key]?.min);
    const max = getCopiedHandsonFilterNumber(filters[filter.key]?.max);

    if (value === null) {
      return true;
    }

    return (min === null || value >= min) && (max === null || value <= max);
  });
}

function getDomainMatchPrefix(value = "") {
  return normalizeDomainForMatch(value).slice(0, 5);
}

function validateSeoCheckerDomainOrder(seoRows = [], copiedDomains = []) {
  for (let index = 0; index < seoRows.length; index += 1) {
    const copiedDomain = String(copiedDomains[index] || "").trim();
    const seoDomain = String(seoRows[index]?.[0] || "").trim();
    const copiedPrefix = getDomainMatchPrefix(copiedDomain);
    const seoPrefix = getDomainMatchPrefix(seoDomain);

    if (!seoDomain) {
      continue;
    }

    if (!copiedPrefix || !seoPrefix || copiedPrefix !== seoPrefix) {
      return {
        ok: false,
        rowNumber: index + 1,
        copiedDomain,
        seoDomain,
        copiedPrefix,
        seoPrefix,
      };
    }
  }

  return { ok: true };
}

function mergeSeoCheckerRowsWithCopiedDomains(seoRows, copiedDomains, expectedCountFallback = 0) {
  const expectedCount = copiedDomains.length || Number(expectedCountFallback || 0) || seoRows.length;
  const pastedCount = seoRows.length;

  return {
    ok: true,
    rows: seoRows.map((seoRow, index) => createCopiedHandsonRowFromSeoRow(seoRow, copiedDomains[index] || seoRow[0])),
    expectedCount,
    pastedCount,
  };
}

function getCopiedDomainsForPaste(copiedState = {}) {
  const loadedDomains = (copiedState.domains || [])
    .map((domain) => String(domain || "").trim())
    .filter(Boolean);

  if (loadedDomains.length) {
    return loadedDomains;
  }

  return (copiedState.rows || [])
    .map((row) => String(row?.url || "").trim())
    .filter(Boolean);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

export default function ExpiredDomainsPage() {
  const { user } = useAuth();
  const [subBatches, setSubBatches] = useState([]);
  const [batchState, setBatchState] = useState({
    currentBatchNumber: 1,
    uploadCount: 0,
    batchSnapshot: null,
  });
  const [activeTab, setActiveTab] = useState("upload");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [processMessage, setProcessMessage] = useState("");
  const [activeProcessStatus, setActiveProcessStatus] = useState(PENDING_PROCESS_STATUS);
  const [activeProcessBatch, setActiveProcessBatch] = useState("all");
  const [domainViewer, setDomainViewer] = useState({
    item: null,
    domains: [],
    loading: false,
  });
  const [processedBatchViewer, setProcessedBatchViewer] = useState({
    item: null,
    subBatches: [],
    loading: false,
  });
  const [copiedHandson, setCopiedHandson] = useState({
    key: "",
    item: null,
    domains: [],
    rows: [],
    merged: false,
    filterApplied: false,
    loading: false,
  });
  const copiedHandsonRef = useRef(copiedHandson);
  const realtimeRefreshTimerRef = useRef(null);
  const [copiedHandsonPasteNotice, setCopiedHandsonPasteNotice] = useState({
    tone: "",
    message: "",
  });
  const [copiedHandsonFilters, setCopiedHandsonFilters] = useState(COPIED_HANDSON_DEFAULT_FILTERS);
  const [serperAvailability, setSerperAvailability] = useState(null);
  const [serperAvailabilityLoading, setSerperAvailabilityLoading] = useState(false);
  const [adminDashboard, setAdminDashboard] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminNotice, setAdminNotice] = useState("");
  const [bulkCheckingSeed, setBulkCheckingSeed] = useState({
    key: "",
    domainsText: "",
    batchNumber: 0,
    subBatches: [],
  });
  const [nawalaCheckingResult, setNawalaCheckingResult] = useState(() =>
    readStoredJson(NAWALA_CHECKING_RESULT_STORAGE_KEY)
  );
  const [waybackCheckingResult, setWaybackCheckingResult] = useState(() =>
    readStoredJson(WAYBACK_CHECKING_RESULT_STORAGE_KEY)
  );
  const [movingToWayBack, setMovingToWayBack] = useState(false);

  const canUploadExpiredDomains = hasPrivilege(user, "IMPORT_EXPIRED_DOMAINS");
  const canProcessExpiredDomains = hasPrivilege(user, "VIEW_EXPIRED_DOMAINS");
  const canAccessRankCheckerAdmin = hasAnyPrivilege(user, ["RANK_CHECKER_ADMIN_PRIVS"]);
  const visibleTabs = useMemo(
    () =>
      EXPIRED_DOMAIN_TABS.filter((tab) =>
        tab.requiredPrivilege === "IMPORT_EXPIRED_DOMAINS"
          ? canUploadExpiredDomains
          : canProcessExpiredDomains
      ),
    [canProcessExpiredDomains, canUploadExpiredDomains]
  );
  const effectiveActiveTab = visibleTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : visibleTabs[0]?.id || "";
  const mainBatchAddedSubBatchKeys = useMemo(
    () =>
      new Set(
        subBatches
          .filter((item) => MAIN_BATCH_ADDED_STATUSES.has(normalizeProcessStatus(item.status)))
          .map((item) => getSubBatchKey(item))
      ),
    [subBatches]
  );
  const processBatchRows = useMemo(() => {
    const batchRows = new Map();

    subBatches.forEach((item) => {
      const batchNumber = Number(item.batchNumber || 1);
      const subBatchNumber = Number(item.subBatchNumber || 1);
      const status = normalizeProcessStatus(item.status);
      const row = batchRows.get(batchNumber) || {
        batchNumber,
        subBatchNumbers: new Set(),
        pendingSubBatchNumbers: new Set(),
        addedSubBatchNumbers: new Set(),
        mainBatchSubBatchNumbers: new Set(),
        completeSubBatchNumbers: new Set(),
      };

      row.subBatchNumbers.add(subBatchNumber);

      if (isPendingProcessStatus(status)) {
        row.pendingSubBatchNumbers.add(subBatchNumber);
      }

      if (MAIN_BATCH_ADDED_STATUSES.has(status)) {
        row.addedSubBatchNumbers.add(subBatchNumber);
      }

      if (MAIN_BATCH_READY_STATUSES.has(status)) {
        row.mainBatchSubBatchNumbers.add(subBatchNumber);
      }

      if (PROCESS_COMPLETE_STATUSES.has(status)) {
        row.completeSubBatchNumbers.add(subBatchNumber);
      }

      batchRows.set(batchNumber, row);
    });

    return Array.from(batchRows.values())
      .map((row) => ({
        batchNumber: row.batchNumber,
        totalSubBatches: row.subBatchNumbers.size,
        pendingSubBatchCount: Array.from(row.pendingSubBatchNumbers)
          .filter((subBatchNumber) => !row.addedSubBatchNumbers.has(subBatchNumber)).length,
        addedSubBatchCount: row.addedSubBatchNumbers.size,
        mainBatchSubBatchCount: row.mainBatchSubBatchNumbers.size,
        completeSubBatchCount: row.completeSubBatchNumbers.size,
      }))
      .sort((left, right) => left.batchNumber - right.batchNumber);
  }, [subBatches]);
  const pendingWorkflowBatchNumber = isPendingProcessStatus(activeProcessStatus)
    ? processBatchRows.find((row) => row.pendingSubBatchCount > 0 || row.mainBatchSubBatchCount > 0)?.batchNumber || 0
    : 0;
  const waybackCheckingBatchNumbers = useMemo(
    () =>
      new Set(
        subBatches
          .filter((item) => normalizeProcessStatus(item.status) === "waybackchecking")
          .map((item) => Number(item.batchNumber || 1))
          .filter(Boolean)
      ),
    [subBatches]
  );
  const statusSubBatches = useMemo(
    () =>
      subBatches
        .map((item) => ({
          ...item,
          status: normalizeProcessStatus(item.status),
        }))
        .filter((item) => item.status === activeProcessStatus)
        .filter((item) =>
          activeProcessStatus === "finalstage"
            ? !waybackCheckingBatchNumbers.has(Number(item.batchNumber || 1))
            : true
        )
        .filter((item) =>
          !isPendingProcessStatus(activeProcessStatus) || !mainBatchAddedSubBatchKeys.has(getSubBatchKey(item))
        )
        .sort((left, right) => {
          const batchDiff = Number(left.batchNumber || 1) - Number(right.batchNumber || 1);

          if (batchDiff) {
            return batchDiff;
          }

          return Number(left.subBatchNumber || 1) - Number(right.subBatchNumber || 1);
        }),
    [activeProcessStatus, mainBatchAddedSubBatchKeys, subBatches, waybackCheckingBatchNumbers]
  );
  const processBatchOptions = useMemo(() => {
    const stageBatchNumbers = new Set(
      statusSubBatches.map((item) => Number(item.batchNumber || 1))
    );

    if (isPendingProcessStatus(activeProcessStatus)) {
      processBatchRows
        .filter((row) => row.pendingSubBatchCount > 0 || row.mainBatchSubBatchCount > 0)
        .forEach((row) => stageBatchNumbers.add(row.batchNumber));
    }

    return processBatchRows
      .filter((row) => stageBatchNumbers.has(row.batchNumber))
      .map((row) => {
        const isLaterPendingBatchLocked =
          isPendingProcessStatus(activeProcessStatus)
          && pendingWorkflowBatchNumber > 0
          && Number(row.batchNumber) > Number(pendingWorkflowBatchNumber);

        return {
          batchNumber: row.batchNumber,
          totalSubBatches: row.totalSubBatches,
          nawalaCheckingSubBatches: row.completeSubBatchCount,
          isComplete: row.totalSubBatches > 0 && row.completeSubBatchCount >= row.totalSubBatches,
          isUnlocked: !isLaterPendingBatchLocked,
        };
      });
  }, [activeProcessStatus, pendingWorkflowBatchNumber, processBatchRows, statusSubBatches]);
  const unlockedProcessBatchNumber = processBatchOptions.find((item) => item.isUnlocked && !item.isComplete)?.batchNumber
    || processBatchOptions.find((item) => item.isUnlocked)?.batchNumber
    || null;
  const defaultProcessBatchNumber = activeProcessStatus === "finalstage"
    ? processBatchOptions[processBatchOptions.length - 1]?.batchNumber || "all"
    : unlockedProcessBatchNumber || processBatchOptions[0]?.batchNumber || "all";
  const batchTransitionPrompt = useMemo(() => {
    const firstIncompleteBatch = processBatchOptions.find((item) => !item.isComplete);

    if (!firstIncompleteBatch) {
      return "";
    }

    const activeBatchNumber = activeProcessBatch === "all"
      ? 0
      : Number(activeProcessBatch || 0);

    if (!activeBatchNumber || activeBatchNumber <= Number(firstIncompleteBatch.batchNumber)) {
      return "";
    }

    return `Batch ${formatBatchNumber(firstIncompleteBatch.batchNumber)} is still in Nawala Checking. You can continue with Batch ${formatBatchNumber(activeBatchNumber)} and add filtered sub-batches to its main batch. When the main batch is fully filtered and you click “Move to Bulk Checking”, the completed batches will stay visible in the Bulk Checking view.`;
  }, [activeProcessBatch, processBatchOptions]);
  const filteredSubBatches = useMemo(
    () => {
      const targetBatchNumber =
        isPendingProcessStatus(activeProcessStatus) && pendingWorkflowBatchNumber
          ? pendingWorkflowBatchNumber
          : activeProcessBatch === "all"
            ? 0
            : Number(activeProcessBatch || 0);
      const rows = targetBatchNumber
        ? statusSubBatches.filter((item) => Number(item.batchNumber || 1) === targetBatchNumber)
        : statusSubBatches;

      return isPendingProcessStatus(activeProcessStatus) ? rows.slice(0, 1) : rows;
    },
    [activeProcessBatch, activeProcessStatus, pendingWorkflowBatchNumber, statusSubBatches]
  );
  const filteredSubBatchDomainCount = useMemo(
    () => filteredSubBatches.reduce((sum, item) => sum + Number(item.domainCount || 0), 0),
    [filteredSubBatches]
  );
  const availableNawalaBatchNumbers = useMemo(
    () => new Set(processBatchOptions.map((item) => Number(item.batchNumber || 0)).filter(Boolean)),
    [processBatchOptions]
  );
  const activeNawalaBatchNumber = activeProcessStatus === "finalstage"
    ? activeProcessBatch === "all"
      ? Number(processBatchOptions[processBatchOptions.length - 1]?.batchNumber || filteredSubBatches[filteredSubBatches.length - 1]?.batchNumber || 0)
      : availableNawalaBatchNumbers.has(Number(activeProcessBatch || 0))
        ? Number(activeProcessBatch || 0)
        : 0
    : 0;
  const activeNawalaCheckingResult = useMemo(() => {
    if (!nawalaCheckingResult) {
      return null;
    }

    if (!activeNawalaBatchNumber) {
      return null;
    }

    return Number(nawalaCheckingResult.batchNumber || 0) === Number(activeNawalaBatchNumber)
      ? nawalaCheckingResult
      : null;
  }, [activeNawalaBatchNumber, nawalaCheckingResult]);
  const visibleNawalaCheckingResult = useMemo(
    () =>
      activeNawalaCheckingResult || {
        batchNumber: activeNawalaBatchNumber || 1,
        summary: summarizeNawalaRows([]),
        results: [],
        totalBatches: 0,
        totalDomains: filteredSubBatchDomainCount,
      },
    [activeNawalaBatchNumber, activeNawalaCheckingResult, filteredSubBatchDomainCount]
  );
  const visibleNawalaResultCount = (visibleNawalaCheckingResult?.results || []).length;
  const hasAvailableNawalaCheckingBatch = activeProcessStatus === "finalstage"
    && activeNawalaBatchNumber > 0
    && filteredSubBatches.length > 0
    && visibleNawalaResultCount > 0
    && !Boolean(activeNawalaCheckingResult?.movedToWayBackAt);
  const currentPendingBatchNumber =
    isPendingProcessStatus(activeProcessStatus) && pendingWorkflowBatchNumber
      ? pendingWorkflowBatchNumber
      : null;
  const bulkCheckingBatchRows = useMemo(() => {
    if (activeProcessStatus !== "bulkchecking") {
      return [];
    }

    const totalSubBatchCounts = new Map();
    const batchRows = new Map();

    subBatches.forEach((item) => {
      const batchNumber = Number(item.batchNumber || 1);
      const subBatchKeys = totalSubBatchCounts.get(batchNumber) || new Set();

      subBatchKeys.add(getSubBatchKey(item));
      totalSubBatchCounts.set(batchNumber, subBatchKeys);
    });

    filteredSubBatches.forEach((item) => {
      const batchNumber = Number(item.batchNumber || 1);
      const row = batchRows.get(batchNumber) || {
        id: `bulkchecking-batch-${batchNumber}`,
        batchNumber,
        status: "bulkchecking",
        subBatchCount: 0,
        totalSubBatchCount: totalSubBatchCounts.get(batchNumber)?.size || 0,
        bulkCheckingPercentage: 0,
        domainCount: 0,
        subBatches: [],
      };

      row.subBatchCount += 1;
      row.domainCount += Number(item.domainCount || 0);
      row.subBatches.push(item);
      row.bulkCheckingPercentage = row.totalSubBatchCount
        ? Math.round((row.subBatchCount / row.totalSubBatchCount) * 100)
        : 0;
      batchRows.set(batchNumber, row);
    });

    return Array.from(batchRows.values()).sort((left, right) => left.batchNumber - right.batchNumber);
  }, [activeProcessStatus, filteredSubBatches, subBatches]);
  const visibleProcessBatchRows = useMemo(
    () => activeProcessStatus === "bulkchecking"
        ? bulkCheckingBatchRows
        : [],
    [activeProcessStatus, bulkCheckingBatchRows]
  );
  const hasVisibleProcessRows = activeProcessStatus === "bulkchecking"
    ? visibleProcessBatchRows.length > 0
    : filteredSubBatches.length > 0;
  const showPendingEmptyNotice =
    !loading
    && isPendingProcessStatus(activeProcessStatus)
    && !hasVisibleProcessRows
    && !pendingWorkflowBatchNumber;
  const activeBulkCheckingBatchNumbers = useMemo(
    () => Array.from(
      new Set(
        subBatches
          .filter((item) => normalizeProcessStatus(item.status) === "bulkchecking")
          .map((item) => Number(item.batchNumber || 1))
          .filter(Boolean)
      )
    ).sort((left, right) => left - right),
    [subBatches]
  );
  const activeBulkCheckingBatchNumber = activeBulkCheckingBatchNumbers[0] || 0;
  const hasActiveBulkCheckingBatch = activeBulkCheckingBatchNumbers.length > 0;
  const activeNawalaCheckingBatchNumbers = useMemo(
    () => Array.from(
      new Set(
        subBatches
          .filter((item) => normalizeProcessStatus(item.status) === "finalstage")
          .map((item) => Number(item.batchNumber || 1))
          .filter((batchNumber) => !waybackCheckingBatchNumbers.has(batchNumber))
          .filter(Boolean)
      )
    ).sort((left, right) => left - right),
    [subBatches, waybackCheckingBatchNumbers]
  );
  const getBlockingNawalaBatchNumber = useCallback(
    (batchNumber) => activeNawalaCheckingBatchNumbers.find((item) => Number(item) !== Number(batchNumber || 0)) || 0,
    [activeNawalaCheckingBatchNumbers]
  );
  const resetBulkCheckingView = useCallback(() => {
    clearBulkCheckerStorage();
    setBulkCheckingSeed({
      key: `cleared:${Date.now()}`,
      domainsText: "",
      batchNumber: 0,
      subBatches: [],
    });
  }, []);
  const copiedHandsonTarget = isPendingProcessStatus(activeProcessStatus) ? filteredSubBatches[0] || null : null;
  const copiedHandsonTargetKey = copiedHandsonTarget ? getSubBatchKey(copiedHandsonTarget) : "";
  const copiedHandsonRows = useMemo(() => {
    const rows = copiedHandson.rows.map((row) => normalizeCopiedHandsonRow(row));

    while (rows.length < COPIED_HANDSON_MIN_ROWS) {
      rows.push(createCopiedHandsonRow());
    }

    return rows;
  }, [copiedHandson.rows]);
  const copiedHandsonHiddenRows = useMemo(() => {
    if (!copiedHandson.merged || !copiedHandson.filterApplied) {
      return [];
    }

    return copiedHandsonRows.reduce((hiddenRows, row, index) => {
      if (!String(row.url || "").trim() || !doesCopiedHandsonRowPassFilters(row, copiedHandsonFilters)) {
        hiddenRows.push(index);
      }

      return hiddenRows;
    }, []);
  }, [copiedHandson.filterApplied, copiedHandson.merged, copiedHandsonFilters, copiedHandsonRows]);
  const copiedHandsonFilteredRows = useMemo(() => {
    if (!copiedHandson.merged) {
      return [];
    }

    return copiedHandsonRows
      .filter((row) => String(row.url || "").trim() && doesCopiedHandsonRowPassFilters(row, copiedHandsonFilters));
  }, [copiedHandson.merged, copiedHandsonFilters, copiedHandsonRows]);
  const copiedHandsonFilteredUrls = useMemo(() => {
    if (!copiedHandsonFilteredRows.length) {
      return [];
    }

    return copiedHandsonFilteredRows
      .map((row) => String(row.url || "").trim())
      .filter(Boolean);
  }, [copiedHandsonFilteredRows]);
  const showCopiedHandsonNoValidRows = copiedHandson.merged && copiedHandson.filterApplied && copiedHandsonFilteredUrls.length === 0;
  const copiedHandsonFallbackBatch = useMemo(() => {
    if (!isPendingProcessStatus(activeProcessStatus)) {
      return {
        readyBatchNumber: 0,
        selectedBatchNumber: 0,
        startedBatchNumber: 0,
      };
    }

    const batchRows = new Map();

    subBatches.forEach((item) => {
      const batchNumber = Number(item.batchNumber || 1);
      const subBatchNumber = Number(item.subBatchNumber || 1);
      const status = normalizeProcessStatus(item.status);
      const row = batchRows.get(batchNumber) || {
        batchNumber,
        subBatchNumbers: new Set(),
        addedSubBatchNumbers: new Set(),
        mainBatchSubBatchNumbers: new Set(),
      };

      row.subBatchNumbers.add(subBatchNumber);
      if (MAIN_BATCH_ADDED_STATUSES.has(status)) {
        row.addedSubBatchNumbers.add(subBatchNumber);
      }
      if (MAIN_BATCH_READY_STATUSES.has(status)) {
        row.mainBatchSubBatchNumbers.add(subBatchNumber);
      }
      batchRows.set(batchNumber, row);
    });

    const rows = Array.from(batchRows.values())
      .map((row) => ({
        batchNumber: row.batchNumber,
        totalSubBatches: row.subBatchNumbers.size,
        addedSubBatches: row.addedSubBatchNumbers.size,
        mainBatchSubBatches: row.mainBatchSubBatchNumbers.size,
      }))
      .sort((left, right) => left.batchNumber - right.batchNumber);
    const selectedBatchNumber = activeProcessBatch === "all" ? 0 : Number(activeProcessBatch || 0);
    const selectedRow = rows.find((row) =>
      row.batchNumber === selectedBatchNumber
      && row.mainBatchSubBatches > 0
    );
    const readyRow = rows.find((row) =>
      row.totalSubBatches > 0
      && row.addedSubBatches >= row.totalSubBatches
      && row.mainBatchSubBatches > 0
    );
    const startedRow = rows.find((row) => row.mainBatchSubBatches > 0);

    return {
      readyBatchNumber: readyRow?.batchNumber || 0,
      selectedBatchNumber: selectedRow?.batchNumber || 0,
      startedBatchNumber: startedRow?.batchNumber || 0,
    };
  }, [activeProcessBatch, activeProcessStatus, subBatches]);
  const copiedHandsonCurrentItem = copiedHandson.item || copiedHandsonTarget;
  const copiedHandsonMainBatchNumber =
    currentPendingBatchNumber
    || Number(copiedHandsonCurrentItem?.batchNumber || 0)
    || copiedHandsonFallbackBatch.selectedBatchNumber
    || copiedHandsonFallbackBatch.readyBatchNumber
    || copiedHandsonFallbackBatch.startedBatchNumber;
  const copiedHandsonMainBatchSubBatches = copiedHandsonMainBatchNumber
    ? subBatches.filter((item) => Number(item.batchNumber || 1) === copiedHandsonMainBatchNumber)
    : [];
  const copiedHandsonMainBatchSubBatchNumbers = new Set(
    copiedHandsonMainBatchSubBatches.map((item) => Number(item.subBatchNumber || 1))
  );
  const copiedHandsonMainBatchAddedSubBatchNumbers = new Set(
    copiedHandsonMainBatchSubBatches
      .filter((item) => MAIN_BATCH_ADDED_STATUSES.has(normalizeProcessStatus(item.status)))
      .map((item) => Number(item.subBatchNumber || 1))
  );
  const copiedHandsonMainBatchReadySubBatches = copiedHandsonMainBatchSubBatches.filter(
    (item) => MAIN_BATCH_READY_STATUSES.has(normalizeProcessStatus(item.status))
  );
  const copiedHandsonMainBatchSubBatchTotal = copiedHandsonMainBatchSubBatchNumbers.size;
  const copiedHandsonMainBatchAddedSubBatchCount = copiedHandsonMainBatchAddedSubBatchNumbers.size;
  const copiedHandsonMainBatchRemainingSubBatchCount = Math.max(
    0,
    copiedHandsonMainBatchSubBatchTotal - copiedHandsonMainBatchAddedSubBatchCount
  );
  const copiedHandsonMainBatchProgressPct = copiedHandsonMainBatchSubBatchTotal
    ? Math.min(100, Math.round((copiedHandsonMainBatchAddedSubBatchCount / copiedHandsonMainBatchSubBatchTotal) * 100))
    : 0;
  const copiedHandsonMainBatchBulkCheckingItem = copiedHandsonMainBatchNumber
    ? {
      id: `bulkchecking-batch-${copiedHandsonMainBatchNumber}`,
      batchNumber: copiedHandsonMainBatchNumber,
      status: "bulkchecking",
      subBatchCount: copiedHandsonMainBatchReadySubBatches.length,
      totalSubBatchCount: copiedHandsonMainBatchSubBatchTotal,
      bulkCheckingPercentage: copiedHandsonMainBatchProgressPct,
      domainCount: copiedHandsonMainBatchReadySubBatches.reduce(
        (sum, item) => sum + Number(item.domainCount || 0),
        0
      ),
      subBatches: copiedHandsonMainBatchReadySubBatches,
    }
    : null;
  const copiedHandsonMainBatchBulkCheckingBusy =
    copiedHandsonMainBatchNumber
    && busyId === `bulkchecking-batch-${copiedHandsonMainBatchNumber}:bulkchecking`;
  const canMoveCopiedHandsonMainBatchToBulkChecking =
    copiedHandsonMainBatchSubBatchTotal > 0
    && copiedHandsonMainBatchRemainingSubBatchCount === 0
    && copiedHandsonMainBatchProgressPct === 100
    && copiedHandsonMainBatchReadySubBatches.length > 0
    && !hasActiveBulkCheckingBatch
    && !Boolean(busyId);
  const bulkToNawalaBlockingBatchNumber = getBlockingNawalaBatchNumber(
    bulkCheckingSeed.batchNumber || activeBulkCheckingBatchNumber
  );
  const bulkToNawalaDisabledReason = bulkToNawalaBlockingBatchNumber
    ? `Batch ${formatBatchNumber(bulkToNawalaBlockingBatchNumber)} is already in Nawala Checking.`
    : "";

  const load = useCallback(async () => {
    if (!canProcessExpiredDomains) {
      setSubBatches([]);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await getExpiredDomainProcessSubBatches();
      setSubBatches(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load expired-domain sub-batches");
    } finally {
      setLoading(false);
    }
  }, [canProcessExpiredDomains]);

  const loadBatchState = useCallback(async () => {
    if (!canUploadExpiredDomains) {
      return;
    }

    try {
      const res = await getCurrentExpiredDomainBatch();
      setBatchState({
        currentBatchNumber: res.data?.data?.currentBatchNumber || 1,
        uploadCount: res.data?.data?.uploadCount || 0,
        batchSnapshot: res.data?.data?.batchSnapshot || null,
      });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load expired-domain batch");
    }
  }, [canUploadExpiredDomains]);

  const refreshSerperAvailability = useCallback(async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setSerperAvailabilityLoading(true);
    }

    try {
      const payload = await getSerperAvailability();
      setSerperAvailability(payload);
      return payload;
    } catch (err) {
      const availabilityPayload = err.response?.data?.serperAvailability;

      if (availabilityPayload) {
        setSerperAvailability(availabilityPayload);
      }

      return null;
    } finally {
      if (showLoader) {
        setSerperAvailabilityLoading(false);
      }
    }
  }, []);

  const syncSerperAvailabilityFromError = useCallback((err) => {
    const availabilityPayload = err.response?.data?.serperAvailability;

    if (availabilityPayload) {
      setSerperAvailability(availabilityPayload);
    }
  }, []);

  const refreshAdminDashboard = useCallback(async ({ showLoader = true } = {}) => {
    if (!canAccessRankCheckerAdmin) {
      return null;
    }

    if (showLoader) {
      setAdminLoading(true);
    }

    try {
      setAdminError("");
      const payload = await getAdminDashboard();
      setAdminDashboard(payload);

      if (payload?.serperAvailability) {
        setSerperAvailability(payload.serperAvailability);
      }

      return payload;
    } catch (err) {
      syncSerperAvailabilityFromError(err);
      setAdminError(getErrorMessage(err, "Failed to load Rank Checker admin configuration"));
      return null;
    } finally {
      if (showLoader) {
        setAdminLoading(false);
      }
    }
  }, [canAccessRankCheckerAdmin, syncSerperAvailabilityFromError]);

  useEffect(() => {
    if (!visibleTabs.length) {
      return;
    }

    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (canProcessExpiredDomains) {
      void load();
    }
  }, [canProcessExpiredDomains, load]);

  useEffect(() => {
    if (canUploadExpiredDomains) {
      void loadBatchState();
    }
  }, [canUploadExpiredDomains, loadBatchState]);

  useEffect(() => {
    if (!canProcessExpiredDomains && !canUploadExpiredDomains) {
      return undefined;
    }

    const token = getToken();

    if (!token) {
      return undefined;
    }

    const socket = io(`${getSocketBaseUrl()}/expired-domains`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    const refreshFromRealtime = () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }

      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        const refreshes = [];

        if (canProcessExpiredDomains) {
          refreshes.push(load());
        }

        if (canUploadExpiredDomains) {
          refreshes.push(loadBatchState());
        }

        void Promise.allSettled(refreshes);
      }, 300);
    };

    const handleForbidden = (payload = {}) => {
      setError(payload.message || "You do not have permission to receive expired-domain live updates.");
      socket.disconnect();
    };

    socket.on("expired-domains:changed", refreshFromRealtime);
    socket.on("expired-domains:forbidden", handleForbidden);

    return () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }

      socket.off("expired-domains:changed", refreshFromRealtime);
      socket.off("expired-domains:forbidden", handleForbidden);
      socket.disconnect();
    };
  }, [canProcessExpiredDomains, canUploadExpiredDomains, load, loadBatchState]);

  useEffect(() => {
    copiedHandsonRef.current = copiedHandson;
  }, [copiedHandson]);

  useEffect(() => {
    storeJson(NAWALA_CHECKING_RESULT_STORAGE_KEY, nawalaCheckingResult);
  }, [nawalaCheckingResult]);

  useEffect(() => {
    storeJson(WAYBACK_CHECKING_RESULT_STORAGE_KEY, waybackCheckingResult);
  }, [waybackCheckingResult]);

  useEffect(() => {
    if (
      !canProcessExpiredDomains
      || effectiveActiveTab !== "process"
      || activeProcessStatus !== "finalstage"
      || loading
      || activeNawalaCheckingResult?.results?.length
    ) {
      return undefined;
    }

    const selectedBatchNumber = activeNawalaBatchNumber;

    if (!selectedBatchNumber) {
      return undefined;
    }

    const sourceRows = subBatches
      .map((item) => ({
        ...item,
        status: normalizeProcessStatus(item.status),
      }))
      .filter((item) =>
        item.status === "finalstage"
        && Number(item.batchNumber || 1) === selectedBatchNumber
      );

    if (!sourceRows.length) {
      return undefined;
    }

    let cancelled = false;

    Promise.all(
      sourceRows.map(async (subBatch) => {
        const res = await getExpiredDomainProcessSubBatchDomains(
          subBatch.batchNumber,
          subBatch.subBatchNumber,
          subBatch.status
        );

        return {
          subBatch,
          payload: res.data?.data || {},
        };
      })
    )
      .then((groups) => {
        if (cancelled) {
          return;
        }

        const sourceSubBatches = [];
        const movedToWayBackDomains = [];
        const rows = groups.flatMap(({ subBatch, payload }) => {
          const items = Array.isArray(payload.items) && payload.items.length
            ? payload.items
            : (payload.domains || []).map((domain) => ({ domain, processStatus: subBatch.status }));
          const domains = items.map((item) => item.domain).filter(Boolean);

          sourceSubBatches.push({
            batchNumber: subBatch.batchNumber,
            subBatchNumber: subBatch.subBatchNumber,
            domains,
          });

          return items.filter((item) => String(item.nawalaStatus || "").trim()).map((item, index) => {
            const processStatus = normalizeProcessStatus(item.processStatus || subBatch.status);
            const status = item.nawalaStatus || (processStatus === "waybackchecking" ? "tidak ada" : "unknown");
            const domain = item.domain;

            if (processStatus === "waybackchecking" && domain) {
              movedToWayBackDomains.push(domain);
            }

            return {
              domain,
              status,
              label: item.nawalaLabel || getNawalaStatusLabel(status),
              blocked: typeof item.nawalaBlocked === "boolean"
                ? item.nawalaBlocked
                : status === "ada"
                  ? true
                  : status === "tidak ada"
                    ? false
                    : null,
              sourceStatus: item.nawalaSourceStatus || "",
              checkedAt: item.nawalaCheckedAt || null,
              batchNumber: item.nawalaResultBatchNumber || Math.floor(index / NAWALA_CHECK_BATCH_SIZE) + 1,
              error: item.nawalaError || "",
            };
          });
        }).filter((item) => item.domain);

        if (!rows.length) {
          return;
        }

        setNawalaCheckingResult({
          batchNumber: selectedBatchNumber || Number(sourceRows[0]?.batchNumber || 1),
          summary: summarizeNawalaRows(rows),
          results: rows,
          sourceSubBatches,
          checkedAt: rows.find((item) => item.checkedAt)?.checkedAt || null,
          totalBatches: Math.ceil(rows.length / NAWALA_CHECK_BATCH_SIZE),
          totalDomains: rows.length,
          movedToWayBackAt: movedToWayBackDomains.length ? new Date().toISOString() : null,
          wayBackMovedDomains: movedToWayBackDomains,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message || err.message || "Failed to load Nawala result details");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeNawalaCheckingResult,
    activeNawalaBatchNumber,
    activeProcessBatch,
    activeProcessStatus,
    canProcessExpiredDomains,
    effectiveActiveTab,
    loading,
    subBatches,
  ]);

  useEffect(() => {
    if (
      !canProcessExpiredDomains
      || effectiveActiveTab !== "process"
      || activeProcessStatus !== "bulkchecking"
    ) {
      return undefined;
    }

    void refreshSerperAvailability({ showLoader: true });
    const timer = window.setInterval(() => {
      void refreshSerperAvailability();
    }, SERPER_AVAILABILITY_POLL_MS);

    return () => window.clearInterval(timer);
  }, [activeProcessStatus, canProcessExpiredDomains, effectiveActiveTab, refreshSerperAvailability]);

  useEffect(() => {
    if (
      !canAccessRankCheckerAdmin
      || effectiveActiveTab !== "process"
      || activeProcessStatus !== "bulkchecking"
    ) {
      return;
    }

    void refreshAdminDashboard({ showLoader: true });
  }, [activeProcessStatus, canAccessRankCheckerAdmin, effectiveActiveTab, refreshAdminDashboard]);

  useEffect(() => {
    if (!copiedHandsonTarget) {
      setCopiedHandsonPasteNotice({ tone: "", message: "" });
      setCopiedHandson((current) => {
        if (current.filterApplied) {
          return {
            ...current,
            item: null,
            loading: false,
          };
        }

        return {
          key: "",
          item: null,
          domains: [],
          rows: [],
          merged: false,
          filterApplied: false,
          loading: false,
        };
      });
      return undefined;
    }

    if (copiedHandson.key === copiedHandsonTargetKey) {
      return undefined;
    }

    let cancelled = false;
    const target = copiedHandsonTarget;
    const targetKey = copiedHandsonTargetKey;

    setCopiedHandsonPasteNotice({ tone: "", message: "" });
    setCopiedHandson({
      key: targetKey,
      item: target,
      domains: [],
      rows: [],
      merged: false,
      filterApplied: false,
      loading: true,
    });

    getExpiredDomainProcessSubBatchDomains(target.batchNumber, target.subBatchNumber, normalizeProcessStatus(target.status))
      .then((res) => {
        if (cancelled) {
          return;
        }

        const domains = res.data?.data?.domains || [];
        setCopiedHandson({
          key: targetKey,
          item: target,
          domains,
          rows: readCopiedHandsonRows(targetKey, domains),
          merged: readCopiedHandsonMergeState(targetKey, domains.length),
          filterApplied: false,
          loading: false,
        });
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }

        setCopiedHandson({
          key: targetKey,
          item: target,
          domains: [],
          rows: [],
          merged: false,
          filterApplied: false,
          loading: false,
        });
        setError(err.response?.data?.message || err.message || "Failed to load pending-domain table");
      });

    return () => {
      cancelled = true;
    };
  }, [copiedHandson.key, copiedHandsonTarget, copiedHandsonTargetKey]);

  useEffect(() => {
    if (!processBatchOptions.length) {
      if (activeProcessBatch !== "all") {
        setActiveProcessBatch("all");
      }
      return;
    }

    const selectedBatch = processBatchOptions.find((item) => item.batchNumber === Number(activeProcessBatch));

    if (
      activeProcessBatch === "all"
      || !selectedBatch
      || !selectedBatch.isUnlocked
    ) {
      setActiveProcessBatch(defaultProcessBatchNumber);
    }
  }, [activeProcessBatch, defaultProcessBatchNumber, processBatchOptions]);

  const handleImportComplete = async () => {
    await loadBatchState();

    if (canProcessExpiredDomains) {
      await load();
    }
  };

  const handleMoveToProcess = async () => {
    const res = await moveExpiredDomainBatchToProcess();
    const result = res.data?.data || {};
    await loadBatchState();

    if (canProcessExpiredDomains) {
      await load();
    }

    if ((result.movedCount || 0) > 0 && canProcessExpiredDomains) {
      setActiveTab("process");
    }

    return result;
  };

  const handleCopySubBatch = async (item) => {
    const key = getSubBatchKey(item);
    const status = normalizeProcessStatus(item.status);

    try {
      setBusyId(`${key}:copy`);
      setError("");
      setProcessMessage("");

      const res = await getExpiredDomainProcessSubBatchDomains(item.batchNumber, item.subBatchNumber, status);
      const result = res.data?.data || {};
      const domains = result.domains || [];

      if (!domains.length) {
        setError("No domains found in this sub-batch.");
        return;
      }

      await copyTextToClipboard(domains.join("\n"));
      if (!isPendingProcessStatus(status)) {
        await updateExpiredDomainProcessSubBatchStatus(item.batchNumber, item.subBatchNumber, PENDING_PROCESS_STATUS);
        setSubBatches((current) =>
          current.map((subBatch) =>
            Number(subBatch.batchNumber || 1) === Number(item.batchNumber || 1)
            && Number(subBatch.subBatchNumber || 1) === Number(item.subBatchNumber || 1)
              ? { ...subBatch, status: PENDING_PROCESS_STATUS }
              : subBatch
          )
        );
      }
      setProcessMessage(
        `Copied ${domains.length.toLocaleString()} domains from batch ${formatBatchNumber(item.batchNumber)}, sub-batch ${formatBatchNumber(item.subBatchNumber)}.`
      );
      setActiveProcessStatus(PENDING_PROCESS_STATUS);
      setActiveProcessBatch(Number(item.batchNumber || 1));
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to copy sub-batch domains");
    } finally {
      setBusyId("");
    }
  };

  const handleStatusUpdate = async (item, status) => {
    const key = getSubBatchKey(item);

    try {
      setBusyId(`${key}:${status}`);
      setError("");
      setProcessMessage("");
      await updateExpiredDomainProcessSubBatchStatus(item.batchNumber, item.subBatchNumber, status);
      setProcessMessage(
        `Batch ${formatBatchNumber(item.batchNumber)}, sub-batch ${formatBatchNumber(item.subBatchNumber)} marked as ${PROCESS_STATUS_LABELS[status]}.`
      );
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to update sub-batch status");
    } finally {
      setBusyId("");
    }
  };

  const handleViewProcessedBatch = async (item) => {
    const key = `${item.status || activeProcessStatus || "batch"}-batch-${item.batchNumber}`;
    const stageSubBatches = item.subBatches || [];

    try {
      setBusyId(`${key}:view`);
      setError("");
      setProcessedBatchViewer({
        item,
        subBatches: [],
        loading: true,
      });

      const subBatchesWithDomains = await Promise.all(
        stageSubBatches.map(async (subBatch) => {
          const res = await getExpiredDomainProcessSubBatchDomains(subBatch.batchNumber, subBatch.subBatchNumber, subBatch.status || "bulkchecking");
          const result = res.data?.data || {};

          return {
            ...subBatch,
            domains: result.domains || [],
          };
        })
      );

      setProcessedBatchViewer({
        item: {
          ...item,
          domains: subBatchesWithDomains.flatMap((subBatch) => subBatch.domains || []),
        },
        subBatches: subBatchesWithDomains,
        loading: false,
      });
    } catch (err) {
      setProcessedBatchViewer({
        item: null,
        subBatches: [],
        loading: false,
      });
      setError(err.response?.data?.message || err.message || "Failed to load batch domains");
    } finally {
      setBusyId("");
    }
  };

  const loadProcessedBatchDomains = useCallback(async (item) => {
    const processedSubBatches = item.subBatches || [];
    const subBatchesWithDomains = await Promise.all(
      processedSubBatches.map(async (subBatch) => {
        const res = await getExpiredDomainProcessSubBatchDomains(subBatch.batchNumber, subBatch.subBatchNumber, subBatch.status || "bulkchecking");
        const result = res.data?.data || {};

        return {
          ...subBatch,
          domains: result.domains || [],
        };
      })
    );

    return {
      subBatches: subBatchesWithDomains,
      domains: subBatchesWithDomains.flatMap((subBatch) => subBatch.domains || []),
    };
  }, []);

  useEffect(() => {
    if (
      !canProcessExpiredDomains
      || effectiveActiveTab !== "process"
      || activeProcessStatus !== "bulkchecking"
      || loading
      || !visibleProcessBatchRows.length
    ) {
      return undefined;
    }

    const selectedBatchNumber = activeProcessBatch === "all" ? 0 : Number(activeProcessBatch || 0);
    const targetItem = visibleProcessBatchRows.find((item) =>
      selectedBatchNumber && Number(item.batchNumber || 0) === selectedBatchNumber
    ) || visibleProcessBatchRows[0];
    const targetBatchNumber = Number(targetItem?.batchNumber || 0);

    if (!targetBatchNumber || !targetItem?.subBatches?.length) {
      return undefined;
    }

    const seededDomainCount = String(bulkCheckingSeed.domainsText || "")
      .split(/[\n,]+/)
      .map((domain) => domain.trim())
      .filter(Boolean).length;
    const targetDomainCount = Number(targetItem.domainCount || 0);
    const hasCurrentBatchDomains =
      Number(bulkCheckingSeed.batchNumber || 0) === targetBatchNumber
      && seededDomainCount > 0
      && (!targetDomainCount || seededDomainCount === targetDomainCount);

    if (hasCurrentBatchDomains) {
      return undefined;
    }

    let cancelled = false;
    const key = `bulkchecking-batch-${targetBatchNumber}`;

    loadProcessedBatchDomains(targetItem)
      .then((batchDomainResult) => {
        if (cancelled) {
          return;
        }

        const domains = Array.from(new Set(
          (batchDomainResult.domains || [])
            .map((domain) => String(domain || "").trim())
            .filter(Boolean)
        ));

        if (!domains.length) {
          setError(`No domains found in Batch ${formatBatchNumber(targetBatchNumber)} for bulk checking.`);
          return;
        }

        setBulkCheckingSeed({
          key: `${key}:${domains.length}:${Date.now()}`,
          domainsText: domains.join("\n"),
          batchNumber: targetBatchNumber,
          subBatches: batchDomainResult.subBatches,
        });
        setProcessMessage(
          `Batch ${formatBatchNumber(targetBatchNumber)} loaded into Bulk Checking with ${domains.length.toLocaleString()} domain${domains.length === 1 ? "" : "s"}.`
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message || err.message || "Failed to load batch domains into bulk checking");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeProcessBatch,
    activeProcessStatus,
    bulkCheckingSeed.batchNumber,
    bulkCheckingSeed.domainsText,
    canProcessExpiredDomains,
    effectiveActiveTab,
    loadProcessedBatchDomains,
    loading,
    visibleProcessBatchRows,
  ]);

  const closeProcessedBatchViewer = () => {
    setProcessedBatchViewer({
      item: null,
      subBatches: [],
      loading: false,
    });
  };

  const handleOpenBatchInBulkChecking = async (item) => {
    const key = `${item.status || "bulkchecking"}-batch-${item.batchNumber}`;
    const stageSubBatches = item.subBatches || [];

    if (!stageSubBatches.length) {
      setError("No bulk checking sub-batches found in this batch.");
      return;
    }

    try {
      setBusyId(`${key}:bulkchecking`);
      setError("");
      setProcessMessage(`Loading batch ${formatBatchNumber(item.batchNumber)} into Bulk Checking...`);

      const batchDomainResult = await loadProcessedBatchDomains(item);
      const domains = Array.from(new Set(
        batchDomainResult.domains.map((domain) => String(domain || "").trim()).filter(Boolean)
      ));

      if (!domains.length) {
        setError("No domains found in this batch for bulk checking.");
        setProcessMessage("");
        return;
      }

      await Promise.all(
        batchDomainResult.subBatches.map((subBatch) =>
          normalizeProcessStatus(subBatch.status) === "bulkchecking"
            ? Promise.resolve()
            : updateExpiredDomainProcessSubBatchStatus(subBatch.batchNumber, subBatch.subBatchNumber, "bulkchecking", {
              domains: subBatch.domains || [],
            })
        )
      );

      const movedSubBatchKeys = new Set(stageSubBatches.map((subBatch) => getSubBatchKey(subBatch)));

      setSubBatches((current) =>
        current.map((subBatch) =>
          Number(subBatch.batchNumber || 1) === Number(item.batchNumber || 1)
          && movedSubBatchKeys.has(getSubBatchKey(subBatch))
            ? { ...subBatch, status: "bulkchecking" }
            : subBatch
        )
      );
      setBulkCheckingSeed({
        key: `${key}:${domains.length}:${Date.now()}`,
        domainsText: domains.join("\n"),
        batchNumber: Number(item.batchNumber || 0),
        subBatches: batchDomainResult.subBatches,
      });
      setNawalaCheckingResult(null);
      setWaybackCheckingResult(null);
      setActiveProcessStatus("bulkchecking");
      setActiveProcessBatch("all");
      setProcessMessage(
        `Batch ${formatBatchNumber(item.batchNumber)} loaded into Bulk Checking with ${domains.length.toLocaleString()} domain${domains.length === 1 ? "" : "s"}.`
      );
      closeProcessedBatchViewer();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load batch into bulk checking");
    } finally {
      setBusyId("");
    }
  };

  const handleMoveCopiedHandsonMainBatchToBulkChecking = () => {
    if (!copiedHandsonMainBatchBulkCheckingItem) {
      setError("No main batch domains found for Bulk Checking.");
      return;
    }

    if (hasActiveBulkCheckingBatch) {
      setError(`Batch ${formatBatchNumber(activeBulkCheckingBatchNumber)} is already in Bulk Checking. Move it to Nawala Checking before starting another batch.`);
      return;
    }

    if (copiedHandsonMainBatchProgressPct < 100 || copiedHandsonMainBatchRemainingSubBatchCount > 0) {
      setError(`Batch ${formatBatchNumber(copiedHandsonMainBatchNumber)} can move to Bulk Checking only after the main batch progress reaches 100%.`);
      return;
    }

    if (!canMoveCopiedHandsonMainBatchToBulkChecking) {
      setError(`Add all filtered sub-batches to Batch ${formatBatchNumber(copiedHandsonMainBatchNumber)} before moving to Bulk Checking.`);
      return;
    }

    handleOpenBatchInBulkChecking(copiedHandsonMainBatchBulkCheckingItem);
  };

  const handleMoveBulkResultsToNawalaChecking = useCallback(
    async ({ domains = [] } = {}) => {
      const batchNumber = bulkCheckingSeed.batchNumber || activeBulkCheckingBatchNumber || 0;
      const blockingNawalaBatchNumber = getBlockingNawalaBatchNumber(batchNumber);
      const uniqueDomains = [...new Set(
        domains.map((domain) => String(domain || "").trim()).filter(Boolean)
      )];

      if (blockingNawalaBatchNumber) {
        throw new Error(`Batch ${formatBatchNumber(blockingNawalaBatchNumber)} is already in Nawala Checking. Finish it before moving another batch to Nawala Checking.`);
      }

      if (!uniqueDomains.length) {
        throw new Error("No passed domains found to move to Nawala checking.");
      }

      return {
        targetUrl: TRUST_POSITIF_URL,
        batchSize: NAWALA_CHECK_BATCH_SIZE,
        batchNumber,
        totalDomains: uniqueDomains.length,
        batches: chunkDomains(uniqueDomains, NAWALA_CHECK_BATCH_SIZE),
      };
    },
    [activeBulkCheckingBatchNumber, bulkCheckingSeed.batchNumber, getBlockingNawalaBatchNumber]
  );

  const handleNawalaCheckComplete = useCallback(
    async ({ plan = {}, trustPositifPayload = {}, results = [], summary = null, runState = null } = {}) => {
      const batchNumber = Number(plan.batchNumber || bulkCheckingSeed.batchNumber || activeBulkCheckingBatchNumber || 0);
      const blockingNawalaBatchNumber = getBlockingNawalaBatchNumber(batchNumber);

      if (blockingNawalaBatchNumber) {
        throw new Error(`Batch ${formatBatchNumber(blockingNawalaBatchNumber)} is already in Nawala Checking. Finish it before moving another batch to Nawala Checking.`);
      }

      const checkedDomainSet = new Set(
        results.map((item) => normalizeDomainForMatch(item?.domain)).filter(Boolean)
      );
      const failedDomainSet = new Set(
        (runState?.failed || []).map((item) => normalizeDomainForMatch(item?.domain)).filter(Boolean)
      );
      const fallbackBulkCheckingBatch = bulkCheckingBatchRows.find((item) =>
        Number(item.batchNumber || 1) === batchNumber
      );
      const sourceSubBatches = Array.isArray(bulkCheckingSeed.subBatches) && bulkCheckingSeed.subBatches.length
        ? bulkCheckingSeed.subBatches
        : fallbackBulkCheckingBatch?.subBatches?.length
          ? (await loadProcessedBatchDomains(fallbackBulkCheckingBatch)).subBatches
          : await Promise.all(
            subBatches
              .filter((item) =>
                normalizeProcessStatus(item.status) === "bulkchecking"
                && (!batchNumber || Number(item.batchNumber || 1) === batchNumber)
              )
              .map(async (subBatch) => {
                const res = await getExpiredDomainProcessSubBatchDomains(
                  subBatch.batchNumber,
                  subBatch.subBatchNumber,
                  "bulkchecking"
                );
                const payload = res.data?.data || {};

                return {
                  ...subBatch,
                  domains: payload.domains || [],
                };
              })
          );
      const updateRequests = [];

      sourceSubBatches.forEach((subBatch) => {
        const subBatchDomains = (subBatch.domains || []).map((domain) => String(domain || "").trim()).filter(Boolean);
        const finalStageDomains = subBatchDomains.filter((domain) => checkedDomainSet.has(normalizeDomainForMatch(domain)));
        const skippedDomains = subBatchDomains.filter((domain) => failedDomainSet.has(normalizeDomainForMatch(domain)));
        const finalStageDomainSet = new Set(finalStageDomains.map((domain) => normalizeDomainForMatch(domain)));
        const finalStageNawalaResults = results.filter((item) =>
          finalStageDomainSet.has(normalizeDomainForMatch(item?.domain))
        );

        if (finalStageDomains.length) {
          updateRequests.push(
            updateExpiredDomainProcessSubBatchStatus(subBatch.batchNumber, subBatch.subBatchNumber, "finalstage", {
              domains: finalStageDomains,
              nawalaResults: finalStageNawalaResults,
            })
          );
        }

        if (skippedDomains.length) {
          updateRequests.push(
            updateExpiredDomainProcessSubBatchStatus(subBatch.batchNumber, subBatch.subBatchNumber, "skipped", {
              domains: skippedDomains,
            })
          );
        }
      });

      if (!updateRequests.length) {
        throw new Error("No Bulk Checker passed domains matched this batch for Nawala Checking.");
      }

      await Promise.all(updateRequests);

      setNawalaCheckingResult({
        batchNumber,
        plan,
        payload: trustPositifPayload,
        summary: summary || trustPositifPayload?.summary || null,
        results,
        sourceSubBatches: sourceSubBatches.map((subBatch) => ({
          batchNumber: subBatch.batchNumber,
          subBatchNumber: subBatch.subBatchNumber,
          domains: subBatch.domains || [],
        })),
        checkedAt: trustPositifPayload?.checkedAt || new Date().toISOString(),
        totalBatches: trustPositifPayload?.totalBatches || plan.batches?.length || 0,
        totalDomains: results.length || plan.totalDomains || 0,
      });
      setWaybackCheckingResult(null);
      resetBulkCheckingView();
      setActiveProcessStatus("finalstage");
      setActiveProcessBatch(batchNumber || "all");
      setProcessMessage(
        `Nawala Checking complete for Batch ${formatBatchNumber(batchNumber || 1)}: ${summary?.blocked || 0} blocked, ${summary?.notBlocked || 0} not blocked.`
      );
      await load();
    },
    [activeBulkCheckingBatchNumber, bulkCheckingBatchRows, bulkCheckingSeed.batchNumber, bulkCheckingSeed.subBatches, getBlockingNawalaBatchNumber, load, loadProcessedBatchDomains, resetBulkCheckingView, subBatches]
  );

  const handleMoveNawalaToWayBack = useCallback(async (targetResult = null) => {
    const result = targetResult || nawalaCheckingResult;
    const notBlockedRows = (result?.results || []).filter(isNawalaNotBlockedResult);
    const notBlockedDomainSet = new Set(
      notBlockedRows.map((item) => normalizeDomainForMatch(item.domain)).filter(Boolean)
    );
    const batchNumber = Number(result?.batchNumber || 0);

    if (!notBlockedDomainSet.size) {
      setError("No not blocked Nawala domains found to move to WayBack Checking.");
      return;
    }

    try {
      setMovingToWayBack(true);
      setBusyId(`nawala-batch-${batchNumber || "all"}:waybackchecking`);
      setError("");
      setProcessMessage("");

      const storedSourceSubBatches = Array.isArray(result?.sourceSubBatches) ? result.sourceSubBatches : [];
      const sourceSubBatches = storedSourceSubBatches.length
        ? storedSourceSubBatches
        : await Promise.all(
          subBatches
            .filter((item) =>
              normalizeProcessStatus(item.status) === "finalstage"
              && (!batchNumber || Number(item.batchNumber || 1) === batchNumber)
            )
            .map(async (subBatch) => {
              const res = await getExpiredDomainProcessSubBatchDomains(
                subBatch.batchNumber,
                subBatch.subBatchNumber,
                "finalstage"
              );
              const payload = res.data?.data || {};

              return {
                ...subBatch,
                domains: payload.domains || [],
              };
            })
        );
      const movedDomainSet = new Set();
      const updateRequests = [];

      sourceSubBatches.forEach((subBatch) => {
        const domainsToMove = (subBatch.domains || [])
          .map((domain) => String(domain || "").trim())
          .filter((domain) => notBlockedDomainSet.has(normalizeDomainForMatch(domain)));

        if (!domainsToMove.length) {
          return;
        }

        domainsToMove.forEach((domain) => movedDomainSet.add(normalizeDomainForMatch(domain) || domain));
        updateRequests.push(
          updateExpiredDomainProcessSubBatchStatus(subBatch.batchNumber, subBatch.subBatchNumber, "waybackchecking", {
            domains: domainsToMove,
          })
        );
      });

      if (!updateRequests.length) {
        throw new Error("No matching not blocked domains were found for WayBack Checking.");
      }

      await Promise.all(updateRequests);

      const movedDomains = Array.from(movedDomainSet);
      const movedAt = new Date().toISOString();
      const movedDomainLookup = new Set(
        movedDomains.map((domain) => normalizeDomainForMatch(domain)).filter(Boolean)
      );
      const movedNawalaResults = notBlockedRows.filter((item) =>
        movedDomainLookup.has(normalizeDomainForMatch(item.domain))
      );

      await createWaybackBatchApi({
        batchNumber,
        domains: movedDomains,
        nawalaResults: movedNawalaResults,
      });

      setWaybackCheckingResult({
        batchNumber,
        movedAt,
        domains: movedDomains,
        totalDomains: movedDomains.length,
        source: "nawala",
      });
      setNawalaCheckingResult((current) =>
        current
          ? {
            ...current,
            movedToWayBackAt: movedAt,
            wayBackMovedDomains: movedDomains,
          }
          : current
      );
      setProcessMessage(
        `${movedDomains.length.toLocaleString()} not blocked Nawala domain${movedDomains.length === 1 ? "" : "s"} moved to WayBack Checking.`
      );
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to move Nawala domains to WayBack Checking");
    } finally {
      setMovingToWayBack(false);
      setBusyId("");
    }
  }, [load, nawalaCheckingResult, subBatches]);

  const handleViewSubBatch = async (item) => {
    const key = getSubBatchKey(item);

    try {
      setBusyId(`${key}:view`);
      setError("");
      setDomainViewer({
        item,
        domains: [],
        loading: true,
      });

      const res = await getExpiredDomainProcessSubBatchDomains(
        item.batchNumber,
        item.subBatchNumber,
        normalizeProcessStatus(item.status)
      );
      const result = res.data?.data || {};

      setDomainViewer({
        item,
        domains: result.domains || [],
        loading: false,
      });
    } catch (err) {
      setDomainViewer({
        item: null,
        domains: [],
        loading: false,
      });
      setError(err.response?.data?.message || err.message || "Failed to load sub-batch domains");
    } finally {
      setBusyId("");
    }
  };

  const handleCopyViewedCopiedDomains = async () => {
    const domains = domainViewer.domains.map((domain) => String(domain || "").trim()).filter(Boolean);

    if (!domains.length) {
      setError("No domains found to copy.");
      return;
    }

    try {
      await copyTextToClipboard(domains.join("\n"));
      setProcessMessage(
        `Copied ${domains.length.toLocaleString()} domains from batch ${formatBatchNumber(domainViewer.item.batchNumber)}, sub-batch ${formatBatchNumber(domainViewer.item.subBatchNumber)}.`
      );
    } catch (err) {
      setError(err.message || "Failed to copy domains");
    }
  };

  const closeDomainViewer = () => {
    setDomainViewer({
      item: null,
      domains: [],
      loading: false,
    });
  };

  const handleCopiedHandsonFilterChange = (key, edge, value) => {
    setCopiedHandson((current) => ({ ...current, filterApplied: false }));
    setCopiedHandsonFilters((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {}),
        [edge]: value,
      },
    }));
  };

  const handleCopiedHandsonFilterStep = (key, edge, direction) => {
    const filter = COPIED_HANDSON_FILTERS.find((item) => item.key === key);
    const fallbackValue = filter?.[edge] || "";
    const isPercentageFilter = isCopiedHandsonPercentageFilter(key);

    setCopiedHandson((current) => ({ ...current, filterApplied: false }));
    setCopiedHandsonFilters((current) => {
      const currentValue = current[key]?.[edge] ?? fallbackValue;
      const textValue = String(currentValue || fallbackValue || "").trim();
      const currentNumber = getCopiedHandsonFilterNumber(textValue);
      const fallbackNumber = getCopiedHandsonFilterNumber(fallbackValue);
      const nextNumber = Math.max(0, (currentNumber ?? fallbackNumber ?? 0) + direction);
      const nextValue = `${Number.isInteger(nextNumber) ? nextNumber : Number(nextNumber.toFixed(2))}${isPercentageFilter ? "%" : ""}`;

      return {
        ...current,
        [key]: {
          ...(current[key] || {}),
          [edge]: nextValue,
        },
      };
    });
  };

  const handleAddFilteredCopiedDomainsToBulkChecking = async () => {
    const item = copiedHandson.item || copiedHandsonTarget;
    const domains = copiedHandsonFilteredUrls;
    const filteredRows = copiedHandsonFilteredRows;

    if (!item) {
      setError("No pending sub-batch selected.");
      return;
    }

    setCopiedHandson((current) => ({ ...current, filterApplied: true }));

    if (!domains.length) {
      setError("No filtered URLs found to move.");
      return;
    }

    const key = getSubBatchKey(item);

    try {
      setBusyId(`${key}:filtered-mainbatch`);
      setError("");
      setProcessMessage("");
      await updateExpiredDomainProcessSubBatchStatus(item.batchNumber, item.subBatchNumber, MAIN_BATCH_PROCESS_STATUS, {
        domains,
      });
      storeCopiedHandsonRows(key, filteredRows);
      storeCopiedHandsonMergeState(key, filteredRows.length);
      setCopiedHandson((current) => ({
        ...current,
        rows: filteredRows,
        merged: true,
        filterApplied: true,
        loading: false,
      }));
      setActiveProcessBatch(Number(item.batchNumber || 1));
      setProcessMessage(`${domains.length.toLocaleString()} filtered domain${domains.length === 1 ? "" : "s"} added to Main Batch.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to add filtered domains to Main Batch");
    } finally {
      setBusyId("");
    }
  };

  const handleSkipEmptyCopiedSubBatch = async () => {
    const item = copiedHandson.item || copiedHandsonTarget;

    if (!item) {
      setError("No pending sub-batch selected.");
      return;
    }

    if (!copiedHandson.merged || copiedHandsonFilteredUrls.length > 0) {
      setError("Skip is only available after filtering produces no valid domains.");
      return;
    }

    const key = getSubBatchKey(item);

    try {
      setBusyId(`${key}:skip-empty`);
      setError("");
      setProcessMessage("");
      await updateExpiredDomainProcessSubBatchStatus(item.batchNumber, item.subBatchNumber, "skipped");
      storeCopiedHandsonRows(key, []);
      clearCopiedHandsonMergeState(key);
      setCopiedHandson((current) => ({
        ...current,
        rows: [],
        merged: false,
        filterApplied: false,
      }));
      setActiveProcessBatch(Number(item.batchNumber || 1));
      setProcessMessage(
        `Batch ${formatBatchNumber(item.batchNumber)}, sub-batch ${formatBatchNumber(item.subBatchNumber)} skipped because no valid filtered domains were found.`
      );
      await load();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to skip empty sub-batch");
    } finally {
      setBusyId("");
    }
  };

  const showCopiedHandsonPasteNotice = (tone, message) => {
    setCopiedHandsonPasteNotice({ tone, message });

    if (tone === "error") {
      setError(message);
      setProcessMessage("");
      return;
    }

    setError("");
    setProcessMessage(message);
  };

  const handleCopiedHandsonAfterChange = (changes, source) => {
    if (!changes || source === "loadData") {
      return;
    }

    setCopiedHandson((current) => {
      const rows = current.rows.map((row) => normalizeCopiedHandsonRow(row));

      changes.forEach(([rowIndex, key, previousValue, nextValue]) => {
        if (previousValue === nextValue) {
          return;
        }

        while (rows.length <= rowIndex) {
          rows.push(createCopiedHandsonRow());
        }

        rows[rowIndex][key] = String(nextValue ?? "");
      });

      storeCopiedHandsonRows(current.key, rows);
      clearCopiedHandsonMergeState(current.key);
      return { ...current, rows, merged: false, filterApplied: false };
    });

    if (String(source || "").toLowerCase().includes("paste")) {
      showCopiedHandsonPasteNotice(
        "error",
        "Paste completed, but it was not recognized as a valid SEO checker merge. Copy the full SEO checker result with URL and metric columns."
      );
    }
  };

  const handleCopiedHandsonBeforePaste = (data) => {
    const seoRows = getSeoCheckerRows(data);

    if (!seoRows.length) {
      if (hasPotentialSeoCheckerPasteShape(data)) {
        showCopiedHandsonPasteNotice(
          "error",
          "Paste error: SEO checker results were detected, but the rows could not be recognized. Copy the full SEO checker table including URL and metric columns."
        );
        return true;
      }

      return true;
    }

    const currentCopiedHandson = copiedHandsonRef.current || copiedHandson;
    const copiedDomains = getCopiedDomainsForPaste(currentCopiedHandson);
    const expectedDomainCount =
      Number(currentCopiedHandson.item?.domainCount || 0)
      || Number(copiedHandsonTarget?.domainCount || 0)
      || copiedDomains.length;
    const result = mergeSeoCheckerRowsWithCopiedDomains(seoRows, copiedDomains, expectedDomainCount);
    const pastedRows = createCopiedHandsonRowsFromSeoRows(seoRows);

    if (!result.ok) {
      storeCopiedHandsonRows(currentCopiedHandson.key, pastedRows);
      clearCopiedHandsonMergeState(currentCopiedHandson.key);
      setCopiedHandson((current) => ({
        ...current,
        key: current.key || currentCopiedHandson.key,
        item: current.item || currentCopiedHandson.item,
        rows: pastedRows,
        merged: false,
        filterApplied: false,
      }));

      if (result.reason === "domain-order-mismatch") {
        showCopiedHandsonPasteNotice(
          "error",
          `Merge error: Pending domain and SEO checker URL do not match at row ${result.rowNumber.toLocaleString()}. Pending domain "${result.copiedDomain || "-"}" starts with "${result.copiedPrefix || "-"}", but SEO URL "${result.seoDomain || "-"}" starts with "${result.seoPrefix || "-"}".`
        );
        return false;
      }

      showCopiedHandsonPasteNotice(
        "error",
        `Merge error: pasted ${result.pastedCount.toLocaleString()} SEO checker row${result.pastedCount === 1 ? "" : "s"}, but Pending has ${result.expectedCount.toLocaleString()} domain${result.expectedCount === 1 ? "" : "s"}.`
      );
      return false;
    }

    storeCopiedHandsonRows(currentCopiedHandson.key, result.rows);
    storeCopiedHandsonMergeState(currentCopiedHandson.key, result.pastedCount);
    setCopiedHandson((current) => ({
      ...current,
      key: current.key || currentCopiedHandson.key,
      item: current.item || currentCopiedHandson.item,
      rows: result.rows,
      merged: true,
      filterApplied: false,
    }));
    showCopiedHandsonPasteNotice(
      "success",
      `SEO checker merge successful: ${result.pastedCount.toLocaleString()} row${result.pastedCount === 1 ? "" : "s"} pasted and URLs replaced with Pending domains.`
    );

    return false;
  };

  const handleAddRankCheckerApiKey = async (payload) => {
    try {
      setAdminError("");
      setAdminNotice("");
      await addAdminApiKey(payload);
      await refreshAdminDashboard();
      await refreshSerperAvailability();
      setAdminNotice("API key added.");
    } catch (err) {
      setAdminError(getErrorMessage(err, "Failed to add API key"));
      throw err;
    }
  };

  const handleUpdateRankCheckerApiKey = async (keyId, payload) => {
    try {
      setAdminError("");
      setAdminNotice("");
      await updateAdminApiKey(keyId, payload);
      await refreshAdminDashboard();
      await refreshSerperAvailability();
      setAdminNotice("API key updated.");
    } catch (err) {
      setAdminError(getErrorMessage(err, "Failed to update API key"));
      throw err;
    }
  };

  const handleDeleteRankCheckerApiKey = async (keyId) => {
    try {
      setAdminError("");
      setAdminNotice("");
      await deleteAdminApiKey(keyId);
      await refreshAdminDashboard();
      await refreshSerperAvailability();
      setAdminNotice("API key deleted.");
    } catch (err) {
      setAdminError(getErrorMessage(err, "Failed to delete API key"));
      throw err;
    }
  };

  const renderProcessActions = (item) => {
    const key = getSubBatchKey(item);
    const status = normalizeProcessStatus(item.status);
    const viewBusy = busyId === `${key}:view`;
    const copyBusy = busyId === `${key}:copy`;
    const mergeRequiredBeforeProcessing = isPendingProcessStatus(status)
      && (copiedHandson.key !== key || copiedHandson.loading || !copiedHandson.merged);

    return (
      <div className="expired-domains-process-actions">
        <button
          type="button"
          className="management-button-secondary"
          disabled={Boolean(busyId)}
          onClick={() => handleViewSubBatch(item)}
        >
          {viewBusy ? "Opening..." : "View"}
        </button>
        {isPendingProcessStatus(status) ? (
          <button
            type="button"
            className="management-button-secondary"
            disabled={Boolean(busyId)}
            aria-label="Copy sub-batch domains"
            onClick={() => handleCopySubBatch(item)}
          >
            {copyBusy ? "Copying..." : "Copy Domains"}
          </button>
        ) : null}
        {isPendingProcessStatus(status) && mergeRequiredBeforeProcessing ? (
          <span className="expired-domains-process-done">Merge Required</span>
        ) : null}
        {status === "bulkchecking" ? (
          <span className="expired-domains-process-done">Use Bulk Checker</span>
        ) : null}
        {status === "finalstage" ? (
          <span className="expired-domains-process-done">Nawala Checking</span>
        ) : null}
        {status === "waybackchecking" ? (
          <span className="expired-domains-process-done">WayBack Checking</span>
        ) : null}
      </div>
    );
  };
  const domainViewerStatus = normalizeProcessStatus(domainViewer.item?.status);
  const domainViewerStatusLabel = PROCESS_STATUS_LABELS[domainViewerStatus] || PROCESS_STATUS_LABELS[PENDING_PROCESS_STATUS];
  const domainViewerDomainCount = Number(
    domainViewer.item?.domainCount || domainViewer.domains.length || 0
  );

  return (
    <div className="management-page expired-domains-page">
      <section className="app-panel management-header">
        <div>
          <h1>Expired Domains</h1>
          <p>Upload new expired-domain lists and process existing records based on your group privileges.</p>
        </div>
      </section>

      <ToastNotice message={error} onClose={() => setError("")} />
      <ToastNotice message={processMessage} onClose={() => setProcessMessage("")} tone="success" />

      {visibleTabs.length ? (
        <div className="profile-settings-tabs" role="tablist" aria-label="Expired domain pages">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={effectiveActiveTab === tab.id}
              className={`profile-settings-tab${effectiveActiveTab === tab.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : (
        <section className="app-panel management-state">
          <h2>No Expired Domains Access</h2>
          <p>Your current group does not include expired-domain upload or process privileges.</p>
        </section>
      )}

      {effectiveActiveTab === "upload" && canUploadExpiredDomains ? (
        <UploadExpiredDomainsForm
          batchNumber={batchState.currentBatchNumber}
          batchSnapshot={batchState.batchSnapshot}
          onImportComplete={handleImportComplete}
          onMoveToProcess={handleMoveToProcess}
        />
      ) : null}

      {effectiveActiveTab === "process" && canProcessExpiredDomains ? (
        <section className="app-panel management-table">
          <div className="management-section-header">
            <div>
              <h2>Process Expired Domains</h2>
              <p>Process uploaded expired-domain sub-batches.</p>
            </div>
            <button type="button" className="management-button-secondary" onClick={load} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="expired-domains-process-tabs" role="tablist" aria-label="Expired domain process status">
            {PROCESS_STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeProcessStatus === tab.id}
                className={`expired-domains-process-tab${activeProcessStatus === tab.id ? " is-active" : ""}`}
                onClick={() => {
                  setActiveProcessStatus(tab.id);
                  setActiveProcessBatch("all");
                }}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {processBatchOptions.length ? (
            <div className="expired-domains-batch-tabs" role="tablist" aria-label="Expired domain batches">
              {processBatchOptions.map((item) => {
                const isActiveBatch = Number(activeProcessBatch) === Number(item.batchNumber);
                const isCurrentPendingBatchTab =
                  isPendingProcessStatus(activeProcessStatus)
                  && Number(item.batchNumber) === Number(currentPendingBatchNumber);

                return (
                  <button
                    key={item.batchNumber}
                    type="button"
                    role="tab"
                    aria-selected={isActiveBatch}
                    disabled={!item.isUnlocked}
                    title={!item.isUnlocked ? `Batch ${formatBatchNumber(currentPendingBatchNumber || 1)} must move to Bulk Checking before Batch ${formatBatchNumber(item.batchNumber)} can be opened.` : undefined}
                    className={`expired-domains-batch-tab${isActiveBatch ? " is-active" : ""}${isCurrentPendingBatchTab ? " is-current-pending-batch" : ""}${item.isComplete ? " is-complete" : ""}${!item.isUnlocked ? " is-locked" : ""}`}
                    onClick={() => {
                      if (item.isUnlocked) {
                        setActiveProcessBatch(item.batchNumber);
                      }
                    }}
                  >
                    <span>Batch {formatBatchNumber(item.batchNumber)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {processMessage ? <div className="management-help-text">{processMessage}</div> : null}
          {batchTransitionPrompt ? <div className="management-help-text">{batchTransitionPrompt}</div> : null}
          {loading ? <p className="management-empty">Loading expired-domain sub-batches...</p> : null}

          {activeProcessStatus === "finalstage" && hasAvailableNawalaCheckingBatch ? (
            <NawalaCheckingResultsPanel
              result={visibleNawalaCheckingResult}
              onExport={() => exportNawalaResultCsv(visibleNawalaCheckingResult)}
              onMoveToWayBack={() => handleMoveNawalaToWayBack(visibleNawalaCheckingResult)}
              movingToWayBack={movingToWayBack}
            />
          ) : null}

          {!loading && activeProcessStatus === "finalstage" && !hasAvailableNawalaCheckingBatch ? (
            <p className="management-empty">There is no available batch for Nawala Checking.</p>
          ) : null}

          {activeProcessStatus === "waybackchecking" && waybackCheckingResult ? (
            <WayBackCheckingPanel result={waybackCheckingResult} />
          ) : null}

          {!loading && activeProcessStatus === "bulkchecking" && visibleProcessBatchRows.length ? (
            <div className="management-table-wrap expired-domains-stage-card">
              <table className="expired-domains-table expired-domains-process-table is-processed-batch-view">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Bulk Checking %</th>
                    <th>Domains</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProcessBatchRows.map((item) => {
                    const batchKey = `${item.status || activeProcessStatus}-batch-${item.batchNumber}`;
                    const viewBusy = busyId === `${batchKey}:view`;
                    const stagePercentage = Number(item.bulkCheckingPercentage || 0);
                    const stageStatusLabel = PROCESS_STATUS_LABELS[item.status || activeProcessStatus] || PROCESS_STATUS_LABELS[activeProcessStatus];

                    return (
                      <tr key={item.id}>
                        <td>{formatBatchNumber(item.batchNumber)}</td>
                        <td title={`${Number(item.subBatchCount || 0).toLocaleString()} of ${Number(item.totalSubBatchCount || 0).toLocaleString()} sub-batches ${stageStatusLabel.toLowerCase()}`}>
                          <div className="expired-domains-percent-bar" aria-label={`${stagePercentage}% ${stageStatusLabel.toLowerCase()}`}>
                            <div
                              className="expired-domains-percent-bar-fill"
                              style={{ width: `${Math.min(100, Math.max(0, stagePercentage))}%` }}
                            />
                            <span>{stagePercentage}%</span>
                          </div>
                        </td>
                        <td>{Number(item.domainCount || 0).toLocaleString()}</td>
                        <td>
                          <div className="expired-domains-process-actions">
                            <button
                              type="button"
                              className="management-button-secondary"
                              disabled={Boolean(busyId)}
                              onClick={() => handleViewProcessedBatch(item)}
                            >
                              {viewBusy ? "Opening..." : "View"}
                            </button>
                            <button
                              type="button"
                              className="management-button-secondary"
                              disabled
                              title="Run Bulk Checker below, then use Move Passed to Nawala Checking."
                            >
                              Use Passed Domains
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {activeProcessStatus === "bulkchecking" ? (
            <>
              <BulkDomainCheckerPanel
                key={bulkCheckingSeed.key || "expired-domains-bulk-checker"}
                serperAvailability={serperAvailability}
                serperAvailabilityLoading={serperAvailabilityLoading}
                onAvailabilityChange={setSerperAvailability}
                initialDomainsText={bulkCheckingSeed.domainsText}
                initialDomainsKey={bulkCheckingSeed.key}
                resetRunOnInitialDomains
                storageNamespace={BULK_CHECKER_STORAGE_NAMESPACE}
                onMoveToNawalaChecking={handleMoveBulkResultsToNawalaChecking}
                onNawalaCheckComplete={handleNawalaCheckComplete}
                moveToNawalaCheckingLabel="Move Passed to Nawala Checking"
                moveToNawalaCheckingDisabledReason={bulkToNawalaDisabledReason}
                nawalaCheckingUrl={TRUST_POSITIF_URL}
              />
              {canAccessRankCheckerAdmin ? (
                <AdminPanel
                  dashboard={adminDashboard}
                  loading={adminLoading}
                  error={adminError}
                  notice={adminNotice}
                  serperAvailability={serperAvailability}
                  serperAvailabilityLoading={serperAvailabilityLoading}
                  onAddKey={handleAddRankCheckerApiKey}
                  onUpdateKey={handleUpdateRankCheckerApiKey}
                  onDeleteKey={handleDeleteRankCheckerApiKey}
                  sectionView="rank-check"
                  isManager
                  apiKeysOnly
                />
              ) : null}
            </>
          ) : null}

          {!loading && activeProcessStatus !== "bulkchecking" && activeProcessStatus !== "finalstage" && !(activeProcessStatus === "waybackchecking" && waybackCheckingResult) && filteredSubBatches.length ? (
            <div className="management-table-wrap expired-domains-stage-card">
              <table className={`expired-domains-table expired-domains-process-table${isPendingProcessStatus(activeProcessStatus) ? " is-pending-view" : ""}`}>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Sub-batch</th>
                    <th>Domains</th>
                    {isPendingProcessStatus(activeProcessStatus) ? null : <th>Status</th>}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubBatches.map((item) => {
                    const status = normalizeProcessStatus(item.status);
                    const isCurrentPendingBatch =
                      isPendingProcessStatus(activeProcessStatus)
                      && Number(item.batchNumber || 1) === Number(currentPendingBatchNumber);

                    return (
                      <tr
                        key={item.id || getSubBatchKey(item)}
                        className={isCurrentPendingBatch ? "is-current-pending-batch" : undefined}
                      >
                        <td>{formatBatchNumber(item.batchNumber)}</td>
                        <td>{formatBatchNumber(item.subBatchNumber)}</td>
                        <td>{Number(item.domainCount || 0).toLocaleString()}</td>
                        {isPendingProcessStatus(activeProcessStatus) ? null : (
                          <td>
                            <span className={`expired-domains-status-badge is-${status}`}>
                              {PROCESS_STATUS_LABELS[status] || PROCESS_STATUS_LABELS[PENDING_PROCESS_STATUS]}
                            </span>
                          </td>
                        )}
                        <td>{renderProcessActions(item)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {showPendingEmptyNotice ? (
            <p className="management-empty">No pending batches available.</p>
          ) : null}

          {isPendingProcessStatus(activeProcessStatus) ? (
            <div className="expired-domains-handson">
              {copiedHandsonPasteNotice.message ? (
                <div
                  className={`expired-domains-paste-notice is-${copiedHandsonPasteNotice.tone}`}
                  role={copiedHandsonPasteNotice.tone === "error" ? "alert" : "status"}
                >
                  {copiedHandsonPasteNotice.message}
                </div>
              ) : null}
              {copiedHandson.merged ? (
                <div className="expired-domains-merge-success" role="status">
                  Merge successful. Pending domains are updated in the SEO checker result.
                </div>
              ) : null}
              <div className="expired-domains-handson-layout has-sidebar">
                <div className="expired-domains-handson-wrap ht-theme-main">
                  {showCopiedHandsonNoValidRows ? (
                    <div className="expired-domains-handson-empty" role="status">
                      No valid domains match the current filters.
                    </div>
                  ) : null}
                  <HotTable
                    key={copiedHandson.key || "copied-handson"}
                    data={copiedHandsonRows}
                    columns={COPIED_HANDSON_COLUMNS.map((column) => ({
                      data: column.key,
                      width: column.width,
                    }))}
                    colHeaders={COPIED_HANDSON_COLUMNS.map((column) => column.label)}
                    rowHeaders
                    width="100%"
                    height="100%"
                    columnHeaderHeight={36}
                    rowHeights={28}
                    stretchH="none"
                    autoWrapRow
                    autoWrapCol
                    minRows={COPIED_HANDSON_MIN_ROWS}
                    manualColumnResize
                    manualRowResize
                    contextMenu
                    copyPaste
                    fillHandle
                    hiddenRows={{
                      rows: copiedHandsonHiddenRows,
                      indicators: true,
                    }}
                    licenseKey="non-commercial-and-evaluation"
                    beforePaste={handleCopiedHandsonBeforePaste}
                    afterChange={handleCopiedHandsonAfterChange}
                  />
                </div>
                <div className="expired-domains-merge-filters" aria-label="Applied filters">
                  {COPIED_HANDSON_FILTERS.map((filter) => (
                    <div key={filter.key} className="expired-domains-merge-filter-pill">
                      <strong>{filter.label}</strong>
                      <label>
                        <span>min.</span>
                        <span className={`expired-domains-filter-stepper${filter.key === "qt" || filter.key === "ss" ? " has-percent" : ""}`}>
                          <input
                            type="text"
                            value={getCopiedHandsonFilterInputValue(filter.key, copiedHandsonFilters[filter.key]?.min || "")}
                            onChange={(event) => handleCopiedHandsonFilterChange(
                              filter.key,
                              "min",
                              normalizeCopiedHandsonFilterInputValue(filter.key, event.target.value)
                            )}
                          />
                          {isCopiedHandsonPercentageFilter(filter.key) ? <span className="expired-domains-filter-percent">%</span> : null}
                          <span className="expired-domains-filter-stepper-buttons">
                            <button
                              type="button"
                              aria-label={`Increase ${filter.label} minimum`}
                              onClick={() => handleCopiedHandsonFilterStep(filter.key, "min", 1)}
                            >
                              ▴
                            </button>
                            <button
                              type="button"
                              aria-label={`Decrease ${filter.label} minimum`}
                              onClick={() => handleCopiedHandsonFilterStep(filter.key, "min", -1)}
                            >
                              ▾
                            </button>
                          </span>
                        </span>
                      </label>
                      <label>
                        <span>max.</span>
                        <span className={`expired-domains-filter-stepper${filter.key === "qt" || filter.key === "ss" ? " has-percent" : ""}`}>
                          <input
                            type="text"
                            value={getCopiedHandsonFilterInputValue(filter.key, copiedHandsonFilters[filter.key]?.max || "")}
                            onChange={(event) => handleCopiedHandsonFilterChange(
                              filter.key,
                              "max",
                              normalizeCopiedHandsonFilterInputValue(filter.key, event.target.value)
                            )}
                          />
                          {isCopiedHandsonPercentageFilter(filter.key) ? <span className="expired-domains-filter-percent">%</span> : null}
                          <span className="expired-domains-filter-stepper-buttons">
                            <button
                              type="button"
                              aria-label={`Increase ${filter.label} maximum`}
                              onClick={() => handleCopiedHandsonFilterStep(filter.key, "max", 1)}
                            >
                              ▴
                            </button>
                            <button
                              type="button"
                              aria-label={`Decrease ${filter.label} maximum`}
                              onClick={() => handleCopiedHandsonFilterStep(filter.key, "max", -1)}
                            >
                              ▾
                            </button>
                          </span>
                        </span>
                      </label>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="management-button expired-domains-filter-move-button"
                    disabled={Boolean(busyId) || !copiedHandson.merged}
                    onClick={handleAddFilteredCopiedDomainsToBulkChecking}
                    >
                      {busyId.endsWith(":filtered-mainbatch")
                        ? "Adding..."
                        : "Filter and Add to main Batch"}
                    </button>
                  {showCopiedHandsonNoValidRows ? (
                    <button
                      type="button"
                      className="management-button-secondary expired-domains-filter-move-button"
                      disabled={Boolean(busyId) || !copiedHandson.merged}
                      onClick={handleSkipEmptyCopiedSubBatch}
                    >
                      {busyId.endsWith(":skip-empty") ? "Skipping..." : "Skip Empty Sub-batch"}
                    </button>
                  ) : null}
                  <div className="expired-domains-main-batch-progress">
                    <div className="expired-domains-main-batch-progress-header">
                      <div>
                        <span>Main Batch</span>
                        <strong>
                          {copiedHandsonMainBatchNumber
                            ? `Batch ${formatBatchNumber(copiedHandsonMainBatchNumber)}`
                            : "There is no pending batch"}
                        </strong>
                      </div>
                      <strong>{copiedHandsonMainBatchNumber ? `${copiedHandsonMainBatchProgressPct}%` : "0%"}</strong>
                    </div>
                    <div
                      className="expired-domains-main-batch-progress-bar"
                      aria-label={copiedHandsonMainBatchNumber ? `${copiedHandsonMainBatchProgressPct}% of sub-batches added to main batch` : "There is no pending batch"}
                    >
                      <span style={{ width: copiedHandsonMainBatchNumber ? `${copiedHandsonMainBatchProgressPct}%` : "0%" }} />
                    </div>
                    <div className="expired-domains-main-batch-progress-meta">
                      {copiedHandsonMainBatchNumber ? (
                        <>
                          <span>
                            {copiedHandsonMainBatchAddedSubBatchCount.toLocaleString()} of{" "}
                            {copiedHandsonMainBatchSubBatchTotal.toLocaleString()} sub-batches added
                          </span>
                          <span>{copiedHandsonMainBatchRemainingSubBatchCount.toLocaleString()} remaining</span>
                        </>
                      ) : (
                        <span>There is no pending batch</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="management-button-secondary expired-domains-main-batch-move-button"
                      disabled={!canMoveCopiedHandsonMainBatchToBulkChecking}
                      title={
                        !copiedHandsonMainBatchNumber
                          ? "There is no pending batch."
                          : hasActiveBulkCheckingBatch
                            ? `Batch ${formatBatchNumber(activeBulkCheckingBatchNumber)} is already in Bulk Checking.`
                            : canMoveCopiedHandsonMainBatchToBulkChecking
                              ? undefined
                              : "Available only when this batch reaches 100% and no batch is in Bulk Checking."
                      }
                      onClick={handleMoveCopiedHandsonMainBatchToBulkChecking}
                    >
                      {copiedHandsonMainBatchBulkCheckingBusy ? "Moving..." : "Move to Bulk Checking"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {!loading && !hasVisibleProcessRows && !isPendingProcessStatus(activeProcessStatus) && activeProcessStatus !== "finalstage" && !(activeProcessStatus === "waybackchecking" && waybackCheckingResult) ? (
            <p className="management-empty">
              {`No ${PROCESS_STATUS_LABELS[activeProcessStatus].toLowerCase()} expired-domain ${activeProcessStatus === "bulkchecking" ? "batches" : "sub-batches"}.`}
            </p>
          ) : null}
        </section>
      ) : null}

      {processedBatchViewer.item ? (
        <div className="management-modal-backdrop is-centered" onClick={closeProcessedBatchViewer}>
          <div className="management-modal expired-domains-domain-modal app-panel" onClick={(event) => event.stopPropagation()}>
            <div className="expired-domains-domain-modal-header">
              <div>
                <h2>{PROCESS_STATUS_LABELS[processedBatchViewer.item.status || "processed"] || PROCESS_STATUS_LABELS.processed} Batch</h2>
                <p>
                  Batch {formatBatchNumber(processedBatchViewer.item.batchNumber)} has {Number(processedBatchViewer.item.subBatchCount || 0).toLocaleString()} {(PROCESS_STATUS_LABELS[processedBatchViewer.item.status || "processed"] || PROCESS_STATUS_LABELS.processed).toLowerCase()} sub-batch{Number(processedBatchViewer.item.subBatchCount || 0) === 1 ? "" : "es"}.
                </p>
                <p>
                  {Number((processedBatchViewer.item.domains || []).length).toLocaleString()} {(PROCESS_STATUS_LABELS[processedBatchViewer.item.status || "processed"] || PROCESS_STATUS_LABELS.processed).toLowerCase()} domains stored in this batch view.
                </p>
              </div>
              <button
                type="button"
                className="expired-domains-domain-modal-close"
                aria-label="Close"
                onClick={closeProcessedBatchViewer}
              >
                X
              </button>
            </div>

            {processedBatchViewer.loading ? (
              <p className="management-empty">Loading batch domains...</p>
            ) : processedBatchViewer.subBatches.length ? (
              <div className="expired-domains-domain-list">
                {processedBatchViewer.subBatches.map((subBatch) => (
                  <div key={subBatch.id || getSubBatchKey(subBatch)} className="expired-domains-batch-domain-group">
                    <div className="expired-domains-batch-domain-group-header">
                      <span>Sub-batch {formatBatchNumber(subBatch.subBatchNumber)}</span>
                      <strong>{Number((subBatch.domains || []).length).toLocaleString()} domains</strong>
                    </div>
                    {(subBatch.domains || []).length ? (
                      <div className="expired-domains-batch-domain-list">
                        {subBatch.domains.map((domain, index) => (
                          <div key={`${subBatch.subBatchNumber}-${domain}-${index}`} className="expired-domains-domain-item">
                            <span>{index + 1}</span>
                            <strong>{domain}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="management-empty">No domains found in this sub-batch.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="management-empty">No sub-batches found in this batch.</p>
            )}
          </div>
        </div>
      ) : null}

      {domainViewer.item ? (
        <div className="management-modal-backdrop is-centered" onClick={closeDomainViewer}>
          <div className="management-modal expired-domains-domain-modal app-panel" onClick={(event) => event.stopPropagation()}>
            <div className="expired-domains-domain-modal-header">
              <div>
                <span className={`expired-domains-domain-modal-kicker is-${domainViewerStatus}`}>
                  {domainViewerStatusLabel}
                </span>
                <h2>Sub-batch {formatBatchNumber(domainViewer.item.subBatchNumber)}</h2>
                <p>Batch {formatBatchNumber(domainViewer.item.batchNumber)}</p>
                <div className="expired-domains-domain-modal-stats">
                  <span>
                    <strong>{domainViewerDomainCount.toLocaleString()}</strong>
                    Domains
                  </span>
                </div>
              </div>
              <div className="expired-domains-domain-modal-actions">
                {isPendingProcessStatus(domainViewer.item.status) ? (
                  <button
                    type="button"
                    className="management-button-secondary"
                    disabled={domainViewer.loading || !domainViewer.domains.length}
                    onClick={handleCopyViewedCopiedDomains}
                  >
                    Copy All Domains
                  </button>
                ) : null}
                <button
                  type="button"
                  className="expired-domains-domain-modal-close"
                  aria-label="Close"
                  onClick={closeDomainViewer}
                >
                  X
                </button>
              </div>
            </div>

            {domainViewer.loading ? (
              <p className="management-empty">Loading sub-batch domains...</p>
            ) : domainViewer.domains.length ? (
              <>
                <div className="expired-domains-domain-list-header">
                  <span>Domain list</span>
                  <strong>{domainViewer.domains.length.toLocaleString()} loaded</strong>
                </div>
                <div className="expired-domains-domain-list">
                  {domainViewer.domains.map((domain, index) => (
                    <div key={`${domain}-${index}`} className="expired-domains-domain-item">
                      <span>{index + 1}</span>
                      <strong>{domain}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="management-empty">No domains found in this sub-batch.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NawalaCheckingResultsPanel({ result, onExport, onMoveToWayBack, movingToWayBack = false }) {
  const summary = result?.summary || {};
  const rows = result?.results || [];
  const notBlockedCount = rows.filter(isNawalaNotBlockedResult).length;
  const movedToWayBack = Boolean(result?.movedToWayBackAt || result?.wayBackMovedDomains?.length);

  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Nawala Checking Results</h3>
          <p className="text-xs text-slate-500">
            Batch {formatBatchNumber(result.batchNumber || 1)} | {Number(result.totalDomains || rows.length).toLocaleString()} domains | {Number(result.totalBatches || 0).toLocaleString()} TrustPositif batches
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="management-button-secondary"
            disabled={!rows.length}
            onClick={onExport}
          >
            Export CSV
          </button>
          {onMoveToWayBack ? (
            <button
              type="button"
              className="management-button"
              disabled={movingToWayBack || !notBlockedCount || movedToWayBack}
              onClick={onMoveToWayBack}
            >
              {movingToWayBack ? "Moving..." : movedToWayBack ? "Moved to WayBack" : "Move to WayBack"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded-md bg-rose-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Blocked</p>
          <p className="text-2xl font-bold text-rose-700">{summary.blocked || 0}</p>
        </div>
        <div className="rounded-md bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Not Blocked</p>
          <p className="text-2xl font-bold text-emerald-700">{summary.notBlocked || 0}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Unknown</p>
          <p className="text-2xl font-bold text-slate-700">{summary.unknown || 0}</p>
        </div>
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Errors</p>
          <p className="text-2xl font-bold text-red-700">{summary.errors || 0}</p>
        </div>
      </div>

      <div className="max-h-[440px] overflow-auto rounded-md border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2">Domain</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.length ? rows.map((item) => (
              <tr key={`${item.domain}-${item.batchNumber}`}>
                <td className="px-3 py-2 font-mono text-slate-800">{item.domain}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-1 font-semibold ${getNawalaResultToneClassName(item.status)}`}>
                    {item.label || item.status || "Unknown"}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{item.batchNumber || "-"}</td>
                <td className="px-3 py-2 text-slate-600">{item.error || item.sourceStatus || "-"}</td>
              </tr>
            )) : (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={4}>
                  No Nawala result details loaded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WayBackCheckingPanel({ result }) {
  const rows = result?.domains || [];

  if (!rows.length) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border border-sky-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">WayBack Checking</h3>
          <p className="text-xs text-slate-500">
            Batch {formatBatchNumber(result.batchNumber || 1)} | {Number(result.totalDomains || rows.length).toLocaleString()} domains moved from Nawala not blocked results
          </p>
        </div>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
          Ready
        </span>
      </div>

      <div className="max-h-[360px] overflow-auto rounded-md border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2">Domain</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((domain) => (
              <tr key={domain}>
                <td className="px-3 py-2 font-mono text-slate-800">{domain}</td>
                <td className="px-3 py-2 text-slate-600">Ready</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
