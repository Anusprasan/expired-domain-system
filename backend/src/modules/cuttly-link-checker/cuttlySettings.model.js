import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    delayMinutes: {
      type: Number,
      default: 60,
      min: 1,
      max: 1440,
    },
    parallelChecks: {
      type: Number,
      default: 1,
      min: 1,
      max: 5,
    },
    nextRunAt: {
      type: Date,
      default: null,
    },
    lastStartedAt: {
      type: Date,
      default: null,
    },
    lastFinishedAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
      trim: true,
    },
    updatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const telegramSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    chatId: {
      type: String,
      default: "",
      trim: true,
    },
    botTokenEncrypted: {
      type: String,
      default: "",
      select: false,
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
      trim: true,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    updatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const cuttlySettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "default",
      unique: true,
      immutable: true,
    },
    apiKeyEncrypted: {
      type: String,
      default: "",
      select: false,
    },
    apiKeyUpdatedAt: {
      type: Date,
      default: null,
    },
    schedule: {
      type: scheduleSchema,
      default: () => ({}),
    },
    telegram: {
      type: telegramSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

const CuttlySettings = mongoose.model("CuttlySettings", cuttlySettingsSchema);

export default CuttlySettings;
