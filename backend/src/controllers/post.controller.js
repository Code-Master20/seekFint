const Post = require("../models/post.model");
const User = require("../models/auth/user.model");
const cloudinary = require("../config/cloudinary.utils");
const SuccessHandler = require("../utils/successHandler.util");
const ErrorHandler = require("../utils/errorHandler.util");
const toPublicUser = require("../utils/auth/publicUser.util");
const { getViewerLikedPostIdSet } = require("../utils/posts/postLike.util");
const {
  resolvePostAudience,
  buildFriendIdSet,
  buildFollowingIdSet,
  canViewerAccessPostAudience,
} = require("../utils/posts/postAudience.util");

const getPublicPosts = async (req, res) => {
  try {
    const viewerId = req.user?.id || req.user?._id || null;
    const allowedTypes = ["image", "video", "text"];
    const requestedType = `${req.query.type ?? "all"}`.trim().toLowerCase();
    const limitValue = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitValue)
      ? Math.min(Math.max(limitValue, 1), 48)
      : 24;
    const viewer = viewerId ? await User.findById(viewerId).select("friends following") : null;
    const viewerFriendIdSet = buildFriendIdSet(viewer);
    const viewerFollowingIdSet = buildFollowingIdSet(viewer);

    const query =
      requestedType === "all" || !allowedTypes.includes(requestedType)
        ? {}
        : { postType: requestedType };

    const posts = await Post.find(query)
      .populate(
        "user",
        "username avatar banner profession location bio talent status gender dob profileVisibility creator friends followers following createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .limit(limit * 4);
    const watchLaterPostIds = Array.isArray(req.user?.watchLaterPosts)
      ? req.user.watchLaterPosts.map((item) => `${item}`)
      : [];
    const likedPostIds = await getViewerLikedPostIdSet(
      viewerId,
      posts.map((post) => post?._id),
    );

    const normalizedPosts = posts
      .filter((post) => post.user)
      .filter((post) =>
        canViewerAccessPostAudience({
          post,
          viewerId,
          viewerFriendIdSet,
          viewerFollowingIdSet,
        }),
      )
      .slice(0, limit)
      .map((post) => {
        return {
          _id: post._id,
          title: post.title,
          description: post.description,
          tags: Array.isArray(post.tags) ? post.tags : [],
          postType: post.postType,
          category: post.category || null,
          contentFormat: post.contentFormat || null,
          visibility: resolvePostAudience(post),
          durationSeconds: Number(post.durationSeconds) || 0,
          musicUrl: post.musicUrl || null,
          musicSourceType: post.musicSourceType || null,
          musicDurationSeconds: Number(post.musicDurationSeconds) || 0,
          url: post.url,
          likeCount: post.likeCount,
          shareCount: post.shareCount,
          commentCount: post.commentCount,
          viewCount: post.viewCount || 0,
          postDate: post.postDate,
          createdAt: post.createdAt,
          isPublic: post.isPublic !== false,
          savedToWatchLater: watchLaterPostIds.includes(`${post._id}`),
          likedByViewer: likedPostIds.has(`${post._id}`),
          user: toPublicUser(post.user, { viewerId }),
        };
      });

    return new SuccessHandler(200, "Public posts", normalizedPosts).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Public posts could not be loaded")
      .log("public posts error", error)
      .send(res);
  }
};

const getPublicPostById = async (req, res) => {
  try {
    const viewerId = req.user?.id || req.user?._id || null;
    const viewer = viewerId ? await User.findById(viewerId).select("friends following") : null;
    const viewerFriendIdSet = buildFriendIdSet(viewer);
    const viewerFollowingIdSet = buildFollowingIdSet(viewer);
    const post = await Post.findById(req.params.postId).populate(
      "user",
      "username avatar banner profession location bio talent status gender dob profileVisibility creator friends followers following createdAt updatedAt",
    );

    if (
      !post ||
      !post.user ||
      !canViewerAccessPostAudience({
        post,
        viewerId,
        viewerFriendIdSet,
        viewerFollowingIdSet,
      })
    ) {
      return new ErrorHandler(404, "Post not found").send(res);
    }
    const likedPostIds = await getViewerLikedPostIdSet(viewerId, [post._id]);

    return new SuccessHandler(200, "Public post", {
      _id: post._id,
      title: post.title,
      description: post.description,
      tags: Array.isArray(post.tags) ? post.tags : [],
      postType: post.postType,
      category: post.category || null,
      contentFormat: post.contentFormat || null,
      visibility: resolvePostAudience(post),
      durationSeconds: Number(post.durationSeconds) || 0,
      musicUrl: post.musicUrl || null,
      musicSourceType: post.musicSourceType || null,
      musicDurationSeconds: Number(post.musicDurationSeconds) || 0,
      url: post.url,
      likeCount: post.likeCount,
      shareCount: post.shareCount,
      commentCount: post.commentCount,
      viewCount: post.viewCount || 0,
      postDate: post.postDate,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      isPublic: post.isPublic !== false,
      savedToWatchLater: Array.isArray(req.user?.watchLaterPosts)
        ? req.user.watchLaterPosts.some((item) => `${item}` === `${post._id}`)
        : false,
      likedByViewer: likedPostIds.has(`${post._id}`),
      user: toPublicUser(post.user, { viewerId }),
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Public post could not be loaded")
      .log("public post by id error", error)
      .send(res);
  }
};

const incrementPublicPostView = async (req, res) => {
  try {
    const viewerId = req.user?.id || req.user?._id || null;
    const viewer = viewerId ? await User.findById(viewerId).select("friends following") : null;
    const viewerFriendIdSet = buildFriendIdSet(viewer);
    const viewerFollowingIdSet = buildFollowingIdSet(viewer);
    const existingPost = await Post.findById(req.params.postId).select(
      "_id user viewCount postType contentFormat isPublic visibility hiddenFromUsers visibleToUsers",
    );

    if (
      !existingPost ||
      !canViewerAccessPostAudience({
        post: existingPost,
        viewerId,
        viewerFriendIdSet,
        viewerFollowingIdSet,
      })
    ) {
      return new ErrorHandler(404, "Post not found").send(res);
    }

    if (viewerId && `${viewerId}` === `${existingPost.user}`) {
      return new SuccessHandler(200, "Owner view ignored", {
        postId: `${existingPost._id}`,
        viewCount: existingPost.viewCount || 0,
        postType: existingPost.postType,
        contentFormat: existingPost.contentFormat || null,
      }).send(res);
    }

    const post = await Post.findByIdAndUpdate(
      req.params.postId,
      { $inc: { viewCount: 1 } },
      { new: true, select: "_id viewCount postType contentFormat" },
    );

    if (!post) {
      return new ErrorHandler(404, "Post not found").send(res);
    }

    return new SuccessHandler(200, "Post view recorded", {
      postId: `${post._id}`,
      viewCount: post.viewCount || 0,
      postType: post.postType,
      contentFormat: post.contentFormat || null,
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Post view could not be recorded")
      .log("public post view error", error)
      .send(res);
  }
};

const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Optional: check ownership
    if (post.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    await cloudinary.uploader.destroy(post.cloudinaryId, {
      resource_type: post.postType === "video" ? "video" : "image",
    });

    if (post.musicCloudinaryId) {
      await cloudinary.uploader.destroy(post.musicCloudinaryId, {
        resource_type: "video",
      });
    }

    await post.deleteOne();

    res.json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Delete failed",
    });
  }
};

module.exports = { deletePost, getPublicPosts, getPublicPostById, incrementPublicPostView };
