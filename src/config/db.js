import mongoose from "mongoose";

let isConnected = false;

const connectionDB = async () => {
  if (isConnected || mongoose.connection.readyState === 1) {
    return;
  }

  try {
    const db = await mongoose.connect(process.env.MONGODB_URI);
    isConnected = db.connections[0].readyState === 1;
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Error connecting to database:", error.message);
  }
};

export default connectionDB;
