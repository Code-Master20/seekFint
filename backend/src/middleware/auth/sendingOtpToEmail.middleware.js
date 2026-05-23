const TemporaryUser = require("../../models/auth/temporaryUser.model");
const User = require("../../models/auth/user.model");
const BlockedEmail = require("../../models/auth/temBlockEmails.model");
const sendOtp = require("../../services/auth/sendOtp.service");
const { getRemainingSeconds } = require("../../utils/auth/expiry.util");
const ErrorHandler = require("../../utils/errorHandler.util");
const SuccessHandler = require("../../utils/successHandler.util");

const LOGIN_BLOCK_DURATION_MS = 45 * 60 * 1000;

const sendingOtpForSignUp = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    await TemporaryUser.deleteMany({ email });
    await TemporaryUser.create({ username, email, password });
    await sendOtp({ email, purpose: "signup" });

    return new SuccessHandler(200, `verification code sent to ${email}`, {
      email,
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "failed to send verification code")
      .log("sending otp for sign up error", error)
      .send(res);
  }
};

const sendingOtpForLogIn = async (req, res) => {
  try {
    const { email, password } = req.body;
    const blocked = await BlockedEmail.findOne({ email });

    if (blocked && blocked.count > 2) {
      const secondsLeft = getRemainingSeconds(blocked.expiresAt);

      if (secondsLeft <= 0) {
        await BlockedEmail.deleteOne({ _id: blocked._id });
      } else {
        const minutes = Math.floor(secondsLeft / 60);
        const seconds = secondsLeft % 60;
        const blockedUntil = blocked.expiresAt.toISOString();

        return new ErrorHandler(
          429,
          `Too many failed attempts. Try again after ${minutes}m ${seconds}s`,
          null,
          {
            retryAfterSeconds: secondsLeft,
            blockedUntil,
          },
        )
          .log("login blocked", `blocked email attempted login: ${email}`)
          .send(res);
      }
    }

    const userExisted = await User.findOne({ email });

    if (!userExisted) {
      return new ErrorHandler(404, "invalid email or password")
        .log(
          "account error",
          "account has not been created with this email yet",
        )
        .send(res);
    }

    const isMatch = await userExisted.comparePassword(password);

    if (!isMatch) {
      let attempts = await BlockedEmail.findOne({ email });
      const nextExpiresAt = new Date(Date.now() + LOGIN_BLOCK_DURATION_MS);

      if (
        attempts &&
        (!attempts.expiresAt || getRemainingSeconds(attempts.expiresAt) <= 0)
      ) {
        await BlockedEmail.deleteOne({ _id: attempts._id });
        attempts = null;
      }

      if (!attempts) {
        attempts = await BlockedEmail.create({
          email,
          count: 1,
          expiresAt: nextExpiresAt,
        });
      } else {
        attempts.count += 1;
        attempts.expiresAt = nextExpiresAt;

        await attempts.save();
      }

      return new ErrorHandler(401, "invalid email or password")
        .log("email or password mis-matched", "invalid email or password")
        .send(res);
    }

    await sendOtp({ email, purpose: "login" });
    await BlockedEmail.deleteOne({ email });

    return new SuccessHandler(200, `verification code sent to ${email}`, {
      email,
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "failed to send verification code")
      .log("sending otp for log-in error", error)
      .send(res);
  }
};

const sendingOtpForPassReset = async (req, res) => {
  try {
    const { email } = req.user;
    await sendOtp({ email, purpose: "reset-password" });

    return new SuccessHandler(
      200,
      `verification code sent to ${email} for password finalization`,
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Internal server error")
      .log("otp failure :", "otp sent failed")
      .send(res);
  }
};

module.exports = {
  sendingOtpForSignUp,
  sendingOtpForLogIn,
  sendingOtpForPassReset,
};
