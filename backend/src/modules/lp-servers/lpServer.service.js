import mongoose from "mongoose";
import net from "net";
import LPServer from "./lpServer.model.js";
import Brand from "../brands/brand.model.js";
import { decrypt, encrypt } from "../../app/utils/crypto.js";

const BRAND_POPULATE = {
  path: "brandId",
  select: "brandName backgroundCss textColor",
};

const LP_SERVER_IMPORT_HEADER_MAP = {
  brand: "brandName",
  brandname: "brandName",
  "brand name": "brandName",
  url: "url",
  link: "url",
  "server ip": "serverIp",
  serverip: "serverIp",
  ip: "serverIp",
  username: "username",
  user: "username",
  password: "password",
  pass: "password",
  note: "note",
  notes: "note",
};

const ensureObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid ID");
  }
};

const normalizeText = (value) => String(value || "").trim().replace(/\s+/g, " ");

const normalizeRequiredText = (value, fieldName) => {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
};

const normalizeUrl = (value) => {
  const raw = String(value || "").trim();

  if (!raw) {
    throw new Error("URL is required");
  }

  try {
    const normalized = /^[a-z][a-z\d+\-.]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(normalized).toString();
  } catch {
    throw new Error("Invalid URL");
  }
};

const normalizeServerIp = (value) => {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  if (!net.isIP(raw)) {
    throw new Error("Server IP must be a valid IPv4 or IPv6 address");
  }

  return raw;
};

const ensureBrandExists = async (brandId) => {
  ensureObjectId(brandId);
  const brand = await Brand.findById(brandId);

  if (!brand) {
    throw new Error("Brand not found");
  }

  return brand;
};

const ensureActiveServerBrandIsUnique = async (brandId, excludeId = null) => {
  const query = {
    brandId,
    isDeleted: false,
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existing = await LPServer.findOne(query).select("_id");

  if (existing) {
    throw new Error("LP Server already exists for this brand");
  }
};

const getDecryptedPassword = (value) => {
  if (!value) {
    return "";
  }

  try {
    return decrypt(value);
  } catch {
    return "";
  }
};

const serializeLPServer = (item, { includePassword = false } = {}) => {
  const value = typeof item.toObject === "function" ? item.toObject() : { ...item };
  const decryptedPassword = getDecryptedPassword(value.password);

  return {
    ...value,
    serverIp: String(value.serverIp || "").trim(),
    decryptedPassword,
    password: includePassword ? decryptedPassword : undefined,
  };
};

const sanitizeLPServerPayload = async (payload = {}, { partial = false } = {}) => {
  const sanitized = {};

  if (!partial || payload.brandId !== undefined) {
    if (!payload.brandId) {
      throw new Error("Brand is required");
    }

    const brand = await ensureBrandExists(payload.brandId);
    sanitized.brandId = brand._id;
  }

  if (!partial || payload.url !== undefined) {
    sanitized.url = normalizeUrl(payload.url);
  }

  if (!partial || payload.serverIp !== undefined) {
    sanitized.serverIp = normalizeServerIp(payload.serverIp);
  }

  if (!partial || payload.username !== undefined) {
    sanitized.username = normalizeRequiredText(payload.username, "Username");
  }

  if (!partial || payload.password !== undefined) {
    sanitized.password = normalizeRequiredText(payload.password, "Password");
  }

  if (!partial || payload.note !== undefined) {
    sanitized.note = normalizeText(payload.note);
  }

  return sanitized;
};

const parseCsvText = (csvText) => {
  const normalizedText = String(csvText || "").replace(/^\uFEFF/, "");
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const nextChar = normalizedText[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);

      if (currentRow.some((value) => String(value || "").trim())) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length || currentRow.length) {
    currentRow.push(currentCell);

    if (currentRow.some((value) => String(value || "").trim())) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const mapCsvHeaders = (headerCells = []) =>
  headerCells.map((header) => {
    const normalizedHeader = normalizeText(header).toLowerCase();
    return LP_SERVER_IMPORT_HEADER_MAP[normalizedHeader] || "";
  });

const parseLPServerCsv = (csvText) => {
  const rows = parseCsvText(csvText);

  if (!rows.length) {
    return {
      rows: [],
      hasHeaderRow: false,
    };
  }

  const mappedHeaders = mapCsvHeaders(rows[0]);
  const hasHeaderRow = mappedHeaders.some(Boolean);
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;

  return {
    hasHeaderRow,
    rows: dataRows.map((cells, index) => {
      if (hasHeaderRow) {
        return mappedHeaders.reduce(
          (result, headerKey, headerIndex) => {
            if (headerKey) {
              result[headerKey] = cells[headerIndex] || "";
            }

            return result;
          },
          { __rowNumber: index + 2 }
        );
      }

      return {
        brandName: cells[0] || "",
        url: cells[1] || "",
        serverIp: cells[2] || "",
        username: cells[3] || "",
        password: cells[4] || "",
        note: cells[5] || "",
        __rowNumber: index + 1,
      };
    }),
  };
};

const normalizeExistingStrategy = (value) =>
  String(value || "").trim().toLowerCase() === "update" ? "update" : "skip";

const buildImportChange = (field, label) => ({
  field,
  label,
});

const stripSensitiveLPServerFields = (item = {}) => {
  const { password, decryptedPassword, ...safeItem } = item;
  return safeItem;
};

const buildImportMessage = ({ status, action, changes, allowUpdates }) => {
  if (status === "invalid") {
    return "Row has validation errors";
  }

  if (status === "new") {
    return "New LP Server will be imported";
  }

  if (status === "unchanged") {
    return "Existing LP Server already matches current data";
  }

  const changedLabels = changes.map((change) => change.label).join(", ");

  if (action === "update") {
    return `Existing LP Server will update: ${changedLabels}`;
  }

  if (!allowUpdates) {
    return `Change detected (${changedLabels}) but update requires Edit LP Servers Details privilege`;
  }

  return `Change detected (${changedLabels}) and will be skipped`;
};

const buildImportSummary = (rows = []) => {
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
};

const serializeImportPreviewRow = (row) => ({
  rowNumber: row.rowNumber,
  brandName: row.brandName,
  url: row.url,
  serverIp: row.serverIp,
  username: row.username,
  passwordPreview: row.passwordPreview,
  note: row.note,
  status: row.status,
  action: row.action,
  willImport: row.willImport,
  message: row.message,
  errors: row.errors,
  changes: row.changes,
  existing: row.existing,
});

const escapeCsvCell = (value) => {
  const stringValue = String(value ?? "");

  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
};

const buildBrandImportKey = (brandName) => String(brandName || "").trim().toUpperCase();

const buildLPServerImportPlan = async ({
  csvText,
  existingStrategy,
  allowUpdates = false,
} = {}) => {
  const parsedCsv = parseLPServerCsv(csvText);
  const rows = parsedCsv.rows;

  if (!rows.length) {
    throw new Error("CSV content is required");
  }

  const brands = await Brand.find().select("_id brandName").lean();
  const brandMap = new Map(
    brands.map((brand) => [normalizeText(brand.brandName).toLowerCase(), brand])
  );
  const existingServers = await LPServer.find({ isDeleted: false }).populate(BRAND_POPULATE);
  const existingServerByBrand = new Map(
    existingServers.map((server) => [
      buildBrandImportKey(server.brandId?.brandName || ""),
      serializeLPServer(server, { includePassword: true }),
    ])
  );
  const seenBrands = new Set();
  const normalizedStrategy = normalizeExistingStrategy(existingStrategy);

  const planRows = rows.map((row) => {
    const rowNumber = row.__rowNumber;
    const errors = [];
    const brandInput = normalizeText(row.brandName);
    const resolvedBrand = brandInput
      ? brandMap.get(brandInput.toLowerCase())
      : null;
    let url = "";
    let serverIp = "";
    let username = "";
    let password = "";
    const note = normalizeText(row.note);

    if (!brandInput) {
      errors.push("Brand is required");
    } else if (!resolvedBrand) {
      errors.push("Brand not found");
    }

    try {
      url = normalizeUrl(row.url);
    } catch (error) {
      errors.push(error.message);
    }

    try {
      serverIp = normalizeServerIp(row.serverIp);
    } catch (error) {
      errors.push(error.message);
    }

    try {
      username = normalizeRequiredText(row.username, "Username");
    } catch (error) {
      errors.push(error.message);
    }

    try {
      password = normalizeRequiredText(row.password, "Password");
    } catch (error) {
      errors.push(error.message);
    }

    const brandKey = resolvedBrand ? buildBrandImportKey(resolvedBrand.brandName) : "";

    if (brandKey) {
      if (seenBrands.has(brandKey)) {
        errors.push("Duplicate brand inside this upload");
      } else {
        seenBrands.add(brandKey);
      }
    }

    if (errors.length) {
      return {
        rowNumber,
        brandName: resolvedBrand?.brandName || brandInput || "-",
        url: url || String(row.url || "").trim(),
        serverIp,
        username,
        passwordPreview: password ? "Provided" : "-",
        note,
        status: "invalid",
        action: "invalid",
        willImport: false,
        message: "Row has validation errors",
        errors,
        changes: [],
        existing: null,
        brandId: resolvedBrand?._id || null,
        passwordRaw: password,
        existingServerId: null,
      };
    }

    const existingServer = existingServerByBrand.get(brandKey);

    if (!existingServer) {
      return {
        rowNumber,
        brandName: resolvedBrand.brandName,
        url,
        serverIp,
        username,
        passwordPreview: "Provided",
        note,
        status: "new",
        action: "create",
        willImport: true,
        message: "New LP Server will be imported",
        errors: [],
        changes: [],
        existing: null,
        brandId: resolvedBrand._id,
        passwordRaw: password,
        existingServerId: null,
      };
    }

    const existingPassword = String(existingServer.decryptedPassword || "");
    const changes = [];

    if (String(existingServer.url || "") !== url) {
      changes.push(buildImportChange("url", "URL"));
    }

    if (String(existingServer.serverIp || "") !== serverIp) {
      changes.push(buildImportChange("serverIp", "Server IP"));
    }

    if (String(existingServer.username || "") !== username) {
      changes.push(buildImportChange("username", "Username"));
    }

    if (existingPassword !== password) {
      changes.push(buildImportChange("password", "Password"));
    }

    if (String(existingServer.note || "") !== note) {
      changes.push(buildImportChange("note", "Note"));
    }

    const existingPreview = {
      id: String(existingServer._id),
      brandName: existingServer.brandId?.brandName || existingServer.brandName || "",
      url: existingServer.url || "",
      serverIp: existingServer.serverIp || "",
      username: existingServer.username || "",
      passwordPreview: existingPassword ? "Saved" : "-",
      note: existingServer.note || "",
    };

    if (!changes.length) {
      return {
        rowNumber,
        brandName: resolvedBrand.brandName,
        url,
        serverIp,
        username,
        passwordPreview: "Provided",
        note,
        status: "unchanged",
        action: "skip",
        willImport: false,
        message: "Existing LP Server already matches current data",
        errors: [],
        changes: [],
        existing: existingPreview,
        brandId: resolvedBrand._id,
        passwordRaw: password,
        existingServerId: String(existingServer._id),
      };
    }

    const shouldUpdate = normalizedStrategy === "update" && allowUpdates;

    return {
      rowNumber,
      brandName: resolvedBrand.brandName,
      url,
      serverIp,
      username,
      passwordPreview: "Provided",
      note,
      status: "changed",
      action: shouldUpdate ? "update" : "skip",
      willImport: shouldUpdate,
      message: buildImportMessage({
        status: "changed",
        action: shouldUpdate ? "update" : "skip",
        changes,
        allowUpdates,
      }),
      errors: [],
      changes,
      existing: existingPreview,
      brandId: resolvedBrand._id,
      passwordRaw: password,
      existingServerId: String(existingServer._id),
    };
  });

  return {
    hasHeaderRow: parsedCsv.hasHeaderRow,
    existingStrategy: normalizedStrategy,
    canUpdateExisting: allowUpdates,
    rows: planRows,
    summary: buildImportSummary(planRows),
  };
};

export const getLPServersService = async (query = {}) => {
  const normalizedSearch = normalizeText(query.search).toLowerCase();
  const items = await LPServer.find({ isDeleted: false })
    .populate(BRAND_POPULATE)
    .lean();

  const serializedItems = items.map((item) => serializeLPServer(item, { includePassword: false }));
  const filteredItems = normalizedSearch
    ? serializedItems.filter((item) =>
        [
          item.brandId?.brandName,
          item.url,
          item.serverIp,
          item.username,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch))
      )
    : serializedItems;

  return [...filteredItems].sort((left, right) => {
    const leftBrand = left.brandId?.brandName?.toLowerCase() || "";
    const rightBrand = right.brandId?.brandName?.toLowerCase() || "";

    return leftBrand.localeCompare(rightBrand)
      || String(left.url || "").localeCompare(String(right.url || ""));
  }).map((item) => stripSensitiveLPServerFields(item));
};

export const getLPServerByIdService = async (id) => {
  ensureObjectId(id);

  const server = await LPServer.findById(id).populate(BRAND_POPULATE);

  if (!server || server.isDeleted) {
    throw new Error("LP Server not found");
  }

  return server;
};

export const createLPServerService = async (payload, userId) => {
  const sanitized = await sanitizeLPServerPayload(payload);
  await ensureActiveServerBrandIsUnique(sanitized.brandId);

  const server = await LPServer.create({
    ...sanitized,
    createdBy: userId,
  });

  return LPServer.findById(server._id).populate(BRAND_POPULATE);
};

export const updateLPServerService = async (id, payload) => {
  ensureObjectId(id);

  const server = await LPServer.findById(id);

  if (!server || server.isDeleted) {
    throw new Error("LP Server not found");
  }

  const sanitized = await sanitizeLPServerPayload(payload, { partial: true });

  if (sanitized.brandId && String(sanitized.brandId) !== String(server.brandId)) {
    await ensureActiveServerBrandIsUnique(sanitized.brandId, id);
  }

  Object.assign(server, sanitized);
  await server.save();

  return LPServer.findById(server._id).populate(BRAND_POPULATE);
};

export const deleteLPServerService = async (id) => {
  ensureObjectId(id);

  const server = await LPServer.findById(id).populate(BRAND_POPULATE);

  if (!server || server.isDeleted) {
    throw new Error("LP Server not found");
  }

  server.isDeleted = true;
  await server.save();

  return server;
};

export const previewLPServersCsvImportService = async ({
  csvText,
  existingStrategy,
  allowUpdates = false,
} = {}) => {
  const plan = await buildLPServerImportPlan({
    csvText,
    existingStrategy,
    allowUpdates,
  });

  return {
    hasHeaderRow: plan.hasHeaderRow,
    existingStrategy: plan.existingStrategy,
    canUpdateExisting: plan.canUpdateExisting,
    summary: plan.summary,
    rows: plan.rows.map((row) => serializeImportPreviewRow(row)),
  };
};

export const importLPServersCsvService = async ({
  userId,
  csvText,
  existingStrategy,
  allowUpdates = false,
} = {}) => {
  if (!userId) {
    throw new Error("User is required for LP Server import");
  }

  const plan = await buildLPServerImportPlan({
    csvText,
    existingStrategy,
    allowUpdates,
  });

  if (!plan.summary.actionableCount) {
    throw new Error("No valid rows are ready to import");
  }

  const rowsToCreate = plan.rows.filter((row) => row.action === "create");
  const rowsToUpdate = plan.rows.filter((row) => row.action === "update");
  const skippedRows = plan.rows
    .filter((row) => !row.willImport)
    .map((row) => ({
      rowNumber: row.rowNumber,
      brandName: row.brandName,
      error: row.errors.length ? row.errors.join(" | ") : row.message,
    }));

  if (rowsToCreate.length) {
    await LPServer.insertMany(
      rowsToCreate.map((row) => ({
        brandId: row.brandId,
        url: row.url,
        serverIp: row.serverIp,
        username: row.username,
        password: encrypt(row.passwordRaw),
        note: row.note,
        createdBy: userId,
      }))
    );
  }

  if (rowsToUpdate.length) {
    await Promise.all(
      rowsToUpdate.map((row) =>
        LPServer.updateOne(
          { _id: row.existingServerId },
          {
            $set: {
              url: row.url,
              serverIp: row.serverIp,
              username: row.username,
              password: encrypt(row.passwordRaw),
              note: row.note,
            },
          }
        )
      )
    );
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
};

export const exportLPServersCsvService = async () => {
  const items = await LPServer.find({ isDeleted: false })
    .populate(BRAND_POPULATE);

  const sortedItems = [...items].sort((left, right) => {
    const leftBrand = String(left.brandId?.brandName || "").toLowerCase();
    const rightBrand = String(right.brandId?.brandName || "").toLowerCase();

    return leftBrand.localeCompare(rightBrand)
      || String(left.url || "").localeCompare(String(right.url || ""));
  });

  const headers = ["Brand", "URL", "Server IP", "Username", "Password", "Note"];
  const rows = sortedItems.map((item) => {
    const serialized = serializeLPServer(item, { includePassword: true });

    return [
      serialized.brandId?.brandName || "",
      serialized.url || "",
      serialized.serverIp || "",
      serialized.username || "",
      serialized.password || "",
      serialized.note || "",
    ]
      .map((value) => escapeCsvCell(value))
      .join(",");
  });

  return {
    csv: [headers.join(","), ...rows].join("\r\n"),
    total: sortedItems.length,
  };
};
