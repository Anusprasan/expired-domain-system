const {
  clearCaptureImages,
  captureLiveSite,
  getActorFromHeaders,
  getCaptureImagePath,
  getCaptureImageStorageSummary,
  listAssignedSites,
  removeAssignedSite,
  upsertAssignedSite,
} = require("./screenshotTaker.service");
const {
  getSchedule,
  getScannerStatus,
  queueCaptureSite,
  updateSchedule,
} = require("./screenshotTaker.scheduler.service");
const { flushStateStorage } = require("./screenshotTaker.storage");

function listSites(req, res) {
  return res.json({
    success: true,
    data: {
      items: listAssignedSites(),
    },
  });
}

async function assignSite(req, res) {
  try {
    const site = upsertAssignedSite(req.body, getActorFromHeaders(req.headers));
    await flushStateStorage();

    return res.status(201).json({
      success: true,
      message: "Website assigned to Screenshot Taker",
      data: { item: site },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to assign website",
    });
  }
}

async function removeSite(req, res) {
  try {
    const site = removeAssignedSite(req.params.siteId);
    await flushStateStorage();

    return res.json({
      success: true,
      message: "Website removed from Screenshot Taker",
      data: { item: site },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to remove website",
    });
  }
}

async function captureAssigned(req, res) {
  try {
    const job = queueCaptureSite(req.params.siteId, { source: "manual", priority: true });

    return res.status(202).json({
      success: true,
      message:
        job.status === "scanning"
          ? "Screenshot capture already running"
          : "Screenshot capture queued",
      data: {
        item: job,
        status: getScannerStatus(),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to capture screenshot",
    });
  }
}

async function captureLive(req, res) {
  try {
    const capture = await captureLiveSite(req.body);
    await flushStateStorage();

    return res.json({
      success: true,
      message: capture.status === "success" ? "Screenshot captured" : "Screenshot capture failed",
      data: { item: capture },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to capture screenshot",
    });
  }
}

function getCaptureImage(req, res) {
  try {
    const imageVariant = String(req.query?.variant || req.query?.quality || "").toLowerCase();
    const imagePath = getCaptureImagePath(req.params.captureId, {
      original: imageVariant === "original",
    });

    res.setHeader("Cache-Control", "private, max-age=300");
    return res.sendFile(imagePath);
  } catch (error) {
    return res.status(error.statusCode || 404).json({
      success: false,
      message: error.message || "Screenshot image not found",
    });
  }
}

async function clearCaptureImageStore(req, res) {
  try {
    const summary = clearCaptureImages();
    await flushStateStorage();

    return res.json({
      success: true,
      message: "Screenshot images cleared",
      data: { item: summary },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to clear screenshot images",
    });
  }
}

function getCaptureImageStorage(req, res) {
  try {
    if (String(req.headers["x-screenshot-proxy-is-admin"] || "") !== "true") {
      return res.status(403).json({
        success: false,
        message: "Only admins can view screenshot image storage",
      });
    }

    return res.json({
      success: true,
      data: {
        item: getCaptureImageStorageSummary(),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to load screenshot image storage",
    });
  }
}

function getScheduleItem(req, res) {
  return res.json({
    success: true,
    data: {
      item: getSchedule(),
      status: getScannerStatus(),
    },
  });
}

function getScannerStatusItem(req, res) {
  return res.json({
    success: true,
    data: {
      item: getScannerStatus(),
    },
  });
}

async function updateScheduleItem(req, res) {
  try {
    const schedule = updateSchedule(req.body, {
      canManageTelegram: String(req.headers["x-screenshot-proxy-is-admin"] || "") === "true",
    });
    await flushStateStorage();

    return res.json({
      success: true,
      message: "Screenshot schedule updated",
      data: { item: schedule, status: getScannerStatus() },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to update schedule",
    });
  }
}

module.exports = {
  assignSite,
  clearCaptureImageStore,
  captureAssigned,
  captureLive,
  getCaptureImage,
  getCaptureImageStorage,
  getScheduleItem,
  getScannerStatusItem,
  listSites,
  removeSite,
  updateScheduleItem,
};
