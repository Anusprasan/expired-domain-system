import mongoose from "mongoose";
import WaybackCheckerDomain from "./waybackChecker.model.js";

const RESULT_STATUSES = new Set(["passed", "failed"]);

function createWaybackError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeText(value, maxLength = 300) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]
    .replace(/\.+$/g, "");
}

function getActorSnapshot(user) {
  return {
    userId: user?._id || user?.id || null,
    name: normalizeText(user?.fullName || user?.email, 120),
    email: normalizeText(user?.email, 160).toLowerCase(),
  };
}

function normalizeDomainList(domains = []) {
  return Array.from(
    new Set(
      (Array.isArray(domains) ? domains : [])
        .map((domain) => normalizeDomain(domain))
        .filter(Boolean)
    )
  );
}

function normalizeNawalaResults(results = []) {
  const resultMap = new Map();

  (Array.isArray(results) ? results : []).forEach((item) => {
    const domain = normalizeDomain(item?.domain);

    if (!domain) {
      return;
    }

    const checkedAt = item?.checkedAt ? new Date(item.checkedAt) : null;

    resultMap.set(domain, {
      nawalaStatus: normalizeText(item?.status, 80).toLowerCase(),
      nawalaLabel: normalizeText(item?.label, 120),
      nawalaBlocked: typeof item?.blocked === "boolean" ? item.blocked : null,
      nawalaSourceStatus: normalizeText(item?.sourceStatus, 120),
      nawalaCheckedAt: checkedAt && !Number.isNaN(checkedAt.getTime()) ? checkedAt : undefined,
      nawalaResultBatchNumber: Number.isFinite(Number(item?.batchNumber))
        ? Number(item.batchNumber)
        : undefined,
    });
  });

  return resultMap;
}

function serializeDomain(item, currentUser = null) {
  const currentUserId = String(currentUser?._id || currentUser?.id || "");
  const takenById = item?.takenBy ? String(item.takenBy?._id || item.takenBy) : "";
  const submittedById = item?.submittedBy ? String(item.submittedBy?._id || item.submittedBy) : "";

  return {
    id: String(item._id),
    batchNumber: item.batchNumber,
    domain: item.domain,
    status: item.status || "pending",
    source: item.source || "nawala",
    movedFromNawalaAt: item.movedFromNawalaAt || null,
    nawalaStatus: item.nawalaStatus || "",
    nawalaLabel: item.nawalaLabel || "",
    nawalaBlocked: item.nawalaBlocked,
    nawalaCheckedAt: item.nawalaCheckedAt || null,
    takenBy: takenById
      ? {
        id: takenById,
        name: item.takenByName || item.takenBy?.fullName || item.takenByEmail || "",
        email: item.takenByEmail || item.takenBy?.email || "",
      }
      : null,
    takenAt: item.takenAt || null,
    isTakenByMe: Boolean(currentUserId && takenById && currentUserId === takenById),
    canTake: !takenById || Boolean(currentUserId && currentUserId === takenById),
    failReason: item.failReason || "",
    submittedBy: submittedById
      ? {
        id: submittedById,
        name: item.submittedByName || item.submittedBy?.fullName || item.submittedByEmail || "",
        email: item.submittedByEmail || item.submittedBy?.email || "",
      }
      : null,
    submittedAt: item.submittedAt || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function parseBatchNumber(value) {
  const batchNumber = Number(value);

  if (!Number.isInteger(batchNumber) || batchNumber < 1) {
    throw createWaybackError("Batch number must be a positive number");
  }

  return batchNumber;
}

export async function ensureWaybackBatchService({
  batchNumber,
  domains = [],
  nawalaResults = [],
  actorUser,
} = {}) {
  const normalizedBatchNumber = parseBatchNumber(batchNumber);
  const normalizedDomains = normalizeDomainList(domains);

  if (!normalizedDomains.length) {
    throw createWaybackError("No valid WayBack domains were provided");
  }

  const now = new Date();
  const actor = getActorSnapshot(actorUser);
  const resultMap = normalizeNawalaResults(nawalaResults);
  const operations = normalizedDomains.map((domain) => {
    const nawalaResult = resultMap.get(domain) || {};
    const setFields = Object.fromEntries(
      Object.entries(nawalaResult).filter(([, value]) => value !== undefined)
    );
    const update = {
      $setOnInsert: {
        batchNumber: normalizedBatchNumber,
        domain,
        source: "nawala",
        status: "pending",
        movedFromNawalaAt: now,
        movedFromNawalaBy: actor.userId,
        movedFromNawalaByName: actor.name,
        movedFromNawalaByEmail: actor.email,
      },
    };

    if (Object.keys(setFields).length) {
      update.$set = setFields;
    }

    return {
      updateOne: {
        filter: {
          batchNumber: normalizedBatchNumber,
          domain,
        },
        update,
        upsert: true,
      },
    };
  });

  await WaybackCheckerDomain.bulkWrite(operations, { ordered: false });

  return getWaybackBatchService(normalizedBatchNumber, actorUser);
}

function getStatusSortValue(status) {
  if (status === "pending" || status === "taken") return 1;
  if (status === "passed" || status === "failed") return 2;
  return 3;
}

export async function listWaybackBatchesService() {
  const rows = await WaybackCheckerDomain.aggregate([
    {
      $group: {
        _id: "$batchNumber",
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        taken: { $sum: { $cond: [{ $eq: ["$status", "taken"] }, 1, 0] } },
        passed: { $sum: { $cond: [{ $eq: ["$status", "passed"] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
        createdAt: { $min: "$createdAt" },
        updatedAt: { $max: "$updatedAt" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const currentBatchNumber = rows.find((row) => Number(row.pending || 0) + Number(row.taken || 0) > 0)?._id
    || rows[rows.length - 1]?._id
    || null;

  return {
    currentBatchNumber,
    items: rows.map((row) => ({
      batchNumber: row._id,
      total: row.total || 0,
      pending: row.pending || 0,
      taken: row.taken || 0,
      passed: row.passed || 0,
      failed: row.failed || 0,
      completed: (row.passed || 0) + (row.failed || 0),
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null,
      isCurrent: currentBatchNumber !== null && Number(row._id) === Number(currentBatchNumber),
    })),
  };
}

export async function getWaybackBatchService(batchNumber, currentUser = null) {
  const normalizedBatchNumber = parseBatchNumber(batchNumber);
  const [batchPayload, domains] = await Promise.all([
    listWaybackBatchesService(),
    WaybackCheckerDomain.find({ batchNumber: normalizedBatchNumber })
      .sort({ domain: 1 })
      .populate("takenBy", "fullName email")
      .populate("submittedBy", "fullName email")
      .lean(),
  ]);

  return {
    batch: batchPayload.items.find((item) => Number(item.batchNumber) === normalizedBatchNumber) || null,
    domains: domains
      .sort((left, right) =>
        getStatusSortValue(left.status) - getStatusSortValue(right.status)
        || String(left.domain || "").localeCompare(String(right.domain || ""))
      )
      .map((item) => serializeDomain(item, currentUser)),
  };
}

export async function takeWaybackDomainService(domainId, actorUser) {
  if (!mongoose.Types.ObjectId.isValid(domainId)) {
    throw createWaybackError("Select a valid domain before taking it");
  }

  const actor = getActorSnapshot(actorUser);
  const currentUserId = actor.userId;

  const activeTakenDomain = await WaybackCheckerDomain.findOne({
    _id: { $ne: domainId },
    status: "taken",
    takenBy: currentUserId,
  })
    .select("batchNumber domain")
    .lean();

  if (activeTakenDomain) {
    throw createWaybackError(
      `Complete ${activeTakenDomain.domain} in Batch ${activeTakenDomain.batchNumber} before taking another domain`,
      409
    );
  }

  const item = await WaybackCheckerDomain.findOneAndUpdate(
    {
      _id: domainId,
      status: { $in: ["pending", "taken"] },
      $or: [
        { takenBy: { $exists: false } },
        { takenBy: null },
        { takenBy: currentUserId },
      ],
    },
    {
      $set: {
        status: "taken",
        takenBy: currentUserId,
        takenByName: actor.name,
        takenByEmail: actor.email,
        takenAt: new Date(),
      },
    },
    { new: true }
  )
    .populate("takenBy", "fullName email")
    .populate("submittedBy", "fullName email")
    .lean();

  if (item) {
    return serializeDomain(item, actorUser);
  }

  const existing = await WaybackCheckerDomain.findById(domainId).lean();

  if (!existing) {
    throw createWaybackError("WayBack domain was not found", 404);
  }

  if (["passed", "failed"].includes(existing.status)) {
    throw createWaybackError("This domain has already been submitted", 409);
  }

  throw createWaybackError("This domain is already taken by another user", 409);
}

export async function submitWaybackDomainResultService(domainId, payload = {}, actorUser) {
  if (!mongoose.Types.ObjectId.isValid(domainId)) {
    throw createWaybackError("Select a valid domain before submitting it");
  }

  const resultStatus = normalizeText(payload.status, 20).toLowerCase();

  if (!RESULT_STATUSES.has(resultStatus)) {
    throw createWaybackError("Select Pass or Fail before submitting");
  }

  const failReason = normalizeText(payload.failReason, 1200);

  if (resultStatus === "failed" && !failReason) {
    throw createWaybackError("Fail reason is required");
  }

  const actor = getActorSnapshot(actorUser);
  const currentUserId = actor.userId;
  const now = new Date();

  const item = await WaybackCheckerDomain.findOneAndUpdate(
    {
      _id: domainId,
      status: { $in: ["pending", "taken"] },
      $or: [
        { takenBy: { $exists: false } },
        { takenBy: null },
        { takenBy: currentUserId },
      ],
    },
    {
      $set: {
        status: resultStatus,
        takenBy: currentUserId,
        takenByName: actor.name,
        takenByEmail: actor.email,
        takenAt: now,
        failReason: resultStatus === "failed" ? failReason : "",
        submittedBy: currentUserId,
        submittedByName: actor.name,
        submittedByEmail: actor.email,
        submittedAt: now,
      },
    },
    { new: true }
  )
    .populate("takenBy", "fullName email")
    .populate("submittedBy", "fullName email")
    .lean();

  if (item) {
    return serializeDomain(item, actorUser);
  }

  const existing = await WaybackCheckerDomain.findById(domainId).lean();

  if (!existing) {
    throw createWaybackError("WayBack domain was not found", 404);
  }

  if (["passed", "failed"].includes(existing.status)) {
    throw createWaybackError("This domain has already been submitted", 409);
  }

  throw createWaybackError("This domain is taken by another user", 409);
}

export async function listWaybackResultsService(batchNumber, status = "passed") {
  const normalizedBatchNumber = parseBatchNumber(batchNumber);
  const normalizedStatus = normalizeText(status, 20).toLowerCase() === "failed" ? "failed" : "passed";
  const items = await WaybackCheckerDomain.find({
    batchNumber: normalizedBatchNumber,
    status: normalizedStatus,
  })
    .sort({ submittedAt: -1, domain: 1 })
    .populate("submittedBy", "fullName email")
    .lean();

  return {
    batchNumber: normalizedBatchNumber,
    status: normalizedStatus,
    items: items.map((item) => serializeDomain(item)),
  };
}
