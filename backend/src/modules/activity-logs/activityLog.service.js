import mongoose from "mongoose";
import ActivityLog from "./activityLog.model.js";

const MAX_LIMIT = 200;

function normalizeText(value, maxLength = 240) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function getActorUserId(user) {
  return user?._id || user?.id || null;
}

function getActorSnapshot(user) {
  return {
    actorUserId: getActorUserId(user),
    actorName: normalizeText(user?.fullName, 120),
    actorEmail: normalizeText(user?.email, 160).toLowerCase(),
  };
}

function normalizeIpAddress(value) {
  const ipAddress = Array.isArray(value) ? value[0] : value;
  return normalizeText(ipAddress, 80);
}

function normalizeUserAgent(value) {
  return normalizeText(value, 400);
}

function buildPagination({ page = 1, limit = 50 }) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || 50));

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
}

function buildLogFilters(filters = {}, currentUser, canViewAllLogs) {
  const query = {};
  const currentUserId = getActorUserId(currentUser);

  if (!canViewAllLogs) {
    query.actorUserId = currentUserId;
  } else if (filters.actorUserId && mongoose.Types.ObjectId.isValid(filters.actorUserId)) {
    query.actorUserId = filters.actorUserId;
  }

  if (filters.module) {
    query.module = normalizeText(filters.module, 80);
  }

  if (filters.category) {
    query.category = normalizeText(filters.category, 80);
  }

  if (filters.action) {
    query.action = normalizeText(filters.action, 120);
  }

  if (filters.fromDate || filters.toDate) {
    query.occurredAt = {};

    if (filters.fromDate) {
      const from = new Date(filters.fromDate);
      if (!Number.isNaN(from.getTime())) {
        from.setHours(0, 0, 0, 0);
        query.occurredAt.$gte = from;
      }
    }

    if (filters.toDate) {
      const to = new Date(filters.toDate);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        query.occurredAt.$lte = to;
      }
    }

    if (!Object.keys(query.occurredAt).length) {
      delete query.occurredAt;
    }
  }

  if (filters.search) {
    const search = normalizeText(filters.search, 120);
    if (search) {
      query.$or = [
        { actorName: { $regex: search, $options: "i" } },
        { actorEmail: { $regex: search, $options: "i" } },
        { summary: { $regex: search, $options: "i" } },
        { targetLabel: { $regex: search, $options: "i" } },
        { routePath: { $regex: search, $options: "i" } },
      ];
    }
  }

  return query;
}

export async function createActivityLog(payload = {}) {
  const actor = getActorSnapshot(payload.actorUser || null);

  return ActivityLog.create({
    ...actor,
    module: normalizeText(payload.module, 80) || "system",
    category: normalizeText(payload.category, 80) || "data",
    action: normalizeText(payload.action, 120) || "unknown",
    targetType: normalizeText(payload.targetType, 80),
    targetId: normalizeText(payload.targetId, 120),
    targetLabel: normalizeText(payload.targetLabel, 240),
    summary: normalizeText(payload.summary, 240) || "Activity recorded",
    details: normalizeText(payload.details, 500),
    httpMethod: normalizeText(payload.httpMethod, 16).toUpperCase(),
    routePath: normalizeText(payload.routePath, 240),
    statusCode: Number(payload.statusCode) || 0,
    durationMs: Math.max(0, Number(payload.durationMs) || 0),
    ipAddress: normalizeIpAddress(payload.ipAddress),
    userAgent: normalizeUserAgent(payload.userAgent),
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    occurredAt: payload.occurredAt || new Date(),
  });
}

export async function listActivityLogs(filters = {}, currentUser, canViewAllLogs) {
  const query = buildLogFilters(filters, currentUser, canViewAllLogs);
  const { page, limit, skip } = buildPagination(filters);

  const [items, total] = await Promise.all([
    ActivityLog.find(query).sort({ occurredAt: -1 }).skip(skip).limit(limit).lean(),
    ActivityLog.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
