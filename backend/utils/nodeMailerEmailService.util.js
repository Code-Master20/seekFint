const nodemailer = require("nodemailer");
const nodeMailerEmailService = async ({ to, subject, text, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MY_EMAIL,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });

    const verificationCode = await transporter.sendMail({
      from: `"ClassMate" <${process.env.MY_EMAIL}>`,
      to,
      subject,
      text,
      html,
    });

    return verificationCode;
  } catch (error) {
    console.error("email Error", error);
    throw error;
  }
};

module.exports = nodeMailerEmailService;
