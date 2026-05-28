import SiteAnalyticsEvent from "./siteAnalytics.model.js";
import SiteAnalyticsBlockedUrl from "./siteAnalyticsBlockedUrl.model.js";

const MAX_TEXT_LENGTH = 400;
const TRACKED_EVENT_TYPES = new Set(["pageview", "click"]);
const TRACKED_SOURCES = new Set(["script", "amp", "pixel"]);
const TRANSPARENT_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const BOT_PATTERNS = [
  { pattern: /googlebot|adsbot|mediapartners-google/i, name: "Googlebot" },
  { pattern: /bingbot|bingpreview/i, name: "Bingbot" },
  { pattern: /yandexbot/i, name: "YandexBot" },
  { pattern: /baiduspider/i, name: "BaiduSpider" },
  { pattern: /duckduckbot/i, name: "DuckDuckBot" },
  { pattern: /slurp/i, name: "Yahoo Slurp" },
  { pattern: /facebookexternalhit/i, name: "Facebook Preview" },
  { pattern: /whatsapp|telegrambot|discordbot|slackbot|skypeuripreview|embedly/i, name: "Preview Bot" },
  { pattern: /lighthouse|pagespeed|chrome-lighthouse/i, name: "Lighthouse" },
  { pattern: /uptimerobot|statuscake|pingdom|site24x7/i, name: "Monitoring Bot" },
  { pattern: /headless|phantomjs|puppeteer|playwright/i, name: "Automation Bot" },
  { pattern: /bot|crawler|crawl|spider|scraper/i, name: "Robot" },
];
const DEVICE_TYPES = new Set(["desktop", "mobile", "tablet", "tv", "bot", "unknown"]);

function normalizeText(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeIdentifier(value, maxLength = 120) {
  return normalizeText(value, maxLength).replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, maxLength);
}

function normalizeEventType(value) {
  const normalized = normalizeText(value, 40).toLowerCase();
  return TRACKED_EVENT_TYPES.has(normalized) ? normalized : "";
}

function normalizeSource(value) {
  const normalized = normalizeText(value, 40).toLowerCase();
  return TRACKED_SOURCES.has(normalized) ? normalized : "script";
}

function normalizeUrl(value, { keepSearch = true } = {}) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "";
  }

  try {
    const parsed = new URL(rawValue);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    parsed.hash = "";

    if (!keepSearch) {
      parsed.search = "";
    }

    return parsed.toString().slice(0, 1600);
  } catch {
    return "";
  }
}

function buildPageLocationFromMainUrl(mainUrl) {
  try {
    const parsed = new URL(mainUrl);

    return {
      mainUrl,
      pageOrigin: `${parsed.protocol}//${parsed.host}`,
      pageHost: String(parsed.host || "").toLowerCase(),
      pagePath: `${parsed.pathname || "/"}${parsed.search || ""}`.slice(0, 600),
    };
  } catch {
    return null;
  }
}

function normalizeRequestIp(value) {
  if (Array.isArray(value)) {
    return normalizeText(value[0], 120);
  }

  return normalizeText(String(value || "").split(",")[0], 120);
}

function detectBot(userAgent) {
  const normalizedUserAgent = normalizeText(userAgent, 600);

  for (const entry of BOT_PATTERNS) {
    if (entry.pattern.test(normalizedUserAgent)) {
      return {
        isBot: true,
        botName: entry.name,
      };
    }
  }

  return {
    isBot: false,
    botName: "",
  };
}

function normalizeDeviceType(value) {
  const normalizedValue = normalizeText(value, 40).toLowerCase();
  return DEVICE_TYPES.has(normalizedValue) ? normalizedValue : "";
}

function detectDeviceType(userAgent, { isBot = false, trafficType = "" } = {}) {
  if (isBot || trafficType === "bot") {
    return "bot";
  }

  const normalizedUserAgent = normalizeText(userAgent, 600).toLowerCase();

  if (!normalizedUserAgent) {
    return trafficType === "unknown" ? "unknown" : "";
  }

  if (
    /tablet|ipad|playbook|silk|(android(?!.*mobile))|kindle/i.test(normalizedUserAgent)
  ) {
    return "tablet";
  }

  if (
    /mobile|iphone|ipod|blackberry|iemobile|opera mini|windows phone/i.test(
      normalizedUserAgent
    )
  ) {
    return "mobile";
  }

  if (/smart-tv|smarttv|googletv|appletv|hbbtv|netcast|viera|roku|tv/i.test(normalizedUserAgent)) {
    return "tv";
  }

  if (/macintosh|windows nt|x11|linux x86_64|ubuntu|cros/i.test(normalizedUserAgent)) {
    return "desktop";
  }

  if (/android/i.test(normalizedUserAgent)) {
    return "mobile";
  }

  return trafficType === "unknown" ? "unknown" : "";
}

function resolveAnalyticsDeviceType({
  deviceType = "",
  userAgent = "",
  isBot = false,
  trafficType = "",
} = {}) {
  return (
    normalizeDeviceType(deviceType)
    || detectDeviceType(userAgent, { isBot, trafficType })
    || "unknown"
  );
}

function parseCollectorBody(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildPageDetails(payload = {}, req) {
  const rawMainUrl =
    payload.mainUrl
    || payload.pageUrl
    || payload.url
    || payload.canonicalUrl
    || req.get("referer")
    || req.get("referrer");
  const mainUrl = normalizeUrl(rawMainUrl, { keepSearch: false });

  if (!mainUrl) {
    return null;
  }

  return buildPageLocationFromMainUrl(mainUrl);
}

function normalizePublicEventPayload(payload = {}, req, fallbackSource = "script") {
  const eventType = normalizeEventType(payload.eventType || payload.event || payload.type);

  if (!eventType) {
    return null;
  }

  const pageDetails = buildPageDetails(payload, req);

  if (!pageDetails) {
    return null;
  }

  const userAgent = normalizeText(req.get("user-agent"), 600);
  const deviceId = normalizeIdentifier(payload.deviceId || payload.clientId || payload.cid, 180);
  const botInfo = detectBot(userAgent);
  const trafficType = botInfo.isBot ? "bot" : deviceId ? "human" : "unknown";
  const deviceType = resolveAnalyticsDeviceType({
    deviceType: payload.deviceType || payload.deviceCategory,
    userAgent,
    isBot: botInfo.isBot,
    trafficType,
  });
  const clickUrl = normalizeUrl(payload.clickUrl || payload.href || "", { keepSearch: true });
  const clickText = normalizeText(payload.clickText || payload.text || payload.eventLabel, 220);

  return {
    eventType,
    source: normalizeSource(payload.source || fallbackSource),
    trafficType,
    isBot: botInfo.isBot,
    botName: botInfo.botName,
    ...pageDetails,
    pageTitle: normalizeText(payload.pageTitle || payload.title, 240),
    referrer: normalizeUrl(payload.referrer || payload.documentReferrer || payload.ref, {
      keepSearch: true,
    }),
    deviceId,
    deviceType,
    sessionId: normalizeIdentifier(payload.sessionId || payload.sid, 180),
    clickUrl,
    clickText,
    clickElementTag: normalizeText(payload.clickElementTag || payload.tag, 40).toLowerCase(),
    clickElementId: normalizeIdentifier(payload.clickElementId || payload.elementId, 140),
    clickElementClasses: normalizeText(
      payload.clickElementClasses || payload.elementClasses || payload.className,
      240
    ),
    clickExternal: Boolean(
      clickUrl && (() => {
        try {
          return new URL(clickUrl).host.toLowerCase() !== pageDetails.pageHost;
        } catch {
          return false;
        }
      })()
    ),
    ipAddress: normalizeRequestIp(req.headers["x-forwarded-for"] || req.ip),
    userAgent,
    language: normalizeText(payload.language || payload.lang || "", 60).toLowerCase(),
    occurredAt: new Date(),
  };
}

function buildSearchMatch(search = "") {
  const normalizedSearch = normalizeText(search, 120);

  if (!normalizedSearch) {
    return {};
  }

  return {
    $or: [
      { mainUrl: { $regex: normalizedSearch, $options: "i" } },
      { pageHost: { $regex: normalizedSearch, $options: "i" } },
      { pageTitle: { $regex: normalizedSearch, $options: "i" } },
    ],
  };
}

function buildTrafficMatch(traffic = "") {
  const normalizedTraffic = normalizeText(traffic, 20).toLowerCase();

  if (["human", "bot", "unknown"].includes(normalizedTraffic)) {
    return { trafficType: normalizedTraffic };
  }

  return {};
}

function matchesSearchText(value, search = "") {
  if (!search) {
    return true;
  }

  return String(value || "").toLowerCase().includes(search);
}

function buildNonEmptyDeviceCountExpression(field = "$deviceIds") {
  return {
    $size: {
      $filter: {
        input: field,
        as: "deviceId",
        cond: {
          $and: [
            { $ne: ["$$deviceId", ""] },
            { $ne: ["$$deviceId", null] },
          ],
        },
      },
    },
  };
}

function buildGroupedSummaryProject() {
  return {
    _id: 0,
    mainUrl: "$_id",
    pageTitle: 1,
    pageOrigin: 1,
    pageHost: 1,
    pagePath: 1,
    firstSeenAt: 1,
    lastSeenAt: 1,
    totalEvents: 1,
    pageviews: 1,
    uniqueViews: 1,
    clicks: 1,
    botEvents: 1,
    unknownEvents: 1,
    scriptEvents: 1,
    ampEvents: 1,
    uniqueDeviceCount: buildNonEmptyDeviceCountExpression("$deviceIds"),
  };
}

function buildZeroSummaryFromBlockedUrl(blockedUrl) {
  return {
    mainUrl: blockedUrl.mainUrl,
    pageTitle: blockedUrl.pageTitle || "",
    pageOrigin: blockedUrl.pageOrigin || "",
    pageHost: blockedUrl.pageHost || "",
    pagePath: blockedUrl.pagePath || "",
    firstSeenAt: null,
    lastSeenAt: null,
    totalEvents: 0,
    pageviews: 0,
    uniqueViews: 0,
    clicks: 0,
    botEvents: 0,
    unknownEvents: 0,
    scriptEvents: 0,
    ampEvents: 0,
    uniqueDeviceCount: 0,
    isBlocked: true,
  };
}

function buildGroupedSummaryStages(match = {}) {
  return [
    { $match: match },
    { $sort: { occurredAt: -1 } },
    {
      $group: {
        _id: "$mainUrl",
        pageTitle: { $first: "$pageTitle" },
        pageOrigin: { $first: "$pageOrigin" },
        pageHost: { $first: "$pageHost" },
        pagePath: { $first: "$pagePath" },
        firstSeenAt: { $last: "$occurredAt" },
        lastSeenAt: { $first: "$occurredAt" },
        totalEvents: { $sum: 1 },
        pageviews: {
          $sum: {
            $cond: [{ $eq: ["$eventType", "pageview"] }, 1, 0],
          },
        },
        uniqueViews: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$eventType", "pageview"] },
                  { $eq: ["$isUniqueView", true] },
                ],
              },
              1,
              0,
            ],
          },
        },
        clicks: {
          $sum: {
            $cond: [{ $eq: ["$eventType", "click"] }, 1, 0],
          },
        },
        botEvents: {
          $sum: {
            $cond: [{ $eq: ["$trafficType", "bot"] }, 1, 0],
          },
        },
        unknownEvents: {
          $sum: {
            $cond: [{ $eq: ["$trafficType", "unknown"] }, 1, 0],
          },
        },
        scriptEvents: {
          $sum: {
            $cond: [{ $eq: ["$source", "script"] }, 1, 0],
          },
        },
        ampEvents: {
          $sum: {
            $cond: [{ $eq: ["$source", "amp"] }, 1, 0],
          },
        },
        deviceIds: { $addToSet: "$deviceId" },
      },
    },
    { $project: buildGroupedSummaryProject() },
  ];
}

async function buildDeviceJourneyData({ mainUrl, pageHost }) {
  if (!pageHost) {
    return {
      deviceJourneys: [],
      topDevicePages: [],
    };
  }

  const selectedDeviceSnapshots = await SiteAnalyticsEvent.aggregate([
    {
      $match: {
        mainUrl,
        trafficType: "human",
        deviceId: { $nin: ["", null] },
      },
    },
    { $sort: { occurredAt: -1 } },
    {
      $group: {
        _id: "$deviceId",
        selectedEvents: { $sum: 1 },
        selectedPageviews: {
          $sum: {
            $cond: [{ $eq: ["$eventType", "pageview"] }, 1, 0],
          },
        },
        selectedClicks: {
          $sum: {
            $cond: [{ $eq: ["$eventType", "click"] }, 1, 0],
          },
        },
        deviceType: { $first: "$deviceType" },
        firstSeenAt: { $last: "$occurredAt" },
        lastSeenAt: { $first: "$occurredAt" },
        referrer: { $first: "$referrer" },
        userAgent: { $first: "$userAgent" },
      },
    },
    {
      $project: {
        _id: 0,
        deviceId: "$_id",
        selectedEvents: 1,
        selectedPageviews: 1,
        selectedClicks: 1,
        deviceType: 1,
        firstSeenAt: 1,
        lastSeenAt: 1,
        referrer: 1,
        userAgent: 1,
      },
    },
    { $sort: { selectedPageviews: -1, selectedClicks: -1, lastSeenAt: -1 } },
    { $limit: 10 },
  ]);

  const deviceIds = selectedDeviceSnapshots
    .map((entry) => String(entry.deviceId || "").trim())
    .filter(Boolean);

  if (!deviceIds.length) {
    return {
      deviceJourneys: [],
      topDevicePages: [],
    };
  }

  const siteMatch = {
    pageHost,
    eventType: "pageview",
    trafficType: "human",
    deviceId: { $in: deviceIds },
  };

  const [deviceVisitedPages, topDevicePages] = await Promise.all([
    SiteAnalyticsEvent.aggregate([
      { $match: siteMatch },
      { $sort: { occurredAt: -1 } },
      {
        $group: {
          _id: {
            deviceId: "$deviceId",
            mainUrl: "$mainUrl",
          },
          pageTitle: { $first: "$pageTitle" },
          count: { $sum: 1 },
          firstSeenAt: { $last: "$occurredAt" },
          lastSeenAt: { $first: "$occurredAt" },
        },
      },
      {
        $project: {
          _id: 0,
          deviceId: "$_id.deviceId",
          mainUrl: "$_id.mainUrl",
          pageTitle: 1,
          count: 1,
          firstSeenAt: 1,
          lastSeenAt: 1,
        },
      },
      { $sort: { deviceId: 1, count: -1, lastSeenAt: -1 } },
    ]),
    SiteAnalyticsEvent.aggregate([
      { $match: siteMatch },
      { $sort: { occurredAt: -1 } },
      {
        $group: {
          _id: "$mainUrl",
          pageTitle: { $first: "$pageTitle" },
          count: { $sum: 1 },
          lastSeenAt: { $first: "$occurredAt" },
          deviceIds: { $addToSet: "$deviceId" },
        },
      },
      {
        $project: {
          _id: 0,
          mainUrl: "$_id",
          pageTitle: 1,
          count: 1,
          lastSeenAt: 1,
          uniqueDeviceCount: buildNonEmptyDeviceCountExpression("$deviceIds"),
        },
      },
      { $sort: { count: -1, uniqueDeviceCount: -1, lastSeenAt: -1 } },
      { $limit: 8 },
    ]),
  ]);

  const pagesByDevice = new Map();

  for (const entry of deviceVisitedPages) {
    if (!pagesByDevice.has(entry.deviceId)) {
      pagesByDevice.set(entry.deviceId, []);
    }

    pagesByDevice.get(entry.deviceId).push({
      mainUrl: entry.mainUrl,
      pageTitle: entry.pageTitle,
      count: Number(entry.count || 0),
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
    });
  }

  const deviceJourneys = selectedDeviceSnapshots.map((entry) => {
    const visitedPages = pagesByDevice.get(entry.deviceId) || [];
    const currentPageIndex = visitedPages.findIndex((page) => page.mainUrl === mainUrl);

    return {
      deviceId: entry.deviceId,
      deviceType: resolveAnalyticsDeviceType({
        deviceType: entry.deviceType,
        userAgent: entry.userAgent,
        trafficType: "human",
      }),
      userAgent: entry.userAgent || "",
      referrer: entry.referrer || "",
      selectedEvents: Number(entry.selectedEvents || 0),
      selectedPageviews: Number(entry.selectedPageviews || 0),
      selectedClicks: Number(entry.selectedClicks || 0),
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
      totalSiteViews: visitedPages.reduce(
        (total, page) => total + (Number(page.count) || 0),
        0
      ),
      uniquePagesVisited: visitedPages.length,
      currentPageRank: currentPageIndex >= 0 ? currentPageIndex + 1 : null,
      topVisitedPage: visitedPages[0] || null,
      visitedPages: visitedPages.slice(0, 5),
    };
  });

  return {
    deviceJourneys,
    topDevicePages,
  };
}

export function getTransparentGifBuffer() {
  return Buffer.from(TRANSPARENT_GIF_BASE64, "base64");
}

export function buildSiteAnalyticsTrackerScript() {
  return [
    "(function () {",
    "  'use strict';",
    "  if (typeof window === 'undefined' || typeof document === 'undefined') {",
    "    return;",
    "  }",
    "  if (window.__m200SiteAnalyticsLoaded) {",
    "    return;",
    "  }",
    "  window.__m200SiteAnalyticsLoaded = true;",
    "  var currentScript = document.currentScript;",
    "  if (!currentScript) {",
    "    var scripts = document.getElementsByTagName('script');",
    "    currentScript = scripts[scripts.length - 1];",
    "  }",
    "  if (!currentScript || !currentScript.src) {",
    "    return;",
    "  }",
    "  var scriptUrl = new URL(currentScript.src, window.location.href);",
    "  var collectorUrl = new URL('collect', scriptUrl).toString();",
    "  var storageKey = '__m200_site_analytics_device_id';",
    "  var sessionKey = '__m200_site_analytics_session_id';",
    "  var trackClicks = currentScript.getAttribute('data-track-clicks') !== 'false';",
    "  var forcedMainUrl = currentScript.getAttribute('data-main-url') || '';",
    "  function trimText(value, maxLength) {",
    "    return String(value || '').trim().replace(/\\s+/g, ' ').slice(0, maxLength);",
    "  }",
    "  function normalizeUrl(value, keepSearch) {",
    "    try {",
    "      var parsed = new URL(value, window.location.href);",
    "      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {",
    "        return '';",
    "      }",
    "      parsed.hash = '';",
    "      if (!keepSearch) {",
    "        parsed.search = '';",
    "      }",
    "      return parsed.toString();",
    "    } catch (error) {",
    "      return '';",
    "    }",
    "  }",
    "  function getCanonicalMainUrl() {",
    "    if (forcedMainUrl) {",
    "      return normalizeUrl(forcedMainUrl, false);",
    "    }",
    "    var canonicalNode = document.querySelector('link[rel=\"canonical\"][href]');",
    "    if (canonicalNode && canonicalNode.href) {",
    "      var canonicalUrl = normalizeUrl(canonicalNode.href, false);",
    "      if (canonicalUrl) {",
    "        return canonicalUrl;",
    "      }",
    "    }",
    "    return normalizeUrl(window.location.origin + window.location.pathname, false);",
    "  }",
    "  function readCookie(name) {",
    "    var prefix = name + '=';",
    "    var parts = document.cookie ? document.cookie.split(';') : [];",
    "    for (var index = 0; index < parts.length; index += 1) {",
    "      var part = parts[index].trim();",
    "      if (part.indexOf(prefix) === 0) {",
    "        return part.slice(prefix.length);",
    "      }",
    "    }",
    "    return '';",
    "  }",
    "  function writeCookie(name, value, maxAgeSeconds) {",
    "    try {",
    "      document.cookie = name + '=' + value + '; path=/; max-age=' + maxAgeSeconds + '; samesite=lax';",
    "      return true;",
    "    } catch (error) {",
    "      return false;",
    "    }",
    "  }",
    "  function safeRead(storage, key) {",
    "    try {",
    "      return storage.getItem(key) || '';",
    "    } catch (error) {",
    "      return '';",
    "    }",
    "  }",
    "  function safeWrite(storage, key, value) {",
    "    try {",
    "      storage.setItem(key, value);",
    "      return true;",
    "    } catch (error) {",
    "      return false;",
    "    }",
    "  }",
    "  function generateId() {",
    "    try {",
    "      if (window.crypto && typeof window.crypto.randomUUID === 'function') {",
    "        return window.crypto.randomUUID();",
    "      }",
    "    } catch (error) {}",
    "    return 'm200-' + Math.random().toString(36).slice(2) + Date.now().toString(36);",
    "  }",
    "  function getDeviceId() {",
    "    var existing = safeRead(window.localStorage, storageKey) || readCookie(storageKey);",
    "    if (existing) {",
    "      return existing;",
    "    }",
    "    var created = generateId();",
    "    safeWrite(window.localStorage, storageKey, created);",
    "    writeCookie(storageKey, created, 31536000);",
    "    return created;",
    "  }",
    "  function getSessionId() {",
    "    var existing = safeRead(window.sessionStorage, sessionKey);",
    "    if (existing) {",
    "      return existing;",
    "    }",
    "    var created = generateId();",
    "    safeWrite(window.sessionStorage, sessionKey, created);",
    "    return created;",
    "  }",
    "  function sendPayload(payload) {",
    "    if (!payload || !payload.mainUrl) {",
    "      return;",
    "    }",
    "    var body = JSON.stringify(payload);",
    "    try {",
    "      if (window.navigator && typeof window.navigator.sendBeacon === 'function') {",
    "        if (window.navigator.sendBeacon(collectorUrl, body)) {",
    "          return;",
    "        }",
    "      }",
    "    } catch (error) {}",
    "    try {",
    "      window.fetch(collectorUrl, {",
    "        method: 'POST',",
    "        mode: 'cors',",
    "        keepalive: true,",
    "        credentials: 'omit',",
    "        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },",
    "        body: body",
    "      });",
    "    } catch (error) {}",
    "  }",
    "  function buildBasePayload(eventType) {",
    "    return {",
    "      eventType: eventType,",
    "      source: 'script',",
    "      mainUrl: getCanonicalMainUrl(),",
    "      pageTitle: trimText(document.title, 240),",
    "      referrer: normalizeUrl(document.referrer, true),",
    "      deviceId: getDeviceId(),",
    "      sessionId: getSessionId(),",
    "      language: trimText(window.navigator && window.navigator.language, 40)",
    "    };",
    "  }",
    "  function trackPageview() {",
    "    sendPayload(buildBasePayload('pageview'));",
    "  }",
    "  function handleClick(event) {",
    "    var target = event && event.target;",
    "    if (!target || typeof target.closest !== 'function') {",
    "      return;",
    "    }",
    "    var element = target.closest('a, button, [role=\"button\"], [data-track-click]');",
    "    if (!element) {",
    "      return;",
    "    }",
    "    var payload = buildBasePayload('click');",
    "    payload.clickElementTag = String(element.tagName || '').toLowerCase();",
    "    payload.clickElementId = trimText(element.id || '', 140);",
    "    payload.clickElementClasses = trimText(element.className || '', 220);",
    "    payload.clickText = trimText(",
    "      element.getAttribute('aria-label') || element.textContent || element.value || '',",
    "      220",
    "    );",
    "    if (payload.clickElementTag === 'a' && element.href) {",
    "      payload.clickUrl = normalizeUrl(element.href, true);",
    "    }",
    "    sendPayload(payload);",
    "  }",
    "  if (document.readyState === 'loading') {",
    "    document.addEventListener('DOMContentLoaded', trackPageview, { once: true });",
    "  } else {",
    "    window.setTimeout(trackPageview, 0);",
    "  }",
    "  if (trackClicks) {",
    "    document.addEventListener('click', handleClick, true);",
    "  }",
    "})();",
  ].join("\n");
}

export async function collectPublicSiteAnalyticsEvent({
  payload,
  req,
  fallbackSource = "script",
} = {}) {
  const normalizedPayload = normalizePublicEventPayload(payload, req, fallbackSource);

  if (!normalizedPayload) {
    return null;
  }

  const isBlocked = await SiteAnalyticsBlockedUrl.exists({
    mainUrl: normalizedPayload.mainUrl,
  });

  if (isBlocked) {
    return null;
  }

  let isUniqueView = false;

  if (
    normalizedPayload.eventType === "pageview"
    && normalizedPayload.trafficType === "human"
    && normalizedPayload.deviceId
  ) {
    const uniqueWindowStart = new Date(normalizedPayload.occurredAt.getTime() - (24 * 60 * 60 * 1000));
    const existingEvent = await SiteAnalyticsEvent.findOne({
      eventType: "pageview",
      mainUrl: normalizedPayload.mainUrl,
      deviceId: normalizedPayload.deviceId,
      occurredAt: { $gte: uniqueWindowStart },
      trafficType: "human",
    }).select("_id");

    isUniqueView = !existingEvent;
  }

  const event = await SiteAnalyticsEvent.create({
    ...normalizedPayload,
    isUniqueView,
  });

  return event.toObject();
}

export async function listSiteAnalyticsSummary({ search = "", traffic = "" } = {}) {
  const match = {
    ...buildSearchMatch(search),
    ...buildTrafficMatch(traffic),
  };

  const normalizedSearch = normalizeText(search, 120).toLowerCase();
  const normalizedTraffic = normalizeText(traffic, 20).toLowerCase();

  const [items, statsResult, blockedUrls] = await Promise.all([
    SiteAnalyticsEvent.aggregate([
      ...buildGroupedSummaryStages(match),
      { $sort: { lastSeenAt: -1 } },
      { $limit: 250 },
    ]),
    SiteAnalyticsEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          pageviews: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "pageview"] }, 1, 0],
            },
          },
          uniqueViews: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$eventType", "pageview"] },
                    { $eq: ["$isUniqueView", true] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          clicks: {
            $sum: {
              $cond: [{ $eq: ["$eventType", "click"] }, 1, 0],
            },
          },
          botEvents: {
            $sum: {
              $cond: [{ $eq: ["$trafficType", "bot"] }, 1, 0],
            },
          },
          unknownEvents: {
            $sum: {
              $cond: [{ $eq: ["$trafficType", "unknown"] }, 1, 0],
            },
          },
          deviceIds: { $addToSet: "$deviceId" },
        },
      },
      {
        $project: {
          _id: 0,
          totalEvents: 1,
          pageviews: 1,
          uniqueViews: 1,
          clicks: 1,
          botEvents: 1,
          unknownEvents: 1,
          uniqueDeviceCount: {
            $size: {
              $filter: {
                input: "$deviceIds",
                as: "deviceId",
                cond: {
                  $and: [
                    { $ne: ["$$deviceId", ""] },
                    { $ne: ["$$deviceId", null] },
                  ],
                },
              },
            },
          },
        },
      },
    ]),
    SiteAnalyticsBlockedUrl.find({})
      .sort({ blockedAt: -1 })
      .select("mainUrl pageOrigin pageHost pagePath pageTitle blockedAt")
      .lean(),
  ]);

  const blockedUrlMap = new Map(
    blockedUrls.map((entry) => [entry.mainUrl, entry])
  );
  const mergedItems = items.map((item) => ({
    ...item,
    isBlocked: blockedUrlMap.has(item.mainUrl),
  }));

  if (normalizedTraffic !== "human" && normalizedTraffic !== "bot" && normalizedTraffic !== "unknown") {
    for (const blockedUrl of blockedUrls) {
      if (blockedUrlMap.has(blockedUrl.mainUrl) && mergedItems.some((item) => item.mainUrl === blockedUrl.mainUrl)) {
        continue;
      }

      const searchableText = [
        blockedUrl.mainUrl,
        blockedUrl.pageTitle,
        blockedUrl.pageHost,
        blockedUrl.pagePath,
      ]
        .join(" ")
        .toLowerCase();

      if (!matchesSearchText(searchableText, normalizedSearch)) {
        continue;
      }

      mergedItems.push(buildZeroSummaryFromBlockedUrl(blockedUrl));
    }
  }

  mergedItems.sort((left, right) => {
    const leftTime = left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : 0;
    const rightTime = right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : 0;
    return rightTime - leftTime;
  });

  const topVisits = [...mergedItems]
    .filter((item) => (Number(item.pageviews) || 0) > 0)
    .sort((left, right) => {
      if ((Number(right.pageviews) || 0) !== (Number(left.pageviews) || 0)) {
        return (Number(right.pageviews) || 0) - (Number(left.pageviews) || 0);
      }

      return (Number(right.uniqueDeviceCount) || 0) - (Number(left.uniqueDeviceCount) || 0);
    })
    .slice(0, 8);

  return {
    items: mergedItems,
    topVisits,
    stats: {
      totalUrls: mergedItems.length,
      totalEvents: Number(statsResult[0]?.totalEvents || 0),
      pageviews: Number(statsResult[0]?.pageviews || 0),
      uniqueViews: Number(statsResult[0]?.uniqueViews || 0),
      clicks: Number(statsResult[0]?.clicks || 0),
      botEvents: Number(statsResult[0]?.botEvents || 0),
      unknownEvents: Number(statsResult[0]?.unknownEvents || 0),
      uniqueDeviceCount: Number(statsResult[0]?.uniqueDeviceCount || 0),
    },
  };
}

export async function getSiteAnalyticsDetail({ mainUrl, page = 1, pageSize = 50 }) {
  const normalizedMainUrl = normalizeUrl(mainUrl, { keepSearch: false });

  if (!normalizedMainUrl) {
    throw new Error("Tracked URL is invalid");
  }

  const match = { mainUrl: normalizedMainUrl };
  const safePageSize = Math.max(10, Math.min(100, Number(pageSize) || 50));
  const safePage = Math.max(1, Number(page) || 1);
  const blockedUrl = await SiteAnalyticsBlockedUrl.findOne({ mainUrl: normalizedMainUrl })
    .select("mainUrl pageOrigin pageHost pagePath pageTitle blockedAt")
    .lean();

  const [summaryResult, topClicks, topReferrers, sourceBreakdown, trafficBreakdown, totalRecentEventCount] =
    await Promise.all([
      SiteAnalyticsEvent.aggregate(buildGroupedSummaryStages(match)),
      SiteAnalyticsEvent.aggregate([
        {
          $match: {
            ...match,
            eventType: "click",
            clickUrl: { $ne: "" },
          },
        },
        { $sort: { occurredAt: -1 } },
        {
          $group: {
            _id: "$clickUrl",
            clickText: { $first: "$clickText" },
            count: { $sum: 1 },
            lastClickedAt: { $first: "$occurredAt" },
          },
        },
        {
          $project: {
            _id: 0,
            clickUrl: "$_id",
            clickText: 1,
            count: 1,
            lastClickedAt: 1,
          },
        },
        { $sort: { count: -1, lastClickedAt: -1 } },
        { $limit: 12 },
      ]),
      SiteAnalyticsEvent.aggregate([
        {
          $match: {
            ...match,
            referrer: { $ne: "" },
          },
        },
        {
          $group: {
            _id: "$referrer",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            referrer: "$_id",
            count: 1,
          },
        },
        { $sort: { count: -1, referrer: 1 } },
        { $limit: 10 },
      ]),
      SiteAnalyticsEvent.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$source",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            source: "$_id",
            count: 1,
          },
        },
        { $sort: { count: -1, source: 1 } },
      ]),
      SiteAnalyticsEvent.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$trafficType",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            trafficType: "$_id",
            count: 1,
          },
        },
        { $sort: { count: -1, trafficType: 1 } },
      ]),
      SiteAnalyticsEvent.countDocuments(match),
    ]);

  const summary = summaryResult[0]
    ? {
      ...summaryResult[0],
      isBlocked: Boolean(blockedUrl),
    }
    : blockedUrl
      ? buildZeroSummaryFromBlockedUrl(blockedUrl)
      : null;

  if (!summary) {
    throw new Error("Tracked URL not found");
  }

  const cappedRecentEventCount = Math.min(Number(totalRecentEventCount || 0), 1000);
  const totalRecentPages = Math.max(1, Math.ceil(cappedRecentEventCount / safePageSize));
  const safeCurrentPage = Math.min(safePage, totalRecentPages);
  const skip = (safeCurrentPage - 1) * safePageSize;
  const recentEvents = skip >= cappedRecentEventCount
    ? []
    : await SiteAnalyticsEvent.find(match)
      .sort({ occurredAt: -1 })
      .skip(skip)
      .limit(Math.min(safePageSize, Math.max(0, cappedRecentEventCount - skip)))
      .select([
        "eventType",
        "source",
        "trafficType",
        "isBot",
        "botName",
        "mainUrl",
        "pageTitle",
        "referrer",
        "deviceId",
        "deviceType",
        "sessionId",
        "isUniqueView",
        "clickUrl",
        "clickText",
        "clickElementTag",
        "clickElementId",
        "clickElementClasses",
        "clickExternal",
        "ipAddress",
        "userAgent",
        "occurredAt",
      ].join(" "))
      .lean();

  const normalizedRecentEvents = recentEvents.map((event) => ({
    ...event,
    deviceType: resolveAnalyticsDeviceType({
      deviceType: event.deviceType,
      userAgent: event.userAgent,
      isBot: event.isBot,
      trafficType: event.trafficType,
    }),
  }));

  const { deviceJourneys, topDevicePages } = await buildDeviceJourneyData({
    mainUrl: normalizedMainUrl,
    pageHost: summary.pageHost,
  });

  const topVisits = summary.pageHost
    ? await SiteAnalyticsEvent.aggregate([
      {
        $match: {
          pageHost: summary.pageHost,
          eventType: "pageview",
        },
      },
      { $sort: { occurredAt: -1 } },
      {
        $group: {
          _id: "$mainUrl",
          pageTitle: { $first: "$pageTitle" },
          count: { $sum: 1 },
          lastSeenAt: { $first: "$occurredAt" },
          deviceIds: { $addToSet: "$deviceId" },
        },
      },
      {
        $project: {
          _id: 0,
          mainUrl: "$_id",
          pageTitle: 1,
          count: 1,
          lastSeenAt: 1,
          uniqueDeviceCount: buildNonEmptyDeviceCountExpression("$deviceIds"),
        },
      },
      { $sort: { count: -1, uniqueDeviceCount: -1, lastSeenAt: -1 } },
      { $limit: 8 },
    ])
    : [];

  return {
    summary,
    topClicks,
    topVisits,
    topDevicePages,
    topReferrers,
    sourceBreakdown,
    trafficBreakdown,
    deviceJourneys,
    recentEvents: normalizedRecentEvents,
    recentPagination: {
      page: safeCurrentPage,
      pageSize: safePageSize,
      totalItems: cappedRecentEventCount,
      totalPages: totalRecentPages,
      latestLimit: 1000,
    },
  };
}

export async function blockTrackedSiteAnalyticsUrl({ mainUrl, pageTitle = "" }) {
  const normalizedMainUrl = normalizeUrl(mainUrl, { keepSearch: false });

  if (!normalizedMainUrl) {
    throw new Error("Tracked URL is invalid");
  }

  const pageLocation = buildPageLocationFromMainUrl(normalizedMainUrl);

  if (!pageLocation) {
    throw new Error("Tracked URL is invalid");
  }

  const latestEvent = await SiteAnalyticsEvent.findOne({ mainUrl: normalizedMainUrl })
    .sort({ occurredAt: -1 })
    .select("pageTitle")
    .lean();

  await SiteAnalyticsBlockedUrl.updateOne(
    { mainUrl: normalizedMainUrl },
    {
      $set: {
        ...pageLocation,
        pageTitle: normalizeText(pageTitle || latestEvent?.pageTitle || "", 240),
        blockedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return {
    mainUrl: normalizedMainUrl,
    isBlocked: true,
  };
}

export async function unblockTrackedSiteAnalyticsUrl({ mainUrl }) {
  const normalizedMainUrl = normalizeUrl(mainUrl, { keepSearch: false });

  if (!normalizedMainUrl) {
    throw new Error("Tracked URL is invalid");
  }

  const result = await SiteAnalyticsBlockedUrl.deleteOne({ mainUrl: normalizedMainUrl });

  return {
    mainUrl: normalizedMainUrl,
    removed: Number(result.deletedCount || 0) > 0,
    isBlocked: false,
  };
}

export async function clearTrackedSiteAnalyticsUrlStats({ mainUrl }) {
  const normalizedMainUrl = normalizeUrl(mainUrl, { keepSearch: false });

  if (!normalizedMainUrl) {
    throw new Error("Tracked URL is invalid");
  }

  const result = await SiteAnalyticsEvent.deleteMany({ mainUrl: normalizedMainUrl });

  return {
    mainUrl: normalizedMainUrl,
    deletedEvents: Number(result.deletedCount || 0),
  };
}

export async function deleteTrackedSiteAnalyticsUrl({ mainUrl }) {
  const normalizedMainUrl = normalizeUrl(mainUrl, { keepSearch: false });

  if (!normalizedMainUrl) {
    throw new Error("Tracked URL is invalid");
  }

  const [eventResult, blockedResult] = await Promise.all([
    SiteAnalyticsEvent.deleteMany({ mainUrl: normalizedMainUrl }),
    SiteAnalyticsBlockedUrl.deleteOne({ mainUrl: normalizedMainUrl }),
  ]);

  return {
    mainUrl: normalizedMainUrl,
    deletedEvents: Number(eventResult.deletedCount || 0),
    removedBlockedRule: Number(blockedResult.deletedCount || 0),
  };
}

export function parseCollectorPayload(value) {
  return parseCollectorBody(value);
}
