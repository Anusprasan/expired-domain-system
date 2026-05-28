import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    privilegeIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Privilege",
      },
    ],
    isProtected: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Group = mongoose.model("Group", groupSchema);

export default Group;