import "../app/config/env.js";
import mongoose from "mongoose";

const COLLECTION_NAME = "developmenttemplates";
const LEGACY_INDEX_NAME = "template_1";

async function dropLegacyTemplateIndex(collection) {
  const indexes = await collection.indexes();
  const hasLegacyIndex = indexes.some((index) => index.name === LEGACY_INDEX_NAME);

  if (!hasLegacyIndex) {
    console.log(`Index ${LEGACY_INDEX_NAME} not found. Skipping index cleanup.`);
    return;
  }

  await collection.dropIndex(LEGACY_INDEX_NAME);
  console.log(`Dropped legacy index ${LEGACY_INDEX_NAME}.`);
}

async function unsetLegacyTemplateField(collection) {
  const result = await collection.updateMany(
    { template: { $exists: true } },
    { $unset: { template: "" } }
  );

  console.log(`Removed legacy template field from ${result.modifiedCount} document(s).`);
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const collection = mongoose.connection.collection(COLLECTION_NAME);

    await dropLegacyTemplateIndex(collection);
    await unsetLegacyTemplateField(collection);

    console.log("Development info collection migration completed.");
  } catch (error) {
    console.error("Development info collection migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
