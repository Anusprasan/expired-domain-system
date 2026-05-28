const fs = require("fs");
const mongoose = require("mongoose");
const path = require("path");

const DEFAULT_DATA_DIR = path.resolve(__dirname, "..", "..", "..", "data");
const DATA_DIR = path.resolve(process.env.SCREENSHOT_TAKER_DATA_DIR || DEFAULT_DATA_DIR);
const SCREENSHOT_DIR = path.join(DATA_DIR, "screenshots");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const STATE_DOCUMENT_KEY = "default";
const STATE_COLLECTION = "screenshot_taker_states";

const DEFAULT_STATE = {
  sites: [],
  captures: [],
  schedule: {
    enabled: false,
    delayMinutes: 60,
    parallelCaptures: 2,
    telegram: {
      enabled: false,
      chatId: "",
      botToken: "",
      updatedAt: null,
      lastSentAt: null,
      lastError: "",
      sentCount: 0,
      failedCount: 0,
    },
    updatedAt: null,
    lastRunAt: null,
    nextRunAt: null,
    completedScanCount: 0,
    lastAutoClearAt: null,
    lastAutoClearResult: null,
  },
  storage: {
    imageLimitBytes: 10 * 1024 * 1024 * 1024,
    lastCleanupAt: null,
    lastCleanupResult: null,
  },
};

let stateCache = cloneState(DEFAULT_STATE);
let storageBackend = "file";
let mongoConnection = null;
let ScreenshotTakerState = null;
let persistQueue = Promise.resolve();
let lastPersistError = null;

function ensureDataDirectories() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeState(state) {
  return {
    ...DEFAULT_STATE,
    ...(state || {}),
    sites: Array.isArray(state?.sites) ? state.sites : [],
    captures: Array.isArray(state?.captures) ? state.captures : [],
    schedule: {
      ...DEFAULT_STATE.schedule,
      ...(state?.schedule || {}),
      telegram: {
        ...DEFAULT_STATE.schedule.telegram,
        ...(state?.schedule?.telegram || {}),
      },
    },
    storage: {
      ...DEFAULT_STATE.storage,
      ...(state?.storage || {}),
    },
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(normalizeState(state)));
}

function getMongoUri() {
  return String(process.env.SCREENSHOT_TAKER_MONGO_URI || process.env.MONGO_URI || "").trim();
}

function getRequestedStorageBackend() {
  return String(process.env.SCREENSHOT_TAKER_STATE_STORAGE || "").trim().toLowerCase();
}

function shouldUseMongoStorage() {
  const requestedBackend = getRequestedStorageBackend();

  if (requestedBackend === "file") {
    return false;
  }

  if (requestedBackend === "mongo" || requestedBackend === "mongodb" || requestedBackend === "database") {
    return true;
  }

  return Boolean(getMongoUri());
}

function readStateFromFile() {
  ensureDataDirectories();

  if (!fs.existsSync(STATE_FILE)) {
    return cloneState(DEFAULT_STATE);
  }

  return cloneState(readJsonFile(STATE_FILE));
}

function writeStateToFile(state) {
  ensureDataDirectories();
  const normalizedState = cloneState(state);
  const temporaryFile = `${STATE_FILE}.tmp`;

  fs.writeFileSync(temporaryFile, JSON.stringify(normalizedState, null, 2));
  fs.renameSync(temporaryFile, STATE_FILE);

  return normalizedState;
}

async function persistStateToMongo(state) {
  if (!ScreenshotTakerState) {
    return;
  }

  await ScreenshotTakerState.updateOne(
    { key: STATE_DOCUMENT_KEY },
    {
      $set: {
        key: STATE_DOCUMENT_KEY,
        state: cloneState(state),
      },
    },
    { upsert: true }
  );
}

function queueMongoPersist(state) {
  const stateSnapshot = cloneState(state);

  persistQueue = persistQueue
    .then(async () => {
      await persistStateToMongo(stateSnapshot);
      lastPersistError = null;
    })
    .catch((error) => {
      lastPersistError = error;
      console.error("[screenshot-taker] Failed to persist state to MongoDB:", error.message);
    });
}

async function initializeMongoStorage() {
  const mongoUri = getMongoUri();

  if (!mongoUri) {
    const error = new Error(
      "SCREENSHOT_TAKER_MONGO_URI or MONGO_URI is required when SCREENSHOT_TAKER_STATE_STORAGE=mongo"
    );
    error.code = "SCREENSHOT_TAKER_MONGO_URI_REQUIRED";
    throw error;
  }

  const connectionTimeoutMs = Math.max(
    3000,
    Number(process.env.SCREENSHOT_TAKER_MONGO_TIMEOUT_MS || 15000)
  );

  mongoConnection = await mongoose.createConnection(mongoUri, {
    serverSelectionTimeoutMS: connectionTimeoutMs,
  }).asPromise();

  const stateSchema = new mongoose.Schema(
    {
      key: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },
      state: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
        default: () => cloneState(DEFAULT_STATE),
      },
    },
    {
      collection: STATE_COLLECTION,
      minimize: false,
      timestamps: true,
    }
  );

  ScreenshotTakerState = mongoConnection.model("ScreenshotTakerState", stateSchema);

  const existingDocument = await ScreenshotTakerState.findOne({ key: STATE_DOCUMENT_KEY }).lean();

  if (existingDocument?.state) {
    stateCache = cloneState(existingDocument.state);
    storageBackend = "mongo";
    return;
  }

  stateCache = readStateFromFile();
  await persistStateToMongo(stateCache);
  storageBackend = "mongo";
}

async function initializeStateStorage() {
  ensureDataDirectories();

  if (shouldUseMongoStorage()) {
    try {
      await initializeMongoStorage();
      console.log("[screenshot-taker] State storage: MongoDB");
      return {
        backend: storageBackend,
      };
    } catch (error) {
      if (getRequestedStorageBackend()) {
        throw error;
      }

      console.warn(
        "[screenshot-taker] MongoDB state storage unavailable. Falling back to state.json:",
        error.message
      );
    }
  }

  stateCache = readStateFromFile();
  storageBackend = "file";

  if (!fs.existsSync(STATE_FILE)) {
    writeStateToFile(stateCache);
  }

  console.log("[screenshot-taker] State storage: state.json");
  return {
    backend: storageBackend,
  };
}

function readState() {
  return cloneState(stateCache);
}

function writeState(state) {
  const normalizedState = cloneState(state);
  stateCache = normalizedState;

  if (storageBackend === "mongo") {
    queueMongoPersist(normalizedState);
    return normalizedState;
  }

  writeStateToFile(normalizedState);
  return normalizedState;
}

function updateState(mutator) {
  const state = readState();
  const nextState = mutator(state) || state;
  return writeState(nextState);
}

async function flushStateStorage() {
  await persistQueue;

  if (lastPersistError) {
    throw lastPersistError;
  }
}

async function closeStateStorage() {
  await flushStateStorage();

  if (mongoConnection) {
    await mongoConnection.close();
    mongoConnection = null;
  }
}

module.exports = {
  DATA_DIR,
  SCREENSHOT_DIR,
  closeStateStorage,
  flushStateStorage,
  initializeStateStorage,
  readState,
  updateState,
  writeState,
};
