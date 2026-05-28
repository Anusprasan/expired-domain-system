import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (typeof mongoUri !== "string" || mongoUri.trim() === "") {
      throw new Error("MONGO_URI is required in backend/.env or the project root .env");
    }

    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};
