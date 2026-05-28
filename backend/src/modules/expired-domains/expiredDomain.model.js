import mongoose from "mongoose";

const expiredDomainSchema = new mongoose.Schema(
  {
    domain: { type: String, required: true, index: true },
    rawValue: { type: String },
    expiredAt: { type: Date },
    source: { type: String },
    notes: { type: String },
    batchNumber: { type: Number, default: 1, index: true },
    importStatus: {
      type: String,
      enum: ["valid", "invalid", "duplicate"],
      default: "valid",
      index: true,
    },
    duplicateOf: { type: String },
    stage: {
      type: String,
      enum: ["upload", "process"],
      default: "upload",
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    movedToProcessAt: { type: Date },
    movedToProcessBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    processSubBatchNumber: { type: Number, index: true },
    processStatus: {
      type: String,
      enum: ["pending", "copied", "processed", "mainbatch", "bulkchecking", "finalstage", "waybackchecking", "skipped"],
      index: true,
    },
    copiedAt: { type: Date },
    copiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    processedAt: { type: Date },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    mainBatchAt: { type: Date },
    mainBatchBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    bulkCheckingAt: { type: Date },
    bulkCheckingBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    finalStageAt: { type: Date },
    finalStageBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    waybackCheckingAt: { type: Date },
    waybackCheckingBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    nawalaStatus: { type: String },
    nawalaLabel: { type: String },
    nawalaBlocked: { type: Boolean },
    nawalaSourceStatus: { type: String },
    nawalaError: { type: String },
    nawalaCheckedAt: { type: Date },
    nawalaResultBatchNumber: { type: Number },
    skippedAt: { type: Date },
    skippedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const ExpiredDomain = mongoose.model("ExpiredDomain", expiredDomainSchema);

export default ExpiredDomain;
