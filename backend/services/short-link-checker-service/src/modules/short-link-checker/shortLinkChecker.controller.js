const {
  clearAllCheckImages,
  checkAllShortLinks,
  checkShortLink,
  createShortLink,
  getActorFromHeaders,
  getCheckImagePath,
  getCheckerStatus,
  getScheduleSettings,
  getTelegramSettings,
  importShortLinks,
  listShortLinks,
  removeAllShortLinks,
  removeShortLink,
  setScheduleEnabled,
  updateScheduleSettings,
  updateShortLink,
  updateTelegramSettings,
} = require("./shortLinkChecker.service");

function listLinks(req, res) {
  try {
    const linkResult = listShortLinks(req.query);

    return res.json({
      success: true,
      data: {
        ...linkResult,
        telegram: getTelegramSettings(),
        schedule: getScheduleSettings(),
        status: getCheckerStatus(),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to load short links",
    });
  }
}

function createLink(req, res) {
  try {
    const item = createShortLink(req.body, getActorFromHeaders(req.headers));

    return res.status(201).json({
      success: true,
      message: "Short link added",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to add short link",
    });
  }
}

function importLinks(req, res) {
  try {
    const item = importShortLinks(req.body, getActorFromHeaders(req.headers));

    return res.status(201).json({
      success: true,
      message: `Imported ${item.createdCount} short links`,
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to import short links",
    });
  }
}

function updateLink(req, res) {
  try {
    const item = updateShortLink(req.params.linkId, req.body, getActorFromHeaders(req.headers));

    return res.json({
      success: true,
      message: "Short link updated",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to update short link",
    });
  }
}

function deleteLink(req, res) {
  try {
    const item = removeShortLink(req.params.linkId);

    return res.json({
      success: true,
      message: "Short link removed",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to remove short link",
    });
  }
}

function deleteAllLinks(req, res) {
  try {
    const item = removeAllShortLinks(getActorFromHeaders(req.headers));

    return res.json({
      success: true,
      message: `Removed ${item.removedLinks} short links`,
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to remove short links",
    });
  }
}

async function checkLink(req, res) {
  try {
    const item = await checkShortLink(req.params.linkId, req.body || {});
    const message = item.status === "error"
      ? "Short link checked with errors"
      : item.status === "cloudflare"
        ? "Short link checked with Cloudflare verification"
        : item.status === "security-verification"
          ? "Short link checked with security verification"
          : "Short link checked";

    return res.json({
      success: true,
      message,
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to check short link",
    });
  }
}

async function checkAllLinks(req, res) {
  try {
    const item = await checkAllShortLinks(req.body || {});

    return res.json({
      success: true,
      message: "Short link check completed",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to check short links",
    });
  }
}

function getStatus(req, res) {
  try {
    return res.json({
      success: true,
      data: { item: getCheckerStatus() },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to load checker status",
    });
  }
}

function getSchedule(req, res) {
  try {
    return res.json({
      success: true,
      data: {
        item: getScheduleSettings(),
        status: getCheckerStatus(),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to load schedule",
    });
  }
}

function updateSchedule(req, res) {
  try {
    const item = updateScheduleSettings(req.body);

    return res.json({
      success: true,
      message: "Short link schedule updated",
      data: {
        item,
        status: getCheckerStatus(),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to update schedule",
    });
  }
}

function toggleSchedule(req, res) {
  try {
    const item = setScheduleEnabled(Boolean(req.body?.enabled), req.body || {});

    return res.json({
      success: true,
      message: item.enabled ? "Short link schedule started" : "Short link schedule stopped",
      data: {
        item,
        status: getCheckerStatus(),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to update schedule",
    });
  }
}

function getCheckImage(req, res) {
  try {
    const imagePath = getCheckImagePath(req.params.checkId);

    res.setHeader("Cache-Control", "private, max-age=300");
    return res.sendFile(imagePath);
  } catch (error) {
    return res.status(error.statusCode || 404).json({
      success: false,
      message: error.message || "Short link screenshot not found",
    });
  }
}

function clearCheckImages(req, res) {
  try {
    const item = clearAllCheckImages();

    return res.json({
      success: true,
      message: `Cleared ${item.removedFiles} images`,
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to clear short-link images",
    });
  }
}

function getTelegram(req, res) {
  try {
    return res.json({
      success: true,
      data: { item: getTelegramSettings() },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to load Telegram settings",
    });
  }
}

function updateTelegram(req, res) {
  try {
    const item = updateTelegramSettings(req.body);

    return res.json({
      success: true,
      message: "Telegram settings saved",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to update Telegram settings",
    });
  }
}

module.exports = {
  clearCheckImages,
  checkAllLinks,
  checkLink,
  createLink,
  deleteAllLinks,
  deleteLink,
  getCheckImage,
  getSchedule,
  getStatus,
  getTelegram,
  importLinks,
  listLinks,
  toggleSchedule,
  updateLink,
  updateSchedule,
  updateTelegram,
};
