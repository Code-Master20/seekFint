const User = require("../models/user.model");

const signUp = async (req, res, _) => {
  try {
    const { username, email, password } = req.body;
    // console.log(req.body);
    const userCreated = await User.create(req.body);
    res.status(200).json(userCreated);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error creating user", error });
  }
};

module.exports = signUp;
