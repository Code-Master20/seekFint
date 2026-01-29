const User = require("../models/user.model");
const temporaryUser = require("../models/temporaryUser.model");

const signUp = async (req, res, _) => {
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
    await temporaryUser.deleteMany({ email });
    res.status(200).json(userCreated);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error creating user", error });
  }
};

module.exports = signUp;
