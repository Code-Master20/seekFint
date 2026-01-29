const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const temporaryUserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      default: () => Date.now() + 15 * 60 * 1000, // 15 minutes
    },
  },
  {
    timestamps: true,
  },
);

temporaryUserSchema.pre("save", async function () {
  try {
    const tempData = this;
    if (!tempData.isModified("password")) return;

    const saltRounds = await bcrypt.genSalt(10);
    const hashed_password = await bcrypt.hash(tempData.password, saltRounds);
    tempData.password = hashed_password;
    return;
  } catch (error) {
    console.error("password could not be hashed");
    return;
  }
});

temporaryUserSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TemporaryUser = mongoose.model("TemporaryUser", temporaryUserSchema);

module.exports = TemporaryUser;
