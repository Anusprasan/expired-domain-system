import {
  createExpiredDomain,
  deleteExpiredDomain,
  getCurrentExpiredDomainBatch,
  importExpiredDomains,
  listExpiredDomainProcessSubBatchDomains,
  listExpiredDomainProcessSubBatches,
  listExpiredDomains,
  moveCurrentExpiredDomainBatchToProcess,
  updateExpiredDomainProcessSubBatchStatus,
} from "./expiredDomain.service.js";

function getErrorStatus(error) {
  return error.statusCode || error.status || 500;
}

export const getExpiredDomains = async (req, res) => {
  try {
    const items = await listExpiredDomains({
      $or: [
        { stage: "process" },
        { stage: { $exists: false } },
      ],
    });
    return res.json({ success: true, data: items });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getExpiredDomainBatch = async (req, res) => {
  try {
    const batch = await getCurrentExpiredDomainBatch();
    return res.json({ success: true, data: batch });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getExpiredDomainProcessSubBatches = async (req, res) => {
  try {
    const items = await listExpiredDomainProcessSubBatches();
    return res.json({ success: true, data: items });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ success: false, message: error.message });
  }
};

export const getExpiredDomainProcessSubBatchDomains = async (req, res) => {
  try {
    const result = await listExpiredDomainProcessSubBatchDomains(
      req.params.batchNumber,
      req.params.subBatchNumber,
      req.query?.status
    );
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ success: false, message: error.message });
  }
};

export const uploadExpiredDomains = async (req, res) => {
  try {
    const { domains } = req.body;
    const result = await importExpiredDomains(domains || [], req.user?._id);
    return res.json({
      success: true,
      message: `Import completed for batch ${String(result.batchNumber).padStart(2, "0")}`,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const moveExpiredDomainBatchToProcess = async (req, res) => {
  try {
    const result = await moveCurrentExpiredDomainBatchToProcess(req.user?._id);
    return res.json({
      success: true,
      message: result.movedCount
        ? `Batch ${String(result.batchNumber).padStart(2, "0")} moved to process`
        : "No uploaded domains found in the current batch",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const patchExpiredDomainProcessSubBatchStatus = async (req, res) => {
  try {
    const result = await updateExpiredDomainProcessSubBatchStatus({
      batchNumber: req.params.batchNumber,
      subBatchNumber: req.params.subBatchNumber,
      status: req.body?.status,
      domains: req.body?.domains,
      nawalaResults: req.body?.nawalaResults,
      userId: req.user?._id,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(getErrorStatus(error)).json({ success: false, message: error.message });
  }
};

export const postExpiredDomain = async (req, res) => {
  try {
    const doc = await createExpiredDomain({ ...req.body, createdBy: req.user?._id });
    return res.json({ success: true, data: doc });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const removeExpiredDomain = async (req, res) => {
  try {
    const doc = await deleteExpiredDomain(req.params.id);
    return res.json({ success: true, data: doc });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
