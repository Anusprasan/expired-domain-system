import mongoose from "mongoose";

const developmentTemplateSchema = new mongoose.Schema(
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

const DevelopmentTemplate = mongoose.model(
  "DevelopmentTemplate",
  developmentTemplateSchema
);

export async function cleanupDevelopmentTemplateIndexes() {
  const collection = DevelopmentTemplate.collection;

  try {
    const indexes = await collection.indexes();
    const hasLegacyTemplateIndex = indexes.some((index) => index.name === "template_1");

    if (hasLegacyTemplateIndex) {
      await collection.dropIndex("template_1");
    }
  } catch (error) {
    if (error.codeName !== "NamespaceNotFound") {
      throw error;
    }
  }
}

export default DevelopmentTemplate;
