const express = require("express");
const router = express.Router();
const {
  logInZodSchema,
} = require("../utils/credentialValidatorSchema.util.js");
const zodyCredentialValidator = require("../middlewares/zodMiddleware/zodCredentialValidator.middleware.js");
const sendingOtpToEmail = require("../middlewares/expressMiddleware/sendingOtpToEmail.middleware.js");
const logIn = require("../controllers/login.controller.js");
const otpVerify = require("../middlewares/expressMiddleware/otpVerify.middleware.js");

router.get(
  "/log-in",
  zodyCredentialValidator(logInZodSchema),
  sendingOtpToEmail.sendingOtpForLogIn,
);

router.post("/log-in/verify-otp", otpVerify, login);
