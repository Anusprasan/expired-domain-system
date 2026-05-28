import mongoose from "mongoose";

const reportingSettingsSchema = new mongoose.Schema(
  {
    smtp: {
      useDefault: {
        type: Boolean,
        default: true,
      },
      host: {
        type: String,
        default: "",
        trim: true,
      },
      port: {
        type: Number,
        default: null,
      },
      user: {
        type: String,
        default: "",
        trim: true,
      },
      passEncrypted: {
        type: String,
        default: "",
        select: false,
      },
      from: {
        type: String,
        default: "",
        trim: true,
      },
    },
    geminiApiKeyEncrypted: {
      type: String,
      default: "",
      select: false,
    },
    language: {
      type: String,
      enum: ["english", "indonesian"],
      default: "english",
      trim: true,
    },
    updatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const telegramBotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    botUsername: {
      type: String,
      default: "",
      trim: true,
    },
    botTokenEncrypted: {
      type: String,
      default: "",
      select: false,
    },
    chatId: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastTestAt: {
      type: Date,
      default: null,
    },
    lastTestStatus: {
      type: String,
      enum: ["never", "success", "failed"],
      default: "never",
    },
    lastTestMessage: {
      type: String,
      default: "",
      trim: true,
    },
    updatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    reportingSettings: {
      type: reportingSettingsSchema,
      default: () => ({
        smtp: {
          useDefault: true,
          host: "",
          port: null,
          user: "",
          passEncrypted: "",
          from: "",
        },
        geminiApiKeyEncrypted: "",
        language: "english",
        updatedAt: null,
      }),
    },
    preferredLanguage: {
      type: String,
      enum: ["english", "indonesian"],
      default: "english",
      trim: true,
    },
    moneySiteLanguage: {
      type: String,
      enum: ["english", "indonesian"],
      trim: true,
    },
    telegramBots: {
      type: [telegramBotSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
