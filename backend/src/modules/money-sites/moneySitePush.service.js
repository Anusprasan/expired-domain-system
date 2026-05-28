import webpush from "web-push";
import User from "../users/user.model.js";
import MoneySitePushSubscription from "./moneySitePushSubscription.model.js";
import { MONEY_SITE_ACCESS_PRIVILEGES } from "./moneySite.constants.js";

let vapidConfigured = false;

function getVapidConfig() {
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = String(
    process.env.WEB_PUSH_SUBJECT || "mailto:admin@200m.website"
  ).trim();

  return {
    enabled: Boolean(publicKey && privateKey && subject),
    publicKey,
    privateKey,
    subject,
  };
}

function ensureWebPushConfigured() {
  if (vapidConfigured) {
    return getVapidConfig().enabled;
  }

  const config = getVapidConfig();

  if (!config.enabled) {
    return false;
  }

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  vapidConfigured = true;
  return true;
}

function getPrivilegeKeys(user) {
  return user?.groupId?.privilegeIds?.map((item) => item.key) || [];
}

function hasMoneySiteAccess(user) {
  const privilegeKeys = getPrivilegeKeys(user);
  return MONEY_SITE_ACCESS_PRIVILEGES.some((privilegeKey) => privilegeKeys.includes(privilegeKey));
}

function sanitizeSubscriptionPayload(payload = {}) {
  const endpoint = String(payload?.endpoint || "").trim();
  const expirationTime =
    payload?.expirationTime === null || payload?.expirationTime === undefined
      ? null
      : Number(payload.expirationTime);
  const p256dh = String(payload?.keys?.p256dh || "").trim();
  const auth = String(payload?.keys?.auth || "").trim();
  const userAgent = String(payload?.userAgent || "").trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error("A valid push subscription is required");
  }

  return {
    endpoint,
    expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
    keys: {
      p256dh,
      auth,
    },
    userAgent,
  };
}

function buildPushPayload(domains = []) {
  const title =
    domains.length === 1
      ? "Money Site Checker: 1 blocked domain"
      : `Money Site Checker: ${domains.length} blocked domains`;
  const domainPreview = domains
    .slice(0, 4)
    .map((item) => item?.domain)
    .filter(Boolean);

  return {
    title,
    body: domainPreview.length ? domainPreview.join(", ") : "New blocked domains detected.",
    tag: `money-sites-blocked-${domains.map((item) => item?.id || item?.domain).join("-")}`,
    url: "/money-sites",
    domains: domains.map((item) => ({
      id: String(item?.id || item?._id || "").trim(),
      domain: String(item?.domain || "").trim(),
    })),
    timestamp: new Date().toISOString(),
  };
}

async function getAuthorizedMoneySiteUserIds() {
  const users = await User.find({ status: "active" }).populate({
    path: "groupId",
    populate: { path: "privilegeIds" },
  });

  return users.filter(hasMoneySiteAccess).map((user) => String(user._id));
}

export function getMoneySitePushConfigService() {
  const config = getVapidConfig();

  return {
    enabled: config.enabled,
    publicKey: config.publicKey || "",
  };
}

export async function upsertMoneySitePushSubscriptionService(user, payload = {}) {
  if (!user?._id) {
    throw new Error("User is required");
  }

  if (!hasMoneySiteAccess(user)) {
    throw new Error("You do not have permission to receive money-site push notifications");
  }

  if (!ensureWebPushConfigured()) {
    throw new Error("Web push notifications are not configured on the server");
  }

  const sanitized = sanitizeSubscriptionPayload(payload);

  await MoneySitePushSubscription.findOneAndUpdate(
    { endpoint: sanitized.endpoint },
    {
      $set: {
        userId: user._id,
        expirationTime: sanitized.expirationTime,
        keys: sanitized.keys,
        userAgent: sanitized.userAgent,
        lastSeenAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return {
    subscribed: true,
    endpoint: sanitized.endpoint,
  };
}

export async function deleteMoneySitePushSubscriptionService(user, payload = {}) {
  if (!user?._id) {
    throw new Error("User is required");
  }

  const endpoint = String(payload?.endpoint || "").trim();

  if (!endpoint) {
    throw new Error("Subscription endpoint is required");
  }

  await MoneySitePushSubscription.deleteOne({
    userId: user._id,
    endpoint,
  });

  return {
    unsubscribed: true,
    endpoint,
  };
}

export async function sendMoneySiteBlockedPushNotifications(domains = []) {
  if (!domains.length || !ensureWebPushConfigured()) {
    return {
      sentCount: 0,
      failedCount: 0,
      staleCount: 0,
    };
  }

  const authorizedUserIds = await getAuthorizedMoneySiteUserIds();

  if (!authorizedUserIds.length) {
    return {
      sentCount: 0,
      failedCount: 0,
      staleCount: 0,
    };
  }

  const subscriptions = await MoneySitePushSubscription.find({
    userId: { $in: authorizedUserIds },
  });

  if (!subscriptions.length) {
    return {
      sentCount: 0,
      failedCount: 0,
      staleCount: 0,
    };
  }

  const payload = JSON.stringify(buildPushPayload(domains));
  const staleSubscriptionIds = [];
  let sentCount = 0;
  let failedCount = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime ?? null,
            keys: {
              p256dh: subscription.keys?.p256dh,
              auth: subscription.keys?.auth,
            },
          },
          payload
        );
        sentCount += 1;
      } catch (error) {
        failedCount += 1;

        if (error?.statusCode === 404 || error?.statusCode === 410) {
          staleSubscriptionIds.push(subscription._id);
        }
      }
    })
  );

  if (staleSubscriptionIds.length) {
    await MoneySitePushSubscription.deleteMany({
      _id: { $in: staleSubscriptionIds },
    });
  }

  return {
    sentCount,
    failedCount,
    staleCount: staleSubscriptionIds.length,
  };
}
