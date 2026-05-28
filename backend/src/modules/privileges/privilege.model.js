import mongoose from "mongoose";

const privilegeSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    module: {
      type: String,
      default: "",
    },
    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

const Privilege = mongoose.model("Privilege", privilegeSchema);

export default Privilege;
