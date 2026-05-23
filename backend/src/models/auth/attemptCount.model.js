const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const attemptCountSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
    },

    count: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: () => Date.now() + 30 * 60 * 1000,
    },
  },
  { timestamps: true },
);

attemptCountSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AttemptCount", attemptCountSchema);
