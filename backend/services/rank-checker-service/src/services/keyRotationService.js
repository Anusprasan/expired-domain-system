const AdminSettings = require('../models/AdminSettings');
const {
  KEY_ERROR_CODES,
  classifySerperKeyError,
  summarizeSerperAvailability,
  assertSerperAvailability,
  buildSerperAvailabilityError,
  loadSerperAvailability,
  isBlockingSerperAvailabilityError,
} = require('./serperAvailabilityService');

const parseNumericLike = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const text = String(value);
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractRemainingTokens = (headers = {}) => {
  const keys = [
    'x-ratelimit-remaining-month',
    'x-ratelimit-remaining',
    'x-ratelimit-requests-remaining',
    'x-ratelimit-remaining-searches',
    'x-ratelimit-remaining-day',
    'x-api-quota-remaining',
    'x-credits-remaining',
  ];

  for (const key of keys) {
    const parsed = parseNumericLike(headers[key]);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const extractRemainingFromBody = (payload = {}) => {
  const candidates = [
    payload.remaining,
    payload.remainingCredits,
    payload.creditsRemaining,
    payload.searchCreditsRemaining,
    payload.credits,
  ];

  for (const item of candidates) {
    const parsed = parseNumericLike(item);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const normalizeExhaustedTotalRequests = (totalRequests, monthlyLimit) => {
  const parsedLimit = Number(monthlyLimit);
  if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
    return parsedLimit;
  }

  const parsedRequests = Number(totalRequests);
  return Number.isFinite(parsedRequests) && parsedRequests >= 0 ? parsedRequests : 0;
};

const createKeyRotationService = ({ monthlyLimit = null } = {}) => {
  const getActiveKeys = (settings) => (settings.serpApiKeys || []).filter((item) => item.isActive);

  const withRotatingKey = async (executor) => {
    const settings = await AdminSettings.findOne();
    await assertSerperAvailability({ settings, monthlyLimit });

    const activeKeys = getActiveKeys(settings);
    let lastError = null;

    for (let index = 0; index < activeKeys.length; index += 1) {
      const keyEntry = activeKeys[index];
      settings.activeKeyCursor = index;

      try {
        const response = await executor({ key: keyEntry.key, keyName: keyEntry.name });
        const remainingTokens =
          extractRemainingTokens(response.headers || {}) ?? extractRemainingFromBody(response.data || {});
        const nextTotalRequests = (keyEntry.totalRequests || 0) + 1;
        const quotaExhausted = remainingTokens !== null && remainingTokens <= 0;

        keyEntry.lastUsedAt = new Date();
        keyEntry.totalRequests = quotaExhausted
          ? normalizeExhaustedTotalRequests(nextTotalRequests, monthlyLimit)
          : nextTotalRequests;
        keyEntry.lastError = '';
        keyEntry.lastErrorCode = '';
        keyEntry.lastErrorAt = null;
        keyEntry.lastKnownRemaining = quotaExhausted ? 0 : remainingTokens;
        keyEntry.exhaustedAt = quotaExhausted ? new Date() : null;
        await settings.save();

        return {
          data: response.data,
          keyId: keyEntry._id,
          keyName: keyEntry.name,
          keyRemaining: keyEntry.lastKnownRemaining,
        };
      } catch (error) {
        lastError = error;
        const classifiedError = error?.serperKeyErrorCode
          ? {
              code: error.serperKeyErrorCode,
              shouldTryNextKey: error.shouldTryNextKey !== false,
              shouldMarkExhausted: Boolean(error.shouldMarkExhausted),
            }
          : classifySerperKeyError(error);
        const remainingTokens =
          extractRemainingTokens(error.response?.headers || {}) ??
          extractRemainingFromBody(error.response?.data || {});
        const nextTotalRequests = (keyEntry.totalRequests || 0) + 1;
        const quotaExhausted = classifiedError.shouldMarkExhausted;

        keyEntry.lastUsedAt = new Date();
        keyEntry.totalRequests = quotaExhausted
          ? normalizeExhaustedTotalRequests(nextTotalRequests, monthlyLimit)
          : nextTotalRequests;
        keyEntry.lastError = error.response?.data?.message || error.message || 'Unknown API key failure';
        keyEntry.lastErrorCode = classifiedError.code;
        keyEntry.lastErrorAt = new Date();
        keyEntry.lastKnownRemaining = quotaExhausted ? 0 : remainingTokens;
        keyEntry.exhaustedAt = quotaExhausted ? new Date() : null;
        await settings.save();

        if (classifiedError.shouldTryNextKey) {
          continue;
        }

        throw error;
      }
    }

    const availability = summarizeSerperAvailability(settings, { monthlyLimit });
    if (!availability.available) {
      throw buildSerperAvailabilityError(availability);
    }

    throw lastError || new Error('All API keys failed');
  };

  return {
    withRotatingKey,
    getAvailability: () => loadSerperAvailability({ monthlyLimit }),
    assertAvailability: (settings) => assertSerperAvailability({ settings, monthlyLimit }),
    isBlockingAvailabilityError: isBlockingSerperAvailabilityError,
    keyErrorCodes: KEY_ERROR_CODES,
  };
};

module.exports = {
  createKeyRotationService,
};
