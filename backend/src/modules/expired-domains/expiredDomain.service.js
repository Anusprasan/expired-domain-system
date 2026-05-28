import ExpiredDomain from "./expiredDomain.model.js";

const UPLOAD_STAGE = "upload";
const PROCESS_STAGE = "process";
const PROCESS_SUB_BATCH_SIZE = 899;
const LEGACY_PENDING_PROCESS_STATUS = "pending";
const DEFAULT_PROCESS_STATUS = "copied";
const PROCESS_STATUSES = ["pending", "copied", "processed", "mainbatch", "bulkchecking", "finalstage", "waybackchecking", "skipped"];
const BULK_WRITE_CHUNK_SIZE = 1000;

function normalizeDomain(value) {
  let domain = String(value || "").trim().toLowerCase();

  domain = domain.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  domain = domain.split(/[/?#]/)[0].replace(/\.+$/, "");

  return domain;
}

function isValidDomain(value) {
  const domain = normalizeDomain(value);

  if (!domain || domain.length > 253 || !domain.includes(".")) {
    return false;
  }

  const labels = domain.split(".");
  return labels.every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  )) && /^[a-z]{2,63}$/.test(labels[labels.length - 1]);
}

function normalizePositiveInteger(value, label) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    const error = new Error(`${label} must be a positive number`);
    error.statusCode = 400;
    throw error;
  }

  return number;
}

function normalizeProcessStatus(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedStatus === LEGACY_PENDING_PROCESS_STATUS) {
    return DEFAULT_PROCESS_STATUS;
  }

  return PROCESS_STATUSES.includes(normalizedStatus) ? normalizedStatus : "";
}

function buildDefaultProcessStatusQuery() {
  return {
    $or: [
      { processStatus: DEFAULT_PROCESS_STATUS },
      { processStatus: LEGACY_PENDING_PROCESS_STATUS },
      { processStatus: { $exists: false } },
    ],
  };
}

function buildNormalizedProcessStatusExpression() {
  return {
    $cond: [
      {
        $eq: [
          { $ifNull: ["$processStatus", DEFAULT_PROCESS_STATUS] },
          LEGACY_PENDING_PROCESS_STATUS,
        ],
      },
      DEFAULT_PROCESS_STATUS,
      { $ifNull: ["$processStatus", DEFAULT_PROCESS_STATUS] },
    ],
  };
}

function normalizeDomainList(domains = []) {
  if (!Array.isArray(domains)) {
    return [];
  }

  return Array.from(
    new Set(
      domains
        .map((domain) => normalizeDomain(domain))
        .filter((domain) => domain && isValidDomain(domain))
    )
  );
}

function normalizeNawalaResults(results = []) {
  if (!Array.isArray(results)) {
    return new Map();
  }

  const resultMap = new Map();

  results.forEach((item) => {
    const domain = normalizeDomain(item?.domain);

    if (!domain || !isValidDomain(domain)) {
      return;
    }

    const checkedAt = item?.checkedAt ? new Date(item.checkedAt) : null;

    resultMap.set(domain, {
      nawalaStatus: String(item?.status || "").trim().toLowerCase(),
      nawalaLabel: String(item?.label || "").trim(),
      nawalaBlocked: typeof item?.blocked === "boolean" ? item.blocked : null,
      nawalaSourceStatus: String(item?.sourceStatus || "").trim(),
      nawalaError: String(item?.error || "").trim(),
      nawalaCheckedAt: checkedAt && !Number.isNaN(checkedAt.getTime()) ? checkedAt : undefined,
      nawalaResultBatchNumber: Number.isFinite(Number(item?.batchNumber)) ? Number(item.batchNumber) : undefined,
    });
  });

  return resultMap;
}

function buildNawalaResultUpdateFields(result) {
  const fields = {};

  if (!result) {
    return fields;
  }

  if (result.nawalaStatus) fields.nawalaStatus = result.nawalaStatus;
  if (result.nawalaLabel) fields.nawalaLabel = result.nawalaLabel;
  if (result.nawalaBlocked !== null && result.nawalaBlocked !== undefined) fields.nawalaBlocked = result.nawalaBlocked;
  if (result.nawalaSourceStatus) fields.nawalaSourceStatus = result.nawalaSourceStatus;
  if (result.nawalaError) fields.nawalaError = result.nawalaError;
  if (result.nawalaCheckedAt) fields.nawalaCheckedAt = result.nawalaCheckedAt;
  if (result.nawalaResultBatchNumber) fields.nawalaResultBatchNumber = result.nawalaResultBatchNumber;

  return fields;
}

function resolveProcessStatus(statuses = []) {
  const normalizedStatuses = new Set(
    statuses.map((status) => normalizeProcessStatus(status || DEFAULT_PROCESS_STATUS)).filter(Boolean)
  );

  return PROCESS_STATUSES.find((status) => normalizedStatuses.has(status)) || DEFAULT_PROCESS_STATUS;
}

function buildProcessStageQuery() {
  return {
    $or: [
      { stage: PROCESS_STAGE },
      { stage: { $exists: false } },
    ],
  };
}

function buildProcessSubBatchQuery(batchNumber, subBatchNumber) {
  const normalizedBatchNumber = normalizePositiveInteger(batchNumber, "Batch number");
  const normalizedSubBatchNumber = normalizePositiveInteger(subBatchNumber, "Sub-batch number");
  const subBatchQuery = normalizedSubBatchNumber === 1
    ? {
      $or: [
        { processSubBatchNumber: 1 },
        { processSubBatchNumber: { $exists: false } },
      ],
    }
    : { processSubBatchNumber: normalizedSubBatchNumber };

  return {
    $and: [
      { batchNumber: normalizedBatchNumber },
      buildProcessStageQuery(),
      subBatchQuery,
    ],
  };
}

function buildProcessSubBatchValueQuery(subBatchNumber) {
  const normalizedSubBatchNumber = Number(subBatchNumber);

  if (Number.isInteger(normalizedSubBatchNumber) && normalizedSubBatchNumber >= 1) {
    return { processSubBatchNumber: normalizedSubBatchNumber };
  }

  return {
    $or: [
      { processSubBatchNumber: { $exists: false } },
      { processSubBatchNumber: null },
    ],
  };
}

function buildProcessStatusAuditFields(status, userId) {
  const now = new Date();
  const fields = { processStatus: status };

  if (status === "copied") {
    fields.copiedAt = now;
    if (userId) fields.copiedBy = userId;
  }

  if (status === "processed") {
    fields.processedAt = now;
    if (userId) fields.processedBy = userId;
  }

  if (status === "mainbatch") {
    fields.mainBatchAt = now;
    if (userId) fields.mainBatchBy = userId;
  }

  if (status === "bulkchecking") {
    fields.bulkCheckingAt = now;
    if (userId) fields.bulkCheckingBy = userId;
  }

  if (status === "finalstage") {
    fields.finalStageAt = now;
    if (userId) fields.finalStageBy = userId;
  }

  if (status === "waybackchecking") {
    fields.waybackCheckingAt = now;
    if (userId) fields.waybackCheckingBy = userId;
  }

  if (status === "skipped") {
    fields.skippedAt = now;
    if (userId) fields.skippedBy = userId;
  }

  return fields;
}

async function getBatchSnapshot(batchNumber) {
  const validStatusQuery = {
    $or: [
      { importStatus: "valid" },
      { importStatus: { $exists: false } },
    ],
  };
  const [total, valid, invalid, duplicate, validRows] = await Promise.all([
    ExpiredDomain.countDocuments({ batchNumber, stage: UPLOAD_STAGE }),
    ExpiredDomain.countDocuments({ batchNumber, stage: UPLOAD_STAGE, ...validStatusQuery }),
    ExpiredDomain.countDocuments({ batchNumber, stage: UPLOAD_STAGE, importStatus: "invalid" }),
    ExpiredDomain.countDocuments({ batchNumber, stage: UPLOAD_STAGE, importStatus: "duplicate" }),
    ExpiredDomain.find({ batchNumber, stage: UPLOAD_STAGE, ...validStatusQuery })
      .sort({ domain: 1, createdAt: 1 })
      .select("domain")
      .lean(),
  ]);

  return {
    total,
    valid,
    invalid,
    duplicate,
    validDomains: validRows.map((item) => item.domain),
  };
}

export const getCurrentExpiredDomainBatch = async () => {
  const activeBatch = await ExpiredDomain.findOne({ stage: UPLOAD_STAGE })
    .sort({ batchNumber: -1, createdAt: -1 })
    .select("batchNumber")
    .lean();

  const currentBatchNumber = activeBatch?.batchNumber || await getNextExpiredDomainBatchNumber();
  const batchSnapshot = await getBatchSnapshot(currentBatchNumber);

  return {
    currentBatchNumber,
    uploadCount: batchSnapshot.total,
    batchSnapshot,
  };
};

async function getNextExpiredDomainBatchNumber() {
  const latestBatch = await ExpiredDomain.findOne({})
    .sort({ batchNumber: -1, createdAt: -1 })
    .select("batchNumber")
    .lean();

  return Math.max(1, Number(latestBatch?.batchNumber || 0) + 1);
}

export const listExpiredDomains = async (query = {}) => {
  return ExpiredDomain.find(query).sort({ batchNumber: -1, createdAt: -1 }).limit(1000);
};

async function rebalancePendingProcessBatches() {
  const candidateRows = await ExpiredDomain.aggregate([
    {
      $match: {
        $and: [
          buildProcessStageQuery(),
          buildDefaultProcessStatusQuery(),
        ],
      },
    },
    {
      $group: {
        _id: {
          batchNumber: { $ifNull: ["$batchNumber", 1] },
          subBatchNumber: "$processSubBatchNumber",
        },
        domainCount: { $sum: 1 },
      },
    },
    {
      $match: {
        $or: [
          { domainCount: { $gt: PROCESS_SUB_BATCH_SIZE } },
          { "_id.subBatchNumber": null },
        ],
      },
    },
    { $sort: { "_id.batchNumber": 1, "_id.subBatchNumber": 1 } },
  ]);
  const candidatesByBatch = new Map();

  candidateRows.forEach((candidate) => {
    const batchNumber = Number(candidate._id?.batchNumber || 1);
    const rows = candidatesByBatch.get(batchNumber) || [];

    rows.push({
      subBatchNumber: candidate._id?.subBatchNumber ?? null,
    });
    candidatesByBatch.set(batchNumber, rows);
  });

  for (const [batchNumber, candidates] of candidatesByBatch.entries()) {
    const nonPendingCount = await ExpiredDomain.countDocuments({
      $and: [
        { batchNumber },
        buildProcessStageQuery(),
        { processStatus: { $exists: true, $nin: [DEFAULT_PROCESS_STATUS, LEGACY_PENDING_PROCESS_STATUS] } },
      ],
    });

    if (!nonPendingCount) {
      await rebalanceEntirePendingProcessBatch(batchNumber);
      continue;
    }

    for (const candidate of candidates) {
      await rebalancePendingProcessSubBatch(batchNumber, candidate.subBatchNumber);
    }
  }
}

async function getMaxProcessSubBatchNumber(batchNumber) {
  const [row] = await ExpiredDomain.aggregate([
    {
      $match: {
        $and: [
          { batchNumber },
          buildProcessStageQuery(),
          { processSubBatchNumber: { $exists: true, $ne: null } },
        ],
      },
    },
    { $group: { _id: null, maxSubBatchNumber: { $max: "$processSubBatchNumber" } } },
  ]);

  return Number(row?.maxSubBatchNumber || 0);
}

async function rebalanceEntirePendingProcessBatch(batchNumber) {
  const cursor = ExpiredDomain.find({
    $and: [
      { batchNumber },
      buildProcessStageQuery(),
      buildDefaultProcessStatusQuery(),
    ],
  })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id")
    .lean()
    .cursor();
  let rowIndex = 0;
  let operations = [];

  for await (const item of cursor) {
    rowIndex += 1;
    operations.push({
      updateOne: {
        filter: { _id: item._id },
        update: {
          $set: {
            processSubBatchNumber: Math.ceil(rowIndex / PROCESS_SUB_BATCH_SIZE),
            processStatus: DEFAULT_PROCESS_STATUS,
          },
        },
      },
    });

    if (operations.length >= BULK_WRITE_CHUNK_SIZE) {
      await ExpiredDomain.bulkWrite(operations);
      operations = [];
    }
  }

  if (operations.length) {
    await ExpiredDomain.bulkWrite(operations);
  }
}

async function rebalancePendingProcessSubBatch(batchNumber, subBatchNumber) {
  const originalSubBatchNumber = Number(subBatchNumber);
  const canReuseOriginalSubBatch = Number.isInteger(originalSubBatchNumber) && originalSubBatchNumber >= 1;
  const nonPendingInOriginalSubBatch = canReuseOriginalSubBatch
    ? await ExpiredDomain.countDocuments({
      $and: [
        { batchNumber },
        buildProcessStageQuery(),
        buildProcessSubBatchValueQuery(originalSubBatchNumber),
        { processStatus: { $exists: true, $nin: [DEFAULT_PROCESS_STATUS, LEGACY_PENDING_PROCESS_STATUS] } },
      ],
    })
    : 0;
  const firstNewSubBatchNumber = await getMaxProcessSubBatchNumber(batchNumber) + 1;
  const cursor = ExpiredDomain.find({
    $and: [
      { batchNumber },
      buildProcessStageQuery(),
      buildDefaultProcessStatusQuery(),
      buildProcessSubBatchValueQuery(subBatchNumber),
    ],
  })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id")
    .lean()
    .cursor();
  let rowIndex = 0;
  let operations = [];

  for await (const item of cursor) {
    const chunkIndex = Math.floor(rowIndex / PROCESS_SUB_BATCH_SIZE);
    const shouldKeepOriginalSubBatch = canReuseOriginalSubBatch && !nonPendingInOriginalSubBatch && chunkIndex === 0;
    const processSubBatchNumber = shouldKeepOriginalSubBatch
      ? originalSubBatchNumber
      : firstNewSubBatchNumber + chunkIndex - (canReuseOriginalSubBatch && !nonPendingInOriginalSubBatch ? 1 : 0);

    rowIndex += 1;
    operations.push({
      updateOne: {
        filter: { _id: item._id },
        update: {
          $set: {
            processSubBatchNumber,
            processStatus: DEFAULT_PROCESS_STATUS,
          },
        },
      },
    });

    if (operations.length >= BULK_WRITE_CHUNK_SIZE) {
      await ExpiredDomain.bulkWrite(operations);
      operations = [];
    }
  }

  if (operations.length) {
    await ExpiredDomain.bulkWrite(operations);
  }
}

export const listExpiredDomainProcessSubBatches = async () => {
  await rebalancePendingProcessBatches();

  const normalizedStatusExpression = buildNormalizedProcessStatusExpression();
  const rows = await ExpiredDomain.aggregate([
    { $match: buildProcessStageQuery() },
    {
      $group: {
        _id: {
          batchNumber: { $ifNull: ["$batchNumber", 1] },
          subBatchNumber: { $ifNull: ["$processSubBatchNumber", 1] },
          status: normalizedStatusExpression,
        },
        domainCount: { $sum: 1 },
        statuses: { $addToSet: normalizedStatusExpression },
        movedToProcessAt: { $min: "$movedToProcessAt" },
        updatedAt: { $max: "$updatedAt" },
      },
    },
    { $sort: { "_id.batchNumber": -1, "_id.subBatchNumber": 1 } },
  ]);

  return rows.map((row) => ({
    id: `${row._id.batchNumber}-${row._id.subBatchNumber}-${row._id.status}`,
    batchNumber: row._id.batchNumber,
    subBatchNumber: row._id.subBatchNumber,
    domainCount: row.domainCount || 0,
    status: row._id.status || resolveProcessStatus(row.statuses),
    statuses: row.statuses || [],
    movedToProcessAt: row.movedToProcessAt || null,
    updatedAt: row.updatedAt || null,
  }));
};

export const listExpiredDomainProcessSubBatchDomains = async (batchNumber, subBatchNumber, status = "") => {
  const normalizedBatchNumber = normalizePositiveInteger(batchNumber, "Batch number");
  const normalizedSubBatchNumber = normalizePositiveInteger(subBatchNumber, "Sub-batch number");
  const normalizedStatus = normalizeProcessStatus(status);
  const query = buildProcessSubBatchQuery(normalizedBatchNumber, normalizedSubBatchNumber);

  if (normalizedStatus) {
    query.$and.push(
      normalizedStatus === DEFAULT_PROCESS_STATUS
        ? buildDefaultProcessStatusQuery()
        : { processStatus: normalizedStatus }
    );
  }

  const rows = await ExpiredDomain.find(query)
    .sort({ createdAt: 1, _id: 1 })
    .select("domain nawalaStatus nawalaLabel nawalaBlocked nawalaSourceStatus nawalaError nawalaCheckedAt nawalaResultBatchNumber processStatus")
    .limit(PROCESS_SUB_BATCH_SIZE)
    .lean();

  return {
    batchNumber: normalizedBatchNumber,
    subBatchNumber: normalizedSubBatchNumber,
    subBatchSize: PROCESS_SUB_BATCH_SIZE,
    count: rows.length,
    domains: rows.map((item) => item.domain),
    items: rows.map((item) => ({
      domain: item.domain,
      processStatus: item.processStatus || DEFAULT_PROCESS_STATUS,
      nawalaStatus: item.nawalaStatus || "",
      nawalaLabel: item.nawalaLabel || "",
      nawalaBlocked: item.nawalaBlocked,
      nawalaSourceStatus: item.nawalaSourceStatus || "",
      nawalaError: item.nawalaError || "",
      nawalaCheckedAt: item.nawalaCheckedAt || null,
      nawalaResultBatchNumber: item.nawalaResultBatchNumber || null,
    })),
  };
};

export const createExpiredDomain = async (data) => {
  const { currentBatchNumber } = await getCurrentExpiredDomainBatch();
  const doc = new ExpiredDomain({
    ...data,
    batchNumber: data.batchNumber || currentBatchNumber,
    rawValue: data.rawValue || data.domain,
    domain: normalizeDomain(data.domain),
    importStatus: data.importStatus || "valid",
    stage: data.stage || UPLOAD_STAGE,
  });
  return doc.save();
};

export const importExpiredDomains = async (domains = [], createdBy) => {
  if (!Array.isArray(domains)) domains = [];
  const { currentBatchNumber } = await getCurrentExpiredDomainBatch();

  const rawItems = domains
    .map((item) => {
      if (typeof item === "string") {
        return String(item || "").trim();
      }

      return String(item.domain || item.name || "").trim();
    })
    .filter(Boolean);

  if (!rawItems.length) {
    const batchSnapshot = await getBatchSnapshot(currentBatchNumber);
    return {
      savedCount: 0,
      insertedCount: 0,
      batchNumber: currentBatchNumber,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      batchSnapshot,
    };
  }

  const normalizedCandidates = rawItems
    .map((item) => normalizeDomain(item))
    .filter(Boolean);
  const existingDomains = await ExpiredDomain.find({
    domain: { $in: normalizedCandidates },
    $or: [
      { importStatus: "valid" },
      { importStatus: { $exists: false } },
    ],
  })
    .collation({ locale: "en", strength: 2 })
    .select("domain")
    .lean();
  const seenValidDomains = new Set(existingDomains.map((item) => normalizeDomain(item.domain)));
  const batchCounts = {
    valid: 0,
    invalid: 0,
    duplicate: 0,
  };

  const docs = rawItems.map((rawValue) => {
    const domain = normalizeDomain(rawValue);

    if (!isValidDomain(domain)) {
      batchCounts.invalid += 1;
      return {
        domain: domain || rawValue,
        rawValue,
        importStatus: "invalid",
        batchNumber: currentBatchNumber,
        stage: UPLOAD_STAGE,
        createdBy,
      };
    }

    if (seenValidDomains.has(domain)) {
      batchCounts.duplicate += 1;
      return {
        domain,
        rawValue,
        importStatus: "duplicate",
        duplicateOf: domain,
        batchNumber: currentBatchNumber,
        stage: UPLOAD_STAGE,
        createdBy,
      };
    }

    seenValidDomains.add(domain);
    batchCounts.valid += 1;
    return {
      domain,
      rawValue,
      importStatus: "valid",
      batchNumber: currentBatchNumber,
      stage: UPLOAD_STAGE,
      createdBy,
    };
  });

  const result = await ExpiredDomain.insertMany(docs, { ordered: false });
  const batchSnapshot = await getBatchSnapshot(currentBatchNumber);

  return {
    savedCount: result.length,
    insertedCount: batchCounts.valid,
    batchNumber: currentBatchNumber,
    validCount: batchCounts.valid,
    invalidCount: batchCounts.invalid,
    duplicateCount: batchCounts.duplicate,
    skippedDuplicateCount: batchCounts.duplicate,
    batchSnapshot,
  };
};

export const moveCurrentExpiredDomainBatchToProcess = async (movedBy) => {
  const { currentBatchNumber } = await getCurrentExpiredDomainBatch();
  const validQuery = {
    batchNumber: currentBatchNumber,
    stage: UPLOAD_STAGE,
    $or: [
      { importStatus: "valid" },
      { importStatus: { $exists: false } },
    ],
  };
  const movedToProcessAt = new Date();
  const cursor = ExpiredDomain.find(validQuery)
    .sort({ createdAt: 1, _id: 1 })
    .select("_id")
    .lean()
    .cursor();
  let movedCount = 0;
  let operations = [];

  for await (const item of cursor) {
    const subBatchNumber = Math.floor(movedCount / PROCESS_SUB_BATCH_SIZE) + 1;
    movedCount += 1;
    operations.push({
      updateOne: {
        filter: { _id: item._id },
        update: {
          $set: {
            stage: PROCESS_STAGE,
            movedToProcessAt,
            movedToProcessBy: movedBy,
            processSubBatchNumber: subBatchNumber,
            processStatus: DEFAULT_PROCESS_STATUS,
          },
        },
      },
    });

    if (operations.length >= BULK_WRITE_CHUNK_SIZE) {
      await ExpiredDomain.bulkWrite(operations);
      operations = [];
    }
  }

  if (operations.length) {
    await ExpiredDomain.bulkWrite(operations);
  }

  const deleteResult = movedCount
    ? await ExpiredDomain.deleteMany({
      batchNumber: currentBatchNumber,
      stage: UPLOAD_STAGE,
      importStatus: { $in: ["invalid", "duplicate"] },
    })
    : { deletedCount: 0 };
  const deletedCount = deleteResult.deletedCount || 0;

  return {
    batchNumber: currentBatchNumber,
    movedCount,
    deletedCount,
    nextBatchNumber: movedCount ? currentBatchNumber + 1 : currentBatchNumber,
    subBatchCount: movedCount ? Math.ceil(movedCount / PROCESS_SUB_BATCH_SIZE) : 0,
    subBatchSize: PROCESS_SUB_BATCH_SIZE,
  };
};

export const updateExpiredDomainProcessSubBatchStatus = async ({
  batchNumber,
  subBatchNumber,
  status,
  domains,
  nawalaResults,
  userId,
}) => {
  const normalizedBatchNumber = normalizePositiveInteger(batchNumber, "Batch number");
  const normalizedSubBatchNumber = normalizePositiveInteger(subBatchNumber, "Sub-batch number");
  const normalizedStatus = normalizeProcessStatus(status);
  const normalizedDomains = normalizeDomainList(domains);
  const nawalaResultMap = normalizeNawalaResults(nawalaResults);

  if (!normalizedStatus) {
    const error = new Error("Invalid process status");
    error.statusCode = 400;
    throw error;
  }

  if (Array.isArray(domains) && !normalizedDomains.length) {
    const error = new Error("No valid domains provided");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedStatus === "bulkchecking") {
    const activeBulkCheckingBatch = await ExpiredDomain.findOne({
      ...buildProcessStageQuery(),
      batchNumber: { $ne: normalizedBatchNumber },
      processStatus: "bulkchecking",
    })
      .select("batchNumber")
      .lean();

    if (activeBulkCheckingBatch) {
      const error = new Error(
        `Batch ${String(activeBulkCheckingBatch.batchNumber || 1).padStart(2, "0")} is already in Bulk Checking. Move it to Nawala Checking before starting another batch.`
      );
      error.statusCode = 409;
      throw error;
    }
  }

  if (normalizedStatus === "finalstage") {
    const waybackCheckingBatchNumbers = await ExpiredDomain.distinct("batchNumber", {
      ...buildProcessStageQuery(),
      processStatus: "waybackchecking",
    });
    const activeNawalaCheckingBatch = await ExpiredDomain.findOne({
      ...buildProcessStageQuery(),
      batchNumber: {
        $ne: normalizedBatchNumber,
        ...(waybackCheckingBatchNumbers.length ? { $nin: waybackCheckingBatchNumbers } : {}),
      },
      processStatus: "finalstage",
    })
      .select("batchNumber")
      .lean();

    if (activeNawalaCheckingBatch) {
      const error = new Error(
        `Batch ${String(activeNawalaCheckingBatch.batchNumber || 1).padStart(2, "0")} is already in Nawala Checking. Finish it before moving another batch to Nawala Checking.`
      );
      error.statusCode = 409;
      throw error;
    }
  }

  const query = buildProcessSubBatchQuery(normalizedBatchNumber, normalizedSubBatchNumber);

  if (normalizedDomains.length) {
    query.$and.push({ domain: { $in: normalizedDomains } });
  }

  const result = await ExpiredDomain.updateMany(
    query,
    {
      $set: buildProcessStatusAuditFields(normalizedStatus, userId),
    }
  );

  if (normalizedStatus === "finalstage" && nawalaResultMap.size) {
    const operations = Array.from(nawalaResultMap.entries())
      .filter(([domain]) => !normalizedDomains.length || normalizedDomains.includes(domain))
      .map(([domain, nawalaResult]) => ({
        updateOne: {
          filter: {
            $and: [
              buildProcessSubBatchQuery(normalizedBatchNumber, normalizedSubBatchNumber),
              { domain },
            ],
          },
          update: {
            $set: buildNawalaResultUpdateFields(nawalaResult),
          },
        },
      }));

    if (operations.length) {
      await ExpiredDomain.bulkWrite(operations);
    }
  }

  return {
    batchNumber: normalizedBatchNumber,
    subBatchNumber: normalizedSubBatchNumber,
    status: normalizedStatus,
    domainCount: normalizedDomains.length || undefined,
    matchedCount: result.matchedCount || result.n || 0,
    modifiedCount: result.modifiedCount || result.nModified || 0,
  };
};

export const deleteExpiredDomain = async (id) => {
  return ExpiredDomain.findByIdAndDelete(id);
};
