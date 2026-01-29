const bcrypt = require("bcryptjs");
const EmailOtp = require("../../models/emailOtp.model.js");
const TemporaryUser = require("../../models/temporaryUser.model.js");

const otpVerify = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const otpRecord = await EmailOtp.findOne({ email });
    if (!otpRecord) {
      return res.status(400).json({ message: "OTP expired or invalid" });
    }

    const isValid = await bcrypt.compare(otp, otpRecord.otp);
    if (!isValid) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const tempUser = await TemporaryUser.findOne({ email });
    if (!tempUser) {
      return res.status(400).json({ message: "No pending signup found" });
    }

    // attach temp user for next controller
    req.tempUser = tempUser;
    next(); // ✅ HERE next() is CORRECT
  } catch (error) {
    return res.status(500).json({ message: "OTP verification failed" });
  }
};

module.exports = otpVerify;
