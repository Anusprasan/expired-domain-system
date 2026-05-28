import mongoose from "mongoose";

const siteAnalyticsEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    source: {
      type: String,
      default: "script",
      trim: true,
      index: true,
    },
    trafficType: {
      type: String,
      default: "unknown",
      trim: true,
      index: true,
    },
    isBot: {
      type: Boolean,
      default: false,
      index: true,
    },
    botName: {
      type: String,
      default: "",
      trim: true,
    },
    mainUrl: {
      type: String,
      required: true,
      trim: true,
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
    referrer: {
      type: String,
      default: "",
      trim: true,
    },
    deviceId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    deviceType: {
      type: String,
      default: "unknown",
      trim: true,
      index: true,
    },
    sessionId: {
      type: String,
      default: "",
      trim: true,
    },
    isUniqueView: {
      type: Boolean,
      default: false,
      index: true,
    },
    clickUrl: {
      type: String,
      default: "",
      trim: true,
    },
    clickText: {
      type: String,
      default: "",
      trim: true,
    },
    clickElementTag: {
      type: String,
      default: "",
      trim: true,
    },
    clickElementId: {
      type: String,
      default: "",
      trim: true,
    },
    clickElementClasses: {
      type: String,
      default: "",
      trim: true,
    },
    clickExternal: {
      type: Boolean,
      default: false,
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
    language: {
      type: String,
      default: "",
      trim: true,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: false }
);

siteAnalyticsEventSchema.index({ mainUrl: 1, occurredAt: -1 });
siteAnalyticsEventSchema.index({ pageHost: 1, occurredAt: -1 });
siteAnalyticsEventSchema.index({ eventType: 1, mainUrl: 1, deviceId: 1, occurredAt: -1 });

const SiteAnalyticsEvent = mongoose.model("SiteAnalyticsEvent", siteAnalyticsEventSchema);

export default SiteAnalyticsEvent;
