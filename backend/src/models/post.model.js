const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
      lowercase: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    postType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    category: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    contentFormat: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    visibility: {
      type: String,
      enum: ["private", "friends", "world", "all"],
      trim: true,
      lowercase: true,
      default: "all",
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    hiddenFromUsers: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    visibleToUsers: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    musicUrl: {
      type: String,
      trim: true,
      default: null,
    },
    musicCloudinaryId: {
      type: String,
      trim: true,
      default: null,
    },
    musicSourceType: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    musicDurationSeconds: {
      type: Number,
      default: 0,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },

    // ✅ NEW FIELD
    cloudinaryId: {
      type: String,
      required: true,
    },

    likeCount: {
      type: Number,
      default: 0,
    },
    shareCount: {
      type: Number,
      default: 0,
    },
    commentCount: {
      type: Number,
      default: 0,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    postDate: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Post", postSchema);
