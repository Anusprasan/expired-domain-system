import mongoose from "mongoose";

const moneySitePushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    expirationTime: {
      type: Number,
      default: null,
    },
    keys: {
      p256dh: {
        type: String,
        required: true,
        trim: true,
      },
      auth: {
        type: String,
        required: true,
        trim: true,
      },
    },
    userAgent: {
      type: String,
      default: "",
      trim: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const MoneySitePushSubscription = mongoose.model(
  "MoneySitePushSubscription",
  moneySitePushSubscriptionSchema
);

export default MoneySitePushSubscription;
