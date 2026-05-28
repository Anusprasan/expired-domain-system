const { BackupRun, BACKUP_RUN_STATUS } = require('../models/BackupRun');
const Brand = require('../models/Brand');
const Domain = require('../models/Domain');
const GoogleRankResult = require('../models/GoogleRankResult');
const SerpRun = require('../models/SerpRun');
const { User } = require('../models/User');

const DAY_MS = 24 * 60 * 60 * 1000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DEFAULT_MAX_ROWS_PER_FILE = 500;

const COLLECTIONS = [
  { name: 'brands', model: Brand },
  { name: 'domains', model: Domain },
  { name: 'google_rank_results', model: GoogleRankResult },
  { name: 'serp_runs', model: SerpRun },
  { name: 'users', model: User },
];

const VALID_BACKUP_FORMATS = ['json', 'ndjson'];
const VALID_TIMEFRAME_DAYS = [1, 3, 4, 7, 30];
const VALID_BACKUP_FREQUENCIES = ['daily', 'twice_weekly', 'weekly', 'monthly'];

const pad2 = (n) => String(n).padStart(2, '0');

const normalizeChatIds = (input) => {
  if (Array.isArray(input)) {
    return input.map((value) => String(value || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
};

const getTelegramTokenFromSettings = (settings, fallbackToken = '') => {
  const dbToken = String(settings?.backupTelegramBotToken || '').trim();
  const envToken = String(fallbackToken || '').trim();
  return dbToken || envToken;
};

const parseWibTime = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const matched = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!matched) return null;
  return {
    hour: Number(matched[1]),
    minute: Number(matched[2]),
    normalized: `${pad2(Number(matched[1]))}:${pad2(Number(matched[2]))}`,
  };
};

const getNextBackupAtFromNow = (now, backupTimeWib) => {
  const parsed = parseWibTime(backupTimeWib) || { hour: 0, minute: 0 };
  const nowWibMs = now.getTime() + WIB_OFFSET_MS;
  const dayStartWibMs = Math.floor(nowWibMs / DAY_MS) * DAY_MS;
  let candidateWibMs = dayStartWibMs + (parsed.hour * 60 + parsed.minute) * 60 * 1000;
  if (candidateWibMs <= nowWibMs) {
    candidateWibMs += DAY_MS;
  }
  return new Date(candidateWibMs - WIB_OFFSET_MS);
};

const getBackupIntervalDays = (frequency) => {
  if (frequency === 'weekly') return 7;
  if (frequency === 'monthly') return 30;
  if (frequency === 'twice_weekly') return 3;
  return 1;
};

const getTimeframeDaysForFrequency = (settings) => {
  const frequency = VALID_BACKUP_FREQUENCIES.includes(settings?.backupFrequency)
    ? settings.backupFrequency
    : 'daily';
  if (frequency === 'weekly') return 7;
  if (frequency === 'monthly') return 30;
  if (frequency === 'twice_weekly') {
    return settings?.backupTwiceWeeklyNextGapDays === 4 ? 4 : 3;
  }
  return 1;
};

const getNextBackupAtFromScheduled = (scheduledAt, settings) => {
  const frequency = VALID_BACKUP_FREQUENCIES.includes(settings?.backupFrequency)
    ? settings.backupFrequency
    : 'daily';

  if (frequency === 'monthly') {
    const wib = new Date(scheduledAt.getTime() + WIB_OFFSET_MS);
    const nextWib = new Date(
      Date.UTC(
        wib.getUTCFullYear(),
        wib.getUTCMonth() + 1,
        wib.getUTCDate(),
        wib.getUTCHours(),
        wib.getUTCMinutes(),
        wib.getUTCSeconds(),
        wib.getUTCMilliseconds()
      )
    );
    return nextWib ? new Date(nextWib.getTime() - WIB_OFFSET_MS) : new Date(scheduledAt.getTime() + 30 * DAY_MS);
  }

  if (frequency === 'twice_weekly') {
    const gapDays = settings?.backupTwiceWeeklyNextGapDays === 4 ? 4 : 3;
    return new Date(scheduledAt.getTime() + gapDays * DAY_MS);
  }

  const intervalDays = getBackupIntervalDays(frequency);
  return new Date(scheduledAt.getTime() + intervalDays * DAY_MS);
};

const getTimeframeQuery = (timeframeDays) => {
  const days = Number(timeframeDays) || 0;
  if (days <= 0) return {};
  return { createdAt: { $gte: new Date(Date.now() - days * DAY_MS) } };
};

const getCollectionQuery = ({ collectionName, timeframeDays }) => {
  // Always back up master data fully; timeframe applies to run history only.
  if (collectionName === 'serp_runs') {
    return getTimeframeQuery(timeframeDays);
  }
  return {};
};

const makeFileName = ({ collection, part, timestamp, format }) => {
  const ext = format === 'ndjson' ? 'ndjson' : 'json';
  return `backup_${timestamp}_${collection}_p${part}.${ext}`;
};

const formatTimestamp = (date = new Date()) => {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const y = wib.getUTCFullYear();
  const m = pad2(wib.getUTCMonth() + 1);
  const d = pad2(wib.getUTCDate());
  const hh = pad2(wib.getUTCHours());
  const mm = pad2(wib.getUTCMinutes());
  const ss = pad2(wib.getUTCSeconds());
  return `${y}${m}${d}_${hh}${mm}${ss}_WIB`;
};

const serializeRows = ({ rows, format }) => {
  if (format === 'ndjson') {
    return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  }
  return JSON.stringify(rows, null, 2);
};

const telegramRequest = async ({ token, method, payload }) => {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, payload);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const message = data?.description || `Telegram ${method} failed`;
    throw new Error(message);
  }
  return data;
};

const sendTelegramText = async ({ token, chatId, text }) => {
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });

  await telegramRequest({
    token,
    method: 'sendMessage',
    payload: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
  });
};

const testTelegramTargets = async ({ telegramBotToken, chatIds, text }) => {
  const normalizedChatIds = normalizeChatIds(chatIds);
  if (!telegramBotToken) {
    const error = new Error('Missing TELEGRAM_BOT_TOKEN');
    error.statusCode = 400;
    throw error;
  }
  if (!normalizedChatIds.length) {
    const error = new Error('No Telegram chat IDs configured');
    error.statusCode = 400;
    throw error;
  }

  const message =
    text ||
    `Backup test message\nTime: ${new Date().toISOString()}\nIf you can read this, bot + chat ID are working.`;

  const results = await Promise.all(
    normalizedChatIds.map(async (chatId) => {
      try {
        await sendTelegramText({ token: telegramBotToken, chatId, text: message });
        return { chatId, ok: true, error: '' };
      } catch (error) {
        return { chatId, ok: false, error: error.message || 'Unknown error' };
      }
    })
  );

  return {
    total: results.length,
    okCount: results.filter((item) => item.ok).length,
    failCount: results.filter((item) => !item.ok).length,
    results,
  };
};

const sendTelegramDocument = async ({ token, chatId, fileName, content, caption = '' }) => {
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('caption', String(caption || '').slice(0, 1024));
  form.set('document', new Blob([content], { type: 'application/json' }), fileName);

  await telegramRequest({
    token,
    method: 'sendDocument',
    payload: {
      method: 'POST',
      body: form,
    },
  });
};

const runTelegramBackup = async ({
  settings,
  source,
  triggeredBy = null,
  telegramBotToken,
  maxRowsPerFile = DEFAULT_MAX_ROWS_PER_FILE,
}) => {
  const startedAt = new Date();
  const chatIds = normalizeChatIds(settings.backupTelegramChatIds);
  const format = VALID_BACKUP_FORMATS.includes(settings.backupFormat) ? settings.backupFormat : 'json';
  const timeframeDays = getTimeframeDaysForFrequency(settings);
  const timestamp = formatTimestamp(startedAt);
  const summary = {};
  let totalFiles = 0;
  let totalRecords = 0;
  let totalCollections = 0;
  const completedCollections = [];
  let currentCollection = '';

  const effectiveTelegramToken = getTelegramTokenFromSettings(settings, telegramBotToken);

  if (!effectiveTelegramToken) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
  }
  if (!chatIds.length) {
    throw new Error('No Telegram chat IDs configured');
  }

  const header = [
    `Backup started (${source})`,
    `Time: ${startedAt.toISOString()}`,
    `Format: ${format.toUpperCase()}`,
    `Timeframe: last ${timeframeDays} day${timeframeDays > 1 ? 's' : ''}`,
  ].join('\n');

  await Promise.all(chatIds.map((chatId) => sendTelegramText({ token: effectiveTelegramToken, chatId, text: header })));

  try {
    for (const item of COLLECTIONS) {
      const model = item.model;
      const collectionName = item.name;
      currentCollection = collectionName;
      const query = getCollectionQuery({ collectionName, timeframeDays });
      const total = await model.countDocuments(query);
      totalCollections += 1;
      summary[collectionName] = { records: total, files: 0 };
      if (!total) {
        completedCollections.push(`${collectionName} - done (0 rows, 0 files)`);
        continue;
      }

      let part = 1;
      let cursorId = null;
      while (true) {
        const rows = await model
          .find({
            ...query,
            ...(cursorId ? { _id: { $gt: cursorId } } : {}),
          })
          .sort({ _id: 1 })
          .limit(maxRowsPerFile)
          .lean();

        if (!rows.length) break;
        cursorId = rows[rows.length - 1]._id;

        const fileName = makeFileName({ collection: collectionName, part, timestamp, format });
        const content = serializeRows({ rows, format });
        const caption = `${collectionName} part ${part} (${rows.length} rows)`;

        await Promise.all(
          chatIds.map((chatId) =>
            sendTelegramDocument({
              token: effectiveTelegramToken,
              chatId,
              fileName,
              content,
              caption,
            })
          )
        );

        summary[collectionName].files += 1;
        totalFiles += 1;
        totalRecords += rows.length;
        part += 1;
      }

      completedCollections.push(
        `${collectionName} - done (${summary[collectionName].records} rows, ${summary[collectionName].files} files)`
      );
    }
  } catch (error) {
    const failedAt = currentCollection || 'unknown';
    const failedFooter = [
      'Backup finished',
      'Status: FAILED',
      `Failed at: ${failedAt}`,
      `Collections completed: ${completedCollections.length}/${COLLECTIONS.length}`,
      `Records sent: ${totalRecords}`,
      `Files sent: ${totalFiles}`,
      ...completedCollections,
      `Error: ${error.message || 'Unknown error'}`,
    ].join('\n');
    try {
      await Promise.all(chatIds.map((chatId) => sendTelegramText({ token: effectiveTelegramToken, chatId, text: failedFooter })));
    } catch (notifyError) {
      // ignore notify error and propagate original error
    }
    throw error;
  }

  const finishedAt = new Date();
  const footer = [
    'Backup finished',
    'Status: SUCCESS',
    `Collections: ${totalCollections}`,
    `Records: ${totalRecords}`,
    `Files: ${totalFiles}`,
    `Duration: ${Math.max(1, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000))}s`,
    ...completedCollections,
  ].join('\n');
  await Promise.all(chatIds.map((chatId) => sendTelegramText({ token: effectiveTelegramToken, chatId, text: footer })));

  const run = await BackupRun.create({
    source,
    status: BACKUP_RUN_STATUS.SUCCESS,
    triggeredBy,
    startedAt,
    finishedAt,
    timeframeDays,
    format,
    chatIds,
    totalCollections,
    totalRecords,
    totalFiles,
    summary,
  });

  return {
    run,
    startedAt,
    finishedAt,
    totalCollections,
    totalRecords,
    totalFiles,
    summary,
  };
};

const logFailedBackupRun = async ({
  source,
  triggeredBy = null,
  timeframeDays = 0,
  format = 'json',
  chatIds = [],
  startedAt = new Date(),
  error,
}) => {
  return BackupRun.create({
    source,
    status: BACKUP_RUN_STATUS.FAILED,
    triggeredBy,
    startedAt,
    finishedAt: new Date(),
    timeframeDays,
    format,
    chatIds,
    totalCollections: 0,
    totalRecords: 0,
    totalFiles: 0,
    error: error?.message || String(error || 'Unknown backup error'),
  });
};

module.exports = {
  VALID_BACKUP_FORMATS,
  VALID_TIMEFRAME_DAYS,
  VALID_BACKUP_FREQUENCIES,
  normalizeChatIds,
  getTelegramTokenFromSettings,
  parseWibTime,
  getBackupIntervalDays,
  getTimeframeDaysForFrequency,
  getNextBackupAtFromNow,
  getNextBackupAtFromScheduled,
  sendTelegramText,
  testTelegramTargets,
  runTelegramBackup,
  logFailedBackupRun,
};
