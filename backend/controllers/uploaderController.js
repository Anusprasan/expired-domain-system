const DraftSheet = require("../models/DraftSheet");
const DraftDomain = require("../models/DraftDomain");
const DomainHistory = require("../models/DomainHistory");
const ProcessorSubBatch = require("../models/ProcessorSubBatch");

const pasteDomains = async (req, res) => {
  try {
    const { domains } = req.body;

    if (!domains) {
      return res.status(400).json({
        message: "Domains are required",
      });
    }

    let draftSheet = await DraftSheet.findOne({
      status: "open",
    });

    if (!draftSheet) {
      const batchCount = await DraftSheet.countDocuments();

      draftSheet = await DraftSheet.create({
        batchName: `Batch #${batchCount + 1}`,
      });
    }

    const domainList = domains
      .split("\n")
      .map((domain) => domain.trim())
      .filter((domain) => domain !== "");

    if (domainList.length === 0) {
      return res.status(400).json({
        message: "No valid domains found",
      });
    }

    const cleanedDomains = domainList.map(
  (domain) =>
    domain.trim().toLowerCase()
);

const existingDomains =
  await DraftDomain.find({
    domain: {
      $in: cleanedDomains,
    },
    status: {
      $ne: "deleted",
    },
  }).select("domain");

const existingDomainSet =
  new Set(
    existingDomains.map(
      (item) => item.domain
    )
  );

const currentPasteSet =
  new Set();

const domainRegex =
  /^(?!-)[A-Za-z0-9-]+\.[A-Za-z]{2,}$/;

const domainDocs =
  cleanedDomains.map((domain) => {

    let status = "draft";

    if (
      !domainRegex.test(domain)
    ) {
      status = "invalid";
    }

    else if (
      existingDomainSet.has(
        domain
      ) ||
      currentPasteSet.has(
        domain
      )
    ) {
      status = "duplicate";
    }

    currentPasteSet.add(domain);

    return {
      domain,
      sheetId:
        draftSheet._id,
      addedBy:
        req.user._id,
      status,
    };
  });
    const savedDomains = await DraftDomain.insertMany(domainDocs);

    const historyDocs = savedDomains.map((draftDomain) => ({
      domain: draftDomain.domain,
      action: "added",
      sheetId: draftSheet._id,
      domainId: draftDomain._id,
      userId: req.user._id,
      role: req.user.role,
    }));

    await DomainHistory.insertMany(historyDocs);

    draftSheet.totalDomains += savedDomains.length;

    await draftSheet.save();

    res.status(201).json({
      message: "Domains pasted successfully",
      batch: {
        id: draftSheet._id,
        batchName: draftSheet.batchName,
        totalDomains: draftSheet.totalDomains,
        status: draftSheet.status,
      },
      addedCount: savedDomains.length,
    });
  } catch (error) {
    console.error("Paste domains error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

const getMyDraftPreview = async (req, res) => {
  try {
    // find current open batch
    const draftSheet = await DraftSheet.findOne({
      status: "open",
    });

    // no open batch
    if (!draftSheet) {
      return res.status(404).json({
        message: "No open batch found",
      });
    }

    // get only logged uploader domains
    const myDomains = await DraftDomain.find({
      sheetId: draftSheet._id,
      addedBy: req.user._id,
      status: { $ne: "deleted" },
    }).sort({ createdAt: -1 });

    res.status(200).json({
      batch: {
        id: draftSheet._id,
        batchName: draftSheet.batchName,
        totalDomains: draftSheet.totalDomains,
        status: draftSheet.status,
      },

      myDomainsCount: myDomains.length,

      myDomains,
    });
  } catch (error) {
    console.error("Preview error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

const deleteMyDraftDomain = async (req, res) => {
  try {
    const { id } = req.params;

    // find domain
    const draftDomain = await DraftDomain.findById(id);

    if (!draftDomain) {
      return res.status(404).json({
        message: "Domain not found",
      });
    }

    // check ownership
    if (
      draftDomain.addedBy.toString() !==
      req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "You can delete only your domains",
      });
    }

    // already deleted
    if (draftDomain.status === "deleted") {
      return res.status(400).json({
        message: "Domain already deleted",
      });
    }

    // soft delete
    draftDomain.status = "deleted";

    await draftDomain.save();

    // reduce batch count
    await DraftSheet.findByIdAndUpdate(
      draftDomain.sheetId,
      {
        $inc: { totalDomains: -1 },
      }
    );

    // save history
    await DomainHistory.create({
      domain: draftDomain.domain,
      action: "deleted",
      reason: "Uploader deleted domain",
      sheetId: draftDomain.sheetId,
      domainId: draftDomain._id,
      userId: req.user._id,
      role: req.user.role,
    });

    res.status(200).json({
      message: "Domain deleted successfully",
    });
  } catch (error) {
    console.error("Delete domain error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

const chunkArray = (array, size) => {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
};

  const moveToProcess = async (req, res) => {
  try {
    const draftSheet = await DraftSheet.findOne({
      status: "open",
    });

    if (!draftSheet) {
      return res.status(404).json({
        message: "No open batch found",
      });
    }

    if (draftSheet.totalDomains === 0) {
      return res.status(400).json({
        message: "Cannot move empty batch",
      });
    }

    const validDomains = await DraftDomain.find({
      sheetId: draftSheet._id,
      status: "draft",
    }).select("domain");

    if (validDomains.length === 0) {
      return res.status(400).json({
        message: "No valid domains to move",
      });
    }

    const existingSubBatches = await ProcessorSubBatch.countDocuments({
      batchId: draftSheet._id,
    });

    if (existingSubBatches > 0) {
      return res.status(400).json({
        message: "Processor sub-batches already created",
      });
    }

    const domainNames = validDomains.map((item) => item.domain);

    const chunks = chunkArray(domainNames, 900);

    const subBatchDocs = chunks.map((chunk, index) => ({
      batchId: draftSheet._id,
      subBatchNumber: index + 1,
      domains: chunk,
      totalDomains: chunk.length,
      status: "pending",
    }));

    await ProcessorSubBatch.insertMany(subBatchDocs);

    draftSheet.status = "locked";
    draftSheet.movedToProcessBy = req.user._id;
    draftSheet.movedToProcessAt = new Date();

    await draftSheet.save();

    await DomainHistory.create({
      action: "moved_to_process",
      reason: "Batch moved to process",
      sheetId: draftSheet._id,
      userId: req.user._id,
      role: req.user.role,
    });

    res.status(200).json({
      message: "Batch moved to process successfully",
      batch: {
        id: draftSheet._id,
        batchName: draftSheet.batchName,
        totalDomains: draftSheet.totalDomains,
        status: draftSheet.status,
      },
      subBatchesCreated: subBatchDocs.length,
    });
  } catch (error) {
    console.error("Move to process error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

const getCurrentBatch = async (req, res) => {
  try {
    let draftSheet = await DraftSheet.findOne({
      status: "open",
    });

    if (!draftSheet) {
      const batchCount = await DraftSheet.countDocuments();

      draftSheet = await DraftSheet.create({
        batchName: `Batch #${batchCount + 1}`,
      });
    }

    const totalDomains = await DraftDomain.countDocuments({
      sheetId: draftSheet._id,
      status: { $ne: "deleted" },
    });

    const validDomainsCount = await DraftDomain.countDocuments({
      sheetId: draftSheet._id,
      status: "draft",
    });

    const duplicateDomainsCount = await DraftDomain.countDocuments({
      sheetId: draftSheet._id,
      status: "duplicate",
    });

    const invalidDomainsCount = await DraftDomain.countDocuments({
      sheetId: draftSheet._id,
      status: "invalid",
    });

    const validDomains = await DraftDomain.find({
      sheetId: draftSheet._id,
      status: "draft",
    }).sort({ createdAt: -1 });

    res.status(200).json({
      batch: {
        id: draftSheet._id,
        batchName: draftSheet.batchName,
      },
      summary: {
        totalDomains,
        validDomains: validDomainsCount,
        duplicateDomains: duplicateDomainsCount,
        invalidDomains: invalidDomainsCount,
      },
      validDomainsList: validDomains,
    });
  } catch (error) {
    console.error("Get current batch error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  pasteDomains,
  getMyDraftPreview,
  deleteMyDraftDomain,
  moveToProcess,
  getCurrentBatch,
};
