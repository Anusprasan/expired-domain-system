import { createActivityLog, listActivityLogs } from "./activityLog.service.js";

function getPrivilegeKeys(user) {
  return user?.groupId?.privilegeIds?.map((privilege) => privilege.key) || [];
}

function canViewAllLogs(user) {
  const privilegeKeys = getPrivilegeKeys(user);
  return privilegeKeys.includes("ADMIN_ACCESS") || privilegeKeys.includes("VIEW_SYSTEM_AUDIT_LOGS");
}

export const getActivityLogs = async (req, res) => {
  try {
    const data = await listActivityLogs(req.query, req.user, canViewAllLogs(req.user));

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to load activity logs",
    });
  }
};

export const recordPageVisit = async (req, res) => {
  try {
    const path = String(req.body.path || "").trim();
    const pageLabel = String(req.body.pageLabel || "").trim();
    const pageKey = String(req.body.pageKey || "").trim();
    const durationMs = Number(req.body.durationMs) || 0;

    if (!path) {
      return res.status(400).json({
        success: false,
        message: "Path is required",
      });
    }

    await createActivityLog({
      actorUser: req.user,
      module: req.body.module || "navigation",
      category: "navigation",
      action: "page.visit",
      targetType: "page",
      targetId: pageKey || path,
      targetLabel: pageLabel || path,
      summary: `Visited ${pageLabel || path}`,
      details: durationMs > 0 ? `Spent ${durationMs} ms on the page` : "",
      httpMethod: req.method,
      routePath: path,
      statusCode: 201,
      durationMs,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        referrer: req.body.referrer || "",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Page visit recorded",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to record page visit",
    });
  }
};
