const mongoose = require("mongoose");

const domainHistorySchema = new mongoose.Schema(
  {
    domain: {
      type: String,
      trim: true,
      default: "",
    },

    action: {
      type: String,
      enum: [
        "added",
        "deleted",
        "duplicate",
        "invalid",
        "rejected",
        "moved_to_process",
        "processed",
      ],
      required: true,
    },

    reason: {
      type: String,
      default: "",
    },

    sheetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DraftSheet",
      default: null,
    },

    domainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DraftDomain",
      default: null,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    role: {
      type: String,
      enum: ["uploader", "processor", "admin"],
      required: true,
    },
  },
  { timestamps: true }
);

const DomainHistory = mongoose.model(
  "DomainHistory",
  domainHistorySchema
);

module.exports = DomainHistory;