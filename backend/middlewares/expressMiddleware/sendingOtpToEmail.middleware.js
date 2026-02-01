// middlewares/expressMiddleware/sendingOtpToEmail.middleware.js
const TemporaryUser = require("../../models/temporaryUser.model");
const sendOtp = require("../../services/sendOtp.service");
const User = require("../../models/user.model");
const ErrorHandler = require("../../utils/errorHandler.util");
const SuccessHandler = require("../../utils/successHandler.util");

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

    return new SuccessHandler(200, `verification code sent to ${email}`).send(
      res,
    );
  } catch (error) {
    return new ErrorHandler(500, "failed to send verification code")
      .log("sending otp for sign up error", error)
      .send(res);
  }
};

// ================= LOGIN OTP =================
const sendingOtpForLogIn = async (req, res) => {
  try {
    const { email, password } = req.body;

    const userExisted = await User.findOne({ email });
    if (!userExisted) {
      return new ErrorHandler(404, "account not found")
        .log(
          "account error",
          "account has not been created with this email yet",
        )
        .send(res);
    }
    console.log(userExisted);
    const isMatch = await userExisted.comparePassword(password);

    if (!isMatch) {
      return new ErrorHandler(401, "invalid email or password")
        .log("email or password mis-matched", "invalid email or password")
        .send(res);
    }

    await sendOtp({
      email,
      purpose: "login",
    });

    return new SuccessHandler(200, `verification code sent to ${email}`).send(
      res,
    );
  } catch (error) {
    return new ErrorHandler(500, "failed to send verification code")
      .log("sending otp for log-in error", error)
      .send(res);
  }
};

module.exports = { sendingOtpForSignUp, sendingOtpForLogIn };
