// middlewares/expressMiddleware/sendingOtpToEmail.middleware.js
const TemporaryUser = require("../../models/temporaryUser.model");
const sendOtp = require("../../services/sendOtp.service");
const User = require("../../models/user.model");

// ================= SIGN UP OTP =================
const sendingOtpForSignUp = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    await TemporaryUser.deleteMany({ email });

    await TemporaryUser.create({
      username,
      email,
      password,
    });

    await sendOtp({
      email,
      purpose: "signup",
    });

    return res.status(200).json({
      success: true,
      message: `Verification code sent to ${email}`,
    });
  } catch (error) {
    console.error("sendingOtpToEmail error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send verification code",
    });
  }
};

// ================= LOGIN OTP =================
const sendingOtpForLogIn = async (req, res) => {
  try {
    const { email, password } = req.body;

    const userExisted = await User.findOne({ email });
    if (!userExisted)
      return res
        .status(404)
        .json({ success: false, message: "account not found" });

    const isMatch = await User.comparePassword(password);
    if (!isMatch)
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });

    await sendOtp({
      email,
      purpose: "login",
    });

    return res.status(200).json({
      success: true,
      message: `Verification code sent to ${email}`,
    });
  } catch (error) {
    console.error("sendingOtpForLogIn error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send verification code",
    });
  }
};

module.exports = { sendingOtpForSignUp, sendingOtpForLogIn };
