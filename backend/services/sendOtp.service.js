// services/sendOtp.service.js
const EmailOtp = require("../models/emailOtp.model");
const nodeMailerEmailService = require("../utils/nodeMailerEmailService.util");

const sendOtp = async ({ email, purpose }) => {
  let otp = "";
  for (let i = 0; i < 8; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  // const otp = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join(""); one line code for otp generation

  await EmailOtp.deleteMany({ email, purpose });

  await EmailOtp.create({
    email,
    otp,
    purpose,
  });

  await nodeMailerEmailService({
    to: email,
    subject: "Email verification code",
    text: `Welcome to the world of ClassMate`,
    html: `
      <h3>Your verification code</h3>
      <p><b>${otp}</b></p>
    `,
  });
};

module.exports = sendOtp;
