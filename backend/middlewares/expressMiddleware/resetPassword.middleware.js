const express = require("express");
const User = require("../../models/user.model");
const ErrorHandler = require("../../utils/errorHandler.util");

const resetPasswordWithRememberence = async (req, res, next) => {
  try {
    const { email, password, newPassword } = req.body;

    const userExisted = await User.findOne({ email });
    if (!userExisted) {
      return new ErrorHandler(404, "Account not found")
        .log(
          "error during password reset",
          "account not found for entered email",
        )
        .send(res);
    }

    const isMatchOldPassword = await userExisted.comparePassword(password);
    if (!isMatchOldPassword) {
      return new ErrorHandler(401, "Old password not correct")
        .log(
          "password not matched",
          "Password not matched to the old one you registered with us before",
        )
        .send(res);
    }

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

const resetPasswordFromCrush = async (req, res, next) => {
  try {
  } catch (error) {}
};
module.exports = { resetPasswordFromCrush, resetPasswordWithRememberence };
