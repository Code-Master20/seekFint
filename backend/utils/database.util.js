const mongoose = require("mongoose");
const URI = process.env.MONGODB_URI;

const connectDB = async () => {
  try {
    await mongoose.connect(URI);
    console.log("database connected successfully");
  } catch (error) {
    console.error("database connection is failed");
    console.error(error);
    process.exit(1); //0 means successful exit, On failure, use 1
  }
};

module.exports = connectDB;
