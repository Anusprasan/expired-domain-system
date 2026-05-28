const axios = require('axios');
const { extractHostFromLink } = require('../utils/domain');

const SERPER_URL = 'https://google.serper.dev/search';
const SERPER_INVALID_RESPONSE_CODE = 'serper_invalid_response';

const buildLookup = (domains) => {
  const mapExactHostKey = new Map();
  const listDomainsSortedByLengthDesc = [...domains].sort(
    (a, b) => b.domainHostKey.length - a.domainHostKey.length
  );

  domains.forEach((item) => {
    mapExactHostKey.set(item.domainHostKey, item);
  });

  return {
    mapExactHostKey,
    listDomainsSortedByLengthDesc,
  };
};

const resolveBestMatch = (candidates) => {
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.domainHostKey.length - a.domainHostKey.length)[0];
};

const classifyResult = (resultHost, lookup) => {
  if (!resultHost) {
    return { matchedDomain: null, matchType: 'none' };
  }

  const exact = lookup.mapExactHostKey.get(resultHost);
  if (exact) {
    return { matchedDomain: exact, matchType: 'exact' };
  }

  const suffixCandidates = [];
  lookup.listDomainsSortedByLengthDesc.forEach((domainItem) => {
    if (resultHost === domainItem.domainHostKey || resultHost.endsWith(`.${domainItem.domainHostKey}`)) {
      suffixCandidates.push(domainItem);
    }
  });

  const suffix = resolveBestMatch(
    suffixCandidates.filter((item, index, arr) => arr.findIndex((x) => x._id.toString() === item._id.toString()) === index)
  );

  if (suffix) {
    return { matchedDomain: suffix, matchType: 'suffix' };
  }

  return { matchedDomain: null, matchType: 'none' };
};

const createSerperInvalidResponseError = (message, details = {}) => {
  const error = new Error(message || 'Serper returned an invalid response.');
  error.statusCode = 502;
  error.errorCode = SERPER_INVALID_RESPONSE_CODE;
  error.details = details;
  return error;
};

const getValidatedOrganicResults = (payload, { query = '' } = {}) => {
  if (!payload || typeof payload !== 'object') {
    throw createSerperInvalidResponseError('Rank Checker stopped because Serper returned an empty response.', {
      query,
      reason: 'empty_payload',
    });
  }

  if (!Array.isArray(payload.organic)) {
    throw createSerperInvalidResponseError(
      'Rank Checker stopped because Serper returned an invalid organic results payload.',
      {
        query,
        reason: 'missing_organic_array',
      }
    );
  }

  const organicResults = payload.organic.filter((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const link = item.link || item.redirect_link || '';
    return Boolean(link || extractHostFromLink(link) || item.title || item.snippet);
  });

  return organicResults;
};

const fetchSerpResults = async ({ apiKey, query, gl = 'id', hl = 'id', num = 10, device = 'desktop' }) =>
  axios.post(
    SERPER_URL,
    {
      q: query,
      gl,
      hl,
      num,
      device,
    },
    {
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
      maxBodyLength: Infinity,
    }
  );


module.exports = {
  fetchSerpResults,
  buildLookup,
  classifyResult,
  getValidatedOrganicResults,
  createSerperInvalidResponseError,
  SERPER_INVALID_RESPONSE_CODE,
};
