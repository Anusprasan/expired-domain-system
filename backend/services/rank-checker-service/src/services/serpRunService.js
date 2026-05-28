const { randomUUID } = require('crypto');
const Domain = require('../models/Domain');
const SerpRun = require('../models/SerpRun');
const { extractHostFromLink } = require('../utils/domain');
const { attachBrands, findBrandById, listBrands } = require('./systemBrandService');
const {
  fetchSerpResults,
  buildLookup,
  classifyResult,
  getValidatedOrganicResults,
} = require('./serpService');

const MAX_BULK_DOMAINS = 5000;
const OWNERSHIP_MATCH_VERSION = 'saved-domain-only-v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanDomain = (raw) => {
  if (!raw) return null;
  let value = String(raw).trim().toLowerCase();
  value = value.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  value = value.split('/')[0].split('?')[0].split('#')[0];
  if (!value || value.length < 3 || !value.includes('.')) return null;
  return value;
};

const parseDomainsInput = (input) => {
  const values = String(input || '')
    .split(/[\n,\r]+/)
    .map((value) => cleanDomain(value))
    .filter(Boolean);

  return [...new Set(values)];
};

const extractResultCount = (payload) => {
  if (Array.isArray(payload?.organic)) {
    return payload.organic.length;
  }

  const numeric = Number.parseInt(String(payload?.searchInformation?.totalResults || '').replace(/,/g, ''), 10);
  return Number.isFinite(numeric) ? numeric : 0;
};

const buildResponsePayload = ({
  brand,
  query,
  checkedAt,
  params,
  results,
  serpRunId = null,
  keyId = null,
  keyName = '',
  keyRemaining = null,
}) => ({
  brand: {
    _id: brand._id,
    code: brand.code,
    name: brand.name,
    color: brand.color,
  },
  query,
  params,
  checkedAt,
  serpRunId,
  keyId,
  keyName,
  keyRemaining,
  results,
});

const summarizeResults = (results) => {
  const ownRows = results.filter((item) => item.badge === 'OWN');

  return {
    ownCount: ownRows.length,
    unknownCount: results.filter((item) => item.badge === 'UNKNOWN').length,
    bestOwnRank: ownRows.length ? Math.min(...ownRows.map((item) => item.rank)) : null,
  };
};

const buildLiveResultPreview = (results = []) =>
  results.slice(0, 3).map((item) => ({
    rank: item.rank,
    title: item.title || '(No title)',
    domainHost: item.domainHost || '',
    badge: item.badge || 'UNKNOWN',
    link: item.link || '',
    matchedBrandCode: item.matchedBrand?.code || null,
  }));

const createSerpRunService = ({ cache, keyRotationService }) => {
  const bulkRuns = new Map();

  const getBulkRunSnapshot = (run) => ({
    runId: run.runId,
    status: run.status,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    checkedAt: run.checkedAt,
    minResults: run.minResults,
    total: run.total,
    current: run.current,
    activeDomain: run.activeDomain,
    passedCount: run.passedCount,
    failedCount: run.failedCount,
    recent: run.recent,
    passed: run.passed,
    failed: run.failed,
    error: run.error,
  });

  const processBulkRun = async (run, { country = 'id', isMobile = false } = {}) => {
    const countryCode = (country || 'id').toLowerCase();
    const device = isMobile ? 'mobile' : 'desktop';

    run.status = 'running';
    run.updatedAt = new Date().toISOString();

    for (let i = 0; i < run.domains.length; i += 1) {
      if (run.stopRequested) {
        run.status = 'stopped';
        run.activeDomain = '';
        run.updatedAt = new Date().toISOString();
        run.checkedAt = run.updatedAt;
        return;
      }

      const domain = run.domains[i];
      run.activeDomain = domain;
      run.updatedAt = new Date().toISOString();

      let row;
      try {
        const { data: serpData } = await keyRotationService.withRotatingKey(({ key }) =>
          fetchSerpResults({
            apiKey: key,
            query: `site:${domain}`,
            gl: countryCode,
            hl: countryCode,
            num: 10,
            device,
          }).then((response) => {
            getValidatedOrganicResults(response.data, {
              query: `site:${domain}`,
            }); 
            return response;
          })
        );

        const count = extractResultCount(serpData);
        row = {
          domain,
          count,
          passed: count >= run.minResults,
        };
      } catch (error) {
        row = {
          domain,
          count: 0,
          passed: false,
          error: error.response?.data?.message || error.message || 'Check failed',
        };

        if (keyRotationService.isBlockingAvailabilityError?.(error)) {
          run.status = 'failed';
          run.error = row.error;
          run.activeDomain = '';
          run.updatedAt = new Date().toISOString();
          run.checkedAt = run.updatedAt;
          throw error;
        }
      }

      run.current = i + 1;
      if (row.passed) {
        run.passed.push(row);
      } else {
        run.failed.push(row);
      }
      run.passedCount = run.passed.length;
      run.failedCount = run.failed.length;
      run.recent.push(row);
      if (run.recent.length > 20) run.recent.shift();
      run.updatedAt = new Date().toISOString();

      if (i < run.domains.length - 1) {
        await sleep(150);
      }
    }

    run.status = 'completed';
    run.activeDomain = '';
    run.updatedAt = new Date().toISOString();
    run.checkedAt = run.updatedAt;
  };

  const runCheckForBrand = async ({
    brandId,
    query,
    country = 'id',
    isMobile = false,
    trigger = 'manual',
    skipCache = false,
  }) => {
    const brand = await findBrandById(brandId);
    if (!brand) {
      const error = new Error('Active brand not found');
      error.statusCode = 404;
      throw error;
    }

    const queryValue = query?.trim() || brand.code || brand.name;
    const countryCode = (country || 'id').toLowerCase();
    const params = { gl: countryCode, hl: 'id', num: 10, device: isMobile ? 'mobile' : 'desktop' };
    const cacheKey = `${OWNERSHIP_MATCH_VERSION}::${brand._id.toString()}::${queryValue}::${params.gl}::${params.hl}::${params.device}`;

    if (!skipCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    const { data: serpData, keyId, keyName, keyRemaining } = await keyRotationService.withRotatingKey(({ key }) =>
      fetchSerpResults({ apiKey: key, query: queryValue, ...params }).then((response) => {
        getValidatedOrganicResults(response.data, {
          query: queryValue,
        });
       console.log(response.data);
        return response;
      })
    );

    const organicResults = getValidatedOrganicResults(serpData, {
      query: queryValue,
    }).slice(0, 10);
    const activeDomains = await attachBrands(await Domain.find({ isActive: true }).lean());
    const lookup = buildLookup(activeDomains.filter((item) => item.brand));

    const results = organicResults.map((item, index) => {
      const link = item.link || item.redirect_link || '';
      const domainHost = extractHostFromLink(link);
      const explicitMatch = classifyResult(domainHost, lookup);
      const matchedDomain = explicitMatch.matchedDomain;
      const matchType = explicitMatch.matchType;

      const matchedBrand = matchedDomain?.brand
        ? {
            _id: matchedDomain.brand._id,
            code: matchedDomain.brand.code,
            name: matchedDomain.brand.name,
            color: matchedDomain.brand.color,
          }
        : null;

      const badge = matchedBrand && matchedBrand._id.toString() === brand._id.toString() ? 'OWN' : 'UNKNOWN';

      return {
        rank: index + 1,
        title: item.title || '(No title)',
        snippet: item.snippet || '',
        link,
        domainHost,
        badge,
        matchType,
        matchedBrand,
        matchedDomain: matchedDomain
          ? {
              _id: matchedDomain._id,
              domain: matchedDomain.domain,
              domainHostKey: matchedDomain.domainHostKey,
              domainRootKey: matchedDomain.domainRootKey,
            }
          : null,
      };
    });

    const checkedAt = new Date().toISOString();
    const summary = summarizeResults(results);

    let serpRunId = null;

    if (trigger === 'auto') {
      const savedRun = await SerpRun.create({
        brand: brand._id,
        query: queryValue,
        trigger,
        checkedAt: new Date(checkedAt),
        params,
        keyId,
        keyName,
        keyRemaining,
        ...summary,
        results,
      });
      serpRunId = savedRun?._id ? String(savedRun._id) : null;
    }

    const payload = buildResponsePayload({
      brand,
      query: queryValue,
      checkedAt,
      params,
      results,
      serpRunId,
      keyId,
      keyName,
      keyRemaining,
    });

    cache.set(cacheKey, payload);
    return payload;
  };

  const runAutoCheckForAllBrands = async ({ shouldStop, onProgress } = {}) => {
    const brands = await listBrands();
    const outcomes = [];
    let stopped = false;
    const totalBrands = brands.length;
    let processedBrands = 0;
    let previewBrandCode = null;
    let previewBrandName = null;
    let previewResults = [];
    let previewOk = null;
    let previewError = null;
    let previewCheckedAt = null;

    try {
      await keyRotationService.assertAvailability?.();
    } catch (error) {
      if (keyRotationService.isBlockingAvailabilityError?.(error)) {
        return {
          outcomes,
          stopped: true,
          availabilityError: {
            message: error.message || 'Serper is unavailable',
            code: error.errorCode || null,
            serperAvailability: error.serperAvailability || null,
          },
        };
      }

      throw error;
    }

    for (const brand of brands) {
      if (shouldStop?.()) {
        stopped = true;
        break;
      }

      onProgress?.({
        processedBrands,
        totalBrands,
        brandCode: brand.code,
        brandName: brand.name,
        stage: 'starting',
        previewBrandCode,
        previewBrandName,
        previewResults,
        previewOk,
        previewError,
        previewCheckedAt,
      });

      try {
        const payload = await runCheckForBrand({
          brandId: brand._id,
          query: brand.code || brand.name,
          trigger: 'auto',
          skipCache: true,
        });
        previewBrandCode = brand.code;
        previewBrandName = brand.name;
        previewResults = buildLiveResultPreview(payload.results || []);
        previewOk = true;
        previewError = null;
        previewCheckedAt = payload.checkedAt || new Date().toISOString();
        outcomes.push({
          brandId: brand._id,
          brandCode: brand.code,
          ok: true,
          checkedAt: payload.checkedAt,
          serpRunId: payload.serpRunId || null,
        });
      } catch (error) {
        previewBrandCode = brand.code;
        previewBrandName = brand.name;
        previewResults = [];
        previewOk = false;
        previewError = error.message || 'Auto-check failed';
        previewCheckedAt = new Date().toISOString();
        outcomes.push({ brandId: brand._id, brandCode: brand.code, ok: false, error: error.message });

        processedBrands += 1;
        onProgress?.({
          processedBrands,
          totalBrands,
          brandCode: brand.code,
          brandName: brand.name,
          stage: 'completed',
          previewBrandCode,
          previewBrandName,
          previewResults,
          previewOk,
          previewError,
          previewCheckedAt,
        });

        if (keyRotationService.isBlockingAvailabilityError?.(error)) {
          stopped = true;
          return {
            outcomes,
            stopped,
            availabilityError: {
              message: error.message || 'Serper is unavailable',
              code: error.errorCode || null,
              serperAvailability: error.serperAvailability || null,
            },
          };
        }

        continue;
      }

      processedBrands += 1;
      onProgress?.({
        processedBrands,
        totalBrands,
        brandCode: brand.code,
        brandName: brand.name,
        stage: 'completed',
        previewBrandCode,
        previewBrandName,
        previewResults,
        previewOk,
        previewError,
        previewCheckedAt,
      });
    }

    return { outcomes, stopped };
  };

  const buildBulkRun = ({ userId, parsedDomains, minResults }) => ({
    runId: randomUUID(),
    userId: String(userId),
    status: 'pending',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    checkedAt: null,
    minResults,
    domains: parsedDomains,
    total: parsedDomains.length,
    current: 0,
    activeDomain: '',
    passedCount: 0,
    failedCount: 0,
    passed: [],
    failed: [],
    recent: [],
    error: '',
    stopRequested: false,
  });

  const runBulkDomainCheck = async ({
    domains,
    minResults = 3,
    country = 'id',
    isMobile = false,
  }) => {
    const parsedDomains = parseDomainsInput(domains);
    if (!parsedDomains.length) {
      const error = new Error('No valid domains found in input');
      error.statusCode = 400;
      throw error;
    }

    if (parsedDomains.length > MAX_BULK_DOMAINS) {
      const error = new Error(`Maximum ${MAX_BULK_DOMAINS} domains allowed per check`);
      error.statusCode = 400;
      throw error;
    }

    await keyRotationService.assertAvailability?.();

    const threshold = Number.isFinite(Number(minResults)) ? Math.max(1, Number(minResults)) : 3;
    const run = buildBulkRun({ userId: 'sync', parsedDomains, minResults: threshold });
    await processBulkRun(run, { country, isMobile });

    return {
      total: run.total,
      minResults: run.minResults,
      checkedAt: run.checkedAt || new Date().toISOString(),
      passed: run.passed,
      failed: run.failed,
    };
  };

  const startBulkDomainCheck = async ({
    userId,
    domains,
    minResults = 3,
    country = 'id',
    isMobile = false,
  }) => {
    const parsedDomains = parseDomainsInput(domains);
    if (!parsedDomains.length) {
      const error = new Error('No valid domains found in input');
      error.statusCode = 400;
      throw error;
    }

    if (parsedDomains.length > MAX_BULK_DOMAINS) {
      const error = new Error(`Maximum ${MAX_BULK_DOMAINS} domains allowed per check`);
      error.statusCode = 400;
      throw error;
    }

    await keyRotationService.assertAvailability?.();

    const threshold = Number.isFinite(Number(minResults)) ? Math.max(1, Number(minResults)) : 3;
    const run = buildBulkRun({ userId, parsedDomains, minResults: threshold });

    bulkRuns.set(run.runId, run);

    processBulkRun(run, { country, isMobile }).catch((error) => {
      run.status = 'failed';
      run.error = error.message || 'Bulk run failed';
      run.activeDomain = '';
      run.updatedAt = new Date().toISOString();
      run.checkedAt = run.updatedAt;
    });

    return getBulkRunSnapshot(run);
  };

  const getBulkDomainCheck = async ({ userId, runId }) => {
    const run = bulkRuns.get(String(runId));
    if (!run || run.userId !== String(userId)) {
      const error = new Error('Bulk run not found');
      error.statusCode = 404;
      throw error;
    }

    return getBulkRunSnapshot(run);
  };

  const stopBulkDomainCheck = async ({ userId, runId }) => {
    const run = bulkRuns.get(String(runId));
    if (!run || run.userId !== String(userId)) {
      const error = new Error('Bulk run not found');
      error.statusCode = 404;
      throw error;
    }

    if (run.status === 'running' || run.status === 'pending') {
      run.stopRequested = true;
      run.updatedAt = new Date().toISOString();
    }

    return getBulkRunSnapshot(run);
  };

  return {
    runCheckForBrand,
    runAutoCheckForAllBrands,
    runBulkDomainCheck,
    startBulkDomainCheck,
    getBulkDomainCheck,
    stopBulkDomainCheck,
  };
};

module.exports = {
  createSerpRunService,
};
