const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
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
  postType: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  url: {
    type: string,
    required: true,
    trim: true,
  },
});
