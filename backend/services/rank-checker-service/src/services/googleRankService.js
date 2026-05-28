const { randomUUID } = require('crypto');
const axios = require('axios');
const Domain = require('../models/Domain');
const GoogleRankResult = require('../models/GoogleRankResult');
const { extractHostFromLink } = require('../utils/domain');
const { ensureSettings } = require('./adminSettingsService');
const { attachBrands, findBrandById, listBrands } = require('./systemBrandService');
const { buildLookup, classifyResult } = require('./serpService');

const SERPAPI_SEARCH_URL = 'https://serpapi.com/search.json';
const GOOGLE_RANK_NO_KEYS_CODE = 'google_rank_no_api_keys';
const GOOGLE_RANK_ALL_KEYS_FAILED_CODE = 'google_rank_all_keys_failed';
const GOOGLE_RANK_INVALID_RESPONSE_CODE = 'google_rank_invalid_response';
const GOOGLE_RANK_LIMIT_REACHED_CODE = 'google_rank_limit_reached';
const GOOGLE_RANK_AUTO_RUN_NOT_FOUND_CODE = 'google_rank_auto_run_not_found';
const DEFAULT_COUNTRY = 'id';
const DEFAULT_LANGUAGE = 'id';
const GOOGLE_RANK_MONTHLY_LIMIT = 250;
const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};
const autoRuns = new Map();

const buildKnownError = ({ message, statusCode = 502, errorCode, details }) => {
  const error = new Error(message || 'Google Rank request failed.');
  error.statusCode = statusCode;
  error.errorCode = errorCode || 'google_rank_request_failed';
  if (details !== undefined) {
    error.details = details;
  }
  return error;
};

const normalizeCode = (value, fallback) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || fallback;
};

const getRequestedDevice = (isMobile) => (isMobile ? 'mobile' : 'desktop');

// SerpAPI's rendered result set is currently coming back swapped for this feature,
// so we normalize the provider-facing device separately from the user-facing label.
const getProviderDevice = (isMobile) => (isMobile ? 'desktop' : 'mobile');

const getTrackedRequests = (keyItem) => Math.max(0, Math.floor(Number(keyItem?.totalRequests) || 0));
const getRemainingRequests = (keyItem) => Math.max(GOOGLE_RANK_MONTHLY_LIMIT - getTrackedRequests(keyItem), 0);

const getActiveKeys = (settings) =>
  (settings?.googleRankApiKeys || []).filter(
    (item) => item?.isActive && String(item?.key || '').trim() && getTrackedRequests(item) < GOOGLE_RANK_MONTHLY_LIMIT
  );

const normalizeGoogleRankKeys = (settings) => {
  let changed = false;
  const currentMonthKey = getCurrentMonthKey();

  (settings?.googleRankApiKeys || []).forEach((item) => {
    if (String(item.usageMonthKey || '').trim() !== currentMonthKey) {
      item.usageMonthKey = currentMonthKey;
      item.totalRequests = 0;
      item.exhaustedAt = null;
      if (item.deactivatedByLimit) {
        item.isActive = true;
      }
      item.deactivatedByLimit = false;
      if (item.lastErrorCode === GOOGLE_RANK_LIMIT_REACHED_CODE) {
        item.lastError = '';
        item.lastErrorCode = '';
        item.lastErrorAt = null;
      }
      changed = true;
    }

    const trackedRequests = getTrackedRequests(item);

    if (Number(item.totalRequests) !== trackedRequests) {
      item.totalRequests = trackedRequests;
      changed = true;
    }

    if (trackedRequests >= GOOGLE_RANK_MONTHLY_LIMIT) {
      if (item.isActive) {
        item.isActive = false;
        changed = true;
      }
      if (!item.deactivatedByLimit) {
        item.deactivatedByLimit = true;
        changed = true;
      }
      if (!item.exhaustedAt) {
        item.exhaustedAt = new Date();
        changed = true;
      }
      if (!String(item.lastErrorCode || '').trim()) {
        item.lastErrorCode = GOOGLE_RANK_LIMIT_REACHED_CODE;
        changed = true;
      }
      if (!String(item.lastError || '').trim()) {
        item.lastError = `Google Rank key reached the monthly limit of ${GOOGLE_RANK_MONTHLY_LIMIT} requests.`;
        changed = true;
      }
      if (!item.lastErrorAt) {
        item.lastErrorAt = item.exhaustedAt || new Date();
        changed = true;
      }
    }
  });

  return changed;
};

const getOrderedKeys = (settings) => {
  const activeKeys = getActiveKeys(settings);
  if (!activeKeys.length) {
    return { activeKeys, orderedKeys: [], cursor: 0 };
  }

  const cursor = Math.max(0, Number(settings.googleRankActiveKeyCursor) || 0) % activeKeys.length;
  const orderedKeys = [
    ...activeKeys.slice(cursor),
    ...activeKeys.slice(0, cursor),
  ];

  return { activeKeys, orderedKeys, cursor };
};

const buildAvailabilityPayload = (settings) => {
  const allConfiguredKeys = settings?.googleRankApiKeys || [];
  const configuredKeysWithValue = allConfiguredKeys.filter((item) => String(item?.key || '').trim());
  const manuallyActiveKeys = configuredKeysWithValue.filter((item) => item?.isActive);
  const { activeKeys, cursor } = getOrderedKeys(settings);
  const currentKey = activeKeys.length ? activeKeys[cursor % activeKeys.length] : null;

  if (!configuredKeysWithValue.length) {
    return {
      available: false,
      message: 'Google Rank is unavailable because no active SerpAPI key is configured.',
      activeKeyCount: 0,
      currentKey: null,
    };
  }

  const activeKeysAtLimit = manuallyActiveKeys.filter((item) => getTrackedRequests(item) >= GOOGLE_RANK_MONTHLY_LIMIT);
  if (!activeKeys.length && manuallyActiveKeys.length && activeKeysAtLimit.length === manuallyActiveKeys.length) {
    return {
      available: false,
      message: `Google Rank is unavailable because all active SerpAPI keys have reached their ${GOOGLE_RANK_MONTHLY_LIMIT}-request monthly limit.`,
      activeKeyCount: 0,
      currentKey: null,
    };
  }

  if (!activeKeys.length) {
    return {
      available: false,
      message: 'Google Rank is unavailable because there is no usable active SerpAPI key.',
      activeKeyCount: 0,
      currentKey: null,
    };
  }

  return {
    available: true,
    message: '',
    activeKeyCount: activeKeys.length,
    currentKey: currentKey
      ? {
          _id: currentKey._id,
          name: currentKey.name,
          lastUsedAt: currentKey.lastUsedAt || null,
          exhaustedAt: currentKey.exhaustedAt || null,
          lastError: currentKey.lastError || '',
          lastErrorCode: currentKey.lastErrorCode || '',
          lastErrorAt: currentKey.lastErrorAt || null,
          totalRequests: getTrackedRequests(currentKey),
          monthlyLimit: GOOGLE_RANK_MONTHLY_LIMIT,
          remainingRequests: getRemainingRequests(currentKey),
        }
      : null,
  };
};

const isLimitMessage = (message) => {
  const normalizedMessage = String(message || '').trim().toLowerCase();
  return (
    normalizedMessage.includes('monthly searches limit reached') ||
    normalizedMessage.includes('searches limit reached') ||
    normalizedMessage.includes('plan calls exhausted') ||
    normalizedMessage.includes('quota exceeded') ||
    normalizedMessage.includes('limit reached')
  );
};

const deriveKeyErrorMeta = (error) => {
  if (error?.statusCode && error?.errorCode) {
    return {
      message: error.message || 'Google Rank request failed.',
      errorCode: error.errorCode,
      statusCode: error.statusCode,
      details: error.details,
    };
  }

  if (error?.response) {
    const statusCode = Number(error.response.status) || 502;
    const apiMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      `SerpAPI request failed with status ${statusCode}.`;

    return {
      message: apiMessage,
      errorCode:
        isLimitMessage(apiMessage) || statusCode === 429
          ? GOOGLE_RANK_LIMIT_REACHED_CODE
          : statusCode === 401 || statusCode === 403
          ? 'google_rank_key_invalid'
          : 'google_rank_api_error',
      statusCode:
        isLimitMessage(apiMessage) || statusCode === 429
          ? 503
          : statusCode >= 500
            ? 502
            : statusCode,
      details: error.response?.data,
    };
  }

  if (error?.code === 'ECONNABORTED') {
    return {
      message: 'Google Rank request timed out while contacting SerpAPI.',
      errorCode: 'google_rank_timeout',
      statusCode: 504,
      details: error.message,
    };
  }

  return {
    message: error?.message || 'Google Rank request failed.',
    errorCode: 'google_rank_request_failed',
    statusCode: 502,
    details: error?.details || undefined,
  };
};

const fetchGoogleRankResults = async ({ apiKey, query, gl, hl, device, num = 10 }) =>
  axios.get(SERPAPI_SEARCH_URL, {
    params: {
      api_key: apiKey,
      engine: 'google',
      q: query,
      gl,
      hl,
      num,
      device,
      no_cache: true,
    },
    timeout: 30000,
    maxBodyLength: Infinity,
  });

const getValidatedOrganicResults = (payload, { query }) => {
  if (!payload || typeof payload !== 'object') {
    throw buildKnownError({
      message: 'Google Rank stopped because SerpAPI returned an empty response.',
      statusCode: 502,
      errorCode: GOOGLE_RANK_INVALID_RESPONSE_CODE,
      details: {
        query,
        reason: 'empty_payload',
      },
    });
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    throw buildKnownError({
      message: payload.error.trim(),
      statusCode: 502,
      errorCode: 'google_rank_api_error',
      details: {
        query,
        provider: 'serpapi',
      },
    });
  }

  if (!Array.isArray(payload.organic_results)) {
    throw buildKnownError({
      message: 'Google Rank stopped because SerpAPI returned an invalid organic results payload.',
      statusCode: 502,
      errorCode: GOOGLE_RANK_INVALID_RESPONSE_CODE,
      details: {
        query,
        reason: 'missing_organic_results',
      },
    });
  }

  return payload.organic_results.filter((item) => item && typeof item === 'object');
};

const markKeyFailure = (keyItem, errorMeta) => {
  keyItem.lastError = errorMeta.message || 'Google Rank request failed.';
  keyItem.lastErrorCode = errorMeta.errorCode || 'google_rank_request_failed';
  keyItem.lastErrorAt = new Date();

  if (errorMeta.errorCode === GOOGLE_RANK_LIMIT_REACHED_CODE) {
    keyItem.totalRequests = GOOGLE_RANK_MONTHLY_LIMIT;
    keyItem.isActive = false;
    keyItem.deactivatedByLimit = true;
    keyItem.exhaustedAt = new Date();
    keyItem.lastError = `Google Rank key reached the monthly limit of ${GOOGLE_RANK_MONTHLY_LIMIT} requests.`;
  }
};

const markKeySuccess = (keyItem) => {
  const now = new Date();
  keyItem.lastUsedAt = now;
  keyItem.usageMonthKey = getCurrentMonthKey();
  keyItem.totalRequests = getTrackedRequests(keyItem) + 1;
  keyItem.deactivatedByLimit = false;
  keyItem.lastError = '';
  keyItem.lastErrorCode = '';
  keyItem.lastErrorAt = null;
  keyItem.exhaustedAt = null;

  if (keyItem.totalRequests >= GOOGLE_RANK_MONTHLY_LIMIT) {
    keyItem.totalRequests = GOOGLE_RANK_MONTHLY_LIMIT;
    keyItem.isActive = false;
    keyItem.deactivatedByLimit = true;
    keyItem.exhaustedAt = now;
    keyItem.lastError = `Google Rank key reached the monthly limit of ${GOOGLE_RANK_MONTHLY_LIMIT} requests.`;
    keyItem.lastErrorCode = GOOGLE_RANK_LIMIT_REACHED_CODE;
    keyItem.lastErrorAt = now;
  }
};

const withGoogleRankKey = async (requestFactory) => {
  const settings = await ensureSettings();
  const normalizedChanged = normalizeGoogleRankKeys(settings);
  const { activeKeys, orderedKeys, cursor } = getOrderedKeys(settings);

  if (!activeKeys.length) {
    if (normalizedChanged) {
      await settings.save();
    }
    throw buildKnownError({
      message: buildAvailabilityPayload(settings).message || 'Google Rank is unavailable because no active SerpAPI key is configured.',
      statusCode: 503,
      errorCode: GOOGLE_RANK_NO_KEYS_CODE,
      details: buildAvailabilityPayload(settings),
    });
  }

  const attemptedKeys = [];

  for (let index = 0; index < orderedKeys.length; index += 1) {
    const keyItem = orderedKeys[index];

    try {
      const response = await requestFactory({
        key: keyItem.key,
        keyItem,
      });

      markKeySuccess(keyItem);
      settings.googleRankActiveKeyCursor = activeKeys.length ? (cursor + index + 1) % activeKeys.length : 0;
      await settings.save();

      return {
        data: response?.data,
        keyId: String(keyItem._id),
        keyName: keyItem.name,
        keyTotalRequests: getTrackedRequests(keyItem),
      };
    } catch (error) {
      const errorMeta = deriveKeyErrorMeta(error);
      markKeyFailure(keyItem, errorMeta);
      attemptedKeys.push({
        keyId: String(keyItem._id),
        name: keyItem.name,
        error: errorMeta.message,
        code: errorMeta.errorCode,
      });
    }
  }

  settings.googleRankActiveKeyCursor = activeKeys.length ? (cursor + 1) % activeKeys.length : 0;
  await settings.save();

  throw buildKnownError({
    message: 'Google Rank is unavailable because all active SerpAPI keys failed.',
    statusCode: 503,
    errorCode: GOOGLE_RANK_ALL_KEYS_FAILED_CODE,
    details: {
      attemptedKeys,
      availability: buildAvailabilityPayload(settings),
    },
  });
};

const mapMatchedBrand = (domainItem) =>
  domainItem?.brand
    ? {
        _id: domainItem.brand._id,
        code: domainItem.brand.code,
        name: domainItem.brand.name,
        color: domainItem.brand.color,
      }
    : null;

const mapMatchedDomain = (domainItem) =>
  domainItem
    ? {
        _id: domainItem._id,
        domain: domainItem.domain,
        domainHostKey: domainItem.domainHostKey,
        domainRootKey: domainItem.domainRootKey,
      }
    : null;

const mapResultRow = (item, index, lookup, brandId) => {
  const link = item.link || '';
  const domainHost = extractHostFromLink(link);
  const explicitMatch = classifyResult(domainHost, lookup);
  const matchedBrand = mapMatchedBrand(explicitMatch.matchedDomain);
  const matchedDomain = mapMatchedDomain(explicitMatch.matchedDomain);
  const badge = matchedBrand && String(matchedBrand._id) === String(brandId) ? 'OWN' : 'UNKNOWN';

  return {
    rank: Number(item.position) || index + 1,
    title: item.title || '(No title)',
    snippet: item.snippet || '',
    link,
    domainHost,
    badge,
    matchType: explicitMatch.matchType,
    matchedBrand,
    matchedDomain,
  };
};

const summarizeResults = (results = []) => {
  const ownRows = results.filter((item) => item.badge === 'OWN');
  const ownCount = ownRows.length;
  const unknownCount = Math.max(results.length - ownCount, 0);
  const ownRanks = ownRows
    .map((item) => Number(item.rank))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    ownCount,
    unknownCount,
    bestOwnRank: ownRanks.length ? Math.min(...ownRanks) : null,
  };
};

const buildAutoBrandSummary = ({ brand, payload }) => {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const ownResults = results
    .filter((item) => item.badge === 'OWN')
    .map((item) => ({
      rank: item.rank,
      link: item.link,
      title: item.title,
      domainHost: item.domainHost,
      domain: item.matchedDomain?.domain || item.domainHost || '',
    }));
  const unknownResults = results
    .filter((item) => item.badge !== 'OWN')
    .map((item) => ({
      rank: item.rank,
      link: item.link,
      title: item.title,
      domainHost: item.domainHost,
    }));

  return {
    brand: {
      _id: brand._id,
      code: brand.code,
      name: brand.name,
      color: brand.color,
    },
    query: payload?.query || brand.code || brand.name,
    checkedAt: payload?.checkedAt || new Date().toISOString(),
    ownCount: ownResults.length,
    unknownCount: unknownResults.length,
    ownResults,
    unknownResults,
  };
};

const buildAutoRunSnapshot = (run) => ({
  runId: run.runId,
  status: run.status,
  startedAt: run.startedAt,
  updatedAt: run.updatedAt,
  checkedAt: run.checkedAt,
  params: run.params,
  totalBrands: run.totalBrands,
  processedBrands: run.processedBrands,
  completedCount: run.completedCount,
  failedCount: run.failedCount,
  activeBrandCode: run.activeBrandCode,
  activeBrandName: run.activeBrandName,
  results: run.results,
  errors: run.errors,
  stopRequested: run.stopRequested,
  error: run.error,
});

const buildAutoRun = ({ userId, brands, country = DEFAULT_COUNTRY, language = DEFAULT_LANGUAGE, isMobile = true }) => ({
  runId: randomUUID(),
  userId: String(userId),
  status: 'pending',
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  checkedAt: null,
  params: {
    gl: normalizeCode(country, DEFAULT_COUNTRY),
    hl: normalizeCode(language, DEFAULT_LANGUAGE),
    device: getRequestedDevice(isMobile),
  },
  totalBrands: brands.length,
  processedBrands: 0,
  completedCount: 0,
  failedCount: 0,
  activeBrandCode: '',
  activeBrandName: '',
  results: [],
  errors: [],
  stopRequested: false,
  error: '',
});

const processAutoRun = async (run, brands, { country = DEFAULT_COUNTRY, language = DEFAULT_LANGUAGE, isMobile = true } = {}) => {
  run.status = 'running';
  run.updatedAt = new Date().toISOString();

  for (let index = 0; index < brands.length; index += 1) {
    if (run.stopRequested) {
      run.status = 'stopped';
      run.activeBrandCode = '';
      run.activeBrandName = '';
      run.updatedAt = new Date().toISOString();
      run.checkedAt = run.updatedAt;
      return;
    }

    const brand = brands[index];
    run.activeBrandCode = brand.code || '';
    run.activeBrandName = brand.name || '';
    run.updatedAt = new Date().toISOString();

    try {
      const payload = await searchGoogleRankForBrand({
        brandId: brand._id,
        query: brand.code || brand.name,
        country,
        language,
        isMobile,
        trigger: 'auto',
      });

      run.results.push(buildAutoBrandSummary({ brand, payload }));
      run.completedCount += 1;
    } catch (error) {
      run.failedCount += 1;
      run.errors.push({
        brand: {
          _id: brand._id,
          code: brand.code,
          name: brand.name,
          color: brand.color,
        },
        error: error.message || 'Google Rank auto run failed for this brand.',
        code: error.errorCode || '',
      });

      if (error?.statusCode >= 500 || error?.errorCode === GOOGLE_RANK_NO_KEYS_CODE || error?.errorCode === GOOGLE_RANK_ALL_KEYS_FAILED_CODE) {
        run.status = 'failed';
        run.error = error.message || 'Google Rank auto run stopped.';
        run.processedBrands = index + 1;
        run.activeBrandCode = '';
        run.activeBrandName = '';
        run.updatedAt = new Date().toISOString();
        run.checkedAt = run.updatedAt;
        return;
      }
    }

    run.processedBrands = index + 1;
    run.updatedAt = new Date().toISOString();
  }

  run.status = 'completed';
  run.activeBrandCode = '';
  run.activeBrandName = '';
  run.updatedAt = new Date().toISOString();
  run.checkedAt = run.updatedAt;
};

const searchGoogleRankForBrand = async ({
  brandId,
  query,
  country = DEFAULT_COUNTRY,
  language = DEFAULT_LANGUAGE,
  isMobile = true,
  trigger = 'manual',
}) => {
  const brand = await findBrandById(brandId);
  if (!brand) {
    throw buildKnownError({
      message: 'Active brand not found',
      statusCode: 404,
      errorCode: 'google_rank_brand_not_found',
    });
  }

  const queryValue = String(query || '').trim() || brand.code || brand.name;
  const params = {
    gl: normalizeCode(country, DEFAULT_COUNTRY),
    hl: normalizeCode(language, DEFAULT_LANGUAGE),
    num: 10,
    device: getRequestedDevice(isMobile),
  };
  const providerParams = {
    ...params,
    device: getProviderDevice(isMobile),
  };

  const { data, keyId, keyName, keyTotalRequests } = await withGoogleRankKey(({ key }) =>
    fetchGoogleRankResults({
      apiKey: key,
      query: queryValue,
      ...providerParams,
    })
  );

  const organicResults = getValidatedOrganicResults(data, { query: queryValue }).slice(0, 10);
  const activeDomains = await attachBrands(await Domain.find({ isActive: true }).lean());
  const lookup = buildLookup(activeDomains.filter((item) => item.brand));

  const results = organicResults.map((item, index) => mapResultRow(item, index, lookup, brand._id));
  const checkedAt = new Date().toISOString();
  const summary = summarizeResults(results);
  let googleRankResultId = null;

  if (trigger === 'auto') {
    const savedResult = await GoogleRankResult.create({
      brand: brand._id,
      query: queryValue,
      trigger,
      checkedAt: new Date(checkedAt),
      params,
      keyId,
      keyName,
      keyTotalRequests,
      keyMonthlyLimit: GOOGLE_RANK_MONTHLY_LIMIT,
      ...summary,
      results,
    });
    googleRankResultId = savedResult?._id ? String(savedResult._id) : null;
  }

  return {
    provider: 'serpapi',
    brand: {
      _id: brand._id,
      code: brand.code,
      name: brand.name,
      color: brand.color,
    },
    query: queryValue,
    params,
    checkedAt,
    keyId,
    keyName,
    keyTotalRequests,
    keyMonthlyLimit: GOOGLE_RANK_MONTHLY_LIMIT,
    googleRankResultId,
    ...summary,
    results,
  };
};

const getGoogleRankAvailability = async () => {
  const settings = await ensureSettings();
  if (normalizeGoogleRankKeys(settings)) {
    await settings.save();
  }
  return buildAvailabilityPayload(settings);
};

const startAutoGoogleRankRun = async ({
  userId,
  country = DEFAULT_COUNTRY,
  language = DEFAULT_LANGUAGE,
  isMobile = true,
}) => {
  const brands = await listBrands();
  const run = buildAutoRun({ userId, brands, country, language, isMobile });
  autoRuns.set(run.runId, run);

  processAutoRun(run, brands, { country, language, isMobile }).catch((error) => {
    run.status = 'failed';
    run.error = error.message || 'Auto Google Rank run failed.';
    run.activeBrandCode = '';
    run.activeBrandName = '';
    run.updatedAt = new Date().toISOString();
    run.checkedAt = run.updatedAt;
  });

  return buildAutoRunSnapshot(run);
};

const getAutoGoogleRankRun = async ({ userId, runId }) => {
  const run = autoRuns.get(String(runId));
  if (!run || run.userId !== String(userId)) {
    throw buildKnownError({
      message: 'Auto Google Rank run not found.',
      statusCode: 404,
      errorCode: GOOGLE_RANK_AUTO_RUN_NOT_FOUND_CODE,
    });
  }

  return buildAutoRunSnapshot(run);
};

const stopAutoGoogleRankRun = async ({ userId, runId }) => {
  const run = autoRuns.get(String(runId));
  if (!run || run.userId !== String(userId)) {
    throw buildKnownError({
      message: 'Auto Google Rank run not found.',
      statusCode: 404,
      errorCode: GOOGLE_RANK_AUTO_RUN_NOT_FOUND_CODE,
    });
  }

  if (run.status === 'pending' || run.status === 'running') {
    run.stopRequested = true;
    run.updatedAt = new Date().toISOString();
  }

  return buildAutoRunSnapshot(run);
};

module.exports = {
  searchGoogleRankForBrand,
  getGoogleRankAvailability,
  startAutoGoogleRankRun,
  getAutoGoogleRankRun,
  stopAutoGoogleRankRun,
};
