import mongoose from "mongoose";

const reportingEmailAttachmentSchema = new mongoose.Schema(
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
      default: "application/octet-stream",
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    contentBase64: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const reportingEmailEntrySchema = new mongoose.Schema(
  {
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReportingReport",
      required: true,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "sent", "failed"],
      default: "draft",
      index: true,
    },
    mailSourceKey: {
      type: String,
      default: "",
      trim: true,
    },
    smtpSourceType: {
      type: String,
      default: "",
      trim: true,
    },
    smtpProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReportingSmtpProfile",
      default: null,
    },
    sourceLabel: {
      type: String,
      default: "",
      trim: true,
    },
    from: {
      type: String,
      default: "",
      trim: true,
    },
    to: {
      type: [String],
      default: [],
    },
    cc: {
      type: [String],
      default: [],
    },
    bcc: {
      type: [String],
      default: [],
    },
    subject: {
      type: String,
      default: "",
      trim: true,
    },
    bodyHtml: {
      type: String,
      default: "",
    },
    bodyText: {
      type: String,
      default: "",
    },
    additionalNotes: {
      type: String,
      default: "",
    },
    generatedSubject: {
      type: String,
      default: "",
      trim: true,
    },
    generatedBody: {
      type: String,
      default: "",
    },
    generatedBodyHtml: {
      type: String,
      default: "",
    },
    attachments: {
      type: [reportingEmailAttachmentSchema],
      default: [],
    },
    sentAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

reportingEmailEntrySchema.index({ reportId: 1, createdAt: -1 });
reportingEmailEntrySchema.index({ reportId: 1, status: 1, updatedAt: -1 });
reportingEmailEntrySchema.index({ reportId: 1, authorId: 1, status: 1, updatedAt: -1 });

const ReportingEmailEntry = mongoose.model("ReportingEmailEntry", reportingEmailEntrySchema);

export default ReportingEmailEntry;
