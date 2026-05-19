const FIFTEEN_MINUTES =
  15 * 60 * 1000;

const checkSubBatchLock = (
  subBatch,
  userId
) => {

  // no lock
  if (!subBatch.lockedBy) {
    return {
      allowed: true,
    };
  }

  const isExpired =
    subBatch.lockedAt &&
    Date.now() -
      new Date(
        subBatch.lockedAt
      ).getTime() >
      FIFTEEN_MINUTES;

  // expired lock
  if (isExpired) {
    return {
      allowed: true,
    };
  }

  // same processor
  if (
    subBatch.lockedBy.toString() ===
    userId.toString()
  ) {
    return {
      allowed: true,
    };
  }

  // locked by another processor
  return {
    allowed: false,
    message:
      "Sub batch currently in use",
  };
};

module.exports = checkSubBatchLock;