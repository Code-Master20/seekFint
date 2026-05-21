const mongoose = require("mongoose");
const validator = require("validator");
const cloudinary = require("../config/cloudinary.utils");
const Comment = require("../models/comment.model");
const CommentLike = require("../models/commentLike.model");
const Post = require("../models/post.model");
const User = require("../models/auth/user.model");
const ErrorHandler = require("../utils/errorHandler.util");
const SuccessHandler = require("../utils/successHandler.util");
const { getViewerCommentReactionSets } = require("../utils/comments/commentLike.util");
const { buildCommentThreadPayload } = require("../utils/comments/commentThread.util");
const {
  buildFriendIdSet,
  buildFollowingIdSet,
  canViewerAccessPostAudience,
} = require("../utils/posts/postAudience.util");

const COMMENT_IMAGE_FOLDER = "seekFi/comments/images";

const uploadBufferToCloudinary = (file, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });

    stream.end(file.buffer);
  });

const destroyCloudinaryAsset = async (publicId) => {
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("comment image delete error", error);
  }
};

const normalizeLinkInput = (value) => {
  const trimmedValue = `${value ?? ""}`.trim();

  if (!trimmedValue) {
    return null;
  }

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  if (
    !validator.isURL(withProtocol, {
      protocols: ["http", "https"],
      require_protocol: true,
      require_valid_protocol: true,
    })
  ) {
    return "";
  }

  return withProtocol;
};

const getPublicPostComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const viewerId = req.user?.id || req.user?._id || null;

    if (!mongoose.isValidObjectId(postId)) {
      return new ErrorHandler(400, "Invalid post selected").send(res);
    }

    const viewer = viewerId ? await User.findById(viewerId).select("friends following") : null;
    const viewerFriendIdSet = buildFriendIdSet(viewer);
    const viewerFollowingIdSet = buildFollowingIdSet(viewer);
    const post = await Post.findById(postId).select(
      "user commentCount visibility isPublic hiddenFromUsers visibleToUsers",
    );

    if (
      !post ||
      !canViewerAccessPostAudience({
        post,
        viewerId,
        viewerFriendIdSet,
        viewerFollowingIdSet,
      })
    ) {
      return new ErrorHandler(404, "Post not found").send(res);
    }

    const comments = await Comment.find({ post: postId })
      .populate(
        "user",
        "username avatar banner profession location bio talent status gender dob profileVisibility creator friends followers following createdAt updatedAt",
      )
      .sort({ createdAt: -1 });
    const { likedCommentIdSet, dislikedCommentIdSet } = await getViewerCommentReactionSets(
      viewerId,
      comments.map((item) => item?._id),
    );

    return new SuccessHandler(200, "Post comments loaded", {
      commentCount: Number(post.commentCount) || comments.length,
      comments: buildCommentThreadPayload(comments, {
        viewerId,
        ownerId: post.user,
        likedCommentIdSet,
        dislikedCommentIdSet,
      }),
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Post comments could not be loaded")
      .log("post comments load error", error)
      .send(res);
  }
};

const createPostComment = async (req, res) => {
  let imageUploadResult = null;

  try {
    const { postId } = req.params;
    const viewerId = req.user?.id || req.user?._id || null;
    const commentText = `${req.body?.comment ?? ""}`.trim();
    const parentCommentId = `${req.body?.parentCommentId ?? ""}`.trim();
    const linkUrl = normalizeLinkInput(req.body?.linkUrl);

    if (!mongoose.isValidObjectId(postId)) {
      return new ErrorHandler(400, "Invalid post selected").send(res);
    }

    if (linkUrl === "") {
      return new ErrorHandler(400, "Comment link must be a valid URL").send(res);
    }

    const viewer = viewerId ? await User.findById(viewerId).select("friends following") : null;
    const viewerFriendIdSet = buildFriendIdSet(viewer);
    const viewerFollowingIdSet = buildFollowingIdSet(viewer);
    const post = await Post.findById(postId).select(
      "user commentCount visibility isPublic hiddenFromUsers visibleToUsers",
    );

    if (
      !post ||
      !canViewerAccessPostAudience({
        post,
        viewerId,
        viewerFriendIdSet,
        viewerFollowingIdSet,
      })
    ) {
      return new ErrorHandler(404, "Post not found").send(res);
    }

    let parentComment = null;

    if (parentCommentId) {
      if (!mongoose.isValidObjectId(parentCommentId)) {
        return new ErrorHandler(400, "Invalid parent comment selected").send(res);
      }

      parentComment = await Comment.findOne({
        _id: parentCommentId,
        post: postId,
      }).select("_id");

      if (!parentComment) {
        return new ErrorHandler(404, "Parent comment not found").send(res);
      }
    }

    if (!commentText && !req.file && !linkUrl) {
      return new ErrorHandler(400, "Add text, a photo, or a link before posting").send(res);
    }

    if (req.file) {
      imageUploadResult = await uploadBufferToCloudinary(req.file, {
        folder: COMMENT_IMAGE_FOLDER,
        resource_type: "image",
      });
    }

    const commentDoc = await Comment.create({
      post: postId,
      user: req.user.id,
      comment: commentText,
      parentComment: parentComment?._id || null,
      imageUrl: imageUploadResult?.secure_url || null,
      imageCloudinaryId: imageUploadResult?.public_id || null,
      linkUrl,
    });

    const populatedComment = await Comment.findById(commentDoc._id).populate(
      "user",
      "username avatar banner profession location bio talent status gender dob profileVisibility creator friends followers following createdAt updatedAt",
    );
    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      { $inc: { commentCount: 1 } },
      { new: true, select: "commentCount user" },
    );
    const [commentPayload] = buildCommentThreadPayload([populatedComment], {
      viewerId: req.user.id,
      ownerId: updatedPost?.user || post.user,
      likedCommentIdSet: new Set(),
      dislikedCommentIdSet: new Set(),
    });

    return new SuccessHandler(201, "Comment added", {
      comment: commentPayload || null,
      commentCount: Number(updatedPost?.commentCount) || (Number(post.commentCount) || 0) + 1,
    }).send(res);
  } catch (error) {
    if (imageUploadResult?.public_id) {
      await destroyCloudinaryAsset(imageUploadResult.public_id);
    }

    if (error?.code === 11000) {
      return new ErrorHandler(409, "You already liked this comment").send(res);
    }

    if (error?.http_code) {
      return new ErrorHandler(500, "Comment photo could not be uploaded")
        .log("comment upload error", error)
        .send(res);
    }

    return new ErrorHandler(500, "Comment could not be added")
      .log("post comment create error", error)
      .send(res);
  }
};

const toggleCommentReaction = async (req, res, reaction) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.isValidObjectId(commentId)) {
      return new ErrorHandler(400, "Invalid comment selected").send(res);
    }

    const comment = await Comment.findById(commentId).select("user likeCount dislikeCount");

    if (!comment) {
      return new ErrorHandler(404, "Comment not found").send(res);
    }

    const existingReaction = await CommentLike.findOne({
      comment: commentId,
      user: req.user.id,
    });

    let liked = false;
    let disliked = false;

    if (existingReaction) {
      const existingReactionType =
        existingReaction.reaction === "dislike" ? "dislike" : "like";

      if (existingReactionType === reaction) {
        await existingReaction.deleteOne();

        if (reaction === "dislike") {
          comment.dislikeCount = Math.max(0, Number(comment.dislikeCount || 0) - 1);
        } else {
          comment.likeCount = Math.max(0, Number(comment.likeCount || 0) - 1);
        }
      } else {
        existingReaction.reaction = reaction;
        await existingReaction.save();

        if (reaction === "dislike") {
          comment.likeCount = Math.max(0, Number(comment.likeCount || 0) - 1);
          comment.dislikeCount = Number(comment.dislikeCount || 0) + 1;
          disliked = true;
        } else {
          comment.dislikeCount = Math.max(0, Number(comment.dislikeCount || 0) - 1);
          comment.likeCount = Number(comment.likeCount || 0) + 1;
          liked = true;
        }
      }
    } else {
      await CommentLike.create({
        comment: commentId,
        user: req.user.id,
        reaction,
      });

      if (reaction === "dislike") {
        comment.dislikeCount = Number(comment.dislikeCount || 0) + 1;
        disliked = true;
      } else {
        comment.likeCount = Number(comment.likeCount || 0) + 1;
        liked = true;
      }
    }

    await comment.save();

    return new SuccessHandler(
      200,
      reaction === "dislike"
        ? disliked
          ? "Comment disliked"
          : "Comment dislike removed"
        : liked
          ? "Comment liked"
          : "Comment like removed",
      {
        commentId: `${comment._id}`,
        liked,
        disliked,
        likeCount: Number(comment.likeCount) || 0,
        dislikeCount: Number(comment.dislikeCount) || 0,
      },
    ).send(res);
  } catch (error) {
    if (error?.code === 11000) {
      return new ErrorHandler(409, "You already reacted to this comment").send(res);
    }

    return new ErrorHandler(
      500,
      reaction === "dislike"
        ? "Comment dislike could not be updated"
        : "Comment like could not be updated",
    )
      .log("comment reaction toggle error", error)
      .send(res);
  }
};

const toggleCommentLike = async (req, res) => toggleCommentReaction(req, res, "like");

const toggleCommentDislike = async (req, res) => toggleCommentReaction(req, res, "dislike");

module.exports = {
  getPublicPostComments,
  createPostComment,
  toggleCommentLike,
  toggleCommentDislike,
};
