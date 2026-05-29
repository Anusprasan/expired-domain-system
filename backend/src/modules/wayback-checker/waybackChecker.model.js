import mongoose from "mongoose";

const waybackCheckerDomainSchema = new mongoose.Schema(
  {
    batchNumber: { type: Number, required: true, index: true },
    domain: { type: String, required: true, trim: true, lowercase: true, index: true },
    source: { type: String, enum: ["nawala", "manual"], default: "nawala", index: true },
    sourceExpiredDomainId: { type: mongoose.Schema.Types.ObjectId, ref: "ExpiredDomain" },
    movedFromNawalaAt: { type: Date, default: Date.now, index: true },
    movedFromNawalaBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    movedFromNawalaByName: { type: String, default: "", trim: true },
    movedFromNawalaByEmail: { type: String, default: "", trim: true, lowercase: true },

    nawalaStatus: { type: String, default: "", trim: true },
    nawalaLabel: { type: String, default: "", trim: true },
    nawalaBlocked: { type: Boolean, default: null },
    nawalaSourceStatus: { type: String, default: "", trim: true },
    nawalaCheckedAt: { type: Date },
    nawalaResultBatchNumber: { type: Number },

    status: {
      type: String,
      enum: ["pending", "taken", "passed", "failed"],
      default: "pending",
      index: true,
    },
    takenBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    takenByName: { type: String, default: "", trim: true },
    takenByEmail: { type: String, default: "", trim: true, lowercase: true },
    takenAt: { type: Date },

    failReason: { type: String, default: "", trim: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    submittedByName: { type: String, default: "", trim: true },
    submittedByEmail: { type: String, default: "", trim: true, lowercase: true },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

waybackCheckerDomainSchema.index({ batchNumber: 1, domain: 1 }, { unique: true });

const WaybackCheckerDomain = mongoose.model("WaybackCheckerDomain", waybackCheckerDomainSchema);

export default WaybackCheckerDomain;
