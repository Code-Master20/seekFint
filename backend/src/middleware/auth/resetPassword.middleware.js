const User = require("../../models/auth/user.model");
const TemporaryUser = require("../../models/auth/temporaryUser.model");
const PasswordChangeAttempt = require("../../models/auth/passwordChangeBlocked.model");
const AttemptCount = require("../../models/auth/attemptCount.model");
const { isExpiredDate } = require("../../utils/auth/expiry.util");
const ErrorHandler = require("../../utils/errorHandler.util");

const PASSWORD_RESET_BLOCK_WINDOW_MS = 30 * 60 * 1000;

async function checkIfBlocked(email, res) {
  const blocked = await PasswordChangeAttempt.findOne({ email });

  if (!blocked) {
    return false;
  }

  if (isExpiredDate(blocked.expiresAt)) {
    await PasswordChangeAttempt.deleteOne({ _id: blocked._id });
    return false;
  }

  const minutesLeft = Math.ceil((blocked.expiresAt - new Date()) / (1000 * 60));

  new ErrorHandler(
    403,
    `Too many attempts. Try again after ${minutesLeft} minutes`,
  ).send(res);

  return true;
}

async function recordFailedAttempt(email) {
  let attempt = await AttemptCount.findOne({ email });
  const nextExpiresAt = new Date(Date.now() + PASSWORD_RESET_BLOCK_WINDOW_MS);

  if (attempt && isExpiredDate(attempt.expiresAt)) {
    await AttemptCount.deleteOne({ _id: attempt._id });
    attempt = null;
  }

  if (!attempt) {
    await AttemptCount.create({ email, count: 1, expiresAt: nextExpiresAt });
    return;
  }

  attempt.count += 1;
  attempt.expiresAt = nextExpiresAt;

  if (attempt.count >= 5) {
    await PasswordChangeAttempt.findOneAndUpdate(
      { email },
      {
        lockUntil: nextExpiresAt,
        expiresAt: nextExpiresAt,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    await AttemptCount.deleteOne({ _id: attempt._id });
    return;
  }

  await attempt.save();
}

async function resetAttempts(email) {
  await AttemptCount.deleteOne({ email });
}

const resetPasswordWithOldPassword = async (req, res, next) => {
  try {
    const { email, password, newPassword } = req.body;

    const isBlocked = await checkIfBlocked(email, res);
    if (isBlocked) return;

    const userExisted = await User.findOne({ email });

    if (!userExisted) {
      await recordFailedAttempt(email);
      return new ErrorHandler(404, "email or password not matched")
        .log("password reset", "email not registered")
        .send(res);
    }

    const isMatchOldPassword = await userExisted.comparePassword(password);

    if (!isMatchOldPassword) {
      await recordFailedAttempt(email);
      return new ErrorHandler(401, "email or password not matched")
        .log("password mismatch", "user entered wrong old password")
        .send(res);
    }

    await resetAttempts(email);
    userExisted.password = newPassword;
    await userExisted.save();

    req.user = {
      id: userExisted._id,
      username: userExisted.username,
      email: userExisted.email,
      creator: userExisted.creator,
    };
    next();
  } catch (error) {
    return new ErrorHandler(500, "internal server error")
      .log("password reset failed", error)
      .send(res);
  }
};

const resetPasswordWithOtp = async (req, res, next) => {
  try {
    const { email, newPassword } = req.body;
    const userExisted = await User.findOne({ email });

    if (!userExisted) {
      return new ErrorHandler(404, "please provide correct email address")
        .log("otp reset", "email not registered")
        .send(res);
    }

    const existingTemporaryUser = await TemporaryUser.findOne({ email });

    if (existingTemporaryUser && isExpiredDate(existingTemporaryUser.expiresAt)) {
      await TemporaryUser.deleteOne({ _id: existingTemporaryUser._id });
    }

    await TemporaryUser.findOneAndUpdate(
      { email },
      {
        username: userExisted.username,
        email,
        password: newPassword,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      },
    );

    req.user = {
      username: userExisted.username,
      email,
      newPassword,
    };

    next();
  } catch (error) {
    return new ErrorHandler(500, error).send(res);
  }
};

module.exports = {
  resetPasswordWithOldPassword,
  resetPasswordWithOtp,
};
