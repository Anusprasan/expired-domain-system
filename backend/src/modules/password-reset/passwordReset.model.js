import mongoose from "mongoose";

const passwordResetRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    requestType: {
      type: String,
      enum: ["self-reset", "admin-reset-request"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "completed", "rejected", "expired"],
      default: "pending",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    token: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    resetPasswordHash: {
      type: String,
      default: null,
    },
    adminNotes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

const PasswordResetRequest = mongoose.model(
  "PasswordResetRequest",
  passwordResetRequestSchema
);

export default PasswordResetRequest;