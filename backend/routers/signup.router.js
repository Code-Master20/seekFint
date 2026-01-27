const express = require("express");
const router = express.Router();
const {
  credentialValidator,
} = require("../utils/credentialValidatorSchema.util.js");
const zodyCredentialValidator = require("../middlewares/zodMiddleware/zodCredentialValidator.middleware.js");
const signUp = require("../controllers/signup.controller.js");

router
  .route("/sign-up")
  .post(zodyCredentialValidator(credentialValidator), signUp);
