import mongoose from "mongoose";

const nawalaSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["unknown", "ada", "tidak ada"],
      default: "unknown",
      index: true,
    },
    blockedId: {
      type: String,
      default: null,
      trim: true,
    },
    lastChecked: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const moneySiteSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
      index: true,
    },
    domain: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
    statusText: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    nawala: {
      type: nawalaSchema,
      default: () => ({
        status: "unknown",
        blockedId: null,
        lastChecked: null,
      }),
    },
  },
  { timestamps: true }
);

moneySiteSchema.index({ brandId: 1, domain: 1 }, { unique: true });

const MoneySite = mongoose.model("MoneySite", moneySiteSchema);

export default MoneySite;
