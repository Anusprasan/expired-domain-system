import mongoose from "mongoose";

const articlePoolTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const ArticlePoolTemplate = mongoose.model(
  "ArticlePoolTemplate",
  articlePoolTemplateSchema
);

export default ArticlePoolTemplate;
