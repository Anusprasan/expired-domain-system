import {
  bulkDeleteBlockedMoneySitesService,
  bulkUpdateMoneySiteStatusesService,
  createMoneySiteService,
  deleteAllMoneySitesService,
  deleteMoneySiteService,
  exportMoneySitesCsvService,
  getMoneySiteActivityLogsService,
  getMoneySiteSummaryService,
  listMoneySiteDomainsService,
  getMoneySitesService,
  getMoneySiteUrlsForCheckerService,
  importMoneySitesCsvService,
  previewMoneySitesCsvImportService,
  requestDeleteAllMoneySitesVerificationService,
  requestMoneySitesCsvImportVerificationService,
  updateMoneySiteService,
} from "./moneySite.service.js";
import {
  deleteMoneySitePushSubscriptionService,
  getMoneySitePushConfigService,
  sendMoneySiteBlockedPushNotifications,
  upsertMoneySitePushSubscriptionService,
} from "./moneySitePush.service.js";

function getUserPrivilegeKeys(user) {
  return user?.groupId?.privilegeIds?.map((item) => item.key) || [];
}

function hasUserPrivilege(user, privilegeKey) {
  const userPrivileges = getUserPrivilegeKeys(user);
  const groupName = user?.groupId?.name?.toLowerCase();

  return groupName === "admin"
    || userPrivileges.includes("ADMIN_ACCESS")
    || userPrivileges.includes(privilegeKey);
}

function emitMoneySiteEvent(app, eventName, payload) {
  const emitRealtimeEvent = app.get("emitMoneySiteRealtimeEvent");

  if (typeof emitRealtimeEvent === "function") {
    void emitRealtimeEvent(eventName, payload);
    return;
  }

  const io = app.get("io");

  if (!io) {
    return;
  }

  io.of("/money-sites").emit(eventName, payload);
}

export async function getMoneySites(req, res) {
  try {
    const result = await getMoneySitesService(req.query);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getMoneySiteDomains(req, res) {
  try {
    const items = await listMoneySiteDomainsService();

    return res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getMoneySiteSummary(req, res) {
  try {
    const summary = await getMoneySiteSummaryService(req.query);

    return res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getMoneySitePushConfig(req, res) {
  try {
    const config = getMoneySitePushConfigService();

    return res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function subscribeMoneySitePush(req, res) {
  try {
    const result = await upsertMoneySitePushSubscriptionService(req.user, req.body);

    return res.status(201).json({
      success: true,
      message: "Money-site push subscription saved successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function unsubscribeMoneySitePush(req, res) {
  try {
    const result = await deleteMoneySitePushSubscriptionService(req.user, req.body);

    return res.json({
      success: true,
      message: "Money-site push subscription removed successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function createMoneySite(req, res) {
  try {
    const item = await createMoneySiteService(req.body);

    req.auditLog = {
      ...(req.auditLog || {}),
      targetId: item._id,
      targetLabel: item.domain,
    };

    emitMoneySiteEvent(req.app, "money-sites:changed", {
      type: "created",
      ids: [String(item._id)],
    });

    return res.status(201).json({
      success: true,
      message: "Money site created successfully",
      data: item,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function importMoneySitesCsv(req, res) {
  try {
    const result = await importMoneySitesCsvService({
      ...req.body,
      userId: req.user?._id,
      allowUpdates: hasUserPrivilege(req.user, "EDIT_MONEY_SITES"),
    });

    req.auditLog = {
      ...(req.auditLog || {}),
      targetLabel: `${result.createdCount} imported / ${result.updatedCount || 0} updated`,
      summary: `Imported ${result.createdCount} money site row${result.createdCount === 1 ? "" : "s"} and updated ${result.updatedCount || 0} existing row${(result.updatedCount || 0) === 1 ? "" : "s"}`,
      details: result.skippedCount
        ? `${result.skippedCount} row${result.skippedCount === 1 ? "" : "s"} skipped`
        : "",
      metadata: {
        createdCount: result.createdCount,
        updatedCount: result.updatedCount || 0,
        skippedCount: result.skippedCount,
      },
    };

    emitMoneySiteEvent(req.app, "money-sites:changed", {
      type: "imported",
      ids: [],
    });

    return res.status(201).json({
      success: true,
      message: "Money site CSV import completed",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function requestMoneySitesCsvImportVerification(req, res) {
  try {
    const result = await requestMoneySitesCsvImportVerificationService({
      ...req.body,
      userId: req.user?._id,
      allowUpdates: hasUserPrivilege(req.user, "EDIT_MONEY_SITES"),
    });

    return res.status(201).json({
      success: true,
      message: "Telegram verification code sent successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function previewMoneySitesCsvImport(req, res) {
  try {
    const result = await previewMoneySitesCsvImportService({
      ...req.body,
      userId: req.user?._id,
      allowUpdates: hasUserPrivilege(req.user, "EDIT_MONEY_SITES"),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getMoneySiteActivityLogs(req, res) {
  try {
    const result = await getMoneySiteActivityLogsService(req.query);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function requestDeleteAllMoneySitesVerification(req, res) {
  try {
    const result = await requestDeleteAllMoneySitesVerificationService({
      userId: req.user?._id,
    });

    return res.status(201).json({
      success: true,
      message: "Delete verification code sent successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteAllMoneySites(req, res) {
  try {
    const result = await deleteAllMoneySitesService({
      ...req.body,
      userId: req.user?._id,
    });

    req.auditLog = {
      ...(req.auditLog || {}),
      targetLabel: `${result.deletedCount} money sites deleted`,
      summary: `Deleted all money sites (${result.deletedCount})`,
      details: result.deletedDomains.slice(0, 5).join(", "),
      metadata: {
        deletedCount: result.deletedCount,
      },
    };

    emitMoneySiteEvent(req.app, "money-sites:changed", {
      type: "deleted-all",
      ids: result.deletedIds,
    });

    return res.json({
      success: true,
      message: "All money sites deleted successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function exportMoneySitesCsv(req, res) {
  try {
    const csv = await exportMoneySitesCsvService(req.query);
    const timestamp = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="money-sites-${timestamp}.csv"`
    );

    return res.send(csv);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateMoneySite(req, res) {
  try {
    const item = await updateMoneySiteService(req.params.id, req.body);

    req.auditLog = {
      ...(req.auditLog || {}),
      targetId: item._id,
      targetLabel: item.domain,
    };

    emitMoneySiteEvent(req.app, "money-sites:changed", {
      type: "updated",
      ids: [String(item._id)],
    });

    return res.json({
      success: true,
      message: "Money site updated successfully",
      data: item,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteMoneySite(req, res) {
  try {
    const deletedItem = await deleteMoneySiteService(req.params.id);

    req.auditLog = {
      ...(req.auditLog || {}),
      targetId: req.params.id,
      targetLabel: deletedItem?.domain || "",
    };

    emitMoneySiteEvent(req.app, "money-sites:changed", {
      type: "deleted",
      ids: [String(req.params.id)],
    });

    return res.json({
      success: true,
      message: "Money site deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function bulkDeleteBlockedMoneySites(req, res) {
  try {
    const result = await bulkDeleteBlockedMoneySitesService(req.body);

    req.auditLog = {
      ...(req.auditLog || {}),
      targetLabel: `${result.deletedCount} blocked money sites deleted`,
      summary: `Deleted ${result.deletedCount} blocked money site row${result.deletedCount === 1 ? "" : "s"}`,
      details: result.deletedDomains.slice(0, 5).join(", "),
      metadata: {
        deletedCount: result.deletedCount,
        skippedCount: result.skippedCount,
      },
    };

    emitMoneySiteEvent(req.app, "money-sites:changed", {
      type: "bulk-deleted",
      ids: result.deletedIds,
    });

    return res.json({
      success: true,
      message: "Blocked money sites deleted successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getMoneySiteUrls(req, res) {
  try {
    const items = await getMoneySiteUrlsForCheckerService();
    return res.status(200).json(items);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function bulkUpdateMoneySiteStatuses(req, res) {
  try {
    const result = await bulkUpdateMoneySiteStatusesService(req.body);
    const livePayload = {
      updatedIds: result.updatedIds,
      newlyBlockedDomains: result.newlyBlockedDomains,
      success: result.success,
      failed: result.failed,
      source: "http",
      scanId: result.scanId,
      batchId: result.batchId,
      batchNumber: result.batchNumber,
      totalBatches: result.totalBatches,
      isComplete: result.isComplete,
      summary: result.summary,
      totalDomains: result.totalDomains,
      blockedDomains: result.blockedDomains,
    };

    emitMoneySiteEvent(req.app, "money-sites:status-updated", livePayload);
    if (result.newlyBlockedDomains.length) {
      void sendMoneySiteBlockedPushNotifications(result.newlyBlockedDomains);
    }

    if (result.isComplete) {
      emitMoneySiteEvent(req.app, "money-sites:bulk-check-complete", livePayload);
    }

    return res.status(200).json({
      success: true,
      message: result.isComplete ? "Bulk update completed" : "Batch update processed",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}
