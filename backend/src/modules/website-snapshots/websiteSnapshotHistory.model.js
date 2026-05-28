import mongoose from "mongoose";

const websiteSnapshotCaptureSchema = new mongoose.Schema(
  {
    timestamp: {
      type: String,
      default: "",
      trim: true,
    },
    originalUrl: {
      type: String,
      default: "",
      trim: true,
    },
    capturedAt: {
      type: Date,
      default: null,
    },
    archiveUrl: {
      type: String,
      default: "",
      trim: true,
    },
    previewArchiveUrl: {
      type: String,
      default: "",
      trim: true,
    },
    rawArchiveUrl: {
      type: String,
      default: "",
      trim: true,
    },
    mimetype: {
      type: String,
      default: "",
      trim: true,
    },
    statusCode: {
      type: Number,
      default: 0,
    },
    length: {
      type: Number,
      default: 0,
    },
    digest: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const websiteSnapshotHistorySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["search", "download"],
      required: true,
      index: true,
    },
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
    requestedUrl: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    normalizedUrl: {
      type: String,
      default: "",
      trim: true,
    },
    selectedOriginalUrl: {
      type: String,
      default: "",
      trim: true,
    },
    selectedTimestamp: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    scope: {
      type: String,
      default: "",
      trim: true,
    },
    fromDate: {
      type: String,
      default: "",
      trim: true,
    },
    toDate: {
      type: String,
      default: "",
      trim: true,
    },
    limit: {
      type: Number,
      default: 0,
    },
    includeAssets: {
      type: Boolean,
      default: true,
    },
    totalSnapshots: {
      type: Number,
      default: 0,
    },
    uniquePageCount: {
      type: Number,
      default: 0,
    },
    cachedRequests: {
      type: Number,
      default: 0,
    },
    liveRequests: {
      type: Number,
      default: 0,
    },
    downloadedAssets: {
      type: Number,
      default: 0,
    },
    skippedAssets: {
      type: Number,
      default: 0,
    },
    snapshots: {
      type: [websiteSnapshotCaptureSchema],
      default: [],
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
  },
  { timestamps: true }
);

websiteSnapshotHistorySchema.index({ createdAt: -1, type: 1 });
websiteSnapshotHistorySchema.index({ requestedUrl: 1, createdAt: -1 });

const websiteSnapshotViewStateSchema = new mongoose.Schema(
  {
    snapshotKey: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    timestamp: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    originalUrl: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    viewed: {
      type: Boolean,
      default: true,
      index: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
    viewedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    viewedByName: {
      type: String,
      default: "",
      trim: true,
    },
    viewedByEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
  },
  { timestamps: true }
);

websiteSnapshotViewStateSchema.index({ originalUrl: 1, timestamp: 1 }, { unique: true });
websiteSnapshotViewStateSchema.index({ updatedAt: -1 });

const WebsiteSnapshotHistory = mongoose.model(
  "WebsiteSnapshotHistory",
  websiteSnapshotHistorySchema
);

export const WebsiteSnapshotViewState = mongoose.model(
  "WebsiteSnapshotViewState",
  websiteSnapshotViewStateSchema
);

export default WebsiteSnapshotHistory;
