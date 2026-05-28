import mongoose from "mongoose";

const siteAnalyticsBlockedUrlSchema = new mongoose.Schema(
  {
    mainUrl: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    pageOrigin: {
      type: String,
      default: "",
      trim: true,
    },
    pageHost: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    pagePath: {
      type: String,
      default: "",
      trim: true,
    },
    pageTitle: {
      type: String,
      default: "",
      trim: true,
    },
    blockedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const SiteAnalyticsBlockedUrl = mongoose.model(
  "SiteAnalyticsBlockedUrl",
  siteAnalyticsBlockedUrlSchema
);

export default SiteAnalyticsBlockedUrl;
