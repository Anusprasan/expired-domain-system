import {
  ensureWaybackBatchService,
  getWaybackBatchService,
  listWaybackBatchesService,
  listWaybackResultsService,
  submitWaybackDomainResultService,
  takeWaybackDomainService,
} from "./waybackChecker.service.js";

function getErrorStatus(error) {
  return error.statusCode || error.status || 500;
}

function emitWaybackCheckerEvent(app, eventName, payload) {
  const emitRealtimeEvent = app.get("emitWaybackCheckerRealtimeEvent");

  if (typeof emitRealtimeEvent === "function") {
    void emitRealtimeEvent(eventName, payload);
    return;
  }

  const io = app.get("io");

  if (!io) {
    return;
  }

  io.of("/wayback-checker").emit(eventName, payload);
}

export async function createWaybackBatch(req, res) {
  try {
    const result = await ensureWaybackBatchService({
      batchNumber: req.body?.batchNumber,
      domains: req.body?.domains,
      nawalaResults: req.body?.nawalaResults,
      actorUser: req.user,
    });
    emitWaybackCheckerEvent(req.app, "wayback-checker:changed", {
      type: "batch-ready",
      batchNumber: result.batch?.batchNumber || Number(req.body?.batchNumber || 1),
      total: result.batch?.total || result.domains?.length || 0,
    });

    return res.json({
      success: true,
      message: `WayBack batch ${String(req.body?.batchNumber || 1).padStart(2, "0")} is ready`,
      data: result,
    });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ success: false, message: error.message });
  }
}

export async function listWaybackBatches(req, res) {
  try {
    const result = await listWaybackBatchesService();
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ success: false, message: error.message });
  }
}

export async function getWaybackBatch(req, res) {
  try {
    const result = await getWaybackBatchService(req.params.batchNumber, req.user);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ success: false, message: error.message });
  }
}

export async function takeWaybackDomain(req, res) {
  try {
    const result = await takeWaybackDomainService(req.params.domainId, req.user);
    emitWaybackCheckerEvent(req.app, "wayback-checker:domain-updated", {
      type: "taken",
      id: result.id,
      batchNumber: result.batchNumber,
      domain: result.domain,
      domainItem: result,
      status: result.status,
      actorUserId: String(req.user?._id || req.user?.id || ""),
    });

    return res.json({ success: true, message: "Domain taken", data: result });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ success: false, message: error.message });
  }
}

export async function submitWaybackDomainResult(req, res) {
  try {
    const result = await submitWaybackDomainResultService(req.params.domainId, req.body, req.user);
    emitWaybackCheckerEvent(req.app, "wayback-checker:domain-updated", {
      type: "result-submitted",
      id: result.id,
      batchNumber: result.batchNumber,
      domain: result.domain,
      domainItem: result,
      status: result.status,
      actorUserId: String(req.user?._id || req.user?.id || ""),
    });
    emitWaybackCheckerEvent(req.app, "wayback-checker:results-updated", {
      type: "result-submitted",
      batchNumber: result.batchNumber,
      status: result.status,
    });

    return res.json({ success: true, message: "WayBack result submitted", data: result });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ success: false, message: error.message });
  }
}

export async function listWaybackResults(req, res) {
  try {
    const result = await listWaybackResultsService(req.params.batchNumber, req.query?.status);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ success: false, message: error.message });
  }
}
