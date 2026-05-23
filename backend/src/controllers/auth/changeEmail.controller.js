const EmailOtp = require("../../models/auth/emailOtp.model");
const EmailChangeRequest = require("../../models/auth/emailChangeRequest.model");
const User = require("../../models/auth/user.model");
const sendOtp = require("../../services/auth/sendOtp.service");
const { isExpiredDate } = require("../../utils/auth/expiry.util");
const ErrorHandler = require("../../utils/errorHandler.util");
const SuccessHandler = require("../../utils/successHandler.util");
const toPublicUser = require("../../utils/auth/publicUser.util");

const compareAndTrackOtp = async ({
  email,
  purpose,
  value,
  invalidMessage,
}) => {
  const otpRecord = await EmailOtp.findOne({ email, purpose });

  if (!otpRecord) {
    return { ok: false, status: 410, message: "OTP expired. Please request a new one." };
  }

  if (isExpiredDate(otpRecord.expiresAt)) {
    await EmailOtp.deleteOne({ _id: otpRecord._id });
    return { ok: false, status: 410, message: "OTP expired. Please request a new one." };
  }

  const isValid = await otpRecord.compareOtp(value);

  if (isValid) {
    return { ok: true, otpRecord };
  }

  otpRecord.attempts += 1;
  await otpRecord.save();

  if (otpRecord.attempts >= otpRecord.maxAttempts) {
    await EmailOtp.deleteOne({ _id: otpRecord._id });
    return {
      ok: false,
      status: 410,
      message: "Too many invalid attempts. Please request fresh email OTPs.",
    };
  }

  return { ok: false, status: 400, message: invalidMessage };
};

const requestEmailChange = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const nextEmail = `${req.body?.newEmail || ""}`.trim().toLowerCase();

    if (!nextEmail) {
      return new ErrorHandler(400, "New email is required").send(res);
    }

    if (nextEmail === user.email) {
      return new ErrorHandler(400, "New email must be different from the current email").send(
        res,
      );
    }

    const existingOwner = await User.findOne({ email: nextEmail }).select("_id");

    if (existingOwner) {
      return new ErrorHandler(409, "That email is already connected to another account").send(
        res,
      );
    }

    await EmailChangeRequest.findOneAndUpdate(
      { user: user._id },
      {
        currentEmail: user.email,
        newEmail: nextEmail,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    await Promise.all([
      sendOtp({ email: user.email, purpose: "change-email-old" }),
      sendOtp({ email: nextEmail, purpose: "change-email-new" }),
    ]);

    return new SuccessHandler(
      200,
      "Verification codes were sent to your current and new email addresses",
      {
        currentEmail: user.email,
        newEmail: nextEmail,
      },
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Email change could not be started")
      .log("email change request error", error)
      .send(res);
  }
};

const verifyEmailChange = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const nextEmail = `${req.body?.newEmail || ""}`.trim().toLowerCase();
    const currentEmailOtp = `${req.body?.currentEmailOtp || ""}`.trim();
    const newEmailOtp = `${req.body?.newEmailOtp || ""}`.trim();

    const emailChangeRequest = await EmailChangeRequest.findOne({
      user: user._id,
      currentEmail: user.email,
      newEmail: nextEmail,
    });

    if (!emailChangeRequest) {
      return new ErrorHandler(
        410,
        "Email change session expired. Request new verification codes.",
      ).send(res);
    }

    if (isExpiredDate(emailChangeRequest.expiresAt)) {
      await Promise.all([
        EmailChangeRequest.deleteOne({ _id: emailChangeRequest._id }),
        EmailOtp.deleteMany({
          $or: [
            { email: emailChangeRequest.currentEmail, purpose: "change-email-old" },
            { email: emailChangeRequest.newEmail, purpose: "change-email-new" },
          ],
        }),
      ]);

      return new ErrorHandler(
        410,
        "Email change session expired. Request new verification codes.",
      ).send(res);
    }

    const duplicateEmailUser = await User.findOne({
      email: nextEmail,
      _id: { $ne: user._id },
    }).select("_id");

    if (duplicateEmailUser) {
      return new ErrorHandler(409, "That email is already connected to another account").send(
        res,
      );
    }

    const oldEmailOtpState = await compareAndTrackOtp({
      email: user.email,
      purpose: "change-email-old",
      value: currentEmailOtp,
      invalidMessage: "Current email OTP is invalid",
    });

    if (!oldEmailOtpState.ok) {
      return new ErrorHandler(oldEmailOtpState.status, oldEmailOtpState.message).send(res);
    }

    const newEmailOtpState = await compareAndTrackOtp({
      email: nextEmail,
      purpose: "change-email-new",
      value: newEmailOtp,
      invalidMessage: "New email OTP is invalid",
    });

    if (!newEmailOtpState.ok) {
      return new ErrorHandler(newEmailOtpState.status, newEmailOtpState.message).send(res);
    }

    user.email = nextEmail;
    await user.save();

    await Promise.all([
      EmailOtp.deleteMany({
        $or: [
          { email: emailChangeRequest.currentEmail, purpose: "change-email-old" },
          { email: nextEmail, purpose: "change-email-new" },
        ],
      }),
      EmailChangeRequest.deleteMany({ user: user._id }),
    ]);

    const refreshedToken = user.generateLogTrackTkn();
    const isProd = process.env.NODE_ENV === "production";

    res.cookie("token", refreshedToken, {
      httpOnly: true,
      secure: isProd ? true : false,
      sameSite: isProd ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return new SuccessHandler(
      200,
      "Email updated successfully",
      toPublicUser(user, { viewerId: user._id }),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Email could not be updated")
      .log("email change verify error", error)
      .send(res);
  }
};

module.exports = {
  requestEmailChange,
  verifyEmailChange,
};
