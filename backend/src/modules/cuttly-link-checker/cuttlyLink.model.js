import mongoose from "mongoose";

const cuttlyCheckSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["not_checked", "ok", "blocked", "warning", "error"],
      default: "not_checked",
      index: true,
    },
    source: {
      type: String,
      enum: ["manual", "schedule"],
      default: "manual",
    },
    cuttlyStatusCode: {
      type: Number,
      default: 0,
    },
    cuttlyStatusLabel: {
      type: String,
      default: "",
      trim: true,
    },
    httpStatus: {
      type: Number,
      default: 0,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    shortLink: {
      type: String,
      default: "",
      trim: true,
    },
    fullLink: {
      type: String,
      default: "",
      trim: true,
    },
    title: {
      type: String,
      default: "",
      trim: true,
    },
    cuttlyDate: {
      type: String,
      default: "",
      trim: true,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    checkedAt: {
      type: Date,
      default: null,
      index: true,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const cuttlyLinkSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
      trim: true,
    },
    targetUrl: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    preferredName: {
      type: String,
      default: "",
      trim: true,
    },
    useUserDomain: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastCheck: {
      type: cuttlyCheckSchema,
      default: () => ({
        status: "not_checked",
        checkedAt: null,
      }),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

cuttlyLinkSchema.index({ isActive: 1, updatedAt: -1 });
cuttlyLinkSchema.index({ "lastCheck.status": 1, updatedAt: -1 });

const CuttlyLink = mongoose.model("CuttlyLink", cuttlyLinkSchema);

export default CuttlyLink;
