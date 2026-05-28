import {
  checkAllCuttlyLinksService,
  checkCuttlyLinkService,
  createCuttlyLinkService,
  deleteCuttlyLinkService,
  getCuttlySettingsService,
  getCuttlyStatusService,
  listCuttlyLinksService,
  setCuttlyScheduleEnabledService,
  updateCuttlyApiSettingsService,
  updateCuttlyLinkService,
  updateCuttlyScheduleSettingsService,
  updateCuttlyTelegramSettingsService,
} from "./cuttlyLinkChecker.service.js";

export async function listCuttlyLinks(req, res) {
  try {
    const data = await listCuttlyLinksService(req.query);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to load Cutt.ly links",
    });
  }
}

export async function createCuttlyLink(req, res) {
  try {
    const item = await createCuttlyLinkService(req.body, req.user);

    return res.status(201).json({
      success: true,
      message: "Cutt.ly link added",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to add Cutt.ly link",
    });
  }
}

export async function updateCuttlyLink(req, res) {
  try {
    const item = await updateCuttlyLinkService(req.params.id, req.body, req.user);

    return res.json({
      success: true,
      message: "Cutt.ly link updated",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to update Cutt.ly link",
    });
  }
}

export async function deleteCuttlyLink(req, res) {
  try {
    const item = await deleteCuttlyLinkService(req.params.id);

    return res.json({
      success: true,
      message: "Cutt.ly link removed",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to remove Cutt.ly link",
    });
  }
}

export async function checkCuttlyLink(req, res) {
  try {
    const item = await checkCuttlyLinkService(req.params.id, { source: "manual" });

    return res.json({
      success: true,
      message: item.status === "blocked" ? "Cutt.ly reports this URL as blocked" : "Cutt.ly check completed",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to check Cutt.ly link",
    });
  }
}

export async function checkAllCuttlyLinks(req, res) {
  try {
    const item = await checkAllCuttlyLinksService({ source: "manual", ...req.body });

    return res.json({
      success: true,
      message: "Cutt.ly batch check completed",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to check Cutt.ly links",
    });
  }
}

export function getCuttlyStatus(req, res) {
  try {
    return res.json({
      success: true,
      data: { item: getCuttlyStatusService() },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to load Cutt.ly status",
    });
  }
}

export async function getCuttlySettings(req, res) {
  try {
    const item = await getCuttlySettingsService();

    return res.json({
      success: true,
      data: { item, status: getCuttlyStatusService() },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to load Cutt.ly settings",
    });
  }
}

export async function updateCuttlyApiSettings(req, res) {
  try {
    const item = await updateCuttlyApiSettingsService(req.body);

    return res.json({
      success: true,
      message: "Cutt.ly API settings saved",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to save Cutt.ly API settings",
    });
  }
}

export async function updateCuttlyTelegramSettings(req, res) {
  try {
    const item = await updateCuttlyTelegramSettingsService(req.body);

    return res.json({
      success: true,
      message: "Cutt.ly Telegram settings saved",
      data: { item },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to save Cutt.ly Telegram settings",
    });
  }
}

export async function updateCuttlyScheduleSettings(req, res) {
  try {
    const item = await updateCuttlyScheduleSettingsService(req.body);

    return res.json({
      success: true,
      message: "Cutt.ly schedule settings saved",
      data: {
        item,
        status: getCuttlyStatusService(),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to save Cutt.ly schedule settings",
    });
  }
}

export async function toggleCuttlySchedule(req, res) {
  try {
    const item = await setCuttlyScheduleEnabledService(Boolean(req.body?.enabled), req.body || {});

    return res.json({
      success: true,
      message: item.enabled ? "Cutt.ly schedule started" : "Cutt.ly schedule stopped",
      data: {
        item,
        status: getCuttlyStatusService(),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to update Cutt.ly schedule",
    });
  }
}
