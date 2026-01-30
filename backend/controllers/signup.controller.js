const User = require("../models/user.model");
const TemporaryUser = require("../models/temporaryUser.model");

const signUp = async (req, res) => {
  try {
    const { username, email, password } = req.tempUser;

    const userExist = await User.findOne({ email });
    if (userExist) {
      return res.status(409).json({
        success: false,
        message: "You already have an account with this email. Please log in.",
      });
    }

    const userCreated = await User.create({ username, email, password });

    await TemporaryUser.deleteMany({ email });

    const token = userCreated.generateLogTrackTkn();

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      user: {
        id: userCreated._id,
        username: userCreated.username,
        email: userCreated.email,
        creator: userCreated.creator,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating user" });
  }
};

module.exports = signUp;
