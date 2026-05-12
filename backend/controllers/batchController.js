const Batch = require("../models/Batch");
const Domain = require("../models/Domain");

const createBatch = async (req, res) => {
  try {
    const { batchName, originalFileName } = req.body;

    const batch = await Batch.create({
      batchName,
      originalFileName,
    });

    res.status(201).json(batch);
  } catch (error) {
    res.status(500).json({ message: "Error creating batch" });
  }
};

const getBatches = async (req, res) => {
  try {
    const batches = await Batch.find().sort({ createdAt: -1 });

    res.status(200).json(batches);
  } catch (error) {
    res.status(500).json({ message: "Error fetching batches" });
  }
};

const deleteBatch = async (req, res) => {
  try {
    const { batchId } = req.params;

    console.log("Deleting batch:", batchId);

    await Batch.findByIdAndDelete(batchId);

    await Domain.deleteMany({
      batchId: batchId,
    });

    res.status(200).json({
      message: "Batch deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Delete failed",
      error: error.message,
    });
  }
};

module.exports = {
  createBatch,
  getBatches,
  deleteBatch,
};