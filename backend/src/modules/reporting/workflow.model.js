import mongoose from "mongoose";
import { REPORTING_ISSUE_TYPES, REPORTING_WORKFLOW_DEFAULTS } from "./reporting.constants.js";

const linkSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    href: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const workflowSchema = new mongoose.Schema(
  {
    issueType: {
      type: String,
      enum: REPORTING_ISSUE_TYPES,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    guideTitle: {
      type: String,
      required: true,
      trim: true,
    },
    tone: {
      type: String,
      default: "blue",
      trim: true,
    },
    label: {
      type: String,
      default: "",
      trim: true,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    summary: {
      type: String,
      default: "",
      trim: true,
    },
    badge: {
      type: String,
      default: "",
      trim: true,
    },
    steps: {
      type: [String],
      default: [],
    },
    links: {
      type: [linkSchema],
      default: [],
    },
  },
  { timestamps: true }
);

workflowSchema.statics.getDefaultWorkflows = function getDefaultWorkflows() {
  return REPORTING_WORKFLOW_DEFAULTS;
};

const ReportingWorkflow = mongoose.model("ReportingWorkflow", workflowSchema);

export default ReportingWorkflow;
