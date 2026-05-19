const mongoose = require("mongoose");

const draftDomainSchema = new mongoose.Schema(
  {
    domain: {
      type: String,
      required: true,
    },

    sheetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DraftSheet",
    },

    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    status: {
      type: String,
      enum: [
        "draft",
        "duplicate",
        "invalid",
        "deleted",
      ],
      default: "draft",
    },
  },
  { timestamps: true }
);

const DraftDomain = mongoose.model("DraftDomain", draftDomainSchema);

module.exports = DraftDomain;