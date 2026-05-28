const fs = require("fs");
const path = require("path");

const DEFAULT_DATA_DIR = path.resolve(__dirname, "..", "..", "..", "data");
const DATA_DIR = path.resolve(process.env.SHORT_LINK_CHECKER_DATA_DIR || DEFAULT_DATA_DIR);
const CAPTURE_DIR = path.join(DATA_DIR, "captures");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const DEFAULT_ALERT_STATUS_CODES = [400, 401, 403, 404, 408, 429, 500, 502, 503, 504];

const DEFAULT_STATE = {
  links: [],
  checks: [],
  telegram: {
    enabled: false,
    chatId: "",
    botToken: "",
    updatedAt: null,
    lastSentAt: null,
    lastError: "",
    sentCount: 0,
    failedCount: 0,
    alertStatusCodes: DEFAULT_ALERT_STATUS_CODES,
    customAlertStatusCodes: [],
    notifyCloudflareVerification: false,
    notifySecurityVerification: false,
  },
  schedule: {
    enabled: false,
    delayMinutes: 60,
    parallelChecks: 2,
    scanMode: "capture",
    nextRunAt: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: "",
    updatedAt: null,
  },
};

function ensureDataDirectories() {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
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
    links: Array.isArray(state?.links) ? state.links : [],
    checks: Array.isArray(state?.checks) ? state.checks : [],
    telegram: {
      ...DEFAULT_STATE.telegram,
      ...(state?.telegram || {}),
      alertStatusCodes: Array.isArray(state?.telegram?.alertStatusCodes)
        ? state.telegram.alertStatusCodes
        : DEFAULT_STATE.telegram.alertStatusCodes,
      customAlertStatusCodes: Array.isArray(state?.telegram?.customAlertStatusCodes)
        ? state.telegram.customAlertStatusCodes
        : DEFAULT_STATE.telegram.customAlertStatusCodes,
    },
    schedule: {
      ...DEFAULT_STATE.schedule,
      ...(state?.schedule || {}),
    },
  };
}

function readState() {
  ensureDataDirectories();

  if (!fs.existsSync(STATE_FILE)) {
    writeState(DEFAULT_STATE);
    return normalizeState(DEFAULT_STATE);
  }

  return normalizeState(readJsonFile(STATE_FILE));
}

function writeState(state) {
  ensureDataDirectories();
  const normalizedState = normalizeState(state);
  const temporaryFile = `${STATE_FILE}.tmp`;

  fs.writeFileSync(temporaryFile, JSON.stringify(normalizedState, null, 2));
  fs.renameSync(temporaryFile, STATE_FILE);

  return normalizedState;
}

function updateState(mutator) {
  const state = readState();
  const nextState = mutator(state) || state;
  return writeState(nextState);
}

module.exports = {
  CAPTURE_DIR,
  DATA_DIR,
  readState,
  updateState,
  writeState,
};
