// models/emailOtp.model.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const emailOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      required: true,
      enum: ["signup", "login", "reset-password"],
    },
    expiresAt: {
      type: Date,
      default: () => Date.now() + 5 * 60 * 1000,
    },
  },
  { timestamps: true },
);

emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

emailOtpSchema.pre("save", async function () {
  try {
    if (!this.isModified("otp")) return;
    const saltRounds = await bcrypt.genSalt(10);
    this.otp = await bcrypt.hash(String(this.otp), saltRounds);
    return;
  } catch (error) {
    console.log("otp could not be hashed", error);
    throw error;
    // return;
  }
});

emailOtpSchema.methods.compareOtp = async function (enteredOtp) {
  try {
    const comparedOtp = await bcrypt.compare(enteredOtp, this.otp);
    return comparedOtp;
  } catch (error) {
    console.log("otp could not be compared");
    throw error;
  }
};

module.exports = mongoose.model("EmailOtp", emailOtpSchema);
