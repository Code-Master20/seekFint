const crypto = require("node:crypto");
const EmailOtp = require("../../models/auth/emailOtp.model");
const TemporaryUser = require("../../models/auth/temporaryUser.model");
const User = require("../../models/auth/user.model");
const { isExpiredDate } = require("../../utils/auth/expiry.util");
const ErrorHandler = require("../../utils/errorHandler.util");

const otpVerify = async (req, res, next) => {
  try {
    const { email, otp, purpose } = req.body;

    if (!purpose) {
      return new ErrorHandler(400, "otp purpose is required").send(res);
    }

    if (!otp) {
      return new ErrorHandler(400, "otp field empty").send(res);
    }

    const otpRecord = await EmailOtp.findOne({ email, purpose });

    if (!otpRecord) {
      return new ErrorHandler(400, "otp is invalid or expired").send(res);
    }

    if (isExpiredDate(otpRecord.expiresAt)) {
      await EmailOtp.deleteOne({ _id: otpRecord._id });
      return new ErrorHandler(410, "otp is invalid or expired").send(res);
    }

    const isValid = await otpRecord.compareOtp(otp);

    if (!isValid) {
      otpRecord.attempts += 1;
      await otpRecord.save();

      if (otpRecord.attempts >= otpRecord.maxAttempts) {
        await EmailOtp.deleteOne({ _id: otpRecord._id });
        return new ErrorHandler(
          410,
          "Too many invalid attempts. Please request a new OTP.",
          crypto.randomUUID(),
        ).send(res);
      }

      return new ErrorHandler(400, "Invalid OTP").send(res);
    }

    if (purpose === "signup") {
      const user = await TemporaryUser.findOne({ email });

      if (!user) {
        return new ErrorHandler(
          410,
          "Signup session expired. Please try signing up again.",
        ).send(res);
      }

      if (isExpiredDate(user.expiresAt)) {
        await TemporaryUser.deleteOne({ _id: user._id });
        await EmailOtp.deleteMany({ email, purpose });
        return new ErrorHandler(
          410,
          "Signup session expired. Please try signing up again.",
        ).send(res);
      }

      req.user = user;
    }

    if (purpose === "login") {
      const userData = await User.findOne({ email }).select("-password");

      if (!userData) {
        return new ErrorHandler(401, "Invalid login credentials").send(res);
      }

      req.user = userData;
    }

    if (purpose === "reset-password") {
      const tempUser = await TemporaryUser.findOne({ email });

      if (!tempUser) {
        return new ErrorHandler(
          410,
          "Password reset session expired. Please request a new OTP.",
        ).send(res);
      }

      if (isExpiredDate(tempUser.expiresAt)) {
        await TemporaryUser.deleteOne({ _id: tempUser._id });
        await EmailOtp.deleteMany({ email, purpose });
        return new ErrorHandler(
          410,
          "Password reset session expired. Please request a new OTP.",
        ).send(res);
      }

      const userFound = await User.findOne({ email: tempUser.email });

      if (!userFound) {
        return new ErrorHandler(404, "Account not found").send(res);
      }

      userFound.password = tempUser.password;
      await userFound.save();
      req.user = await User.findOne({ email }).select("-password");
      await TemporaryUser.deleteMany({ email });
    }

    await EmailOtp.deleteMany({ email, purpose });
    next();
  } catch (error) {
    return new ErrorHandler(500, "internal server error").send(res);
  }
};

module.exports = otpVerify;
