const axios = require('axios');

const DEFAULT_CHECK_URL = 'https://nawalacp.com/check';
const PUBLIC_TRUST_POSITIF_URL = 'https://trustpositif.komdigi.go.id/';
const MAX_BATCH_SIZE = 5;
const MAX_DOMAINS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeDomain = (raw) => {
  let value = String(raw || '').trim().toLowerCase();
  value = value.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  value = value.split(/[/?#]/)[0].replace(/\.+$/g, '');

  if (!value || value.length < 3 || !value.includes('.')) {
    return '';
  }

  return value;
};

const parseDomainsInput = (input) => {
  const rawValues = Array.isArray(input)
    ? input
    : String(input || '').split(/[\n,\r;\s]+/);

  return [
    ...new Set(
      rawValues
        .map((value) => normalizeDomain(value))
        .filter(Boolean)
    ),
  ];
};

const getCheckUrl = () =>
  String(process.env.TRUST_POSITIF_CHECK_URL || process.env.NAWALA_CHECK_URL || DEFAULT_CHECK_URL).trim();

const getPublicSourceUrl = () =>
  String(process.env.TRUST_POSITIF_PUBLIC_URL || PUBLIC_TRUST_POSITIF_URL).trim();

const normalizeStatus = (value) => {
  const text = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

  if (['ada', 'blocked', 'block', 'diblokir', 'terblokir'].includes(text)) {
    return 'ada';
  }

  if (
    [
      'tidak ada',
      'not blocked',
      'not blocked',
      'safe',
      'aman',
      'clear',
      'clean',
      'tidak diblokir',
      'tidak terblokir',
    ].includes(text)
  ) {
    return 'tidak ada';
  }

  if (text === 'true') {
    return 'ada';
  }

  if (text === 'false') {
    return 'tidak ada';
  }

  return 'unknown';
};

const statusToLabel = (status) => {
  if (status === 'ada') return 'Blocked';
  if (status === 'tidak ada') return 'Not Blocked';
  if (status === 'error') return 'Error';
  return 'Unknown';
};

const buildResultRow = ({
  domain,
  status,
  sourceStatus = '',
  checkedAt,
  batchNumber,
  error = '',
}) => {
  const normalizedStatus = status === 'error' ? 'error' : normalizeStatus(status);

  return {
    domain,
    status: normalizedStatus,
    label: statusToLabel(normalizedStatus),
    blocked: normalizedStatus === 'ada' ? true : normalizedStatus === 'tidak ada' ? false : null,
    sourceStatus: String(sourceStatus || status || ''),
    checkedAt,
    batchNumber,
    error,
  };
};

const findStatusForDomain = (resultMap, domain) => {
  if (!resultMap || typeof resultMap !== 'object') {
    return undefined;
  }

  if (resultMap[domain] !== undefined) {
    return resultMap[domain];
  }

  const normalizedDomain = normalizeDomain(domain);
  const matchedKey = Object.keys(resultMap).find((key) => normalizeDomain(key) === normalizedDomain);

  return matchedKey ? resultMap[matchedKey] : undefined;
};

const parseArrayResults = (items = [], batchDomains, checkedAt, batchNumber) => {
  const rowsByDomain = new Map();

  items.forEach((item) => {
    const domain = normalizeDomain(item?.domain || item?.Domain || item?.url || item?.URL || item?.host);
    if (!domain) {
      return;
    }

    const sourceStatus =
      item?.status ||
      item?.Status ||
      item?.result ||
      item?.label ||
      item?.blocked ||
      item?.isBlocked ||
      item?.scanResult?.isBlocked;

    rowsByDomain.set(
      domain,
      buildResultRow({
        domain,
        status: sourceStatus,
        sourceStatus,
        checkedAt,
        batchNumber,
      })
    );
  });

  return batchDomains.map((domain) => rowsByDomain.get(domain) || buildResultRow({
    domain,
    status: 'unknown',
    sourceStatus: 'Missing result',
    checkedAt,
    batchNumber,
  }));
};

const parseProviderResults = (payload, batchDomains, checkedAt, batchNumber) => {
  if (payload?.results && !Array.isArray(payload.results) && typeof payload.results === 'object') {
    return batchDomains.map((domain) => {
      const sourceStatus = findStatusForDomain(payload.results, domain);

      return buildResultRow({
        domain,
        status: sourceStatus,
        sourceStatus: sourceStatus === undefined ? 'Missing result' : sourceStatus,
        checkedAt,
        batchNumber,
      });
    });
  }

  if (Array.isArray(payload?.results)) {
    return parseArrayResults(payload.results, batchDomains, checkedAt, batchNumber);
  }

  if (Array.isArray(payload?.data)) {
    return parseArrayResults(payload.data, batchDomains, checkedAt, batchNumber);
  }

  if (Array.isArray(payload)) {
    return parseArrayResults(payload, batchDomains, checkedAt, batchNumber);
  }

  return batchDomains.map((domain) => buildResultRow({
    domain,
    status: 'unknown',
    sourceStatus: 'Unrecognized response',
    checkedAt,
    batchNumber,
  }));
};

const summarizeRows = (rows = []) => {
  const summary = {
    total: rows.length,
    blocked: 0,
    notBlocked: 0,
    unknown: 0,
    errors: 0,
  };

  rows.forEach((row) => {
    if (row.status === 'ada') {
      summary.blocked += 1;
    } else if (row.status === 'tidak ada') {
      summary.notBlocked += 1;
    } else if (row.status === 'error') {
      summary.errors += 1;
    } else {
      summary.unknown += 1;
    }
  });

  return summary;
};

const checkBatch = async ({ domains, batchNumber, checkUrl, timeoutMs }) => {
  const checkedAt = new Date().toISOString();

  try {
    const response = await axios.post(
      checkUrl,
      { domains },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': '200M-Rank-Checker/1.0',
        },
        timeout: timeoutMs,
      }
    );
    const results = parseProviderResults(response.data, domains, checkedAt, batchNumber);

    return {
      batchNumber,
      checkedAt,
      totalDomains: domains.length,
      results,
      summary: summarizeRows(results),
    };
  } catch (error) {
    const message = error.response?.data?.error || error.response?.data?.message || error.message || 'TrustPositif check failed';
    const results = domains.map((domain) => buildResultRow({
      domain,
      status: 'error',
      sourceStatus: 'Request failed',
      checkedAt,
      batchNumber,
      error: message,
    }));

    return {
      batchNumber,
      checkedAt,
      totalDomains: domains.length,
      results,
      summary: summarizeRows(results),
      error: message,
    };
  }
};

const checkTrustPositifDomains = async ({ domains, batchSize = MAX_BATCH_SIZE } = {}) => {
  const parsedDomains = parseDomainsInput(domains);

  if (!parsedDomains.length) {
    const error = new Error('No valid domains found for TrustPositif check');
    error.statusCode = 400;
    throw error;
  }

  if (parsedDomains.length > MAX_DOMAINS) {
    const error = new Error(`Maximum ${MAX_DOMAINS} domains allowed per TrustPositif check`);
    error.statusCode = 400;
    throw error;
  }

  const normalizedBatchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Number.isFinite(Number(batchSize)) ? Number(batchSize) : MAX_BATCH_SIZE)
  );
  const checkUrl = getCheckUrl();
  const sourceUrl = getPublicSourceUrl();
  const timeoutMs = Math.max(5000, Number(process.env.TRUST_POSITIF_TIMEOUT_MS) || 30000);
  const batches = [];

  for (let index = 0; index < parsedDomains.length; index += normalizedBatchSize) {
    const batchDomains = parsedDomains.slice(index, index + normalizedBatchSize);
    const batch = await checkBatch({
      domains: batchDomains,
      batchNumber: batches.length + 1,
      checkUrl,
      timeoutMs,
    });

    batches.push(batch);

    if (index + normalizedBatchSize < parsedDomains.length) {
      await sleep(Math.max(0, Number(process.env.TRUST_POSITIF_BATCH_DELAY_MS) || 250));
    }
  }

  const results = batches.flatMap((batch) => batch.results);
  const summary = summarizeRows(results);

  return {
    sourceUrl,
    checkUrl,
    batchSize: normalizedBatchSize,
    totalBatches: batches.length,
    checkedAt: new Date().toISOString(),
    summary,
    batches,
    results,
  };
};

module.exports = {
  checkTrustPositifDomains,
  normalizeDomain,
  parseDomainsInput,
};
