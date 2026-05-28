import mongoose from "mongoose";

const submissionImageSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      default: "image/png",
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    uploadedAt: {
      type: Date,
      default: null,
    },
    contentBase64: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const deletedSubmissionImageSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      default: "image/png",
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    uploadedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: Date.now,
    },
    deletedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deletedByName: {
      type: String,
      default: "",
      trim: true,
    },
    deletionReason: {
      type: String,
      default: "cleanup",
      trim: true,
    },
    cleanupCutoff: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReportingReport",
      required: true,
      index: true,
    },
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    driveLink: {
      type: String,
      default: "",
      trim: true,
    },
    images: {
      type: [submissionImageSchema],
      default: [],
    },
    deletedImages: {
      type: [deletedSubmissionImageSchema],
      default: [],
    },
    reportedTo: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    didDdos: {
      type: Boolean,
      default: false,
    },
    reviewStatus: {
      type: String,
      enum: ["submitted", "checked", "rejected"],
      default: "submitted",
      index: true,
    },
    reviewComment: {
      type: String,
      default: "",
      trim: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

submissionSchema.index({ reportId: 1, createdAt: -1 });
submissionSchema.index({ reportId: 1, reporterId: 1 }, { unique: true });

const Submission = mongoose.model("ReportingSubmission", submissionSchema);

export default Submission;
