import mongoose from "mongoose";

const lpServerSchema = new mongoose.Schema(
  {
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },

    url: {
      type: String,
      required: true,
      trim: true,
    },

    serverIp: {
      type: String,
      default: "",
      trim: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      trim: true,
    },

    note: {
      type: String,
      default: "",
      trim: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

lpServerSchema.index(
  { brandId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);


const LPServer = mongoose.model("LPServer", lpServerSchema);

export async function cleanupLPServerIndexes() {
  const collection = LPServer.collection;

  try {
    const indexes = await collection.indexes();

    const hasLegacyUrlIndex = indexes.some((index) => index.name === "url_1");

    if (hasLegacyUrlIndex) {
      await collection.dropIndex("url_1");
      console.log("Dropped legacy LPServer index: url_1");
    }
  } catch (error) {
    if (error.codeName !== "NamespaceNotFound") {
      throw error;
    }
  }
}

export default LPServer;
