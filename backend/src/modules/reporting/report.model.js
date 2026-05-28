import mongoose from "mongoose";
import { REPORTING_ISSUE_TYPES, REPORTING_STATUSES } from "./reporting.constants.js";

const claimSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: REPORTING_STATUSES.filter((status) => status !== "open"),
      default: "in_progress",
      required: true,
    },
    claimedAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    isChecked: {
      type: Boolean,
      default: false,
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
    hasTaskUpdate: {
      type: Boolean,
      default: false,
    },
    taskUpdatedAt: {
      type: Date,
      default: null,
    },
    taskUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
      index: true,
    },
    issueType: {
      type: String,
      enum: REPORTING_ISSUE_TYPES,
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    googleRank: {
      type: Number,
      required: true,
      min: 1,
    },
    hasDdos: {
      type: Boolean,
      default: false,
    },
    searchKeyword: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: REPORTING_STATUSES,
      default: "open",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    claims: {
      type: [claimSchema],
      default: [],
    },
    claimedByIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
      index: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

reportSchema.index({ brandId: 1, issueType: 1, status: 1, createdAt: -1 });

const Report = mongoose.model("ReportingReport", reportSchema);

export default Report;
