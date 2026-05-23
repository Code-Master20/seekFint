const mongoose = require("mongoose");

const blockSchema = new mongoose.Schema({
  count: {
    type: Number,
    default: 0,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  expiresAt: {
    type: Date,
    default: () => Date.now() + 45 * 60 * 1000,
  },
});

blockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const BlockedEmail = mongoose.model("BlockedEmail", blockSchema);
module.exports = BlockedEmail;
