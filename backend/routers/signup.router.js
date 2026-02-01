// routers/signup.router.js
const express = require("express");
const router = express.Router();
const { signUpZodSchema } = require("../utils/credentialValidatorSchema.util");
const zodyCredentialValidator = require("../middlewares/zodMiddleware/zodCredentialValidator.middleware");
const signUp = require("../controllers/signup.controller");
const sendingOtpToEmail = require("../middlewares/expressMiddleware/sendingOtpToEmail.middleware");
const otpVerify = require("../middlewares/expressMiddleware/otpVerify.middleware");

router.post(
  "/sign-up",
  zodyCredentialValidator(signUpZodSchema),
  sendingOtpToEmail.sendingOtpForSignUp,
);

router.post("/sign-up/verify-otp", otpVerify, signUp);

module.exports = router;
