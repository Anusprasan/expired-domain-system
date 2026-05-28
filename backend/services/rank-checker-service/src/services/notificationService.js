const SerpRun = require('../models/SerpRun');
const AdminSettings = require('../models/AdminSettings');
const Domain = require('../models/Domain');
const {
  normalizeChatIds,
  getTelegramTokenFromSettings,
  parseWibTime,
  sendTelegramText,
} = require('./backupService');
const { attachBrands, listBrands } = require('./systemBrandService');

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (value) => String(value).padStart(2, '0');

const getWibDateParts = (date = new Date()) => {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    year: wib.getUTCFullYear(),
    month: wib.getUTCMonth() + 1,
    day: wib.getUTCDate(),
    hour: wib.getUTCHours(),
    minute: wib.getUTCMinutes(),
  };
};

const getWibClock = (date = new Date()) => {
  const { hour, minute } = getWibDateParts(date);
  return `${pad2(hour)}:${pad2(minute)} WIB`;
};

const getWibDateKey = (date = new Date()) => {
  const { year, month, day } = getWibDateParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const getWibHourSlotKey = (date = new Date()) => {
  const { year, month, day, hour } = getWibDateParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}-${pad2(hour)}`;
};

const getWibDayRangeUtc = (date = new Date()) => {
  const wibMs = date.getTime() + WIB_OFFSET_MS;
  const dayStartWibMs = Math.floor(wibMs / DAY_MS) * DAY_MS;
  return {
    start: new Date(dayStartWibMs - WIB_OFFSET_MS),
    end: new Date(dayStartWibMs + DAY_MS - WIB_OFFSET_MS),
  };
};

const clamp = (value, min, max, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
};

const shortList = (items, fallback = '-') => (items.length ? items.slice(0, 8).join(', ') : fallback);

const formatRank = (rank) => (rank === null ? 'NF' : `#${rank}`);
const MAX_BRAND_DOMAIN_STATUS_ITEMS = 24;
const pickDomain = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
};
const formatDomainSuffix = (domain) => {
  const text = String(domain || '').trim();
  return text ? ` - ${text}` : '';
};
const normalizeDomainHost = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const withProtocol = raw.includes('://') ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).hostname.replace(/\.$/, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  }
};

const getSnapshotRank = (snapshot, brandCode) => {
  if (!snapshot || !brandCode) return null;
  if (snapshot instanceof Map) {
    const value = snapshot.get(brandCode);
    return Number.isFinite(value) ? value : null;
  }
  const value = snapshot[brandCode];
  return Number.isFinite(value) ? value : null;
};

const buildHourlySnapshot = (activeBrands, latestByBrandCode) => {
  const snapshot = {};
  activeBrands.forEach((brand) => {
    const brandCode = String(brand.code || '').trim().toUpperCase();
    if (!brandCode) return;
    const latest = latestByBrandCode.get(brandCode);
    snapshot[brandCode] = Number.isFinite(latest?.bestOwnRank) ? latest.bestOwnRank : -1;
  });
  return snapshot;
};

const hasSnapshotChanges = (previousSnapshot, currentSnapshot) => {
  const allBrandCodes = new Set([
    ...Object.keys(previousSnapshot || {}),
    ...Object.keys(currentSnapshot || {}),
  ]);

  for (const brandCode of allBrandCodes) {
    const previous = getSnapshotRank(previousSnapshot, brandCode);
    const current = getSnapshotRank(currentSnapshot, brandCode);
    if ((previous ?? -1) !== (current ?? -1)) {
      return true;
    }
  }

  return false;
};

const buildSnapshotHash = (snapshot) =>
  JSON.stringify(
    Object.entries(snapshot || {})
      .map(([brandCode, rank]) => [String(brandCode || '').trim().toUpperCase(), Number(rank)])
      .filter(([brandCode]) => Boolean(brandCode))
      .sort((a, b) => a[0].localeCompare(b[0]))
  );

const getPrimaryOwnDomain = (run) => {
  const bestOwnRow = (run?.results || [])
    .filter((row) => row?.badge === 'OWN')
    .sort((a, b) => Number(a?.rank || 999) - Number(b?.rank || 999))[0];

  if (!bestOwnRow) {
    return '';
  }

  return String(bestOwnRow?.matchedDomain?.domain || bestOwnRow?.domainHost || bestOwnRow?.link || '').trim();
};

const getOwnRowsByUrl = (run) => {
  const rowsByUrl = new Map();

  (run?.results || []).forEach((row) => {
    if (row?.badge !== 'OWN') return;

    const url =
      String(row?.matchedDomain?.domain || '').trim() ||
      String(row?.domainHost || '').trim() ||
      String(row?.link || '').trim();
    const rank = Number(row?.rank);

    if (!url || !Number.isFinite(rank)) {
      return;
    }

    if (!rowsByUrl.has(url) || rank < rowsByUrl.get(url)) {
      rowsByUrl.set(url, rank);
    }
  });

  return rowsByUrl;
};

const getOwnRowsByDomainKey = (run) => {
  const rowsByDomainKey = new Map();

  (run?.results || []).forEach((row) => {
    if (row?.badge !== 'OWN') return;

    const rank = Number(row?.rank);
    if (!Number.isFinite(rank)) {
      return;
    }

    const domain =
      String(row?.matchedDomain?.domain || '').trim() ||
      String(row?.domainHost || '').trim() ||
      String(row?.link || '').trim();
    const domainHostKey =
      String(row?.matchedDomain?.domainHostKey || '').trim() ||
      normalizeDomainHost(domain);

    if (!domainHostKey) {
      return;
    }

    const previous = rowsByDomainKey.get(domainHostKey);
    if (!previous || rank < previous.rank) {
      rowsByDomainKey.set(domainHostKey, {
        rank,
        domain: domain || domainHostKey,
      });
    }
  });

  return rowsByDomainKey;
};

const summarizeChanges = ({ comparisons, latestByBrandCode }) => {
  const improved = [];
  const dropped = [];
  const newlyRanked = [];
  const notFound = [];
  let stillMissingCount = 0;
  let noChangeCount = 0;

  comparisons.forEach((item) => {
    const previousRank = item.previousRank;
    const currentRank = item.currentRank;

    if (currentRank === null) {
      notFound.push(item.brandCode);
    }

    if (previousRank === null && currentRank === null) {
      stillMissingCount += 1;
      return;
    }

    if (previousRank === null && currentRank !== null) {
      newlyRanked.push(item.brandCode);
      return;
    }

    if (previousRank !== null && previousRank === currentRank) {
      noChangeCount += 1;
      return;
    }

    if (previousRank !== null && currentRank !== null) {
      if (currentRank < previousRank) {
        improved.push(`${item.brandCode} +${previousRank - currentRank}${formatDomainSuffix(item.primaryDomain)}`);
        return;
      }
      if (currentRank > previousRank) {
        dropped.push(`${item.brandCode} -${currentRank - previousRank}${formatDomainSuffix(item.primaryDomain)}`);
      }
    }
  });

  const latestRows = Array.from(latestByBrandCode.values());
  const rankedRows = latestRows.filter(
    (item) => Number(item?.ownCount || 0) > 0 || Number.isFinite(item?.bestOwnRank)
  );
  const leading = [...rankedRows].sort((a, b) => (b.ownCount || 0) - (a.ownCount || 0))[0] || null;

  return {
    noChangeCount,
    improved,
    dropped,
    newlyRanked,
    notFound,
    stillMissingCount,
    leading,
  };
};

const buildActiveRankingLines = (comparisons) =>
  [...comparisons]
    .filter((item) => item.currentRank !== null)
    .sort((a, b) => String(a.brandCode || '').localeCompare(String(b.brandCode || '')))
    .map((item) => {
      const { previousRank, currentRank, brandCode } = item;

      if (previousRank === null) {
        return `- ${brandCode}: NEW ${formatRank(currentRank)}${formatDomainSuffix(item.primaryDomain)}`;
      }
      if (previousRank === currentRank) {
        return `- ${brandCode}: ${formatRank(currentRank)} (=)${formatDomainSuffix(item.primaryDomain)}`;
      }
      if (currentRank < previousRank) {
        return `- ${brandCode}: ${formatRank(previousRank)} -> ${formatRank(currentRank)}${formatDomainSuffix(item.primaryDomain)}`;
      }
      return `- ${brandCode}: ${formatRank(previousRank)} -> ${formatRank(currentRank)}${formatDomainSuffix(item.primaryDomain)}`;
    });

const buildComparisonsFromSnapshot = ({
  activeBrands,
  latestByBrandCode,
  previousSnapshot,
  previousByBrandCode,
}) =>
  activeBrands.map((brand) => {
    const brandCode = String(brand.code || '').trim().toUpperCase();
    const latest = latestByBrandCode.get(brandCode) || null;
    const previousSnapshotRank = getSnapshotRank(previousSnapshot, brandCode);

    return {
      brandCode,
      query: latest?.query || brandCode,
      currentPrimaryDomain: latest?.primaryDomain || '',
      previousPrimaryDomain: previousByBrandCode.get(brandCode)?.primaryDomain || '',
      primaryDomain: pickDomain(latest?.primaryDomain, previousByBrandCode.get(brandCode)?.primaryDomain),
      currentRank: latest ? latest.bestOwnRank : null,
      previousRank:
        previousSnapshotRank !== null
          ? (previousSnapshotRank < 0 ? null : previousSnapshotRank)
          : (previousByBrandCode.get(brandCode)?.bestOwnRank ?? null),
    };
  });

const buildDetectorLabel = (activeDomainCount) =>
  activeDomainCount > 0
    ? `${activeDomainCount} configured domains only`
    : '0 configured domains, no own-domain matching';

const buildHourlyMessage = ({ comparisons, latestByBrandCode, now, activeDomainCount }) => {
  const summary = summarizeChanges({ comparisons, latestByBrandCode });
  const activeLines = buildActiveRankingLines(comparisons);

  return [
    `Hourly Check - ${getWibClock(now)}`,
    '----------------',
    `Brands checked: ${comparisons.length}`,
    `Detector: ${buildDetectorLabel(activeDomainCount)}`,
    `No change: ${summary.noChangeCount} brand${summary.noChangeCount !== 1 ? 's' : ''}`,
    `Newly ranked: ${summary.newlyRanked.length} brand${summary.newlyRanked.length !== 1 ? 's' : ''}`,
    `Dropped: ${shortList(summary.dropped, '-')}`,
    `Not found now: ${summary.notFound.length} brand${summary.notFound.length !== 1 ? 's' : ''}`,
    `Still missing: ${summary.stillMissingCount} brand${summary.stillMissingCount !== 1 ? 's' : ''}`,
    `Leading: ${
      summary.leading
        ? `${summary.leading.brandCode} ${summary.leading.ownCount || 0}/10 (${formatRank(summary.leading.bestOwnRank)})${formatDomainSuffix(summary.leading.primaryDomain)}`
        : '-'
    }`,
    '',
    `Active Rankings (${activeLines.length} found)`,
    ...(activeLines.length ? activeLines : ['- None found this hour']),
    '----------------',
  ].join('\n');
};

const buildRankChangeMessages = ({ latestRunByBrandCode, previousRunByBrandCode }) => {
  const brandCodes = Array.from(
    new Set([...latestRunByBrandCode.keys(), ...previousRunByBrandCode.keys()])
  ).sort();
  const messages = [];

  brandCodes.forEach((brandCode) => {
    const latestRun = latestRunByBrandCode.get(brandCode) || null;
    const previousRun = previousRunByBrandCode.get(brandCode) || null;
    if (!latestRun || !previousRun) return;

    const currentByUrl = getOwnRowsByUrl(latestRun);
    const previousByUrl = getOwnRowsByUrl(previousRun);
    const changedUrls = [];

    currentByUrl.forEach((currentRank, url) => {
      const previousRank = previousByUrl.get(url);
      if (!Number.isFinite(previousRank)) return;
      if (currentRank !== previousRank) {
        changedUrls.push({ url, previousRank, currentRank });
      }
    });

    if (!changedUrls.length) return;

    const lines = [`Brand: ${brandCode}`];
    changedUrls
      .sort((a, b) => a.currentRank - b.currentRank || a.url.localeCompare(b.url))
      .forEach((item) => {
        lines.push(`URL: ${item.url}`);
        lines.push(`Previous: #${item.previousRank}`);
        lines.push(`Current: #${item.currentRank}`);
        lines.push('----------------');
      });

    messages.push(lines.join('\n'));
  });

  return messages;
};

const buildBrandDomainStatusMessages = ({
  activeBrands,
  configuredDomainsByBrandCode,
  latestRunByBrandCode,
  previousRunByBrandCode,
  now,
}) => {
  const messages = [];
  const timeLabel = getWibClock(now);

  activeBrands.forEach((brand) => {
    const brandCode = String(brand?.code || '').trim().toUpperCase();
    if (!brandCode) return;

    const latestRun = latestRunByBrandCode.get(brandCode) || null;
    const configuredDomains = configuredDomainsByBrandCode.get(brandCode) || [];
    if (!latestRun || !configuredDomains.length) {
      return;
    }

    const latestByDomainKey = getOwnRowsByDomainKey(latestRun);
    const previousByDomainKey = getOwnRowsByDomainKey(previousRunByBrandCode.get(brandCode) || null);
    const entries = [];

    configuredDomains.forEach((domainItem) => {
      const configuredDomain = String(domainItem?.domain || '').trim();
      const domainHostKey =
        String(domainItem?.domainHostKey || '').trim() ||
        normalizeDomainHost(configuredDomain);

      if (!configuredDomain || !domainHostKey) {
        return;
      }

      const current = latestByDomainKey.get(domainHostKey) || null;
      const previous = previousByDomainKey.get(domainHostKey) || null;
      const currentRank = Number.isFinite(current?.rank) ? current.rank : null;
      const previousRank = Number.isFinite(previous?.rank) ? previous.rank : null;
      const domainLabel = configuredDomain;

      if (currentRank === null) {
        entries.push({
          domain: domainLabel,
          message: '[DANGER] Domain is not in top 10 ❌',
          rankLine: '',
        });
        return;
      }

      if (previousRank !== null && currentRank > previousRank) {
        entries.push({
          domain: domainLabel,
          message: '[DOWN] Rank down ⬇',
          rankLine: `Rank: #${previousRank} -> #${currentRank}`,
        });
      }

      if (currentRank > 5) {
        entries.push({
          domain: domainLabel,
          message: '[WARN] Below top 5 ⚠',
          rankLine: `Rank: #${currentRank}`,
        });
      }
    });

    if (!entries.length) {
      return;
    }

    const visibleEntries = entries.slice(0, MAX_BRAND_DOMAIN_STATUS_ITEMS);
    const lines = [`${brandCode}`, '----------------'];

    visibleEntries.forEach((entry, index) => {
      lines.push(`URL: ${entry.domain}`);
      lines.push(`Message: ${entry.message}`);
      if (entry.rankLine) {
        lines.push(entry.rankLine);
      }
      lines.push(`Time: ${timeLabel}`);
      if (index !== visibleEntries.length - 1 || entries.length > visibleEntries.length) {
        lines.push('');
      }
    });

    if (entries.length > visibleEntries.length) {
      lines.push(`... and ${entries.length - visibleEntries.length} more alerts`);
    }

    lines.push('----------------');
    messages.push(lines.join('\n'));
  });

  return messages;
};

const buildInstantAlerts = ({
  comparisons,
  alertOnDrop,
  alertOnNotFound,
  dropThreshold,
  now,
}) => {
  const alerts = [];

  comparisons.forEach((item) => {
    const previousRank = item.previousRank;
    const currentRank = item.currentRank;
    const alertDomain = pickDomain(item.currentPrimaryDomain, item.previousPrimaryDomain, item.primaryDomain);

    if (previousRank === null) {
      return;
    }

    if (alertOnNotFound && currentRank === null) {
      alerts.push([
        `INFO ALERT - ${item.brandCode}`,
        '----------------',
        `${item.brandCode} is no longer found`,
        `Keyword: "${item.query || item.brandCode}"`,
        `Was: #${previousRank} -> Now: Not found`,
        ...(alertDomain ? [`URL: ${alertDomain}`] : []),
        `Time: ${getWibClock(now)}`,
        '----------------',
      ].join('\n'));
      return;
    }

    if (!alertOnDrop || currentRank === null || currentRank <= previousRank) {
      return;
    }

    const dropAmount = currentRank - previousRank;
    if (dropAmount < dropThreshold) {
      return;
    }

    const severity =
      previousRank <= 3 || currentRank > 10
        ? 'CRITICAL ALERT'
        : currentRank > 5 || dropAmount >= dropThreshold + 3
          ? 'MEDIUM ALERT'
          : 'ALERT';

    alerts.push([
      `${severity} - ${item.brandCode}`,
      '----------------',
      `${item.brandCode} dropped ${dropAmount} position${dropAmount !== 1 ? 's' : ''}`,
      `Keyword: "${item.query || item.brandCode}"`,
      `Was: #${previousRank} -> Now: #${currentRank}`,
      ...(alertDomain ? [`URL: ${alertDomain}`] : []),
      `Time: ${getWibClock(now)}`,
      '----------------',
    ].join('\n'));
  });

  return alerts.slice(0, 8);
};

const buildDailyDigest = ({ runsToday, intervalMinutes, now, activeDomainCount }) => {
  const byBrand = new Map();

  runsToday.forEach((run) => {
    const brandCode = String(run.brand?.code || '').trim().toUpperCase();
    if (!brandCode) return;
    if (!byBrand.has(brandCode)) {
      byBrand.set(brandCode, []);
    }
    byBrand.get(brandCode).push(run);
  });

  let bestBrand = null;
  let mostVolatile = null;
  let mostStable = null;
  let totalOwnCount = 0;
  let totalSlots = 0;

  byBrand.forEach((runs, brandCode) => {
    const ownCounts = runs.map((run) => Number(run.ownCount) || 0);
    const avgOwn = ownCounts.length ? ownCounts.reduce((sum, value) => sum + value, 0) / ownCounts.length : 0;
    const ranks = runs.map((run) => (Number.isFinite(run.bestOwnRank) ? run.bestOwnRank : null));
    const hasOwnRankingData = ownCounts.some((value) => value > 0) || ranks.some((value) => value !== null);

    let totalDrop = 0;
    let changes = 0;
    for (let index = 1; index < ranks.length; index += 1) {
      const previous = ranks[index - 1];
      const current = ranks[index];
      if (previous === current) continue;
      changes += 1;
      if (previous !== null && current !== null && current > previous) totalDrop += current - previous;
      if (previous !== null && current === null) totalDrop += 10;
    }

    if (hasOwnRankingData && (!bestBrand || avgOwn > bestBrand.avgOwn)) {
      bestBrand = { brandCode, avgOwn };
    }
    if (hasOwnRankingData && totalDrop > 0 && (!mostVolatile || totalDrop > mostVolatile.totalDrop)) {
      mostVolatile = { brandCode, totalDrop };
    }
    if (hasOwnRankingData && (!mostStable || changes < mostStable.changes)) {
      mostStable = { brandCode, changes };
    }
  });

  runsToday.forEach((run) => {
    totalOwnCount += Number(run.ownCount) || 0;
    totalSlots += 10;
  });

  const zeroRows = Array.from(byBrand.entries())
    .map(([brandCode, runs]) => ({ brandCode, runs }))
    .filter(({ runs }) => runs.length > 0 && runs.every((run) => (Number(run.ownCount) || 0) === 0))
    .sort((a, b) => b.runs.length - a.runs.length);

  const ownRate = totalSlots > 0 ? Math.round((totalOwnCount / totalSlots) * 100) : 0;
  const dateKey = getWibDateKey(now).split('-').reverse().join('/');

  return [
    `Daily Summary - ${dateKey}`,
    '----------------',
    `Checks completed: ${runsToday.length}`,
    `Detector: ${buildDetectorLabel(activeDomainCount)}`,
    '',
    `Best brand: ${bestBrand ? `${bestBrand.brandCode} avg ${bestBrand.avgOwn.toFixed(1)}/10` : '-'}`,
    `Most volatile: ${mostVolatile ? `${mostVolatile.brandCode} (-${mostVolatile.totalDrop} total)` : '-'}`,
    `Most stable: ${mostStable ? `${mostStable.brandCode} (${mostStable.changes} changes)` : '-'}`,
    `Zero appearances: ${
      zeroRows.length
        ? `${zeroRows[0].brandCode} (${Math.max(1, Math.round((zeroRows[0].runs.length * intervalMinutes) / 60))}hrs)`
        : '-'
    }`,
    '',
    `Overall own-domain rate: ${ownRate}%`,
    '----------------',
  ].join('\n');
};

const createNotificationService = ({ telegramBotToken = '' } = {}) => {
  const sendTextToTargets = async ({ token, chatIds, text }) => {
    await Promise.all(chatIds.map((chatId) => sendTelegramText({ token, chatId, text })));
    return chatIds.length;
  };

  const processAutoCheckRun = async ({ settings, now = new Date() }) => {
    if (!settings?.notificationsEnabled) {
      return { skipped: true, reason: 'notifications-disabled', sentCount: 0 };
    }

    const token = getTelegramTokenFromSettings(
      { backupTelegramBotToken: settings.notificationTelegramBotToken },
      telegramBotToken
    );
    if (!token) {
      return { skipped: true, reason: 'missing-telegram-token', sentCount: 0 };
    }

    const chatIds = normalizeChatIds(settings.notificationTelegramChatIds);
    if (!chatIds.length) {
      return { skipped: true, reason: 'missing-chat-ids', sentCount: 0 };
    }

    const activeBrands = await listBrands();
    if (!activeBrands.length) {
      return { skipped: true, reason: 'no-active-brands', sentCount: 0 };
    }

    let sentCount = 0;

    const activeBrandIds = activeBrands.map((brand) => brand._id);
    const activeDomains = await Domain.find({
      brand: { $in: activeBrandIds },
      isActive: true,
    })
      .select('brand domain domainHostKey')
      .sort({ domain: 1 })
      .lean();
    const activeDomainCount = activeDomains.length;
    const brandCodeById = new Map(
      activeBrands.map((brand) => [String(brand._id), String(brand.code || '').trim().toUpperCase()])
    );
    const configuredDomainsByBrandCode = activeDomains.reduce((accumulator, item) => {
      const brandCode = brandCodeById.get(String(item?.brand || '')) || '';
      if (!brandCode) {
        return accumulator;
      }

      const current = accumulator.get(brandCode) || [];
      current.push({
        domain: String(item?.domain || '').trim(),
        domainHostKey: String(item?.domainHostKey || '').trim(),
      });
      accumulator.set(brandCode, current);
      return accumulator;
    }, new Map());

    const recentRows = await attachBrands(
      await SerpRun.find({ brand: { $in: activeBrandIds }, trigger: 'auto' })
        .sort({ checkedAt: -1 })
        .lean()
    );

    const latestByBrandCode = new Map();
    const previousByBrandCode = new Map();
    const latestRunByBrandCode = new Map();
    const previousRunByBrandCode = new Map();

    recentRows.forEach((row) => {
      const brandCode = String(row.brand?.code || '').trim().toUpperCase();
      if (!brandCode) return;

      if (!latestByBrandCode.has(brandCode)) {
        latestRunByBrandCode.set(brandCode, row);
        latestByBrandCode.set(brandCode, {
          brandCode,
          checkedAt: row.checkedAt,
          bestOwnRank: Number.isFinite(row.bestOwnRank) ? row.bestOwnRank : null,
          ownCount: Number(row.ownCount) || 0,
          query: row.query || brandCode,
          primaryDomain: getPrimaryOwnDomain(row),
        });
        return;
      }

      if (!previousByBrandCode.has(brandCode)) {
        previousRunByBrandCode.set(brandCode, row);
        previousByBrandCode.set(brandCode, {
          bestOwnRank: Number.isFinite(row.bestOwnRank) ? row.bestOwnRank : null,
          primaryDomain: getPrimaryOwnDomain(row),
        });
      }
    });

    const comparisons = activeBrands.map((brand) => {
      const brandCode = String(brand.code || '').trim().toUpperCase();
      const latest = latestByBrandCode.get(brandCode) || null;
      const previous = previousByBrandCode.get(brandCode) || null;
      return {
        brandCode,
        query: latest?.query || brandCode,
        currentPrimaryDomain: latest?.primaryDomain || '',
        previousPrimaryDomain: previous?.primaryDomain || '',
        primaryDomain: pickDomain(latest?.primaryDomain, previous?.primaryDomain),
        currentRank: latest ? latest.bestOwnRank : null,
        previousRank: previous ? previous.bestOwnRank : null,
      };
    });

    const intervalMinutes = Math.max(15, Math.round((Number(settings.checkIntervalHours) || 1) * 60));
    const wibParts = getWibDateParts(now);

    if (settings.notificationInstantEnabled) {
      const instantAlerts = buildInstantAlerts({
        comparisons,
        alertOnDrop: settings.notificationAlertOnDrop !== false,
        alertOnNotFound: settings.notificationAlertOnNotFound !== false,
        dropThreshold: clamp(settings.notificationInstantDropThreshold, 1, 10, 3),
        now,
      });

      for (const message of instantAlerts) {
        sentCount += await sendTextToTargets({ token, chatIds, text: message });
      }
    }

    if (settings.notificationHourlyEnabled) {
      const slotKey = getWibHourSlotKey(now);
      const previousRunSnapshot = settings.notificationLastRunSnapshot || {};
      const currentSnapshot = buildHourlySnapshot(activeBrands, latestByBrandCode);
      const currentSnapshotHash = buildSnapshotHash(currentSnapshot);
      const hasChanges = hasSnapshotChanges(previousRunSnapshot, currentSnapshot);
      const isNewHour = settings.notificationLastHourlySlotKey !== slotKey;
      const sendAtMinute = clamp(settings.notificationHourlySendAtMinute, 0, 59, 0);
      const isHourlySendWindowOpen = wibParts.minute >= sendAtMinute;
      const shouldSend = isHourlySendWindowOpen && (hasChanges || isNewHour);

      if (shouldSend) {
        let canSend = true;

        if (settings?._id) {
          const claim = await AdminSettings.findOneAndUpdate(
            {
              _id: settings._id,
              $or: [
                { notificationLastSentSlotKey: { $ne: slotKey } },
                { notificationLastSentSnapshotHash: { $ne: currentSnapshotHash } },
              ],
            },
            {
              $set: {
                notificationLastSentSlotKey: slotKey,
                notificationLastSentSnapshotHash: currentSnapshotHash,
              },
            },
            { new: false }
          )
            .select('_id')
            .lean();

          canSend = Boolean(claim);
        }

        if (canSend) {
          const snapshotComparisons = buildComparisonsFromSnapshot({
            activeBrands,
            latestByBrandCode,
            previousSnapshot: previousRunSnapshot,
            previousByBrandCode,
          });

          const hourlyMessage = buildHourlyMessage({
            comparisons: snapshotComparisons,
            latestByBrandCode,
            now,
            activeDomainCount,
          });
          sentCount += await sendTextToTargets({ token, chatIds, text: hourlyMessage });

          const rankChangeMessages = buildRankChangeMessages({
            latestRunByBrandCode,
            previousRunByBrandCode,
          });
          for (const message of rankChangeMessages) {
            sentCount += await sendTextToTargets({ token, chatIds, text: message });
          }

          const brandDomainStatusMessages = buildBrandDomainStatusMessages({
            activeBrands,
            configuredDomainsByBrandCode,
            latestRunByBrandCode,
            previousRunByBrandCode,
            now,
          });
          for (const message of brandDomainStatusMessages) {
            sentCount += await sendTextToTargets({ token, chatIds, text: message });
          }

          settings.notificationLastHourlySlotKey = slotKey;
          settings.notificationLastHourlySnapshot = currentSnapshot;
          settings.notificationLastSentSlotKey = slotKey;
          settings.notificationLastSentSnapshotHash = currentSnapshotHash;
        }
      }

      settings.notificationLastRunSnapshot = currentSnapshot;
    }

    if (settings.notificationDailyDigestEnabled) {
      const parsedDigestTime = parseWibTime(settings.notificationDailyDigestTimeWib || '23:00') || {
        hour: 23,
        minute: 0,
      };
      const dateKey = getWibDateKey(now);
      const isAfterDigestTime =
        wibParts.hour > parsedDigestTime.hour ||
        (wibParts.hour === parsedDigestTime.hour && wibParts.minute >= parsedDigestTime.minute);

      if (isAfterDigestTime && settings.notificationLastDailyDigestDateKey !== dateKey) {
        const { start, end } = getWibDayRangeUtc(now);
        const runsToday = await attachBrands(
          await SerpRun.find({
            trigger: 'auto',
            checkedAt: { $gte: start, $lt: end },
            brand: { $in: activeBrandIds },
          })
            .sort({ checkedAt: 1 })
            .lean()
        );

        const digestMessage = buildDailyDigest({
          runsToday,
          intervalMinutes,
          now,
          activeDomainCount,
        });
        sentCount += await sendTextToTargets({ token, chatIds, text: digestMessage });
        settings.notificationLastDailyDigestDateKey = dateKey;
      }
    }

    return { skipped: false, reason: '', sentCount };
  };

  return {
    processAutoCheckRun,
  };
};

module.exports = {
  createNotificationService,
};
