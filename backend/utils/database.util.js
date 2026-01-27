const mongoose = require("mongoose");
const URI = process.env.MONGODB_URI;

const connectDB = async () => {
  //   {
  //       tls: true,
  //       tlsAllowInvalidCertificates: true,
  //     }
  try {
    await mongoose.connect(URI); //Because you’re on Windows + Node 24, MongoDB Atlas often fails TLS handshake unless options are explicit.
    // console.log(resultOfMongoConnected);
    console.log("database is connected successfully");
  } catch (error) {
    console.error("database connection is failed");
    console.log(error);
    process.exit(1); //0 means successful exit, On failure, use 1
  }
};

module.exports = connectDB;
