const Domain = require('../models/Domain');
const GoogleRankResult = require('../models/GoogleRankResult');
const SerpRun = require('../models/SerpRun');
const { findBrandById } = require('../services/systemBrandService');

const RANGE_TO_DAYS = {
  '1d': 1,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

const computeTrend = (firstRank, lastRank) => {
  if (firstRank === null || lastRank === null) {
    return { trend: 'no_data', delta: null };
  }

  const delta = firstRank - lastRank;
  if (delta > 0) return { trend: 'up', delta };
  if (delta < 0) return { trend: 'down', delta };
  return { trend: 'stable', delta: 0 };
};

const computeRankMovement = (previousRank, currentRank) => {
  if (previousRank === null || currentRank === null) {
    return { trend: 'no_data', delta: null };
  }

  const delta = previousRank - currentRank;
  if (delta > 0) return { trend: 'up', delta };
  if (delta < 0) return { trend: 'down', delta };
  return { trend: 'stable', delta: 0 };
};

const normalizeDomainValue = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const withProtocol = raw.includes('://') ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.replace(/\.$/, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  }
};

const getDomainRankForRun = (run, domainItem) => {
  const expectedHostKey = String(domainItem?.domainHostKey || '').trim().toLowerCase();
  const expectedDomain = normalizeDomainValue(domainItem?.domain);

  const matchedRanks = (run?.results || [])
    .filter((row) => row?.badge === 'OWN')
    .filter((row) => {
      const matchedHostKey = String(row?.matchedDomain?.domainHostKey || '').trim().toLowerCase();
      if (expectedHostKey && matchedHostKey) {
        return matchedHostKey === expectedHostKey;
      }

      const matchedDomain = normalizeDomainValue(
        row?.matchedDomain?.domain || row?.domainHost || row?.link || ''
      );

      if (!expectedDomain || !matchedDomain) {
        return false;
      }

      return (
        matchedDomain === expectedDomain ||
        matchedDomain.endsWith(`.${expectedDomain}`) ||
        expectedDomain.endsWith(`.${matchedDomain}`)
      );
    })
    .map((row) => Number(row?.rank))
    .filter((value) => Number.isFinite(value) && value > 0);

  return matchedRanks.length ? Math.min(...matchedRanks) : null;
};

const buildMissingGoogleRankDomains = (brandDomains, runsDesc) =>
  brandDomains.reduce((accumulator, domainItem) => {
    if (!runsDesc.length) {
      return accumulator;
    }

    const latestRank = getDomainRankForRun(runsDesc[0], domainItem);
    if (latestRank !== null) {
      return accumulator;
    }

    let missingSince = null;
    let missingRunCount = 0;
    let lastSeenAt = null;
    let lastSeenRank = null;

    for (const run of runsDesc) {
      const rank = getDomainRankForRun(run, domainItem);
      if (rank === null) {
        missingSince = run.checkedAt;
        missingRunCount += 1;
        continue;
      }

      lastSeenAt = run.checkedAt;
      lastSeenRank = rank;
      break;
    }

    accumulator.push({
      domain: domainItem.domain,
      domainHostKey: domainItem.domainHostKey,
      missingSince,
      missingRunCount,
      lastSeenAt,
      lastSeenRank,
      hasEverRanked: lastSeenAt !== null,
    });

    return accumulator;
  }, []);

const getRankingHistory = async (req, res, next) => {
  try {
    const brandId = req.params.brandId;
    const range = req.query.range || '7d';
    const days = RANGE_TO_DAYS[range];

    if (!days) {
      return res.status(400).json({ error: 'range must be one of 1d, 7d, 14d, 30d' });
    }

    const brand = await findBrandById(brandId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const brandDomains = await Domain.find({ brand: brandId, isActive: true })
      .select('domain domainHostKey')
      .sort({ domain: 1 });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const runs = await SerpRun.find({ brand: brandId, checkedAt: { $gte: since } })
      .sort({ checkedAt: 1 })
      .select('checkedAt bestOwnRank ownCount unknownCount query trigger results');

    const points = runs.map((run) => ({
      checkedAt: run.checkedAt,
      bestOwnRank: run.bestOwnRank,
      ownCount: run.ownCount,
      unknownCount: run.unknownCount,
      query: run.query,
      trigger: run.trigger,
    }));

    const rankedPoints = points.filter((item) => item.bestOwnRank !== null);
    const firstOverall = rankedPoints[0] || null;
    const lastOverall = rankedPoints[rankedPoints.length - 1] || null;
    const overallTrend = computeTrend(firstOverall?.bestOwnRank ?? null, lastOverall?.bestOwnRank ?? null);

    const domainTrends = brandDomains.map((domainItem) => {
      const perRunPoints = runs.map((run) => {
        const rankMatches = (run.results || [])
          .filter(
            (row) =>
              row.badge === 'OWN' &&
              row.matchedDomain?.domainHostKey &&
              row.matchedDomain.domainHostKey === domainItem.domainHostKey
          )
          .map((row) => row.rank);

        const bestRankForRun = rankMatches.length ? Math.min(...rankMatches) : null;
        return {
          checkedAt: run.checkedAt,
          rank: bestRankForRun,
        };
      });

      const rankedDomainPoints = perRunPoints.filter((item) => item.rank !== null);
      const currentRank = perRunPoints.length ? (perRunPoints[perRunPoints.length - 1]?.rank ?? null) : null;
      const previousRank = perRunPoints.length > 1 ? (perRunPoints[perRunPoints.length - 2]?.rank ?? null) : null;
      const movement = computeRankMovement(previousRank, currentRank);

      return {
        domain: domainItem.domain,
        domainHostKey: domainItem.domainHostKey,
        trend: movement.trend,
        delta: movement.delta,
        currentRank,
        previousRank,
        points: perRunPoints,
      };
    });

    return res.json({
      brand: {
        _id: brand._id,
        code: brand.code,
        name: brand.name,
        color: brand.color,
      },
      range,
      from: since,
      to: new Date(),
      trend: overallTrend.trend,
      delta: overallTrend.delta,
      points,
      domainTrends,
    });
  } catch (error) {
    return next(error);
  }
};

const getRecentAutoChecks = async (req, res, next) => {
  try {
    const brandId = req.params.brandId;
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(20, limitRaw)) : 5;

    const brand = await findBrandById(brandId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const rawRuns = await SerpRun.find({ brand: brandId, trigger: 'auto' })
      .sort({ checkedAt: -1 })
      .limit(limit * 8)
      .select('checkedAt query bestOwnRank ownCount unknownCount results');

    const seenRoundKeys = new Set();
    const runs = [];
    for (const run of rawRuns) {
      const at = run?.checkedAt ? new Date(run.checkedAt) : null;
      if (!at || Number.isNaN(at.getTime())) continue;
      const minuteKey = Math.floor(at.getTime() / 60000);
      if (seenRoundKeys.has(minuteKey)) continue;
      seenRoundKeys.add(minuteKey);
      runs.push(run);
      if (runs.length >= limit) break;
    }

    return res.json({
      brand: {
        _id: brand._id,
        code: brand.code,
        name: brand.name,
        color: brand.color,
      },
      runs: runs.map((run) => ({
        _id: run._id,
        checkedAt: run.checkedAt,
        query: run.query,
        bestOwnRank: run.bestOwnRank,
        ownCount: run.ownCount,
        unknownCount: run.unknownCount,
        results: (run.results || []).map((row) => ({
          rank: row.rank,
          title: row.title,
          domainHost: row.domainHost,
          badge: row.badge,
          link: row.link,
        })),
      })),
    });
  } catch (error) {
    return next(error);
  }
};

const getGoogleRankOverview = async (req, res, next) => {
  try {
    const brandId = req.params.brandId;
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10, limitRaw)) : 5;

    const brand = await findBrandById(brandId);
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const brandDomains = await Domain.find({ brand: brandId, isActive: true })
      .select('domain domainHostKey')
      .sort({ domain: 1 })
      .lean();

    const allRunsDesc = await GoogleRankResult.find({ brand: brandId, trigger: 'auto' })
      .sort({ checkedAt: -1 })
      .select('checkedAt query bestOwnRank ownCount unknownCount params results')
      .lean();

    const recentRuns = allRunsDesc.slice(0, limit).map((run) => ({
      _id: String(run._id),
      checkedAt: run.checkedAt,
      query: run.query,
      bestOwnRank: run.bestOwnRank,
      ownCount: run.ownCount,
      unknownCount: run.unknownCount,
      params: run.params || {},
      results: (run.results || []).map((row) => ({
        rank: row.rank,
        title: row.title,
        snippet: row.snippet,
        domainHost: row.domainHost,
        badge: row.badge,
        link: row.link,
        matchedDomain: row.matchedDomain
          ? {
              _id: row.matchedDomain._id,
              domain: row.matchedDomain.domain,
              domainHostKey: row.matchedDomain.domainHostKey,
              domainRootKey: row.matchedDomain.domainRootKey,
            }
          : null,
      })),
    }));

    const missingDomains = buildMissingGoogleRankDomains(brandDomains, allRunsDesc);

    return res.json({
      brand: {
        _id: brand._id,
        code: brand.code,
        name: brand.name,
        color: brand.color,
      },
      configuredDomainCount: brandDomains.length,
      configuredDomains: brandDomains.map((item) => item.domain),
      totalRuns: allRunsDesc.length,
      latestCheckedAt: allRunsDesc[0]?.checkedAt || null,
      runs: recentRuns,
      missingDomains,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getRankingHistory,
  getRecentAutoChecks,
  getGoogleRankOverview,
};
