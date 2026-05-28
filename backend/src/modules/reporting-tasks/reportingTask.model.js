import mongoose from "mongoose";

const ISSUE_TYPES = ["cloaking", "brand_phishing", "death_phishing", "stray_domain"];

const evidenceImageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    contentType: { type: String, default: "image/png", trim: true },
    size: { type: Number, default: 0, min: 0 },
    contentBase64: { type: String, default: "" },
    url: { type: String, default: "", trim: true },
    key: { type: String, default: "", trim: true },
    bucket: { type: String, default: "", trim: true },
    storageProvider: { type: String, default: "", trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const acceptedEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    acceptedAt: {
      type: Date,
      default: Date.now,
    },
    evidenceSubmitted: {
      type: Boolean,
      default: false,
    },
    evidenceNote: {
      type: String,
      default: "",
      trim: true,
    },
    images: {
      type: [evidenceImageSchema],
      default: [],
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    ddosEvidenceSubmitted: {
      type: Boolean,
      default: false,
    },
    ddosNote: {
      type: String,
      default: "",
      trim: true,
    },
    ddosImages: {
      type: [evidenceImageSchema],
      default: [],
    },
    ddosSubmittedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const reportingTaskSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    rank: {
      type: Number,
      required: true,
      min: 1,
    },
    issueType: {
      type: String,
      enum: ISSUE_TYPES,
      required: true,
      index: true,
    },
    ddosRequired: {
      type: Boolean,
      default: false,
    },
    acceptedBy: {
      type: [acceptedEntrySchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["open", "done"],
      default: "open",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdSource: {
      type: String,
      enum: ["manual", "telegram"],
      default: "manual",
      index: true,
    },
    telegramSource: {
      chatId: {
        type: String,
        default: "",
        trim: true,
      },
      messageId: {
        type: String,
        default: "",
        trim: true,
      },
      botId: {
        type: String,
        default: "",
        trim: true,
      },
      botName: {
        type: String,
        default: "",
        trim: true,
      },
      messageText: {
        type: String,
        default: "",
        trim: true,
      },
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

reportingTaskSchema.index({ status: 1, createdAt: -1 });

export { ISSUE_TYPES };
const ReportingTask = mongoose.model("ReportingTask", reportingTaskSchema);
export default ReportingTask;
