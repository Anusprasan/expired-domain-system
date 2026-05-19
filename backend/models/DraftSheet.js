const mongoose = require("mongoose");

const draftSheetSchema = new mongoose.Schema(
  {
    batchName: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["open", "locked", "processed"],
      default: "open",
    },

    totalDomains: {
      type: Number,
      default: 0,
    },

    acceptedCount: {
      type: Number,
      default: 0,
    },

    rejectedCount: {
      type: Number,
      default: 0,
    },

    movedToProcessBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    movedToProcessAt: {
      type: Date,
      default: null,
    },

    processedDomains: [
      {
        type: String,
      },
    ],

    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const DraftSheet = mongoose.model("DraftSheet", draftSheetSchema);

module.exports = DraftSheet;
