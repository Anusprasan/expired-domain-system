import fs from "fs/promises";
import path from "path";
import ActivityLog from "./activityLog.model.js";

const ARCHIVE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
const ARCHIVE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const ARCHIVE_DIR = path.resolve(process.cwd(), "activity-log-backups");

let archiveTimer = null;
let isArchiveRunning = false;

function formatDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatTimestamp(date) {
  return [
    date.getFullYear(),
    formatDatePart(date.getMonth() + 1),
    formatDatePart(date.getDate()),
  ].join("-")
    + "_"
    + [
      formatDatePart(date.getHours()),
      formatDatePart(date.getMinutes()),
      formatDatePart(date.getSeconds()),
    ].join("-");
}

async function ensureArchiveDirectory() {
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
}

async function writeArchiveFile(logs) {
  const firstOccurredAt = new Date(logs[0].occurredAt);
  const lastOccurredAt = new Date(logs[logs.length - 1].occurredAt);
  const generatedAt = new Date();
  const fileName = `activity-logs_${formatTimestamp(firstOccurredAt)}_to_${formatTimestamp(lastOccurredAt)}.json`;
  const filePath = path.join(ARCHIVE_DIR, fileName);

  const payload = {
    generatedAt: generatedAt.toISOString(),
    recordCount: logs.length,
    range: {
      from: firstOccurredAt.toISOString(),
      to: lastOccurredAt.toISOString(),
    },
    logs,
  };

  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return filePath;
}

export async function archiveExpiredActivityLogs() {
  if (isArchiveRunning) {
    return { archivedCount: 0, filePath: "", skipped: true };
  }

  isArchiveRunning = true;

  try {
    const cutoffDate = new Date(Date.now() - ARCHIVE_INTERVAL_MS);
    const logs = await ActivityLog.find({
      occurredAt: { $lte: cutoffDate },
    })
      .sort({ occurredAt: 1 })
      .lean();

    if (!logs.length) {
      return { archivedCount: 0, filePath: "", skipped: false };
    }

    await ensureArchiveDirectory();
    const filePath = await writeArchiveFile(logs);

    await ActivityLog.deleteMany({
      _id: { $in: logs.map((item) => item._id) },
    });

    return {
      archivedCount: logs.length,
      filePath,
      skipped: false,
    };
  } finally {
    isArchiveRunning = false;
  }
}

export function startActivityLogArchiver() {
  if (archiveTimer) {
    return;
  }

  const runArchive = async () => {
    try {
      const result = await archiveExpiredActivityLogs();

      if (result.archivedCount > 0) {
        console.log(
          `Archived ${result.archivedCount} activity logs to ${result.filePath}`
        );
      }
    } catch (error) {
      console.error("Activity log archiving failed:", error.message);
    }
  };

  void runArchive();
  archiveTimer = setInterval(() => {
    void runArchive();
  }, ARCHIVE_CHECK_INTERVAL_MS);
}
