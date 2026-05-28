import mongoose from "mongoose";

const reportingSmtpProfileSchema = new mongoose.Schema(
  {
    profileScope: {
      type: String,
      enum: ["shared", "personal"],
      default: "shared",
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
      index: true,
    },
    host: {
      type: String,
      required: true,
      trim: true,
    },
    port: {
      type: Number,
      required: true,
      min: 1,
    },
    user: {
      type: String,
      required: true,
      trim: true,
    },
    passEncrypted: {
      type: String,
      required: true,
      select: false,
    },
    from: {
      type: String,
      required: true,
      trim: true,
    },
    isBrandDefault: {
      type: Boolean,
      default: false,
    },
    isGlobalDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastTestedAt: {
      type: Date,
      default: null,
    },
    lastTestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

reportingSmtpProfileSchema.index({ brandId: 1, isBrandDefault: 1, isActive: 1 });
reportingSmtpProfileSchema.index({ isGlobalDefault: 1, isActive: 1 });
reportingSmtpProfileSchema.index({ ownerUserId: 1, profileScope: 1, isActive: 1 });

const ReportingSmtpProfile = mongoose.model("ReportingSmtpProfile", reportingSmtpProfileSchema);

export default ReportingSmtpProfile;
