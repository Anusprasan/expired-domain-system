import {
  getLPServersService,
  createLPServerService,
  updateLPServerService,
  deleteLPServerService,
  getLPServerByIdService,
  importLPServersCsvService,
  previewLPServersCsvImportService,
  exportLPServersCsvService,
} from "./lpServer.service.js";

import { encrypt, decrypt } from "../../app/utils/crypto.js";
import { createActivityLog } from "../activity-logs/activityLog.service.js";

function hasUserPrivilege(user, privilegeKey) {
  const privilegeKeys = user?.groupId?.privilegeIds?.map((item) => item.key) || [];
  const groupName = user?.groupId?.name?.toLowerCase();

  return groupName === "admin"
    || privilegeKeys.includes("ADMIN_ACCESS")
    || privilegeKeys.includes(privilegeKey);
}

function sanitizeLPServerResponse(item) {
  const value = item?.toObject ? item.toObject() : { ...(item || {}) };

  delete value.password;
  delete value.decryptedPassword;

  return value;
}

function buildLPServerLabel(server) {
  const brandName = server?.brandId?.brandName || "Unknown Brand";
  const url = String(server?.url || "").trim();
  return url ? `${brandName} - ${url}` : brandName;
}

function getRoutePath(req) {
  return String(req.originalUrl || req.baseUrl || req.path || "").split("?")[0];
}

function safeCreateActivityLog(payload) {
  return createActivityLog(payload).catch((error) => {
    console.error("Failed to write LP server activity log:", error.message);
  });
}

export const getLPServers = async (req, res) => {
  try {
    const data = await getLPServersService(req.query);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

export const createLPServer = async (req, res) => {
  try {

    const payload = { ...req.body };

    if (payload.password) {
      payload.password = encrypt(payload.password);
    }
    const data = await createLPServerService(payload, req.user._id);

    req.auditLog = {
      ...(req.auditLog || {}),
      targetId: data._id,
      targetLabel: buildLPServerLabel(data),
      details: `Brand: ${data.brandId?.brandName || "-"} | URL: ${data.url || "-"} | Server IP: ${data.serverIp || "-"}`,
      metadata: {
        brandName: data.brandId?.brandName || "",
        url: data.url || "",
        serverIp: data.serverIp || "",
        username: data.username || "",
      },
    };

    res.status(201).json({
      success: true,
      message: "LP Server created",
      data: sanitizeLPServerResponse(data),
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

export const updateLPServer = async (req, res) => {
  try {
    const payload = { ...req.body };

    if (payload.password) {
      payload.password = encrypt(payload.password);
    }

    const data = await updateLPServerService(req.params.id, payload);

    req.auditLog = {
      ...(req.auditLog || {}),
      targetId: data._id,
      targetLabel: buildLPServerLabel(data),
      details: `Brand: ${data.brandId?.brandName || "-"} | URL: ${data.url || "-"} | Server IP: ${data.serverIp || "-"}`,
      metadata: {
        brandName: data.brandId?.brandName || "",
        url: data.url || "",
        serverIp: data.serverIp || "",
        username: data.username || "",
      },
    };

    res.json({
      success: true,
      message: "LP Server updated",
      data: sanitizeLPServerResponse(data),
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

export const deleteLPServer = async (req, res) => {
  try {
    const deletedServer = await deleteLPServerService(req.params.id);

    req.auditLog = {
      ...(req.auditLog || {}),
      targetId: deletedServer._id,
      targetLabel: buildLPServerLabel(deletedServer),
      details: `Brand: ${deletedServer.brandId?.brandName || "-"} | URL: ${deletedServer.url || "-"} | Server IP: ${deletedServer.serverIp || "-"}`,
      metadata: {
        brandName: deletedServer.brandId?.brandName || "",
        url: deletedServer.url || "",
        serverIp: deletedServer.serverIp || "",
        username: deletedServer.username || "",
      },
    };

    res.json({
      success: true,
      message: "LP Server deleted",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

export const getLPServerPassword = async (req, res) => {
  try {
    const server = await getLPServerByIdService(req.params.id);
    const decryptedPassword = decrypt(server.password);

    await safeCreateActivityLog({
      actorUser: req.user,
      module: "lp-servers",
      category: "access",
      action: "lp-server.password.view",
      targetType: "lp-server",
      targetId: server._id,
      targetLabel: buildLPServerLabel(server),
      summary: "Viewed an LP server password",
      details: `Brand: ${server.brandId?.brandName || "-"} | URL: ${server.url || "-"} | Server IP: ${server.serverIp || "-"}`,
      httpMethod: req.method,
      routePath: getRoutePath(req),
      statusCode: 200,
      durationMs: Date.now() - (req.auditLog?.requestStartedAt || Date.now()),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        brandName: server.brandId?.brandName || "",
        url: server.url || "",
        serverIp: server.serverIp || "",
        username: server.username || "",
      },
    });

    res.json({
      success: true,
      password: decryptedPassword,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

export const previewLPServersCsvImport = async (req, res) => {
  try {
    const result = await previewLPServersCsvImportService({
      ...req.body,
      allowUpdates: hasUserPrivilege(req.user, "EDIT_LP_SERVERS_DETAILS"),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

export const importLPServersCsv = async (req, res) => {
  try {
    const result = await importLPServersCsvService({
      ...req.body,
      userId: req.user?._id,
      allowUpdates: hasUserPrivilege(req.user, "EDIT_LP_SERVERS_DETAILS"),
    });

    req.auditLog = {
      ...(req.auditLog || {}),
      targetLabel: `${result.createdCount} imported / ${result.updatedCount || 0} updated`,
      summary: `Imported ${result.createdCount} LP server row${result.createdCount === 1 ? "" : "s"} and updated ${result.updatedCount || 0} existing row${(result.updatedCount || 0) === 1 ? "" : "s"}`,
      details: result.skippedCount
        ? `${result.skippedCount} row${result.skippedCount === 1 ? "" : "s"} skipped`
        : "",
      metadata: {
        createdCount: result.createdCount,
        updatedCount: result.updatedCount || 0,
        skippedCount: result.skippedCount,
      },
    };

    return res.status(201).json({
      success: true,
      message: "LP Server CSV import completed",
      data: result,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

export const exportLPServersCsv = async (req, res) => {
  try {
    const { csv, total } = await exportLPServersCsvService();
    const timestamp = new Date().toISOString().slice(0, 10);

    await safeCreateActivityLog({
      actorUser: req.user,
      module: "lp-servers",
      category: "data",
      action: "lp-server.export",
      targetType: "lp-server-export",
      targetLabel: `${total} LP server row${total === 1 ? "" : "s"}`,
      summary: `Exported ${total} LP server row${total === 1 ? "" : "s"} to CSV`,
      httpMethod: req.method,
      routePath: getRoutePath(req),
      statusCode: 200,
      durationMs: Date.now() - (req.auditLog?.requestStartedAt || Date.now()),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        totalRows: total,
      },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="lp-servers-${timestamp}.csv"`
    );

    return res.send(csv);
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
