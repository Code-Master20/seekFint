const mongoose = require("mongoose");
const URI = process.env.MONGODB_URI;
const EmailOtp = require("../models/auth/emailOtp.model");
const TemporaryUser = require("../models/auth/temporaryUser.model");
const PasswordChangeAttempt = require("../models/auth/passwordChangeBlocked.model");
const AttemptCount = require("../models/auth/attemptCount.model");
const BlockedEmail = require("../models/auth/temBlockEmails.model");
const EmailChangeRequest = require("../models/auth/emailChangeRequest.model");

const ensureTemporaryModelIndexes = async () => {
  await Promise.all([
    EmailOtp.createIndexes(),
    TemporaryUser.createIndexes(),
    PasswordChangeAttempt.createIndexes(),
    AttemptCount.createIndexes(),
    BlockedEmail.createIndexes(),
    EmailChangeRequest.createIndexes(),
  ]);
};

const connectDB = async () => {
  try {
    await mongoose.connect(URI);
    await ensureTemporaryModelIndexes();
    console.log("database connected successfully");
  } catch (error) {
    console.error("database connection is failed");
    console.error(error);
    process.exit(1); //0 means successful exit, On failure, use 1
  }
};

module.exports = connectDB;
