const AdminSettings = require('../models/AdminSettings');

const SERVICE_UNAVAILABLE_COOLDOWN_MS = 60 * 1000;

const KEY_ERROR_CODES = Object.freeze({
  QUOTA_EXHAUSTED: 'serper_quota_exhausted',
  INVALID_KEY: 'serper_invalid_api_key',
  API_UNAVAILABLE: 'serper_api_unavailable',
  REQUEST_FAILED: 'serper_request_failed',
});

const SERPER_AVAILABILITY_CODES = Object.freeze({
  AVAILABLE: 'serper_available',
  ADMIN_SETTINGS_MISSING: 'serper_admin_settings_missing',
  NO_ACTIVE_KEY: 'serper_no_active_key',
  QUOTA_EXHAUSTED: 'serper_quota_exhausted',
  INVALID_KEY: 'serper_invalid_api_key',
  API_UNAVAILABLE: 'serper_api_unavailable',
  NO_USABLE_KEY: 'serper_no_usable_key',
});

const QUOTA_KEYWORDS = [
  'credit',
  'credits',
  'quota',
  'limit',
  'not enough',
  'exhaust',
  'expired',
  'payment required',
  'rate limit',
];

const INVALID_KEYWORDS = [
  'invalid api key',
  'invalid key',
  'unauthorized',
  'forbidden',
  'invalid token',
  'authentication',
];

const NON_BLOCKING_RESPONSE_VALIDATION_MESSAGES = [
  'serper returned an empty response',
  'serper returned an invalid organic results payload',
  'serper returned no usable organic results for this search',
];

const parseFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeMonthlyLimit = (monthlyLimit) => {
  const parsed = Number(monthlyLimit);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeMessage = (error) =>
  `${error?.response?.data?.message || ''} ${error?.response?.data?.error || ''} ${error?.message || ''}`
    .trim()
    .toLowerCase();

const isNonBlockingResponseValidationMessage = (message) => {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return NON_BLOCKING_RESPONSE_VALIDATION_MESSAGES.some((item) => normalized.includes(item));
};

const toIsoOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getRetryAtIso = (lastErrorAt, nowMs) => {
  if (!lastErrorAt) return null;
  const retryAtMs = new Date(lastErrorAt).getTime() + SERVICE_UNAVAILABLE_COOLDOWN_MS;
  if (Number.isNaN(retryAtMs) || retryAtMs <= nowMs) {
    return null;
  }
  return new Date(retryAtMs).toISOString();
};

const buildRemainingDisplay = (remainingSnapshot, totalRequests, monthlyLimit) => {
  if (remainingSnapshot !== null) {
    return Math.max(remainingSnapshot, 0);
  }

  if (monthlyLimit !== null) {
    return Math.max(monthlyLimit - totalRequests, 0);
  }

  return null;
};

const buildTrackedRemainingDisplay = (totalRequests, monthlyLimit) => {
  if (monthlyLimit !== null) {
    return Math.max(monthlyLimit - totalRequests, 0);
  }

  return null;
};

const classifySerperKeyError = (error) => {
  const status = Number(error?.response?.status || 0);
  const message = normalizeMessage(error);
  const code = String(error?.code || '').toUpperCase();
  const isNetworkFailure =
    ['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET'].includes(code) ||
    (!status && Boolean(error?.request));

  if (status === 402 || status === 429) {
    return {
      code: KEY_ERROR_CODES.QUOTA_EXHAUSTED,
      shouldTryNextKey: true,
      shouldMarkExhausted: true,
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: KEY_ERROR_CODES.INVALID_KEY,
      shouldTryNextKey: true,
      shouldMarkExhausted: false,
    };
  }

  if (status === 400) {
    if (QUOTA_KEYWORDS.some((keyword) => message.includes(keyword))) {
      return {
        code: KEY_ERROR_CODES.QUOTA_EXHAUSTED,
        shouldTryNextKey: true,
        shouldMarkExhausted: true,
      };
    }

    if (INVALID_KEYWORDS.some((keyword) => message.includes(keyword))) {
      return {
        code: KEY_ERROR_CODES.INVALID_KEY,
        shouldTryNextKey: true,
        shouldMarkExhausted: false,
      };
    }
  }

  if (status >= 500 || isNetworkFailure) {
    return {
      code: KEY_ERROR_CODES.API_UNAVAILABLE,
      shouldTryNextKey: true,
      shouldMarkExhausted: false,
    };
  }

  return {
    code: KEY_ERROR_CODES.REQUEST_FAILED,
    shouldTryNextKey: false,
    shouldMarkExhausted: false,
  };
};

const getKeyState = (item, { monthlyLimit = null, nowMs = Date.now() } = {}) => {
  const totalRequests = Math.max(0, parseFiniteNumber(item?.totalRequests) || 0);
  const remainingSnapshot = parseFiniteNumber(item?.lastKnownRemaining);
  const lastErrorCode = String(item?.lastErrorCode || '').trim();
  const lastErrorAtIso = toIsoOrNull(item?.lastErrorAt);
  const legacyResponseValidationFailure =
    lastErrorCode === KEY_ERROR_CODES.API_UNAVAILABLE &&
    isNonBlockingResponseValidationMessage(item?.lastError);
  const exhaustedByCounter = monthlyLimit !== null && totalRequests >= monthlyLimit;
  const exhaustedBySnapshot = remainingSnapshot !== null && remainingSnapshot <= 0;
  const quotaExhausted =
    lastErrorCode === KEY_ERROR_CODES.QUOTA_EXHAUSTED ||
    Boolean(item?.exhaustedAt) ||
    exhaustedByCounter ||
    exhaustedBySnapshot;
  const invalidKey = lastErrorCode === KEY_ERROR_CODES.INVALID_KEY;
  const apiUnavailable =
    !legacyResponseValidationFailure &&
    lastErrorCode === KEY_ERROR_CODES.API_UNAVAILABLE &&
    lastErrorAtIso &&
    new Date(lastErrorAtIso).getTime() + SERVICE_UNAVAILABLE_COOLDOWN_MS > nowMs;

  const blockingReason = quotaExhausted
    ? KEY_ERROR_CODES.QUOTA_EXHAUSTED
    : invalidKey
      ? KEY_ERROR_CODES.INVALID_KEY
      : apiUnavailable
        ? KEY_ERROR_CODES.API_UNAVAILABLE
        : null;
  const remainingDisplay = buildRemainingDisplay(remainingSnapshot, totalRequests, monthlyLimit);
  const trackedRemainingDisplay = buildTrackedRemainingDisplay(totalRequests, monthlyLimit);

  return {
    _id: item?._id || null,
    name: item?.name || '',
    isActive: Boolean(item?.isActive),
    usable: Boolean(item?.isActive) && !blockingReason,
    totalRequests,
    remainingSnapshot,
    remainingDisplay,
    trackedRemainingDisplay,
    lastErrorCode,
    lastErrorAt: lastErrorAtIso,
    retryAt: apiUnavailable ? getRetryAtIso(lastErrorAtIso, nowMs) : null,
    blockingReason,
  };
};

const summarizeSerperAvailability = (settings, { monthlyLimit = null, now = new Date() } = {}) => {
  const nowMs = new Date(now).getTime();
  const limit = normalizeMonthlyLimit(monthlyLimit);

  if (!settings) {
    return {
      available: false,
      blocking: true,
      code: SERPER_AVAILABILITY_CODES.ADMIN_SETTINGS_MISSING,
      message: 'Rank Checker is unavailable because the service settings are missing.',
      checkedAt: new Date(nowMs).toISOString(),
      httpStatus: 503,
      activeKeyCount: 0,
      usableKeyCount: 0,
      exhaustedKeyCount: 0,
      invalidKeyCount: 0,
      unavailableKeyCount: 0,
      keyStates: [],
      currentKey: null,
      retryAt: null,
    };
  }

  const activeKeys = (settings.serpApiKeys || []).filter((item) => item.isActive);
  const keyStates = activeKeys.map((item) => getKeyState(item, { monthlyLimit: limit, nowMs }));
  const usableKeys = keyStates.filter((item) => item.usable);
  const exhaustedKeys = keyStates.filter((item) => item.blockingReason === KEY_ERROR_CODES.QUOTA_EXHAUSTED);
  const invalidKeys = keyStates.filter((item) => item.blockingReason === KEY_ERROR_CODES.INVALID_KEY);
  const unavailableKeys = keyStates.filter((item) => item.blockingReason === KEY_ERROR_CODES.API_UNAVAILABLE);
  const checkedAt = new Date(nowMs).toISOString();
  const activeCursor = Math.max(0, parseFiniteNumber(settings?.activeKeyCursor) || 0);
  const preferredKeyState = usableKeys[0] || keyStates[activeKeys.length ? activeCursor % activeKeys.length : 0] || null;

  const buildCurrentKey = (keyState) =>
    keyState
      ? {
          _id: keyState._id,
          name: keyState.name,
          remainingDisplay: keyState.remainingDisplay,
          trackedRemainingDisplay: keyState.trackedRemainingDisplay,
          remainingSnapshot: keyState.remainingSnapshot,
          totalRequests: keyState.totalRequests,
          usable: keyState.usable,
          blockingReason: keyState.blockingReason,
        }
      : null;

  if (!activeKeys.length) {
    return {
      available: false,
      blocking: true,
      code: SERPER_AVAILABILITY_CODES.NO_ACTIVE_KEY,
      message: 'Rank Checker is unavailable because there is no active Serper API key.',
      checkedAt,
      httpStatus: 409,
      activeKeyCount: 0,
      usableKeyCount: 0,
      exhaustedKeyCount: 0,
      invalidKeyCount: 0,
      unavailableKeyCount: 0,
      keyStates,
      currentKey: null,
      retryAt: null,
    };
  }

  if (usableKeys.length) {
    return {
      available: true,
      blocking: false,
      code: SERPER_AVAILABILITY_CODES.AVAILABLE,
      message: 'Rank Checker can use Serper normally.',
      checkedAt,
      httpStatus: 200,
      activeKeyCount: activeKeys.length,
      usableKeyCount: usableKeys.length,
      exhaustedKeyCount: exhaustedKeys.length,
      invalidKeyCount: invalidKeys.length,
      unavailableKeyCount: unavailableKeys.length,
      keyStates,
      currentKey: buildCurrentKey(preferredKeyState),
      retryAt: null,
    };
  }

  if (exhaustedKeys.length === activeKeys.length) {
    return {
      available: false,
      blocking: true,
      code: SERPER_AVAILABILITY_CODES.QUOTA_EXHAUSTED,
      message: 'Rank Checker is unavailable because all active Serper API keys have reached their limit.',
      checkedAt,
      httpStatus: 409,
      activeKeyCount: activeKeys.length,
      usableKeyCount: 0,
      exhaustedKeyCount: exhaustedKeys.length,
      invalidKeyCount: invalidKeys.length,
      unavailableKeyCount: unavailableKeys.length,
      keyStates,
      currentKey: buildCurrentKey(preferredKeyState),
      retryAt: null,
    };
  }

  if (invalidKeys.length === activeKeys.length) {
    return {
      available: false,
      blocking: true,
      code: SERPER_AVAILABILITY_CODES.INVALID_KEY,
      message: 'Rank Checker is unavailable because all active Serper API keys are invalid or unauthorized.',
      checkedAt,
      httpStatus: 409,
      activeKeyCount: activeKeys.length,
      usableKeyCount: 0,
      exhaustedKeyCount: exhaustedKeys.length,
      invalidKeyCount: invalidKeys.length,
      unavailableKeyCount: unavailableKeys.length,
      keyStates,
      currentKey: buildCurrentKey(preferredKeyState),
      retryAt: null,
    };
  }

  if (unavailableKeys.length === activeKeys.length) {
    const retryAt = unavailableKeys
      .map((item) => item.retryAt)
      .filter(Boolean)
      .sort()
      .pop() || null;

    return {
      available: false,
      blocking: true,
      code: SERPER_AVAILABILITY_CODES.API_UNAVAILABLE,
      message: 'Rank Checker is temporarily unavailable because Serper is not responding correctly.',
      checkedAt,
      httpStatus: 503,
      activeKeyCount: activeKeys.length,
      usableKeyCount: 0,
      exhaustedKeyCount: exhaustedKeys.length,
      invalidKeyCount: invalidKeys.length,
      unavailableKeyCount: unavailableKeys.length,
      keyStates,
      currentKey: buildCurrentKey(preferredKeyState),
      retryAt,
    };
  }

  return {
    available: false,
    blocking: true,
    code: SERPER_AVAILABILITY_CODES.NO_USABLE_KEY,
    message: 'Rank Checker is unavailable because no usable Serper API key is available right now.',
    checkedAt,
    httpStatus: 409,
    activeKeyCount: activeKeys.length,
    usableKeyCount: 0,
    exhaustedKeyCount: exhaustedKeys.length,
    invalidKeyCount: invalidKeys.length,
    unavailableKeyCount: unavailableKeys.length,
    keyStates,
    currentKey: buildCurrentKey(preferredKeyState),
    retryAt: null,
  };
};

const syncQuotaExhaustedKeyCounters = async (settings, { monthlyLimit = null, now = new Date() } = {}) => {
  const limit = normalizeMonthlyLimit(monthlyLimit);
  if (!settings || !limit || !Array.isArray(settings.serpApiKeys)) {
    return settings;
  }

  const nowDate = new Date(now);
  const nowMs = nowDate.getTime();
  let shouldSave = false;

  settings.serpApiKeys.forEach((item) => {
    const keyState = getKeyState(item, { monthlyLimit: limit, nowMs });
    if (keyState.blockingReason !== KEY_ERROR_CODES.QUOTA_EXHAUSTED) {
      return;
    }

    if (keyState.totalRequests !== limit) {
      item.totalRequests = limit;
      shouldSave = true;
    }

    if (keyState.remainingSnapshot !== 0) {
      item.lastKnownRemaining = 0;
      shouldSave = true;
    }

    if (!item.exhaustedAt) {
      item.exhaustedAt = nowDate;
      shouldSave = true;
    }
  });

  if (shouldSave && typeof settings.save === 'function') {
    await settings.save();
  }

  return settings;
};

const clearNonBlockingValidationErrors = async (settings) => {
  if (!settings || !Array.isArray(settings.serpApiKeys)) {
    return settings;
  }

  let shouldSave = false;

  settings.serpApiKeys.forEach((item) => {
    if (
      String(item?.lastErrorCode || '').trim() === KEY_ERROR_CODES.API_UNAVAILABLE &&
      isNonBlockingResponseValidationMessage(item?.lastError)
    ) {
      item.lastErrorCode = '';
      item.lastError = '';
      item.lastErrorAt = null;
      shouldSave = true;
    }
  });

  if (shouldSave && typeof settings.save === 'function') {
    await settings.save();
  }

  return settings;
};

const loadSerperAvailability = async ({ monthlyLimit = null } = {}) => {
  const settings = await AdminSettings.findOne();
  await clearNonBlockingValidationErrors(settings);
  await syncQuotaExhaustedKeyCounters(settings, { monthlyLimit });
  return summarizeSerperAvailability(settings, { monthlyLimit });
};

const buildSerperAvailabilityError = (availability) => {
  const error = new Error(availability?.message || 'Rank Checker is unavailable');
  error.statusCode = Number(availability?.httpStatus) || 503;
  error.errorCode = availability?.code || SERPER_AVAILABILITY_CODES.NO_USABLE_KEY;
  error.serperAvailability = availability || null;
  return error;
};

const assertSerperAvailability = async ({ settings = null, monthlyLimit = null } = {}) => {
  if (settings) {
    await clearNonBlockingValidationErrors(settings);
    await syncQuotaExhaustedKeyCounters(settings, { monthlyLimit });
  }

  const availability = settings
    ? summarizeSerperAvailability(settings, { monthlyLimit })
    : await loadSerperAvailability({ monthlyLimit });

  if (!availability.available) {
    throw buildSerperAvailabilityError(availability);
  }

  return availability;
};

const isBlockingSerperAvailabilityError = (error) =>
  Boolean(error?.serperAvailability?.blocking) ||
  [
    SERPER_AVAILABILITY_CODES.ADMIN_SETTINGS_MISSING,
    SERPER_AVAILABILITY_CODES.NO_ACTIVE_KEY,
    SERPER_AVAILABILITY_CODES.QUOTA_EXHAUSTED,
    SERPER_AVAILABILITY_CODES.INVALID_KEY,
    SERPER_AVAILABILITY_CODES.API_UNAVAILABLE,
    SERPER_AVAILABILITY_CODES.NO_USABLE_KEY,
  ].includes(String(error?.errorCode || '').trim());

module.exports = {
  KEY_ERROR_CODES,
  SERPER_AVAILABILITY_CODES,
  SERVICE_UNAVAILABLE_COOLDOWN_MS,
  classifySerperKeyError,
  summarizeSerperAvailability,
  syncQuotaExhaustedKeyCounters,
  clearNonBlockingValidationErrors,
  loadSerperAvailability,
  buildSerperAvailabilityError,
  assertSerperAvailability,
  isBlockingSerperAvailabilityError,
};
