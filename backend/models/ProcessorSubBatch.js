const mongoose = require("mongoose");

const processorSubBatchSchema =
  new mongoose.Schema(
    {
      batchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DraftSheet",
        required: true,
      },

      subBatchNumber: {
        type: Number,
        required: true,
      },

      domains: [
        {
          type: String,
        },
      ],

      totalDomains: {
        type: Number,
        default: 0,
      },

      status: {
        type: String,
        enum: [
          "pending",
          "copied",
          "processed",
        ],
        default: "pending",
      },

      copiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },

      copiedAt: {
        type: Date,
      },

      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },

      processedAt: {
        type: Date,
      },

      lockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        },

        lockedAt: {
        type: Date,
        default: null,
        },

        mergedDomains: [
          {
            type: String,
          },
        ],

        seoResultPastedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },

        seoResultPastedAt: {
          type: Date,
        },
    },
    {
      timestamps: true,
    }
  );

module.exports = mongoose.model(
  "ProcessorSubBatch",
  processorSubBatchSchema
);