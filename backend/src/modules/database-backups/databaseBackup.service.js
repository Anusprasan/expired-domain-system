import crypto from "crypto";
import { spawn } from "child_process";
import fs from "fs/promises";
import mongoose from "mongoose";
import path from "path";
import { promisify } from "util";
import { gunzip, gzip } from "zlib";
import { EJSON } from "bson";
import { decryptSecretValue, encryptSecretValue } from "../../app/utils/secureValue.js";
import { sendTelegramMessage } from "../auth/auth.telegram.service.js";

const BACKUP_ROOT_DIR = path.resolve(
  process.cwd(),
  process.env.DATABASE_BACKUP_DIR || "database-backups"
);
const MANIFEST_PATH = path.join(BACKUP_ROOT_DIR, "manifest.json");
const SETTINGS_PATH = path.join(BACKUP_ROOT_DIR, "settings.json");
const RESTORE_VERIFICATION_STORE_PATH = path.join(
  BACKUP_ROOT_DIR,
  "restore-verifications.json"
);
const RESTORE_SESSION_STORE_PATH = path.join(
  BACKUP_ROOT_DIR,
  "restore-sessions.json"
);
const TELEGRAM_CODE_TTL_MS = 5 * 60 * 1000;
const RESTORE_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_LIST_ITEMS = 100;
const MINIMUM_RETAINED_BACKUPS = 3;
const INTERNAL_BACKUP_BATCH_SIZE = 500;
const INTERNAL_BACKUP_ENGINE = "internal-ejson";
const MONGODUMP_BACKUP_ENGINE = "mongodump";
const INTERNAL_BACKUP_FORMAT = "internal-ejson-gzip";
const INTERNAL_BACKUP_FORMAT_VERSION = 1;
const DEFAULT_MANIFEST = { items: [] };
const DEFAULT_SETTINGS = {
  telegram: {
    enabled: false,
    botTokenEncrypted: "",
    chatIds: [],
    lastSentAt: null,
    lastError: "",
    sentCount: 0,
    failedCount: 0,
    updatedAt: null,
  },
};
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const mongoBinaryResolutionCache = new Map();

const restoreVerificationStore = new Map();
const restoreSessionStore = new Map();

let backupOperationInProgress = false;
let restoreOperationInProgress = false;

function normalizeText(value, maxLength = 240) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function getActorUserId(actorUser) {
  return String(actorUser?._id || actorUser?.id || "").trim();
}

function getActorUserKey(actorUser) {
  const emailKey = normalizeText(actorUser?.email, 160).toLowerCase();
  return emailKey || getActorUserId(actorUser);
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeVerificationCode(value) {
  return String(value || "").trim().replace(/\D/g, "").slice(0, 4);
}

function normalizeChatIds(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }

  return [...new Set(
    String(value || "")
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function serializeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function maskSecret(secret) {
  const normalizedSecret = String(secret || "").trim();

  if (!normalizedSecret) {
    return "";
  }

  if (normalizedSecret.length <= 10) {
    return `${normalizedSecret.slice(0, 3)}***${normalizedSecret.slice(-2)}`;
  }

  return `${normalizedSecret.slice(0, 6)}***${normalizedSecret.slice(-4)}`;
}

function buildTimestampSlug(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function buildBackupSlug(type = "manual") {
  const normalizedType = normalizeText(type, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "backup";
  return `${buildTimestampSlug()}-${normalizedType}-${crypto.randomUUID().slice(0, 8)}`;
}

function ensurePathInsideBackupRoot(targetPath) {
  const resolvedRoot = path.resolve(BACKUP_ROOT_DIR);
  const resolvedTarget = path.resolve(targetPath);
  const relativePath = path.relative(resolvedRoot, resolvedTarget);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Backup path is invalid");
  }

  return resolvedTarget;
}

async function ensureBackupStorage() {
  await fs.mkdir(BACKUP_ROOT_DIR, { recursive: true });
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    const rawValue = await fs.readFile(filePath, "utf8");
    return JSON.parse(rawValue);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallbackValue;
    }

    throw error;
  }
}

async function writeJsonFileAtomic(filePath, value) {
  const resolvedPath = ensurePathInsideBackupRoot(filePath);
  const tempPath = `${resolvedPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, resolvedPath);
}

async function loadManifest() {
  await ensureBackupStorage();
  const manifest = await readJsonFile(MANIFEST_PATH, DEFAULT_MANIFEST);

  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.items)) {
    return { items: [] };
  }

  return {
    items: manifest.items,
  };
}

async function saveManifest(manifest) {
  await writeJsonFileAtomic(MANIFEST_PATH, {
    items: Array.isArray(manifest?.items) ? manifest.items : [],
  });
}

async function loadSettings() {
  await ensureBackupStorage();
  const settings = await readJsonFile(SETTINGS_PATH, DEFAULT_SETTINGS);

  return {
    telegram: {
      ...DEFAULT_SETTINGS.telegram,
      ...(settings?.telegram || {}),
      chatIds: normalizeChatIds(settings?.telegram?.chatIds || []),
    },
  };
}

async function saveSettings(settings) {
  await writeJsonFileAtomic(SETTINGS_PATH, {
    telegram: {
      ...DEFAULT_SETTINGS.telegram,
      ...(settings?.telegram || {}),
      chatIds: normalizeChatIds(settings?.telegram?.chatIds || []),
    },
  });
}

function cleanupExpiredStoreEntries(store) {
  const now = Date.now();
  let removedAny = false;

  for (const [key, entry] of store.entries()) {
    if (!entry?.expiresAt || Number(entry.expiresAt) <= now) {
      store.delete(key);
      removedAny = true;
    }
  }

  return removedAny;
}

async function hydrateEphemeralStore(filePath, store) {
  await ensureBackupStorage();
  const payload = await readJsonFile(filePath, { items: [] });

  store.clear();

  for (const item of Array.isArray(payload?.items) ? payload.items : []) {
    const key = normalizeText(item?.key, 320);
    const expiresAt = Math.max(0, Number(item?.expiresAt) || 0);

    if (!key || !expiresAt) {
      continue;
    }

    const nextEntry = {
      ...item,
      expiresAt,
      requestedAt: Math.max(0, Number(item?.requestedAt) || 0),
    };
    delete nextEntry.key;
    store.set(key, nextEntry);
  }

  if (cleanupExpiredStoreEntries(store)) {
    await persistEphemeralStore(filePath, store);
  }
}

async function persistEphemeralStore(filePath, store) {
  cleanupExpiredStoreEntries(store);

  await writeJsonFileAtomic(filePath, {
    items: Array.from(store.entries()).map(([key, entry]) => ({
      key,
      ...entry,
    })),
  });
}

async function hydrateRestoreVerificationStore() {
  await hydrateEphemeralStore(RESTORE_VERIFICATION_STORE_PATH, restoreVerificationStore);
}

async function persistRestoreVerificationStore() {
  await persistEphemeralStore(RESTORE_VERIFICATION_STORE_PATH, restoreVerificationStore);
}

async function hydrateRestoreSessionStore() {
  await hydrateEphemeralStore(RESTORE_SESSION_STORE_PATH, restoreSessionStore);
}

async function persistRestoreSessionStore() {
  await persistEphemeralStore(RESTORE_SESSION_STORE_PATH, restoreSessionStore);
}

function getMongoUri() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();

  if (!mongoUri) {
    throw new Error("MONGO_URI is required before running database backups");
  }

  return mongoUri;
}

function parseDatabaseNameFromUri(mongoUri) {
  const normalizedUri = String(mongoUri || "").trim();

  if (!normalizedUri) {
    return "";
  }

  const withoutQuery = normalizedUri.split("?")[0] || "";
  const databaseSegment = withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
  return normalizeText(databaseSegment, 120);
}

function getDatabaseName() {
  const connectedDatabaseName =
    mongoose.connection?.db?.databaseName
    || mongoose.connection?.name
    || parseDatabaseNameFromUri(getMongoUri());

  if (!connectedDatabaseName) {
    throw new Error("Unable to determine the current MongoDB database name");
  }

  return connectedDatabaseName;
}

function getMongoDumpBinary() {
  return process.env.MONGODUMP_PATH || "";
}

function getMongoRestoreBinary() {
  return process.env.MONGORESTORE_PATH || "";
}

async function listCommonWindowsMongoToolCandidates(toolName) {
  const candidatePaths = [];
  const baseDirectories = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const baseDirectory of baseDirectories) {
    const toolsRoot = path.join(baseDirectory, "MongoDB", "Tools");

    try {
      const versionEntries = await fs.readdir(toolsRoot, { withFileTypes: true });

      for (const entry of versionEntries) {
        if (!entry.isDirectory()) {
          continue;
        }

        candidatePaths.push(path.join(toolsRoot, entry.name, "bin", `${toolName}.exe`));
      }
    } catch {
      // Ignore missing MongoDB Tools root folders.
    }
  }

  candidatePaths.push(path.join("C:\\", "mongodb-database-tools", "bin", `${toolName}.exe`));
  return candidatePaths;
}

async function buildMongoToolCandidates(toolName, explicitBinaryPath) {
  const candidates = [];

  if (explicitBinaryPath) {
    candidates.push(explicitBinaryPath);
  }

  if (process.platform === "win32") {
    candidates.push(`${toolName}.exe`, toolName, ...(await listCommonWindowsMongoToolCandidates(toolName)));
  } else {
    candidates.push(
      toolName,
      `/usr/bin/${toolName}`,
      `/usr/local/bin/${toolName}`,
      `/snap/bin/${toolName}`
    );
  }

  return [...new Set(candidates.filter(Boolean))];
}

function canTreatAsExplicitPath(value) {
  return /[\\/]/.test(String(value || "")) || /^[a-zA-Z]:/.test(String(value || ""));
}

function canRunBinary(binary) {
  return new Promise((resolve) => {
    const child = spawn(binary, ["--version"], {
      env: process.env,
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function resolveMongoToolBinary({ toolName, explicitBinaryPath }) {
  const cacheKey = `${toolName}:${explicitBinaryPath || ""}`;

  if (mongoBinaryResolutionCache.has(cacheKey)) {
    return mongoBinaryResolutionCache.get(cacheKey);
  }

  const candidates = await buildMongoToolCandidates(toolName, explicitBinaryPath);

  for (const candidate of candidates) {
    if (canTreatAsExplicitPath(candidate)) {
      if (await fileExists(candidate)) {
        mongoBinaryResolutionCache.set(cacheKey, candidate);
        return candidate;
      }

      continue;
    }

    if (await canRunBinary(candidate)) {
      mongoBinaryResolutionCache.set(cacheKey, candidate);
      return candidate;
    }
  }

  mongoBinaryResolutionCache.set(cacheKey, "");
  return "";
}

function buildMongoToolMissingMessage(toolLabel, envVarName) {
  return `${toolLabel} is not available on this server. The system can create new in-app backups without MongoDB Database Tools, but restoring legacy tool-based archives still needs ${toolLabel}. Install MongoDB Database Tools or set ${envVarName} to the correct binary path.`;
}

function runResolvedMongoTool({ binary, args, toolLabel }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(new Error(`${toolLabel} is not available on this server.`));
        return;
      }

      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          normalizeText(
            stderr || stdout || `${toolLabel} failed with exit code ${code}`,
            1200
          )
        )
      );
    });
  });
}

async function runMongoTool({ toolName, explicitBinaryPath, args, toolLabel, envVarName }) {
  const resolvedBinary = await resolveMongoToolBinary({
    toolName,
    explicitBinaryPath,
  });

  if (!resolvedBinary) {
    throw new Error(buildMongoToolMissingMessage(toolLabel, envVarName));
  }

  return runResolvedMongoTool({
    binary: resolvedBinary,
    args,
    toolLabel,
  });
}

async function withBackupOperationLock(task) {
  if (backupOperationInProgress) {
    throw new Error("A database backup is already in progress");
  }

  if (restoreOperationInProgress) {
    throw new Error("Database restore is currently running. Wait until it finishes first.");
  }

  backupOperationInProgress = true;

  try {
    return await task();
  } finally {
    backupOperationInProgress = false;
  }
}

async function withRestoreOperationLock(task) {
  if (restoreOperationInProgress) {
    throw new Error("A database restore is already in progress");
  }

  if (backupOperationInProgress) {
    throw new Error("A database backup is currently running. Wait until it finishes first.");
  }

  restoreOperationInProgress = true;

  try {
    return await task();
  } finally {
    restoreOperationInProgress = false;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildArchiveFilePath(record) {
  return ensurePathInsideBackupRoot(path.join(BACKUP_ROOT_DIR, record.directoryName, record.archiveFileName));
}

function buildMetadataFilePath(record) {
  return ensurePathInsideBackupRoot(path.join(BACKUP_ROOT_DIR, record.directoryName, record.metadataFileName));
}

function sortBackupRecords(records = []) {
  return [...records].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function getProtectedBackupIds(records = []) {
  return new Set(
    sortBackupRecords(records)
      .slice(0, MINIMUM_RETAINED_BACKUPS)
      .map((record) => record.id)
  );
}

function buildDeleteProtectionReason(protectedCount = MINIMUM_RETAINED_BACKUPS) {
  return `The latest ${protectedCount} backups are protected and cannot be deleted`;
}

function sanitizeBackupRecord(
  record,
  {
    isAvailable = true,
    isDeleteProtected = false,
    deleteProtectionReason = "",
  } = {}
) {
  return {
    id: record.id,
    slug: record.slug,
    type: record.type,
    trigger: record.trigger,
    archiveEngine: getArchiveEngine(record),
    databaseName: record.databaseName,
    note: record.note || "",
    createdAt: serializeDate(record.createdAt),
    createdByUserId: record.createdByUserId || "",
    createdByName: record.createdByName || "",
    createdByEmail: record.createdByEmail || "",
    fileSizeBytes: Math.max(0, Number(record.fileSizeBytes) || 0),
    sourceBackupId: record.sourceBackupId || "",
    restoreCount: Math.max(0, Number(record.restoreCount) || 0),
    lastRestoredAt: serializeDate(record.lastRestoredAt),
    isAvailable: Boolean(isAvailable),
    isDeleteProtected: Boolean(isDeleteProtected),
    deleteProtectionReason: isDeleteProtected ? deleteProtectionReason : "",
    downloadFileName: record.archiveFileName,
  };
}

function buildBackupRecord({
  id,
  slug,
  type,
  trigger,
  archiveEngine = MONGODUMP_BACKUP_ENGINE,
  databaseName,
  createdAt,
  createdByUserId,
  createdByName,
  createdByEmail,
  fileSizeBytes,
  sourceBackupId = "",
  note = "",
}) {
  return {
    id,
    slug,
    type,
    trigger,
    archiveEngine,
    databaseName,
    directoryName: slug,
    archiveFileName: `${slug}.archive.gz`,
    metadataFileName: "metadata.json",
    createdAt,
    createdByUserId: createdByUserId || "",
    createdByName: createdByName || "",
    createdByEmail: createdByEmail || "",
    fileSizeBytes,
    sourceBackupId,
    note,
    restoreCount: 0,
    lastRestoredAt: null,
  };
}

async function writeBackupMetadata(record) {
  const metadataFilePath = buildMetadataFilePath(record);
  await fs.writeFile(
    metadataFilePath,
    JSON.stringify(
      {
        ...record,
        createdAt: serializeDate(record.createdAt),
        lastRestoredAt: serializeDate(record.lastRestoredAt),
      },
      null,
      2
    ),
    "utf8"
  );
}

function getArchiveEngine(record) {
  return record?.archiveEngine || MONGODUMP_BACKUP_ENGINE;
}

function getConnectedDatabase() {
  const database = mongoose.connection?.db;

  if (!database) {
    throw new Error("Database connection is not ready for backup operations");
  }

  return database;
}

function normalizeCollectionOptions(options) {
  return options && typeof options === "object" && !Array.isArray(options)
    ? options
    : {};
}

function buildIndexOptions(indexSpec = {}) {
  const {
    key,
    v,
    ns,
    background,
    sparse,
    unique,
    expireAfterSeconds,
    partialFilterExpression,
    weights,
    default_language,
    language_override,
    textIndexVersion,
    sphereIndexVersion,
    bits,
    min,
    max,
    bucketSize,
    collation,
    wildcardProjection,
    hidden,
    name,
  } = indexSpec;

  const indexOptions = {
    name,
    sparse,
    unique,
    expireAfterSeconds,
    partialFilterExpression,
    weights,
    default_language,
    language_override,
    textIndexVersion,
    sphereIndexVersion,
    bits,
    min,
    max,
    bucketSize,
    collation,
    wildcardProjection,
    hidden,
  };

  void key;
  void v;
  void ns;
  void background;

  return Object.fromEntries(
    Object.entries(indexOptions).filter(([, value]) => value !== undefined)
  );
}

async function createInternalBackupArchive({ archiveFilePath, databaseName }) {
  const database = getConnectedDatabase();
  const collectionInfos = await database.listCollections({}, { nameOnly: false }).toArray();
  const collections = [];

  for (const collectionInfo of collectionInfos) {
    const collectionName = collectionInfo?.name;

    if (!collectionName) {
      continue;
    }

    const collectionType = collectionInfo?.type || "collection";
    const collectionOptions = normalizeCollectionOptions(collectionInfo?.options);

    if (collectionType === "view") {
      collections.push({
        name: collectionName,
        type: collectionType,
        options: collectionOptions,
        documents: [],
        indexes: [],
      });
      continue;
    }

    const collection = database.collection(collectionName);
    const documents = await collection.find({}).toArray();
    const indexes = await collection.indexes().catch(() => []);

    collections.push({
      name: collectionName,
      type: collectionType,
      options: collectionOptions,
      documents,
      indexes,
    });
  }

  const snapshot = {
    format: INTERNAL_BACKUP_FORMAT,
    version: INTERNAL_BACKUP_FORMAT_VERSION,
    engine: INTERNAL_BACKUP_ENGINE,
    databaseName,
    createdAt: new Date().toISOString(),
    collections,
  };

  const serializedSnapshot = EJSON.stringify(snapshot, null, 2, {
    relaxed: false,
  });
  const compressedSnapshot = await gzipAsync(Buffer.from(serializedSnapshot, "utf8"));
  await fs.writeFile(archiveFilePath, compressedSnapshot);

  return {
    archiveEngine: INTERNAL_BACKUP_ENGINE,
  };
}

async function readInternalBackupArchive(archiveFilePath) {
  const compressedSnapshot = await fs.readFile(archiveFilePath);
  const archiveBuffer = await gunzipAsync(compressedSnapshot);
  const archiveText = archiveBuffer.toString("utf8");
  const parsedArchive = EJSON.parse(archiveText, { relaxed: false });

  if (!parsedArchive || parsedArchive.format !== INTERNAL_BACKUP_FORMAT) {
    throw new Error("Backup archive format is not supported for internal restore");
  }

  if (Number(parsedArchive.version) !== INTERNAL_BACKUP_FORMAT_VERSION) {
    throw new Error("Backup archive version is not supported");
  }

  if (!Array.isArray(parsedArchive.collections)) {
    throw new Error("Backup archive is missing collection data");
  }

  return parsedArchive;
}

async function createBackupArchive({ mongoUri, databaseName, archiveFilePath }) {
  try {
    await runMongoTool({
      toolName: "mongodump",
      explicitBinaryPath: getMongoDumpBinary(),
      toolLabel: "mongodump",
      envVarName: "MONGODUMP_PATH",
      args: [
        "--uri",
        mongoUri,
        "--db",
        databaseName,
        `--archive=${archiveFilePath}`,
        "--gzip",
      ],
    });

    return {
      archiveEngine: MONGODUMP_BACKUP_ENGINE,
    };
  } catch (error) {
    const message = String(error?.message || "");

    if (!message.includes("not available on this server")) {
      throw error;
    }

    return createInternalBackupArchive({
      archiveFilePath,
      databaseName,
    });
  }
}

async function createIndexesForCollection(collection, indexSpecs = []) {
  for (const indexSpec of indexSpecs) {
    if (!indexSpec?.key || indexSpec.name === "_id_") {
      continue;
    }

    await collection.createIndex(indexSpec.key, buildIndexOptions(indexSpec));
  }
}

function buildDocumentBatches(documents = []) {
  const batches = [];

  for (let index = 0; index < documents.length; index += INTERNAL_BACKUP_BATCH_SIZE) {
    batches.push(documents.slice(index, index + INTERNAL_BACKUP_BATCH_SIZE));
  }

  return batches;
}

async function restoreInternalBackupArchive({ archiveFilePath }) {
  const archive = await readInternalBackupArchive(archiveFilePath);
  const database = getConnectedDatabase();

  await database.dropDatabase();

  for (const collectionSnapshot of archive.collections) {
    const collectionName = normalizeText(collectionSnapshot?.name, 240);

    if (!collectionName) {
      continue;
    }

    const collectionType = collectionSnapshot?.type || "collection";
    const collectionOptions = normalizeCollectionOptions(collectionSnapshot?.options);

    if (collectionType === "view") {
      await database.createCollection(collectionName, collectionOptions);
      continue;
    }

    await database.createCollection(collectionName, collectionOptions);
    const collection = database.collection(collectionName);
    const documents = Array.isArray(collectionSnapshot?.documents)
      ? collectionSnapshot.documents
      : [];

    for (const documentBatch of buildDocumentBatches(documents)) {
      if (!documentBatch.length) {
        continue;
      }

      await collection.insertMany(documentBatch, { ordered: true });
    }

    await createIndexesForCollection(collection, collectionSnapshot?.indexes || []);
  }

  return archive;
}

async function createBackupSnapshot({
  actorUser,
  type = "manual",
  trigger = "manual-export",
  sourceBackupId = "",
  note = "",
} = {}) {
  return withBackupOperationLock(async () => {
    const mongoUri = getMongoUri();
    const databaseName = getDatabaseName();
    const createdAt = new Date().toISOString();
    const slug = buildBackupSlug(type);
    const id = crypto.randomUUID();
    const backupDirectory = ensurePathInsideBackupRoot(path.join(BACKUP_ROOT_DIR, slug));
    const archiveFilePath = ensurePathInsideBackupRoot(path.join(backupDirectory, `${slug}.archive.gz`));

    await fs.mkdir(backupDirectory, { recursive: true });

    try {
      const { archiveEngine } = await createBackupArchive({
        mongoUri,
        databaseName,
        archiveFilePath,
      });

      const archiveStats = await fs.stat(archiveFilePath);
      const record = buildBackupRecord({
        id,
        slug,
        type,
        trigger,
        archiveEngine,
        databaseName,
        createdAt,
        createdByUserId: getActorUserId(actorUser),
        createdByName: normalizeText(actorUser?.fullName, 120),
        createdByEmail: normalizeText(actorUser?.email, 160).toLowerCase(),
        fileSizeBytes: archiveStats.size,
        sourceBackupId,
        note: normalizeText(note, 240),
      });

      const manifest = await loadManifest();
      manifest.items = [
        record,
        ...manifest.items.filter((item) => item.id !== record.id),
      ].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );

      await writeBackupMetadata(record);
      await saveManifest(manifest);

      try {
        const settings = await loadSettings();

        if (settings?.telegram?.enabled && settings?.telegram?.botTokenEncrypted) {
          sendBackupFileToTelegramBackground({
            settings,
            backup: record,
            archiveFilePath,
          });
        }
      } catch (telegramError) {
        console.error(
          "[database-backup] Could not initiate background Telegram send:",
          telegramError?.message || telegramError
        );
      }

      return sanitizeBackupRecord(record);
    } catch (error) {
      await fs.rm(backupDirectory, { recursive: true, force: true });
      throw error;
    }
  });
}

async function getBackupRecordById(backupId) {
  const normalizedBackupId = normalizeText(backupId, 120);

  if (!normalizedBackupId) {
    throw new Error("Backup id is required");
  }

  const manifest = await loadManifest();
  const record = manifest.items.find((item) => item.id === normalizedBackupId);

  if (!record) {
    throw new Error("Backup record not found");
  }

  const archiveFilePath = buildArchiveFilePath(record);
  const isAvailable = await fileExists(archiveFilePath);

  return {
    manifest,
    record,
    archiveFilePath,
    isAvailable,
  };
}

function assertBackupCanBeDeleted(manifest, backupId) {
  const protectedBackupIds = getProtectedBackupIds(manifest?.items || []);

  if (protectedBackupIds.has(backupId)) {
    throw new Error(buildDeleteProtectionReason());
  }
}

async function removeRestoreStateForBackup(backupId) {
  let verificationStoreChanged = false;
  let restoreSessionStoreChanged = false;

  await hydrateRestoreVerificationStore();
  for (const [key, entry] of restoreVerificationStore.entries()) {
    if (entry?.backupId === backupId) {
      restoreVerificationStore.delete(key);
      verificationStoreChanged = true;
    }
  }

  if (verificationStoreChanged) {
    await persistRestoreVerificationStore();
  }

  await hydrateRestoreSessionStore();
  for (const [key, entry] of restoreSessionStore.entries()) {
    if (entry?.backupId === backupId || entry?.safetyBackupId === backupId) {
      restoreSessionStore.delete(key);
      restoreSessionStoreChanged = true;
    }
  }

  if (restoreSessionStoreChanged) {
    await persistRestoreSessionStore();
  }
}

async function getAvailableBackupRecord(backupId) {
  const result = await getBackupRecordById(backupId);

  if (!result.isAvailable) {
    throw new Error("Backup file is no longer available on the server");
  }

  return result;
}

function sanitizeTelegramSettings(settings) {
  const botToken = settings?.telegram?.botTokenEncrypted
    ? decryptSecretValue(settings.telegram.botTokenEncrypted)
    : "";

  return {
    telegram: {
      enabled: Boolean(settings?.telegram?.enabled),
      chatIds: normalizeChatIds(settings?.telegram?.chatIds || []),
      hasBotToken: Boolean(settings?.telegram?.botTokenEncrypted),
      botTokenMasked: botToken ? maskSecret(botToken) : "",
      lastSentAt: serializeDate(settings?.telegram?.lastSentAt),
      lastError: settings?.telegram?.lastError || "",
      sentCount: Math.max(0, Number(settings?.telegram?.sentCount) || 0),
      failedCount: Math.max(0, Number(settings?.telegram?.failedCount) || 0),
      updatedAt: serializeDate(settings?.telegram?.updatedAt),
    },
  };
}

function resolveTelegramSettingsForAction(settings, payload = {}) {
  const existingEncryptedToken = settings?.telegram?.botTokenEncrypted || "";
  const existingToken = existingEncryptedToken ? decryptSecretValue(existingEncryptedToken) : "";
  const nextToken = String(payload.botToken || "").trim();
  const clearToken = normalizeBoolean(payload.clearToken, false);
  const enabled = normalizeBoolean(payload.enabled, settings?.telegram?.enabled || false);
  const chatIds = normalizeChatIds(payload.chatIds ?? settings?.telegram?.chatIds ?? []);
  const botToken = clearToken ? "" : nextToken || existingToken;

  if (enabled && !chatIds.length) {
    throw new Error("At least one Telegram chat ID is required when restore verification is enabled");
  }

  if (enabled && !botToken) {
    throw new Error("Telegram bot token is required when restore verification is enabled");
  }

  return {
    enabled,
    chatIds,
    botToken,
    clearToken,
  };
}

function buildRestoreVerificationKey(userId, backupId) {
  return `${String(userId || "").trim()}:${String(backupId || "").trim()}`;
}

function buildRestoreSessionKey(userId, token) {
  return `${String(userId || "").trim()}:${String(token || "").trim()}`;
}

function invalidateRestoreVerificationsForUser(userId) {
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    return;
  }

  for (const key of restoreVerificationStore.keys()) {
    if (key.startsWith(`${normalizedUserId}:`)) {
      restoreVerificationStore.delete(key);
    }
  }
}

function invalidateRestoreSessionsForUser(userId) {
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    return;
  }

  for (const key of restoreSessionStore.keys()) {
    if (key.startsWith(`${normalizedUserId}:`)) {
      restoreSessionStore.delete(key);
    }
  }
}

async function assertRestoreVerificationCode({ userId, backupId, verificationCode }) {
  await hydrateRestoreVerificationStore();
  const normalizedCode = normalizeVerificationCode(verificationCode);

  if (normalizedCode.length !== 4) {
    throw new Error("Enter the 4-digit Telegram verification code");
  }

  const storeKey = buildRestoreVerificationKey(userId, backupId);
  const entry = restoreVerificationStore.get(storeKey);

  if (!entry) {
    throw new Error("Request a new Telegram verification code before restoring");
  }

  if (entry.expiresAt <= Date.now()) {
    restoreVerificationStore.delete(storeKey);
    await persistRestoreVerificationStore();
    throw new Error("Telegram verification code expired. Request a new code");
  }

  if (entry.code !== normalizedCode) {
    throw new Error("Telegram verification code is incorrect");
  }
}

async function clearRestoreVerificationCode({ userId, backupId }) {
  await hydrateRestoreVerificationStore();
  const storeKey = buildRestoreVerificationKey(userId, backupId);

  if (!restoreVerificationStore.has(storeKey)) {
    return;
  }

  restoreVerificationStore.delete(storeKey);
  await persistRestoreVerificationStore();
}

async function sendTelegramToConfiguredChats({ settings, text }) {
  const botToken = settings?.telegram?.botTokenEncrypted
    ? decryptSecretValue(settings.telegram.botTokenEncrypted)
    : "";
  const chatIds = normalizeChatIds(settings?.telegram?.chatIds || []);

  if (!botToken) {
    throw new Error("Telegram bot token is not configured");
  }

  if (!chatIds.length) {
    throw new Error("Telegram chat IDs are not configured");
  }

  const results = await Promise.allSettled(
    chatIds.map((chatId) =>
      sendTelegramMessage({
        botToken,
        chatId,
        text,
      })
    )
  );

  const sentCount = results.filter((result) => result.status === "fulfilled").length;
  const failedCount = results.length - sentCount;
  const firstError = results.find((result) => result.status === "rejected");

  return {
    sentCount,
    failedCount,
    errorMessage: firstError?.reason?.message || "",
  };
}

async function sendTelegramDocument({ botToken, chatId, filePath, caption, timeoutMs = 120_000 }) {
  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("caption", caption || "");
  formData.append("document", new Blob([fileBuffer]), fileName);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendDocument`,
      { method: "POST", body: formData, signal: controller.signal }
    );

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.description || "Telegram sendDocument failed");
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildBackupTelegramCaption({
  backup,
  heading,
  actorUser,
}) {
  const lines = [
    heading || "200M Web App - Database Backup",
    "",
    `Slug: ${backup.slug}`,
    `Type: ${backup.type}`,
    `Database: ${backup.databaseName}`,
    `Created by: ${backup.createdByName || backup.createdByEmail || "System"}`,
    `Created at: ${new Date(backup.createdAt).toLocaleString("en-GB", { hour12: false })}`,
  ];

  const sharedBy = normalizeText(actorUser?.fullName, 120)
    || normalizeText(actorUser?.email, 160);

  if (sharedBy) {
    lines.push(`Shared by: ${sharedBy}`);
  }

  return lines.join("\n");
}

async function sendBackupFileToConfiguredChats({
  settings,
  archiveFilePath,
  caption,
}) {
  const botToken = settings?.telegram?.botTokenEncrypted
    ? decryptSecretValue(settings.telegram.botTokenEncrypted)
    : "";
  const chatIds = normalizeChatIds(settings?.telegram?.chatIds || []);

  if (!botToken) {
    throw new Error(
      "Telegram bot token is not configured. Ask an administrator to configure it first."
    );
  }

  if (!chatIds.length) {
    throw new Error(
      "Telegram chat IDs are not configured. Ask an administrator to configure them first."
    );
  }

  const results = await Promise.allSettled(
    chatIds.map((chatId) =>
      sendTelegramDocument({
        botToken,
        chatId,
        filePath: archiveFilePath,
        caption,
      })
    )
  );

  return {
    sentCount: results.filter((result) => result.status === "fulfilled").length,
    failedCount: results.filter((result) => result.status === "rejected").length,
    errorMessage:
      results.find((result) => result.status === "rejected")?.reason?.message || "",
  };
}

function sendBackupFileToTelegramBackground({ settings, backup, archiveFilePath }) {
  // Fire-and-forget: runs completely in the background, never throws to caller
  setImmediate(async () => {
    try {
      if (!settings?.telegram?.botTokenEncrypted || !normalizeChatIds(settings?.telegram?.chatIds || []).length) {
        return;
      }

      const delivery = await sendBackupFileToConfiguredChats({
        settings,
        archiveFilePath,
        caption: buildBackupTelegramCaption({
          backup,
          heading: "200M Web App - New Database Backup",
        }),
      });

      const latestSettings = await loadSettings();
      await updateSettingsDeliveryStats(latestSettings, delivery);
    } catch (error) {
      console.error("[database-backup] Background Telegram file send failed:", error?.message || error);
    }
  });
}

function buildRestoreVerificationTelegramMessage({ backup, requestedBy, code }) {
  const lines = [
    "200M Web App database restore verification",
    "",
    `Code: ${code}`,
    "Expires in: 5 minutes",
    "",
    `Backup: ${backup.slug}`,
    `Type: ${backup.type}`,
    `Database: ${backup.databaseName}`,
    `Requested by: ${normalizeText(requestedBy?.fullName, 120) || normalizeText(requestedBy?.email, 160) || "Unknown user"}`,
    `Requested at: ${new Date().toLocaleString("en-GB", { hour12: false })}`,
  ];

  return lines.join("\n");
}

function buildTelegramTestMessage() {
  return [
    "200M Web App database backup Telegram test",
    "",
    "This confirms the backup/restore verification bot is configured correctly.",
    `Sent at: ${new Date().toLocaleString("en-GB", { hour12: false })}`,
  ].join("\n");
}

async function updateSettingsDeliveryStats(settings, delivery) {
  settings.telegram.lastSentAt = new Date().toISOString();
  settings.telegram.lastError = delivery.errorMessage || "";
  settings.telegram.sentCount = Math.max(0, Number(settings.telegram.sentCount) || 0) + delivery.sentCount;
  settings.telegram.failedCount = Math.max(0, Number(settings.telegram.failedCount) || 0) + delivery.failedCount;
  settings.telegram.updatedAt = new Date().toISOString();
  await saveSettings(settings);
}

export async function listDatabaseBackupsService() {
  const manifest = await loadManifest();
  const protectedBackupIds = getProtectedBackupIds(manifest.items);
  const items = await Promise.all(
    sortBackupRecords(manifest.items)
      .slice(0, MAX_LIST_ITEMS)
      .map(async (record) => {
        const isDeleteProtected = protectedBackupIds.has(record.id);
        return sanitizeBackupRecord(record, {
          isAvailable: await fileExists(buildArchiveFilePath(record)),
          isDeleteProtected,
          deleteProtectionReason: isDeleteProtected ? buildDeleteProtectionReason() : "",
        });
      })
  );

  const latestBackup = items.find((item) => item.isAvailable) || null;
  const latestManualBackup = items.find((item) => item.type === "manual" && item.isAvailable) || null;
  const latestPreRestoreBackup =
    items.find((item) => item.type === "pre-restore" && item.isAvailable) || null;

  return {
    items,
    stats: {
      totalBackups: items.length,
      availableBackups: items.filter((item) => item.isAvailable).length,
      totalBackupSizeBytes: items.reduce(
        (total, item) => total + (Number(item.fileSizeBytes) || 0),
        0
      ),
      minimumRetainedBackups: MINIMUM_RETAINED_BACKUPS,
      latestBackupAt: latestBackup?.createdAt || null,
      latestManualBackupAt: latestManualBackup?.createdAt || null,
      latestPreRestoreBackupAt: latestPreRestoreBackup?.createdAt || null,
    },
  };
}

export async function createDatabaseBackupService({ actorUser } = {}) {
  return createBackupSnapshot({
    actorUser,
    type: "manual",
    trigger: "manual-export",
    note: "Manual full database backup",
  });
}

export async function getDatabaseBackupDownloadInfoService(backupId) {
  const { record, archiveFilePath } = await getAvailableBackupRecord(backupId);

  return {
    record: sanitizeBackupRecord(record),
    archiveFilePath,
  };
}

export async function getDatabaseBackupTelegramSettingsService() {
  return sanitizeTelegramSettings(await loadSettings());
}

export async function sendDatabaseBackupToTelegramService({ backupId, actorUser } = {}) {
  const { record, archiveFilePath } = await getAvailableBackupRecord(backupId);
  const settings = await loadSettings();

  const delivery = await sendBackupFileToConfiguredChats({
    settings,
    archiveFilePath,
    caption: buildBackupTelegramCaption({
      backup: record,
      heading: "200M Web App - Backup Library Archive",
      actorUser,
    }),
  });

  await updateSettingsDeliveryStats(settings, delivery);

  if (!delivery.sentCount) {
    throw new Error(delivery.errorMessage || "Failed to send database backup archive to Telegram");
  }

  return {
    backup: sanitizeBackupRecord(record),
    sentCount: delivery.sentCount,
    failedCount: delivery.failedCount,
    errorMessage: delivery.errorMessage || "",
  };
}

export async function deleteDatabaseBackupService(backupId) {
  return withBackupOperationLock(async () => {
    const { manifest, record, isAvailable } = await getBackupRecordById(backupId);
    assertBackupCanBeDeleted(manifest, record.id);

    const backupDirectory = ensurePathInsideBackupRoot(
      path.join(BACKUP_ROOT_DIR, record.directoryName)
    );

    await fs.rm(backupDirectory, {
      recursive: true,
      force: true,
    });

    manifest.items = manifest.items.filter((item) => item.id !== record.id);
    await saveManifest(manifest);
    await removeRestoreStateForBackup(record.id);

    return sanitizeBackupRecord(record, {
      isAvailable,
    });
  });
}

export async function updateDatabaseBackupTelegramSettingsService(payload = {}) {
  const settings = await loadSettings();
  const nextTelegramSettings = resolveTelegramSettingsForAction(settings, payload);

  settings.telegram.enabled = nextTelegramSettings.enabled;
  settings.telegram.chatIds = nextTelegramSettings.chatIds;
  settings.telegram.updatedAt = new Date().toISOString();
  settings.telegram.lastError = "";

  if (nextTelegramSettings.clearToken) {
    settings.telegram.botTokenEncrypted = "";
  } else if (nextTelegramSettings.botToken) {
    settings.telegram.botTokenEncrypted = encryptSecretValue(nextTelegramSettings.botToken);
  }

  await saveSettings(settings);
  return sanitizeTelegramSettings(settings);
}

export async function testDatabaseBackupTelegramSettingsService(payload = {}) {
  const settings = await loadSettings();
  const nextTelegramSettings = resolveTelegramSettingsForAction(settings, {
    ...payload,
    enabled: true,
  });
  const resolvedSettings = {
    telegram: {
      ...settings.telegram,
      enabled: true,
      chatIds: nextTelegramSettings.chatIds,
      botTokenEncrypted: encryptSecretValue(nextTelegramSettings.botToken),
    },
  };

  const delivery = await sendTelegramToConfiguredChats({
    settings: resolvedSettings,
    text: buildTelegramTestMessage(),
  });

  await updateSettingsDeliveryStats(settings, delivery);

  if (!delivery.sentCount) {
    throw new Error(delivery.errorMessage || "Failed to send Telegram test message");
  }

  return delivery;
}

export async function requestDatabaseRestoreVerificationCodeService({ backupId, actorUser } = {}) {
  const { record } = await getAvailableBackupRecord(backupId);
  const settings = await loadSettings();
  const actorUserKey = getActorUserKey(actorUser);

  if (!settings.telegram.enabled) {
    throw new Error("Restore verification bot is disabled. Ask an administrator to enable it first.");
  }

  if (!actorUserKey) {
    throw new Error("Authenticated user could not be verified for database restore");
  }

  const code = String(Math.floor(1000 + Math.random() * 9000));
  const delivery = await sendTelegramToConfiguredChats({
    settings,
    text: buildRestoreVerificationTelegramMessage({
      backup: record,
      requestedBy: actorUser,
      code,
    }),
  });

  if (!delivery.sentCount) {
    throw new Error(delivery.errorMessage || "Failed to send Telegram verification code");
  }

  const requestedAt = Date.now();
  const expiresAt = requestedAt + TELEGRAM_CODE_TTL_MS;

  await hydrateRestoreVerificationStore();
  invalidateRestoreVerificationsForUser(actorUserKey);
  restoreVerificationStore.set(buildRestoreVerificationKey(actorUserKey, backupId), {
    code,
    requestedAt,
    expiresAt,
    backupId,
  });
  await persistRestoreVerificationStore();

  await updateSettingsDeliveryStats(settings, delivery);

  return {
    backup: sanitizeBackupRecord(record),
    requestedAt: new Date(requestedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    sentCount: delivery.sentCount,
    failedCount: delivery.failedCount,
  };
}

export async function prepareDatabaseRestoreService({
  backupId,
  verificationCode,
  actorUser,
} = {}) {
  const { record } = await getAvailableBackupRecord(backupId);
  const actorUserKey = getActorUserKey(actorUser);

  if (!actorUserKey) {
    throw new Error("Authenticated user could not be verified for database restore");
  }

  await assertRestoreVerificationCode({
    userId: actorUserKey,
    backupId,
    verificationCode,
  });

  const safetyBackup = await createBackupSnapshot({
    actorUser,
    type: "pre-restore",
    trigger: "pre-restore-safety",
    sourceBackupId: backupId,
    note: `Safety backup created before restoring ${record.slug}`,
  });

  const restoreToken = crypto.randomUUID();
  const requestedAt = Date.now();
  const expiresAt = requestedAt + RESTORE_SESSION_TTL_MS;

  await hydrateRestoreSessionStore();
  invalidateRestoreSessionsForUser(actorUserKey);
  restoreSessionStore.set(buildRestoreSessionKey(actorUserKey, restoreToken), {
    backupId,
    safetyBackupId: safetyBackup.id,
    requestedAt,
    expiresAt,
  });
  await persistRestoreSessionStore();

  return {
    selectedBackup: sanitizeBackupRecord(record),
    safetyBackup,
    restoreToken,
    restoreExpiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function executeDatabaseRestoreService({ restoreToken, actorUser } = {}) {
  const normalizedRestoreToken = normalizeText(restoreToken, 120);
  const actorUserKey = getActorUserKey(actorUser);

  if (!normalizedRestoreToken) {
    throw new Error("Restore token is required");
  }

  if (!actorUserKey) {
    throw new Error("Authenticated user could not be verified for database restore");
  }

  await hydrateRestoreSessionStore();
  const restoreSessionKey = buildRestoreSessionKey(actorUserKey, normalizedRestoreToken);
  const sessionEntry = restoreSessionStore.get(restoreSessionKey);

  if (!sessionEntry) {
    throw new Error("Restore session expired. Request a new Telegram code and try again.");
  }

  if (sessionEntry.expiresAt <= Date.now()) {
    restoreSessionStore.delete(restoreSessionKey);
    await persistRestoreSessionStore();
    throw new Error("Restore session expired. Request a new Telegram code and try again.");
  }

  const { record: selectedBackup, manifest } = await getAvailableBackupRecord(sessionEntry.backupId);
  const { record: safetyBackup } = await getAvailableBackupRecord(sessionEntry.safetyBackupId);
  const mongoUri = getMongoUri();
  const databaseName = getDatabaseName();
  const selectedArchiveEngine = getArchiveEngine(selectedBackup);

  await withRestoreOperationLock(async () => {
    if (selectedArchiveEngine === INTERNAL_BACKUP_ENGINE) {
      await restoreInternalBackupArchive({
        archiveFilePath: buildArchiveFilePath(selectedBackup),
      });
      return;
    }

    await runMongoTool({
      toolName: "mongorestore",
      explicitBinaryPath: getMongoRestoreBinary(),
      toolLabel: "mongorestore",
      envVarName: "MONGORESTORE_PATH",
      args: [
        "--uri",
        mongoUri,
        `--archive=${buildArchiveFilePath(selectedBackup)}`,
        "--gzip",
        "--drop",
        "--stopOnError",
        "--nsInclude",
        `${databaseName}.*`,
      ],
    });
  });

  restoreSessionStore.delete(restoreSessionKey);
  await persistRestoreSessionStore();
  await clearRestoreVerificationCode({
    userId: actorUserKey,
    backupId: sessionEntry.backupId,
  });

  const nextRestoredAt = new Date().toISOString();
  let updatedSelectedBackupRecord = selectedBackup;
  manifest.items = manifest.items.map((item) => {
    if (item.id !== selectedBackup.id) {
      return item;
    }

    updatedSelectedBackupRecord = {
      ...item,
      restoreCount: Math.max(0, Number(item.restoreCount) || 0) + 1,
      lastRestoredAt: nextRestoredAt,
    };

    return updatedSelectedBackupRecord;
  });
  await saveManifest(manifest);
  await writeBackupMetadata(updatedSelectedBackupRecord);

  return {
    selectedBackup: sanitizeBackupRecord(updatedSelectedBackupRecord),
    safetyBackup: sanitizeBackupRecord(safetyBackup),
    restoredAt: nextRestoredAt,
  };
}
