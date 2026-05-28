import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    actorName: {
      type: String,
      default: "",
      trim: true,
    },
    actorEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    module: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      default: "data",
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    targetType: {
      type: String,
      default: "",
      trim: true,
    },
    targetId: {
      type: String,
      default: "",
      trim: true,
    },
    targetLabel: {
      type: String,
      default: "",
      trim: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      type: String,
      default: "",
      trim: true,
    },
    httpMethod: {
      type: String,
      default: "",
      trim: true,
    },
    routePath: {
      type: String,
      default: "",
      trim: true,
    },
    statusCode: {
      type: Number,
      default: 0,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    ipAddress: {
      type: String,
      default: "",
      trim: true,
    },
    userAgent: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: false }
);

activityLogSchema.index({ occurredAt: -1, module: 1 });

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;
