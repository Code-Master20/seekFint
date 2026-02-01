const router = require("express").Router();
const {
  passResetZodSchema,
} = require("../utils/credentialValidatorSchema.util");
const zodyCredentialValidator = require("../middlewares/zodMiddleware/zodCredentialValidator.middleware");
const {
  resetPasswordWithRememberence,
  resetPasswordFromCrush,
} = require("../middlewares/expressMiddleware/resetPassword.middleware");
const sendingOtpToEmail = require("../middlewares/expressMiddleware/sendingOtpToEmail.middleware");
const logIn = require("../controllers/login.controller");

router.post(
  "/reset-password-with-rememberence",
  zodyCredentialValidator(passResetZodSchema),
  resetPasswordWithRememberence,
  logIn,
);

// router.post(
//   "/reset-password-from-crush",
//   zodyCredentialValidator(passResetZodSchema),
//   resetPassword,
//   sendingOtpToEmail.sendingOtpForLogIn,
// );

module.exports = router;
