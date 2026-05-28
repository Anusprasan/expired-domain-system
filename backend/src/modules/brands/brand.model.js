import mongoose from "mongoose";

const brandSchema = new mongoose.Schema(
  {
    brandName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    cssClassName: {
      type: String,
      required: true,
      trim: true,
    },
    backgroundCss: {
      type: String,
      required: true,
      trim: true,
    },
    backgroundStyle: {
      type: String,
      enum: ["solid", "linear-gradient", "radial-gradient"],
      required: true,
    },
    backgroundColor: {
      type: String,
      default: null,
      trim: true,
    },
    gradientType: {
      type: String,
      enum: ["linear", "radial"],
      default: null,
    },
    gradientDirection: {
      type: String,
      default: null,
      trim: true,
    },
    gradientPosition: {
      type: String,
      default: null,
      trim: true,
    },
    gradientStops: {
      type: [String],
      default: [],
    },
    gradientColors: {
      type: [String],
      default: [],
    },
    textColor: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const Brand = mongoose.model("Brand", brandSchema);

export default Brand;
