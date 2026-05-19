const ProcessorSubBatch = require(
  "../models/ProcessorSubBatch"
);

const DraftSheet = require(
  "../models/DraftSheet"
);
const checkSubBatchLock = require(
  "../utils/checkSubBatchLock"
);

const getResultDomains = (subBatch) =>
  subBatch.mergedDomains &&
  subBatch.mergedDomains.length > 0
    ? subBatch.mergedDomains
    : subBatch.domains || [];

const finalizeBatchIfComplete = async (
  batchId,
  userId
) => {
  const remainingSubBatches =
    await ProcessorSubBatch.countDocuments({
      batchId,
      status: {
        $ne: "processed",
      },
    });

  if (remainingSubBatches !== 0) {
    return false;
  }

  const allProcessedSubBatches =
    await ProcessorSubBatch.find({
      batchId,
      status: "processed",
    }).sort({
      subBatchNumber: 1,
    });

  if (allProcessedSubBatches.length === 0) {
    return false;
  }

  const processedDomains =
    allProcessedSubBatches.flatMap(
      getResultDomains
    );

  const draftSheet =
    await DraftSheet.findById(batchId).select(
      "status"
    );

  const update = {
    processedDomains,
  };

  if (draftSheet?.status !== "processed") {
    update.status = "processed";
    update.processedBy = userId;
    update.processedAt = new Date();
  }

  await DraftSheet.findByIdAndUpdate(
    batchId,
    update
  );

  return true;
};


const getPendingSubBatches =
  async (req, res) => {
    try {

    const subBatches =
      await ProcessorSubBatch.find({
        status: "pending",
  })
    .populate({
      path: "batchId",
      select:
        "batchName movedToProcessAt movedToProcessBy",
      populate: {
        path: "movedToProcessBy",
        select: "name",
      },
    })
    .sort({
      createdAt: 1,
    });

res.status(200).json(subBatches);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Internal Server Error",
      });
    }
};

const getCopiedSubBatches =
  async (req, res) => {
    try {

      const subBatches =
        await ProcessorSubBatch.find({
          status: "copied",
        })
          .populate(
            "batchId",
            "batchName movedToProcessAt"
          )
          .populate(
            "copiedBy",
            "name"
          )
          .sort({
            copiedAt: -1,
          });

      res.status(200).json(subBatches);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Internal Server Error",
      });
    }
};

const getProcessedSubBatches =
  async (req, res) => {
    try {

      const batchIdsWithProcessedSubBatches =
        await ProcessorSubBatch.distinct(
          "batchId",
          {
            status: "processed",
          }
        );

      await Promise.all(
        batchIdsWithProcessedSubBatches.map(
          (batchId) =>
            finalizeBatchIfComplete(
              batchId,
              req.user._id
            )
        )
      );

      const processedBatchIds =
        await DraftSheet.find({
          status: "processed",
        }).distinct("_id");

       const subBatches =
        await ProcessorSubBatch.find({
          status: "processed",
          batchId: {
            $in: processedBatchIds,
          },
        })
          .populate(
            "batchId",
            "batchName movedToProcessAt processedDomains processedAt status"
          )
          .populate(
            "processedBy",
            "name"
          )
          .populate(
              "processedBy",
              "name"
            )
          .sort({
            processedAt: -1,
          });

      res.status(200).json(subBatches);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Internal Server Error",
      });
    }
};

const copySubBatch = async (
  req,
  res
) => {
  try {

    const { id } = req.params;

    const activeCopiedSubBatch = await ProcessorSubBatch.findOne({
      status: "copied",
    });

    if (activeCopiedSubBatch) {
      return res.status(400).json({
        message:
          "A sub-batch is already in copied state. Move it to processed before copying another.",
      });
    }

    const subBatch =
      await ProcessorSubBatch.findById(
        id
      );

    if (!subBatch) {
      return res.status(404).json({
        message:
          "Sub batch not found",
      });
    }

    if (
      subBatch.status ===
      "processed"
    ) {
      return res.status(400).json({
        message:
          "Sub batch already processed",
      });
    }

    const lockCheck =
      checkSubBatchLock(
        subBatch,
        req.user._id
      );

    if (!lockCheck.allowed) {
      return res.status(423).json({
        message:
          lockCheck.message,
      });
    }

    subBatch.lockedBy =
      req.user._id;

    subBatch.lockedAt =
      new Date();

   subBatch.status = "copied";



    await subBatch.save();

    res.status(200).json({
      message:
        "Sub batch copied",
      domains: subBatch.domains,
      subBatch,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message:
        "Internal Server Error",
    });
  }
};

const moveToProcessed =
  async (req, res) => {
    try {

      const { id } =
        req.params;
      const filteredDomains =
        Array.isArray(req.body?.domains)
          ? req.body.domains
              .map((domain) =>
                String(domain || "").trim()
              )
              .filter(Boolean)
          : [];

      const subBatch =
        await ProcessorSubBatch.findById(
          id
        );

      if (!subBatch) {
        return res.status(404).json({
          message:
            "Sub batch not found",
        });
      }

      if (
        subBatch.status ===
        "processed"
      ) {
        return res.status(400).json({
          message:
            "Sub batch already processed",
        });
      }

      if (
        subBatch.status !==
        "copied"
      ) {
        return res.status(400).json({
          message:
            "Only copied sub batches can be processed",
        });
      }

      if (filteredDomains.length === 0) {
        return res.status(400).json({
          message:
            "Filtered domains are required",
        });
      }

      subBatch.mergedDomains =
        filteredDomains;

      subBatch.status =
        "processed";

      subBatch.processedBy =
        req.user._id;

      subBatch.processedAt =
        new Date();

      await subBatch.save();
      await finalizeBatchIfComplete(
        subBatch.batchId,
        req.user._id
      );

      res.status(200).json({
        message:
          "Sub batch moved to processed",
        subBatch,
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Internal Server Error",
      });
    }
};

const viewSubBatchDomains = async (req, res) => {
  try {
    const { id } = req.params;

    const subBatch = await ProcessorSubBatch.findById(id)
      .populate("batchId", "batchName")
      .populate("copiedBy", "name");

    if (!subBatch) {
      return res.status(404).json({
        message: "Sub batch not found",
      });
    }

    if (
      subBatch.status !== "copied" &&
      subBatch.status !== "processed"
    ) {
      return res.status(400).json({
        message: "Only copied or processed sub batches can be viewed here",
      });
    }

    res.status(200).json({
      batchName: subBatch.batchId?.batchName,
      subBatchNumber: subBatch.subBatchNumber,
      totalDomains: subBatch.totalDomains,
      copiedBy: subBatch.copiedBy?.name,
      copiedAt: subBatch.copiedAt,

      domains:
        subBatch.mergedDomains &&
        subBatch.mergedDomains.length > 0
          ? subBatch.mergedDomains
          : subBatch.domains,   
});   
  } catch (error) {
    console.error("View sub batch error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

const saveSeoResult = async (req, res) => {
  try {
    const { id } = req.params;
    const resultText = req.body?.resultText || "";

    if (!resultText.trim()) {
      return res.status(400).json({
        message: "SEO result text is required",
      });
    }

    const subBatch = await ProcessorSubBatch.findById(id);

    if (!subBatch) {
      return res.status(404).json({
        message: "Sub batch not found",
      });
    }

    if (subBatch.status !== "copied") {
      return res.status(400).json({
        message: "Only copied sub batches can accept SEO results",
      });
    }

    const domainRegex = /([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/g;

    const extractedDomains =
      String(resultText).match(domainRegex) || [];

    const originalDomains = subBatch.domains || [];

    if (extractedDomains.length !== originalDomains.length) {
      return res.status(400).json({
        message: `SEO result count mismatch. Expected ${originalDomains.length}, but found ${extractedDomains.length}. Please copy the full SEO checker result again.`,
      });
    }

    const mergedDomains = originalDomains;

    subBatch.mergedDomains = mergedDomains;
    subBatch.seoResultPastedBy = req.user._id;
    subBatch.seoResultPastedAt = new Date();

    await subBatch.save();

    res.status(200).json({
      message: "SEO results saved",
      mergedDomains,
      count: mergedDomains.length,
    });
  } catch (error) {
    console.error("Save SEO result error:", error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  getPendingSubBatches,
  getCopiedSubBatches,
  getProcessedSubBatches,
  saveSeoResult,
  viewSubBatchDomains,
  copySubBatch,
  moveToProcessed,
};
