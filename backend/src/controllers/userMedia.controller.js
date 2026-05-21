const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary.utils");
const User = require("../models/auth/user.model");
const Post = require("../models/post.model");
const Like = require("../models/like.model");
const Playlist = require("../models/playlist.model");
const StoryLike = require("../models/storyLike.model");
const Notification = require("../models/notification.model");
const ErrorHandler = require("../utils/errorHandler.util");
const SuccessHandler = require("../utils/successHandler.util");
const toPublicUser = require("../utils/auth/publicUser.util");
const { getViewerLikedPostIdSet } = require("../utils/posts/postLike.util");
const {
  resolvePostAudience,
  buildRelationshipIdSet,
  buildFriendIdSet,
  buildFollowingIdSet,
  canViewerAccessPostAudience,
} = require("../utils/posts/postAudience.util");
const {
  getRelationshipSnapshot,
} = require("../utils/network/relationship.util");

const STORY_LIFETIME_MS = 36 * 60 * 60 * 1000;
const MAX_STORY_DURATION_SECONDS = 90;
const MAX_OWNER_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_PHOTO_SHORT_MUSIC_DURATION_SECONDS = 5 * 60;
const STORY_ALLOWED_POST_TYPES = ["image", "video"];
const OWNER_ALLOWED_POST_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
const OWNER_ALLOWED_POST_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];
const STORY_HISTORY_LIMIT = 12;

const normalizeListInput = (value, pattern = /\r?\n|,/) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => `${item ?? ""}`.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(pattern)
    .map((item) => item.trim())
    .filter(Boolean);
};

const PROFILE_LINK_TYPES = new Set([
  "whatsapp",
  "youtube",
  "website",
  "app",
  "instagram",
  "twitter",
  "x",
  "facebook",
  "linkedin",
  "telegram",
  "github",
  "other",
]);

const hasUrlScheme = (value) => /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(`${value ?? ""}`.trim());

const normalizeProfileLinkUrl = ({ rawUrl, type }) => {
  const trimmedUrl = `${rawUrl ?? ""}`.trim();

  if (!trimmedUrl) {
    return "";
  }

  if (type === "whatsapp" && /^\+?[\d\s()-]{7,}$/.test(trimmedUrl)) {
    const digits = trimmedUrl.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "";
  }

  if (hasUrlScheme(trimmedUrl)) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("//")) {
    return `https:${trimmedUrl}`;
  }

  return `https://${trimmedUrl.replace(/^\/+/, "")}`;
};

const normalizeExternalLinksInput = (value) => {
  const parsedValue =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch (error) {
            return [];
          }
        })()
      : value;

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .map((item) => {
      const normalizedType = `${item?.type ?? "website"}`.trim().toLowerCase();
      const normalizedLabel = `${item?.label ?? ""}`.trim().slice(0, 60);
      const normalizedUrl = normalizeProfileLinkUrl({
        rawUrl: item?.url,
        type: normalizedType,
      });

      if (!normalizedUrl) {
        return null;
      }

      try {
        // Validate normalized URLs without blocking custom app/deep-link schemes.
        // `new URL` accepts both standard web URLs and custom protocols.
        new URL(normalizedUrl);
      } catch (error) {
        return null;
      }

      return {
        type: PROFILE_LINK_TYPES.has(normalizedType) ? normalizedType : "other",
        label: normalizedLabel,
        url: normalizedUrl,
      };
    })
    .filter(Boolean)
    .slice(0, 12);
};

const normalizeCategoryInput = (value) => {
  const normalizedValue = `${value ?? ""}`.trim().toLowerCase();
  return normalizedValue || null;
};

const normalizeTagInput = (value) =>
  Array.from(
    new Set(
      normalizeListInput(value)
        .map((item) => item.toLowerCase())
        .slice(0, 12),
    ),
  );

const normalizeObjectIdListInput = (value) => {
  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return [];
    }

    try {
      return normalizeObjectIdListInput(JSON.parse(trimmedValue));
    } catch (error) {
      return normalizeObjectIdListInput(trimmedValue.split(","));
    }
  }

  if (!Array.isArray(value)) {
    return value && mongoose.isValidObjectId(`${value}`.trim()) ? [`${value}`.trim()] : [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => `${item ?? ""}`.trim())
        .filter((item) => mongoose.isValidObjectId(item)),
    ),
  );
};

const normalizeHiddenFriendIds = ({ value, allowedFriendIdSet = new Set() }) =>
  normalizeObjectIdListInput(value).filter((friendId) => allowedFriendIdSet.has(friendId));

const normalizeIncludedFriendIds = ({ value, allowedFriendIdSet = new Set() }) =>
  normalizeObjectIdListInput(value).filter((friendId) => allowedFriendIdSet.has(friendId));

const normalizePostVisibility = (value, fallback = true) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalizedValue = `${value ?? ""}`.trim().toLowerCase();

  if (["false", "0", "private", "hidden"].includes(normalizedValue)) {
    return false;
  }

  if (["true", "1", "public", "visible"].includes(normalizedValue)) {
    return true;
  }

  return fallback;
};

const normalizePostAudience = (value, fallback = "all") => {
  const normalizedValue = `${value ?? ""}`.trim().toLowerCase();

  if (["private", "friends", "world", "all"].includes(normalizedValue)) {
    return normalizedValue;
  }

  if (normalizedValue === "public") {
    return "all";
  }

  return fallback;
};

const normalizeOwnerPostFormat = ({ postType, contentFormat }) => {
  const normalizedFormat = `${contentFormat ?? ""}`.trim().toLowerCase();

  if (postType === "video") {
    if (normalizedFormat === "long") {
      return "long";
    }

    return "reel";
  }

  if (normalizedFormat === "reel") {
    return "reel";
  }

  return "article";
};

const getOwnerPostTypeFromFile = (file) =>
  file?.mimetype?.startsWith("video/") ? "video" : "image";

const getOwnerMusicSourceTypeFromFile = (file) =>
  file?.mimetype?.startsWith("video/") ? "video" : "audio";

const buildOwnerPostTitle = (providedTitle, file) => {
  const trimmedTitle = `${providedTitle ?? ""}`.trim();

  if (trimmedTitle) {
    return trimmedTitle;
  }

  const fallbackName = `${file?.originalname ?? "untitled post"}`.replace(
    /\.[^.]+$/,
    "",
  );

  return fallbackName.trim() || "untitled post";
};

const formatPostPayload = (postDoc, options = {}) => {
  if (!postDoc) {
    return null;
  }

  const {
    viewerId = null,
    savedToWatchLater = false,
    playlists = [],
    likedByViewer = false,
  } = options;
  const post = typeof postDoc.toObject === "function" ? postDoc.toObject() : postDoc;

  return {
    _id: `${post._id}`,
    title: post.title,
    description: post.description,
    tags: Array.isArray(post.tags) ? post.tags : [],
    postType: post.postType,
    category: post.category || null,
    contentFormat: post.contentFormat || null,
    durationSeconds: Number(post.durationSeconds) || 0,
    musicUrl: post.musicUrl || null,
    musicSourceType: post.musicSourceType || null,
    musicDurationSeconds: Number(post.musicDurationSeconds) || 0,
    url: post.url,
    visibility: resolvePostAudience(post),
    likeCount: post.likeCount || 0,
    shareCount: post.shareCount || 0,
    commentCount: post.commentCount || 0,
    viewCount: post.viewCount || 0,
    postDate: post.postDate,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    isPublic: post.isPublic !== false,
    savedToWatchLater,
    likedByViewer,
    playlists,
    user: post.user ? toPublicUser(post.user, { viewerId }) : null,
  };
};

const normalizePlaylistPostIds = (value) => {
  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return [];
    }

    try {
      return normalizePlaylistPostIds(JSON.parse(trimmedValue));
    } catch (error) {
      return normalizePlaylistPostIds(trimmedValue.split(","));
    }
  }

  if (!Array.isArray(value)) {
    return value && mongoose.isValidObjectId(`${value}`.trim()) ? [`${value}`.trim()] : [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => `${item ?? ""}`.trim())
        .filter((item) => mongoose.isValidObjectId(item)),
    ),
  );
};

const appendPostToPlaylists = async ({
  ownerId,
  postId,
  existingPlaylistIds = [],
  newPlaylistTitle = "",
  newPlaylistDescription = "",
}) => {
  const linkedPlaylists = [];

  if (existingPlaylistIds.length) {
    const existingPlaylists = await Playlist.find({
      _id: { $in: existingPlaylistIds },
      owner: ownerId,
    }).select("title");

    if (existingPlaylists.length) {
      await Playlist.updateMany(
        {
          _id: { $in: existingPlaylists.map((playlist) => playlist._id) },
          owner: ownerId,
        },
        {
          $addToSet: { videoPosts: postId },
        },
      );

      linkedPlaylists.push(
        ...existingPlaylists.map((playlist) => ({
          _id: `${playlist._id}`,
          title: playlist.title,
        })),
      );
    }
  }

  const normalizedNewTitle = `${newPlaylistTitle ?? ""}`.trim().toLowerCase();
  const normalizedNewDescription = `${newPlaylistDescription ?? ""}`.trim();

  if (normalizedNewTitle) {
    let playlist = await Playlist.findOne({
      owner: ownerId,
      title: normalizedNewTitle,
    });

    if (!playlist) {
      playlist = await Playlist.create({
        owner: ownerId,
        title: normalizedNewTitle,
        description: normalizedNewDescription,
        isPublic: true,
        videoPosts: [postId],
      });
    } else {
      if (normalizedNewDescription && !`${playlist.description ?? ""}`.trim()) {
        playlist.description = normalizedNewDescription;
      }
      if (!playlist.videoPosts.some((existingPostId) => `${existingPostId}` === `${postId}`)) {
        playlist.videoPosts.push(postId);
      }

      await playlist.save();
    }

    if (!linkedPlaylists.some((item) => item._id === `${playlist._id}`)) {
      linkedPlaylists.push({
        _id: `${playlist._id}`,
        title: playlist.title,
      });
    }
  }

  return linkedPlaylists;
};

const formatPlaylistPayload = (playlistDoc, options = {}) => {
  if (!playlistDoc) {
    return null;
  }

  const likedPostIdSet = options.likedPostIdSet || new Set();
  const playlist = typeof playlistDoc.toObject === "function"
    ? playlistDoc.toObject()
    : playlistDoc;
  const posts = Array.isArray(playlist.videoPosts) ? playlist.videoPosts : [];

  return {
    _id: `${playlist._id}`,
    title: playlist.title,
    description: playlist.description || "",
    isPublic: playlist.isPublic !== false,
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
    videoCount: posts.length,
    postCount: posts.length,
    videos: posts
      .filter(Boolean)
      .map((post) => ({
        _id: `${post._id}`,
        title: post.title,
        description: post.description,
        url: post.url,
        postType: post.postType,
        category: post.category || "uncategorized",
        contentFormat: post.contentFormat || null,
        likeCount: post.likeCount,
        shareCount: post.shareCount,
        commentCount: post.commentCount,
        viewCount: post.viewCount || 0,
        likedByViewer: likedPostIdSet.has(`${post._id}`),
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      })),
  };
};

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

const uploadRemoteAssetToCloudinary = (url, options) =>
  cloudinary.uploader.upload(url, options);

const destroyCloudinaryAsset = async (publicId, resourceType = "image") => {
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (error) {
    console.error("Cloudinary deletion failed:", error);
  }
};

const getStoryMediaTypeFromFile = (file) =>
  file?.mimetype?.startsWith("video/") ? "video" : "image";

const getUploadDurationSeconds = (uploadResult) => {
  const duration = Number(uploadResult?.duration);
  return Number.isFinite(duration) ? duration : 0;
};

const getStoryDurationError = ({ storyType, mediaUploadResult, audioUploadResult }) => {
  if (
    storyType === "video" &&
    getUploadDurationSeconds(mediaUploadResult) > MAX_STORY_DURATION_SECONDS
  ) {
    return "Story videos must be 1 minute 30 seconds or shorter";
  }

  return "";
};

const normalizeStoryAudioSelection = (audioFile, audioUploadResult, rawSelection = {}) => {
  if (!audioFile || !audioUploadResult?.secure_url) {
    return {
      audioType: null,
      audioStartSeconds: 0,
      audioEndSeconds: 0,
      audioPlaybackDurationSeconds: 0,
    };
  }

  const sourceDuration = getUploadDurationSeconds(audioUploadResult);
  const defaultEnd = Math.min(sourceDuration, MAX_STORY_DURATION_SECONDS);
  const requestedStart = Number(rawSelection.startSeconds);
  const requestedEnd = Number(rawSelection.endSeconds);
  const requestedPlaybackDuration = Number(rawSelection.playbackDurationSeconds);
  const audioType = audioFile?.mimetype?.startsWith("video/") ? "video" : "audio";

  let audioStartSeconds = Number.isFinite(requestedStart)
    ? Math.max(0, requestedStart)
    : 0;
  let audioEndSeconds = Number.isFinite(requestedEnd)
    ? Math.max(audioStartSeconds, requestedEnd)
    : defaultEnd;

  if (sourceDuration > 0) {
    audioStartSeconds = Math.min(audioStartSeconds, Math.max(0, sourceDuration));
    audioEndSeconds = Math.min(Math.max(audioEndSeconds, audioStartSeconds), sourceDuration);
  }

  const clipDuration = Math.max(0, audioEndSeconds - audioStartSeconds);
  const fallbackPlaybackDuration =
    clipDuration > 0
      ? Math.min(
          MAX_STORY_DURATION_SECONDS,
          clipDuration < MAX_STORY_DURATION_SECONDS
            ? MAX_STORY_DURATION_SECONDS
            : clipDuration,
        )
      : 0;

  const audioPlaybackDurationSeconds = Number.isFinite(requestedPlaybackDuration)
    ? Math.max(0, Math.min(MAX_STORY_DURATION_SECONDS, requestedPlaybackDuration))
    : fallbackPlaybackDuration;

  return {
    audioType,
    audioStartSeconds,
    audioEndSeconds,
    audioPlaybackDurationSeconds,
  };
};

const getStoryAudioSelectionError = (audioSelection, audioUploadResult) => {
  if (!audioUploadResult?.secure_url) {
    return "";
  }

  const sourceDuration = getUploadDurationSeconds(audioUploadResult);

  if (sourceDuration <= 0) {
    return "Story soundtrack length could not be read";
  }

  const clipDuration = Math.max(
    0,
    audioSelection.audioEndSeconds - audioSelection.audioStartSeconds,
  );

  if (clipDuration <= 0.05) {
    return "Choose a valid soundtrack portion for your story";
  }

  if (clipDuration > MAX_STORY_DURATION_SECONDS + 0.05) {
    return "Story soundtrack clips must stay within 1 minute 30 seconds";
  }

  if (
    audioSelection.audioPlaybackDurationSeconds <= 0 ||
    audioSelection.audioPlaybackDurationSeconds > MAX_STORY_DURATION_SECONDS + 0.05
  ) {
    return "Story soundtrack playback must stay within 1 minute 30 seconds";
  }

  return "";
};

const resetStoryFields = (user) => {
  user.story = null;
  user.storyType = null;
  user.storyCloudinaryId = null;
  user.storyAudio = null;
  user.storyAudioType = null;
  user.storyAudioStartSeconds = 0;
  user.storyAudioEndSeconds = 0;
  user.storyAudioPlaybackDurationSeconds = 0;
  user.storyAudioCloudinaryId = null;
  user.storySourcePost = null;
  user.storyLikeCount = 0;
  user.storyExpiresAt = null;
  user.storyActiveHistoryId = null;
};

const appendStoryHistoryEntry = (user, storyData) => {
  const historyEntry = {
    _id: new mongoose.Types.ObjectId(),
    mediaUrl: storyData.mediaUrl,
    mediaType: storyData.mediaType || "image",
    audioUrl: storyData.audioUrl || null,
    audioType: storyData.audioType || null,
    audioStartSeconds: Number(storyData.audioStartSeconds) || 0,
    audioEndSeconds: Number(storyData.audioEndSeconds) || 0,
    audioPlaybackDurationSeconds: Number(storyData.audioPlaybackDurationSeconds) || 0,
    mediaCloudinaryId: storyData.mediaCloudinaryId || null,
    audioCloudinaryId: storyData.audioCloudinaryId || null,
    sourcePost: storyData.sourcePost || null,
    likeCount: typeof storyData.likeCount === "number" ? storyData.likeCount : 0,
    expiresAt: storyData.expiresAt || null,
    createdAt: new Date(),
  };
  const existingHistory = Array.isArray(user.storyHistory) ? user.storyHistory : [];
  const nextHistory = [historyEntry, ...existingHistory].filter((item) => item?.mediaUrl);
  const trimmedEntries = nextHistory.slice(STORY_HISTORY_LIMIT);

  user.storyHistory = nextHistory.slice(0, STORY_HISTORY_LIMIT);

  return {
    historyEntry,
    trimmedEntries,
  };
};

const destroyStoryHistoryEntryAssets = async (entry) => {
  if (!entry) {
    return;
  }

  await destroyCloudinaryAsset(
    entry.mediaCloudinaryId,
    entry.mediaType === "video" ? "video" : "image",
  );
  await destroyCloudinaryAsset(entry.audioCloudinaryId, "video");
};

const removeStoryHistoryEntryById = (user, storyHistoryId) => {
  if (!Array.isArray(user.storyHistory)) {
    return null;
  }

  const targetId = `${storyHistoryId}`;
  const existingEntry =
    user.storyHistory.find((item) => `${item?._id}` === targetId) || null;

  if (!existingEntry) {
    return null;
  }

  user.storyHistory = user.storyHistory.filter((item) => `${item?._id}` !== targetId);
  return existingEntry;
};

const isStoryEntryExpired = (entry) => {
  if (!entry?.mediaUrl || !entry?.expiresAt) {
    return true;
  }

  const expiresAt = new Date(entry.expiresAt);

  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now();
};

const pruneExpiredStoriesFromUser = (user) => {
  if (!user) {
    return {
      changed: false,
      expiredEntries: [],
      activeStoryExpired: false,
    };
  }

  const currentHistory = Array.isArray(user.storyHistory) ? user.storyHistory : [];
  const liveHistory = [];
  const expiredEntries = [];

  currentHistory.forEach((entry) => {
    if (isStoryEntryExpired(entry)) {
      expiredEntries.push(entry);
      return;
    }

    liveHistory.push(entry);
  });

  const activeStoryExpired = isStoryEntryExpired({
    mediaUrl: user.story,
    expiresAt: user.storyExpiresAt,
  });
  const historyChanged = liveHistory.length !== currentHistory.length;
  let changed = historyChanged;

  if (historyChanged) {
    user.storyHistory = liveHistory;
  }

  if (activeStoryExpired) {
    const hadStoryState = Boolean(
      user.story ||
        user.storyType ||
        user.storyAudio ||
        user.storyAudioType ||
        user.storyAudioStartSeconds ||
        user.storyAudioEndSeconds ||
        user.storyAudioPlaybackDurationSeconds ||
        user.storyCloudinaryId ||
        user.storyAudioCloudinaryId ||
        user.storySourcePost ||
        user.storyExpiresAt ||
        user.storyActiveHistoryId,
    );

    if (hadStoryState) {
      resetStoryFields(user);
      changed = true;
    }
  }

  return {
    changed,
    expiredEntries,
    activeStoryExpired,
  };
};

const clearStoryLikes = async (userId) => {
  if (!userId) {
    return;
  }

  try {
    await StoryLike.deleteMany({ storyOwner: userId });
  } catch (error) {
    console.error("Story likes cleanup failed:", error);
  }
};

const buildStoryNotificationLink = (userId) => `/profile/${userId}?story=1`;

const notifyFriendsAboutStory = async (user) => {
  const friendIds = Array.from(
    new Set((user.friends || []).map((friendId) => `${friendId}`).filter(Boolean)),
  );

  if (!friendIds.length) {
    return;
  }

  await Notification.insertMany(
    friendIds.map((friendId) => ({
      user: friendId,
      actor: user._id,
      type: "story_added",
      message: `${user.username} added a new story`,
      link: buildStoryNotificationLink(user._id),
    })),
    { ordered: false },
  );
};

/* =========================
   UPLOAD AVATAR
========================= */
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return new ErrorHandler(400, "No file chosen").send(res);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const stream = cloudinary.uploader.upload_stream(
      { folder: "seekFi/avatar" },
      async (error, result) => {
        if (error) {
          return new ErrorHandler(500, "Cloudinary upload failed")
            .log("cloudinary error", error)
            .send(res);
        }

        try {
          // Try deleting old avatar (non-blocking cleanup)
          try {
            if (user.avatarCloudinaryId) {
              await cloudinary.uploader.destroy(user.avatarCloudinaryId);
            }
          } catch (deleteError) {
            console.error("Old avatar deletion failed:", deleteError);
          }

          user.avatar = result.secure_url;
          user.avatarCloudinaryId = result.public_id;

          await user.save();

          return new SuccessHandler(
            200,
            "DP updated successfully",
            toPublicUser(user, { viewerId: user._id }),
          ).send(res);
        } catch (dbError) {
          // Rollback newly uploaded image
          await cloudinary.uploader.destroy(result.public_id);

          return new ErrorHandler(500, "Database update failed")
            .log("database error", dbError)
            .send(res);
        }
      },
    );

    stream.end(req.file.buffer);
  } catch (error) {
    return new ErrorHandler(500, "Server Error")
      .log("unexpected error", error)
      .send(res);
  }
};

/* =========================
   UPLOAD BANNER
========================= */
const uploadBanner = async (req, res) => {
  try {
    if (!req.file) {
      return new ErrorHandler(400, "No file chosen").send(res);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const stream = cloudinary.uploader.upload_stream(
      { folder: "seekFi/banner" },
      async (error, result) => {
        if (error) {
          return new ErrorHandler(500, "Cloudinary upload failed")
            .log("cloudinary error", error)
            .send(res);
        }

        try {
          // Try deleting old banner (non-blocking cleanup)
          try {
            if (user.bannerCloudinaryId) {
              await cloudinary.uploader.destroy(user.bannerCloudinaryId);
            }
          } catch (deleteError) {
            console.error("Old banner deletion failed:", deleteError);
          }

          user.banner = result.secure_url;
          user.bannerCloudinaryId = result.public_id;

          await user.save();

          return new SuccessHandler(
            200,
            "Banner updated successfully",
            toPublicUser(user, { viewerId: user._id }),
          ).send(res);
        } catch (dbError) {
          // Rollback newly uploaded image
          await cloudinary.uploader.destroy(result.public_id);

          return new ErrorHandler(500, "Database update failed")
            .log("database error", dbError)
            .send(res);
        }
      },
    );

    stream.end(req.file.buffer);
  } catch (error) {
    return new ErrorHandler(500, "Server Error")
      .log("unexpected error", error)
      .send(res);
  }
};

/* =========================
   UPLOAD STORY
========================= */
const uploadStory = async (req, res) => {
  try {
    const mediaFile = req.files?.media?.[0] || null;
    const audioFile = req.files?.audio?.[0] || null;
    const sourcePostId = `${req.body?.sourcePostId ?? ""}`.trim();
    const rawAudioSelection = {
      startSeconds: req.body?.audioStartSeconds,
      endSeconds: req.body?.audioEndSeconds,
      playbackDurationSeconds: req.body?.audioPlaybackDurationSeconds,
    };

    if (!mediaFile && !sourcePostId) {
      return new ErrorHandler(
        400,
        "Choose a photo or video, or pick one of your posts",
      ).send(res);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    let mediaUploadResult = null;
    let audioUploadResult = null;
    let storyType = "image";
    let audioSelection = {
      audioType: null,
      audioStartSeconds: 0,
      audioEndSeconds: 0,
      audioPlaybackDurationSeconds: 0,
    };

    try {
      if (sourcePostId) {
        if (!mongoose.isValidObjectId(sourcePostId)) {
          return new ErrorHandler(400, "Invalid post selected for story").send(res);
        }

        const sourcePost = await Post.findOne({
          _id: sourcePostId,
          user: req.user.id,
        }).select("url postType");

        if (!sourcePost) {
          return new ErrorHandler(404, "Selected post was not found").send(res);
        }

        if (!STORY_ALLOWED_POST_TYPES.includes(sourcePost.postType)) {
          return new ErrorHandler(
            400,
            "Only image and video posts can be used as stories",
          ).send(res);
        }

        storyType = sourcePost.postType;
        mediaUploadResult = await uploadRemoteAssetToCloudinary(sourcePost.url, {
          folder: "seekFi/story/media",
          resource_type: "auto",
        });
        user.storySourcePost = sourcePost._id;
      } else {
        storyType = getStoryMediaTypeFromFile(mediaFile);
        mediaUploadResult = await uploadBufferToCloudinary(mediaFile, {
          folder: "seekFi/story/media",
          resource_type: "auto",
        });
        user.storySourcePost = null;
      }

      if (audioFile) {
        audioUploadResult = await uploadBufferToCloudinary(audioFile, {
          folder: "seekFi/story/audio",
          resource_type: "video",
        });
        audioSelection = normalizeStoryAudioSelection(
          audioFile,
          audioUploadResult,
          rawAudioSelection,
        );
      }
    } catch (uploadError) {
      if (mediaUploadResult?.public_id) {
        await destroyCloudinaryAsset(
          mediaUploadResult.public_id,
          storyType === "video" ? "video" : "image",
        );
      }

      if (audioUploadResult?.public_id) {
        await destroyCloudinaryAsset(audioUploadResult.public_id, "video");
      }

      return new ErrorHandler(500, "Cloudinary upload failed")
        .log("cloudinary error", uploadError)
        .send(res);
    }

    const durationError = getStoryDurationError({
      storyType,
      mediaUploadResult,
      audioUploadResult,
    });

    if (durationError) {
      await destroyCloudinaryAsset(
        mediaUploadResult?.public_id,
        storyType === "video" ? "video" : "image",
      );
      await destroyCloudinaryAsset(audioUploadResult?.public_id, "video");

      return new ErrorHandler(400, durationError).send(res);
    }

    const audioSelectionError = getStoryAudioSelectionError(
      audioSelection,
      audioUploadResult,
    );

    if (audioSelectionError) {
      await destroyCloudinaryAsset(
        mediaUploadResult?.public_id,
        storyType === "video" ? "video" : "image",
      );
      await destroyCloudinaryAsset(audioUploadResult?.public_id, "video");

      return new ErrorHandler(400, audioSelectionError).send(res);
    }

    try {
      await clearStoryLikes(user._id);
      user.story = mediaUploadResult.secure_url;
      user.storyType = storyType;
      user.storyCloudinaryId = mediaUploadResult.public_id;
      user.storyAudio = audioUploadResult?.secure_url || null;
      user.storyAudioType = audioSelection.audioType;
      user.storyAudioStartSeconds = audioSelection.audioStartSeconds;
      user.storyAudioEndSeconds = audioSelection.audioEndSeconds;
      user.storyAudioPlaybackDurationSeconds =
        audioSelection.audioPlaybackDurationSeconds;
      user.storyAudioCloudinaryId = audioUploadResult?.public_id || null;
      user.storyLikeCount = 0;
      user.storyExpiresAt = new Date(Date.now() + STORY_LIFETIME_MS);
      const { historyEntry, trimmedEntries } = appendStoryHistoryEntry(user, {
        mediaUrl: mediaUploadResult.secure_url,
        mediaType: storyType,
        audioUrl: audioUploadResult?.secure_url || null,
        audioType: audioSelection.audioType,
        audioStartSeconds: audioSelection.audioStartSeconds,
        audioEndSeconds: audioSelection.audioEndSeconds,
        audioPlaybackDurationSeconds: audioSelection.audioPlaybackDurationSeconds,
        mediaCloudinaryId: mediaUploadResult.public_id,
        audioCloudinaryId: audioUploadResult?.public_id || null,
        sourcePost: user.storySourcePost || null,
        likeCount: 0,
        expiresAt: user.storyExpiresAt,
      });
      user.storyActiveHistoryId = historyEntry._id;

      await user.save();

      await Promise.all(trimmedEntries.map((entry) => destroyStoryHistoryEntryAssets(entry)));

      try {
        await notifyFriendsAboutStory(user);
      } catch (notificationError) {
        console.error("story notification error", notificationError);
      }

      return new SuccessHandler(
        200,
        "Story uploaded successfully",
        toPublicUser(user, { viewerId: user._id }),
      ).send(res);
    } catch (dbError) {
      await destroyCloudinaryAsset(
        mediaUploadResult?.public_id,
        storyType === "video" ? "video" : "image",
      );
      await destroyCloudinaryAsset(audioUploadResult?.public_id, "video");

      return new ErrorHandler(500, "Database update failed")
        .log("database error", dbError)
        .send(res);
    }
  } catch (error) {
    return new ErrorHandler(500, "Server Error")
      .log("unexpected error", error)
      .send(res);
  }
};

const deleteAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.avatarCloudinaryId) {
      return res.status(400).json({
        success: false,
        message: "No avatar to delete",
      });
    }

    await cloudinary.uploader.destroy(user.avatarCloudinaryId);

    user.avatar = null;
    user.avatarCloudinaryId = null;

    await user.save();

    res.json({
      success: true,
      message: "Avatar deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Delete failed",
    });
  }
};

const deleteBanner = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.bannerCloudinaryId) {
      return res.status(400).json({
        success: false,
        message: "No banner to delete",
      });
    }

    await cloudinary.uploader.destroy(user.bannerCloudinaryId);

    user.banner = null;
    user.bannerCloudinaryId = null;

    await user.save();

    res.json({
      success: true,
      message: "Banner deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Delete failed",
    });
  }
};

const deleteStory = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    if (!user.story && !user.storyCloudinaryId) {
      return new ErrorHandler(400, "No story to delete").send(res);
    }

    const activeHistoryId = user.storyActiveHistoryId;
    const removedEntry = activeHistoryId
      ? removeStoryHistoryEntryById(user, activeHistoryId)
      : null;

    if (removedEntry) {
      await destroyStoryHistoryEntryAssets(removedEntry);
    } else {
      await destroyCloudinaryAsset(
        user.storyCloudinaryId,
        user.storyType === "video" ? "video" : "image",
      );
      await destroyCloudinaryAsset(user.storyAudioCloudinaryId, "video");
    }

    await clearStoryLikes(user._id);

    resetStoryFields(user);

    await user.save();

    return new SuccessHandler(
      200,
      "Story removed successfully",
      toPublicUser(user, { viewerId: user._id }),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Story could not be deleted")
      .log("story delete error", error)
      .send(res);
  }
};

const deleteStoryHistoryEntry = async (req, res) => {
  try {
    const { storyHistoryId } = req.params;

    if (!mongoose.isValidObjectId(storyHistoryId)) {
      return new ErrorHandler(400, "Invalid story selected").send(res);
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const removedEntry = removeStoryHistoryEntryById(user, storyHistoryId);

    if (!removedEntry) {
      return new ErrorHandler(404, "Story was not found").send(res);
    }

    const isActiveStory = user.storyActiveHistoryId
      ? `${user.storyActiveHistoryId}` === `${storyHistoryId}`
      : false;

    if (isActiveStory) {
      await clearStoryLikes(user._id);
      resetStoryFields(user);
    }

    await destroyStoryHistoryEntryAssets(removedEntry);
    await user.save();

    return new SuccessHandler(
      200,
      "Story removed successfully",
      toPublicUser(user, { viewerId: user._id }),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Story could not be deleted")
      .log("story history delete error", error)
      .send(res);
  }
};

const getStoryEligiblePosts = async (req, res) => {
  try {
    const posts = await Post.find({
      user: req.user.id,
      postType: { $in: STORY_ALLOWED_POST_TYPES },
    })
      .select("title description url postType createdAt")
      .sort({ createdAt: -1 })
      .limit(24);

    return new SuccessHandler(200, "Eligible story posts", posts).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Story posts could not be loaded")
      .log("story posts error", error)
      .send(res);
  }
};

const getOwnerVideoLibrary = async (req, res) => {
  try {
    const posts = await Post.find({
      user: req.user.id,
      postType: "video",
    })
      .select("title description url postType category createdAt updatedAt")
      .select("title description url postType category contentFormat durationSeconds createdAt updatedAt")
      .sort({ createdAt: -1 });

    const normalizedPosts = posts.map((post) => ({
      _id: `${post._id}`,
      title: post.title,
      description: post.description,
      url: post.url,
      postType: post.postType,
      category: post.category || "uncategorized",
      contentFormat: post.contentFormat || "reel",
      durationSeconds: Number(post.durationSeconds) || 0,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }));

    const categorySummary = normalizedPosts.reduce((accumulator, post) => {
      const categoryKey = post.category || "uncategorized";
      accumulator[categoryKey] = (accumulator[categoryKey] || 0) + 1;
      return accumulator;
    }, {});

    return new SuccessHandler(200, "Video library loaded", {
      posts: normalizedPosts,
      categories: Object.entries(categorySummary).map(([category, count]) => ({
        category,
        count,
      })),
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Video library could not be loaded")
      .log("video library error", error)
      .send(res);
  }
};

const getOwnerPlaylists = async (req, res) => {
  try {
    const playlists = await Playlist.find({ owner: req.user.id })
      .populate({
        path: "videoPosts",
        select:
          "title description url postType category contentFormat likeCount shareCount commentCount viewCount createdAt updatedAt",
      })
      .sort({ updatedAt: -1 });
    const likedPostIds = await getViewerLikedPostIdSet(
      req.user.id,
      playlists.flatMap((playlist) =>
        Array.isArray(playlist.videoPosts) ? playlist.videoPosts.map((post) => post?._id) : [],
      ),
    );

    return new SuccessHandler(
      200,
      "Playlists loaded",
      playlists.map((playlist) => formatPlaylistPayload(playlist, { likedPostIdSet: likedPostIds })),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Playlists could not be loaded")
      .log("owner playlists error", error)
      .send(res);
  }
};

const createPlaylist = async (req, res) => {
  try {
    const title = `${req.body?.title ?? ""}`.trim().toLowerCase();
    const description = `${req.body?.description ?? ""}`.trim();
    const videoPostIds = normalizePlaylistPostIds(req.body?.videoPostIds);
    const isPublic = req.body?.isPublic !== false;

    if (!title) {
      return new ErrorHandler(400, "Playlist title is required").send(res);
    }

    const eligiblePosts = await Post.find({
      _id: { $in: videoPostIds },
    }).select("_id");

    const eligiblePostIds = eligiblePosts.map((post) => post._id);

    const playlist = await Playlist.create({
      owner: req.user.id,
      title,
      description,
      isPublic,
      videoPosts: eligiblePostIds,
    });

    const hydratedPlaylist = await Playlist.findById(playlist._id).populate({
      path: "videoPosts",
      select:
        "title description url postType category contentFormat likeCount shareCount commentCount viewCount createdAt updatedAt",
    });
    const likedPostIds = await getViewerLikedPostIdSet(
      req.user.id,
      Array.isArray(hydratedPlaylist?.videoPosts)
        ? hydratedPlaylist.videoPosts.map((post) => post?._id)
        : [],
    );

    return new SuccessHandler(
      201,
      "Playlist created successfully",
      formatPlaylistPayload(hydratedPlaylist, { likedPostIdSet: likedPostIds }),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Playlist could not be created")
      .log("create playlist error", error)
      .send(res);
  }
};

const updatePlaylist = async (req, res) => {
  try {
    const { playlistId } = req.params;

    if (!mongoose.isValidObjectId(playlistId)) {
      return new ErrorHandler(400, "Invalid playlist selected").send(res);
    }

    const playlist = await Playlist.findOne({ _id: playlistId, owner: req.user.id });

    if (!playlist) {
      return new ErrorHandler(404, "Playlist not found").send(res);
    }

    const title = `${req.body?.title ?? playlist.title}`.trim().toLowerCase();
    const description =
      req.body?.description !== undefined
        ? `${req.body.description ?? ""}`.trim()
        : playlist.description;
    const isPublic =
      req.body?.isPublic !== undefined ? req.body.isPublic !== false : playlist.isPublic;
    const videoPostIds =
      req.body?.videoPostIds !== undefined
        ? normalizePlaylistPostIds(req.body.videoPostIds)
        : playlist.videoPosts.map((postId) => `${postId}`);

    if (!title) {
      return new ErrorHandler(400, "Playlist title is required").send(res);
    }

    const eligiblePosts = await Post.find({
      _id: { $in: videoPostIds },
    }).select("_id");

    playlist.title = title;
    playlist.description = description;
    playlist.videoPosts = eligiblePosts.map((post) => post._id);
    playlist.isPublic = isPublic;
    await playlist.save();

    const hydratedPlaylist = await Playlist.findById(playlist._id).populate({
      path: "videoPosts",
      select:
        "title description url postType category contentFormat likeCount shareCount commentCount viewCount createdAt updatedAt",
    });
    const likedPostIds = await getViewerLikedPostIdSet(
      req.user.id,
      Array.isArray(hydratedPlaylist?.videoPosts)
        ? hydratedPlaylist.videoPosts.map((post) => post?._id)
        : [],
    );

    return new SuccessHandler(
      200,
      "Playlist updated successfully",
      formatPlaylistPayload(hydratedPlaylist, { likedPostIdSet: likedPostIds }),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Playlist could not be updated")
      .log("update playlist error", error)
      .send(res);
  }
};

const getPublicProfilePlaylists = async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user?.id || req.user?._id || null;

    if (!mongoose.isValidObjectId(userId)) {
      return new ErrorHandler(400, "Invalid profile id").send(res);
    }

    const playlists = await Playlist.find({
      owner: userId,
      isPublic: true,
    })
      .populate({
        path: "videoPosts",
        select:
          "title description url postType category contentFormat likeCount shareCount commentCount viewCount createdAt updatedAt",
      })
      .sort({ updatedAt: -1 });
    const likedPostIds = await getViewerLikedPostIdSet(
      viewerId,
      playlists.flatMap((playlist) =>
        Array.isArray(playlist.videoPosts) ? playlist.videoPosts.map((post) => post?._id) : [],
      ),
    );

    return new SuccessHandler(
      200,
      "Public playlists loaded",
      playlists.map((playlist) => formatPlaylistPayload(playlist, { likedPostIdSet: likedPostIds })),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Public playlists could not be loaded")
      .log("public playlists error", error)
      .send(res);
  }
};

const updateVideoCategory = async (req, res) => {
  try {
    const { postId } = req.params;
    const category = normalizeCategoryInput(req.body?.category);

    if (!mongoose.isValidObjectId(postId)) {
      return new ErrorHandler(400, "Invalid post selected").send(res);
    }

    const post = await Post.findOne({
      _id: postId,
      user: req.user.id,
      postType: "video",
    });

    if (!post) {
      return new ErrorHandler(404, "Video post not found").send(res);
    }

    post.category = category;
    await post.save();

    return new SuccessHandler(200, "Video category updated", {
      _id: `${post._id}`,
      category: post.category || "uncategorized",
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Video category could not be updated")
      .log("video category error", error)
      .send(res);
  }
};

const createOwnerPost = async (req, res) => {
  try {
    const mediaFile = req.files?.media?.[0] || null;
    const musicFile = req.files?.music?.[0] || null;

    if (!mediaFile) {
      return new ErrorHandler(400, "Choose a photo or video to publish").send(res);
    }

    const postType = getOwnerPostTypeFromFile(mediaFile);
    const contentFormat = normalizeOwnerPostFormat({
      postType,
      contentFormat: req.body?.contentFormat,
    });
    const category = postType === "video" ? normalizeCategoryInput(req.body?.category) : null;
    const title = buildOwnerPostTitle(req.body?.title, mediaFile);
    const description = `${req.body?.description ?? ""}`.trim();
    const tags = normalizeTagInput(req.body?.tags);
    const visibility = normalizePostAudience(
      req.body?.visibility,
      normalizePostVisibility(req.body?.isPublic, true) ? "all" : "private",
    );
    const isPublic = ["world", "all"].includes(visibility);
    const owner = await User.findById(req.user.id).select("friends followers");

    if (!owner) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const ownerFriendIdSet = buildFriendIdSet(owner);
    const ownerFollowerIdSet = buildRelationshipIdSet(owner, "followers");
    const ownerSafroIdSet = new Set(
      Array.from(ownerFriendIdSet).filter((friendId) => ownerFollowerIdSet.has(friendId)),
    );
    const ownerFradoIdSet = new Set(
      Array.from(ownerFriendIdSet).filter((friendId) => !ownerFollowerIdSet.has(friendId)),
    );
    const hiddenFromUsers = normalizeHiddenFriendIds({
      value: req.body?.hiddenFromUserIds ?? req.body?.hiddenFromUsers,
      allowedFriendIdSet: visibility === "world" ? ownerSafroIdSet : ownerFriendIdSet,
    });
    const visibleToUsers = normalizeIncludedFriendIds({
      value: req.body?.includedUserIds ?? req.body?.visibleToUsers,
      allowedFriendIdSet: visibility === "world" ? ownerFradoIdSet : ownerFriendIdSet,
    });

    if (postType === "video" && Number(mediaFile.size) > MAX_OWNER_VIDEO_UPLOAD_BYTES) {
      return new ErrorHandler(400, "Video posts must be 100MB or smaller").send(res);
    }

    const playlistIds = normalizePlaylistPostIds(req.body?.playlistIds);
    const newPlaylistTitle = `${req.body?.newPlaylistTitle ?? ""}`.trim();
    const newPlaylistDescription = `${req.body?.newPlaylistDescription ?? ""}`.trim();
    const canAttachPhotoShortMusic = postType === "image" && contentFormat === "reel";

    if (canAttachPhotoShortMusic && !musicFile) {
      return new ErrorHandler(400, "Attach music to publish Photo Shorts").send(res);
    }

    const uploadResult = await uploadBufferToCloudinary(mediaFile, {
      folder: postType === "video" ? "seekFi/posts/videos" : "seekFi/posts/images",
      resource_type: postType === "video" ? "video" : "image",
    });
    let musicUploadResult = null;
    let musicDurationSeconds = 0;
    let musicUrl = null;
    let musicCloudinaryId = null;
    let musicSourceType = null;

    if (canAttachPhotoShortMusic && musicFile) {
      musicSourceType = getOwnerMusicSourceTypeFromFile(musicFile);
      musicUploadResult = await uploadBufferToCloudinary(musicFile, {
        folder: "seekFi/posts/music",
        resource_type: "video",
      });
      musicDurationSeconds = Math.min(
        getUploadDurationSeconds(musicUploadResult),
        MAX_PHOTO_SHORT_MUSIC_DURATION_SECONDS,
      );
      musicUrl = musicUploadResult.secure_url;
      musicCloudinaryId = musicUploadResult.public_id;
    }

    const newPost = await Post.create({
      title,
      description,
      tags,
      postType,
      category,
      contentFormat,
      visibility,
      isPublic,
      hiddenFromUsers,
      visibleToUsers,
      durationSeconds:
        postType === "video"
          ? getUploadDurationSeconds(uploadResult)
          : musicDurationSeconds,
      musicUrl,
      musicCloudinaryId,
      musicSourceType,
      musicDurationSeconds,
      url: uploadResult.secure_url,
      cloudinaryId: uploadResult.public_id,
      user: req.user.id,
      postDate: Date.now(),
    });

    const linkedPlaylists = await appendPostToPlaylists({
      ownerId: req.user.id,
      postId: newPost._id,
      existingPlaylistIds: playlistIds,
      newPlaylistTitle,
      newPlaylistDescription,
    });

    const hydratedPost = await Post.findById(newPost._id).populate(
      "user",
      "username avatar banner profession location bio talent status gender dob profileVisibility creator friends followers following createdAt updatedAt",
    );

    return new SuccessHandler(
      201,
      "Post published successfully",
      formatPostPayload(hydratedPost, {
        viewerId: req.user.id,
        playlists: linkedPlaylists,
      }),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Post could not be published")
      .log("owner post publish error", error)
      .send(res);
  }
};

const getOwnerPosts = async (req, res) => {
  try {
    const requestedType = `${req.query.type ?? "all"}`.trim().toLowerCase();
    const allowedTypes = ["all", "image", "video"];
    const query = {
      user: req.user.id,
    };

    if (allowedTypes.includes(requestedType) && requestedType !== "all") {
      query.postType = requestedType;
    }

    const posts = await Post.find(query)
      .populate(
        "user",
        "username avatar banner profession location bio talent status gender dob profileVisibility creator friends followers following createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .limit(36);
    const likedPostIds = await getViewerLikedPostIdSet(
      req.user.id,
      posts.map((post) => post?._id),
    );

    return new SuccessHandler(
      200,
      "Owner posts loaded",
      posts.map((post) =>
        formatPostPayload(post, {
          viewerId: req.user.id,
          likedByViewer: likedPostIds.has(`${post._id}`),
        }),
      ),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Owner posts could not be loaded")
      .log("owner posts error", error)
      .send(res);
  }
};

const getProfilePosts = async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user?.id || req.user?._id || null;
    const requestedType = `${req.query.type ?? "all"}`.trim().toLowerCase();
    const allowedTypes = ["all", "image", "video"];
    const viewer = viewerId ? await User.findById(viewerId).select("friends following") : null;
    const viewerFriendIdSet = buildFriendIdSet(viewer);
    const viewerFollowingIdSet = buildFollowingIdSet(viewer);

    if (!mongoose.isValidObjectId(userId)) {
      return new ErrorHandler(400, "Invalid profile id").send(res);
    }

    const query = {
      user: userId,
    };

    if (allowedTypes.includes(requestedType) && requestedType !== "all") {
      query.postType = requestedType;
    }

    const posts = await Post.find(query)
      .populate(
        "user",
        "username avatar banner profession location bio talent status gender dob profileVisibility creator friends followers following createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .limit(36);
    const likedPostIds = await getViewerLikedPostIdSet(
      viewerId,
      posts.map((post) => post?._id),
    );

    return new SuccessHandler(
      200,
      "Profile posts loaded",
      posts
        .filter((post) => post.user)
        .filter((post) =>
          canViewerAccessPostAudience({
            post,
            viewerId,
            viewerFriendIdSet,
            viewerFollowingIdSet,
          }),
        )
        .map((post) =>
          formatPostPayload(post, {
            viewerId,
            likedByViewer: likedPostIds.has(`${post._id}`),
          }),
        ),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Profile posts could not be loaded")
      .log("profile posts error", error)
      .send(res);
  }
};

const togglePostLike = async (req, res) => {
  try {
    const { postId } = req.params;

    if (!mongoose.isValidObjectId(postId)) {
      return new ErrorHandler(400, "Invalid post selected").send(res);
    }

    const post = await Post.findById(postId).select(
      "user likeCount title visibility isPublic hiddenFromUsers visibleToUsers",
    );
    const viewer = await User.findById(req.user.id).select("friends following");
    const viewerFriendIdSet = buildFriendIdSet(viewer);
    const viewerFollowingIdSet = buildFollowingIdSet(viewer);

    if (
      !post ||
      !canViewerAccessPostAudience({
        post,
        viewerId: req.user.id,
        viewerFriendIdSet,
        viewerFollowingIdSet,
      })
    ) {
      return new ErrorHandler(404, "Post not found").send(res);
    }

    const existingLike = await Like.findOne({
      post: postId,
      user: req.user.id,
    });

    let liked = false;

    if (existingLike) {
      await existingLike.deleteOne();
      post.likeCount = Math.max(0, Number(post.likeCount || 0) - 1);
      await Notification.deleteMany({
        user: post.user,
        actor: req.user.id,
        type: "post_like",
        link: `/posts/${post._id}`,
      });
    } else {
      await Like.create({
        post: postId,
        user: req.user.id,
      });
      post.likeCount = Number(post.likeCount || 0) + 1;
      liked = true;

      if (`${post.user}` !== `${req.user.id}`) {
        const actor = await User.findById(req.user.id).select("username");

        try {
          await Notification.create({
            user: post.user,
            actor: req.user.id,
            type: "post_like",
            message: `${actor?.username || "Someone"} liked your post${post.title ? `: ${post.title}` : ""}`,
            link: `/posts/${post._id}`,
          });
        } catch (notificationError) {
          console.error("post like notification error", notificationError);
        }
      }
    }

    await post.save();

    return new SuccessHandler(
      200,
      liked ? "Post liked" : "Like removed",
      {
        postId: `${post._id}`,
        liked,
        likeCount: post.likeCount,
      },
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Post like could not be updated")
      .log("post like toggle error", error)
      .send(res);
  }
};

const getPostLikes = async (req, res) => {
  try {
    const { postId } = req.params;

    if (!mongoose.isValidObjectId(postId)) {
      return new ErrorHandler(400, "Invalid post selected").send(res);
    }

    const post = await Post.findById(postId).select("user title");

    if (!post) {
      return new ErrorHandler(404, "Post not found").send(res);
    }

    if (`${post.user}` !== `${req.user.id}`) {
      return new ErrorHandler(403, "Only the post owner can view likes").send(res);
    }

    const likes = await Like.find({ post: postId })
      .populate(
        "user",
        "username avatar profession location bio talent status gender dob profileVisibility creator friends followers following createdAt updatedAt",
      )
      .sort({ createdAt: -1 });

    return new SuccessHandler(
      200,
      "Post likes loaded",
      {
        postId: `${post._id}`,
        title: post.title,
        totalLikes: likes.length,
        likes: likes
          .filter((item) => item.user)
          .map((item) => ({
            _id: `${item._id}`,
            createdAt: item.createdAt,
            user: toPublicUser(item.user, { viewerId: req.user.id }),
          })),
      },
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Post likes could not be loaded")
      .log("post likes load error", error)
      .send(res);
  }
};

const toggleWatchLater = async (req, res) => {
  try {
    const { postId } = req.params;

    if (!mongoose.isValidObjectId(postId)) {
      return new ErrorHandler(400, "Invalid post selected").send(res);
    }

    const post = await Post.findById(postId).select(
      "title description url postType category user likeCount commentCount shareCount viewCount postDate createdAt updatedAt visibility isPublic hiddenFromUsers visibleToUsers",
    );
    const viewer = await User.findById(req.user.id).select("friends following");
    const viewerFriendIdSet = buildFriendIdSet(viewer);
    const viewerFollowingIdSet = buildFollowingIdSet(viewer);

    if (
      !post ||
      post.postType !== "video" ||
      !canViewerAccessPostAudience({
        post,
        viewerId: req.user.id,
        viewerFriendIdSet,
        viewerFollowingIdSet,
      })
    ) {
      return new ErrorHandler(404, "Video post not found").send(res);
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const existingIndex = (user.watchLaterPosts || []).findIndex(
      (savedPostId) => `${savedPostId}` === `${post._id}`,
    );
    const isSaved = existingIndex >= 0;

    if (isSaved) {
      user.watchLaterPosts.splice(existingIndex, 1);
    } else {
      user.watchLaterPosts.push(post._id);
    }

    await user.save();

    return new SuccessHandler(
      200,
      isSaved ? "Removed from watch later" : "Saved to watch later",
      {
        postId: `${post._id}`,
        savedToWatchLater: !isSaved,
      },
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Watch later could not be updated")
      .log("watch later toggle error", error)
      .send(res);
  }
};

const getWatchLaterVideos = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("watchLaterPosts");

    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const watchLaterIds = Array.isArray(user.watchLaterPosts)
      ? user.watchLaterPosts
      : [];
    const viewer = await User.findById(req.user.id).select("friends following");
    const viewerFriendIdSet = buildFriendIdSet(viewer);
    const viewerFollowingIdSet = buildFollowingIdSet(viewer);

    const posts = await Post.find({
      _id: { $in: watchLaterIds },
      postType: "video",
    })
      .populate(
        "user",
        "username avatar profession location bio talent status gender dob profileVisibility creator friends followers following createdAt updatedAt",
      )
      .sort({ createdAt: -1 });
    const likedPostIds = await getViewerLikedPostIdSet(
      req.user.id,
      posts.map((post) => post?._id),
    );

    const normalizedPosts = posts
      .filter((post) => post.user)
      .filter((post) =>
        canViewerAccessPostAudience({
          post,
          viewerId: req.user.id,
          viewerFriendIdSet,
          viewerFollowingIdSet,
        }),
      )
      .map((post) =>
        formatPostPayload(post, {
          viewerId: user._id,
          savedToWatchLater: true,
          likedByViewer: likedPostIds.has(`${post._id}`),
        }),
      );

    return new SuccessHandler(200, "Watch later videos loaded", normalizedPosts).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Watch later videos could not be loaded")
      .log("watch later load error", error)
      .send(res);
  }
};

const updateProfileDetails = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const {
      username,
      bio,
      location,
      profession,
      talent,
      externalLinks,
      status,
      gender,
      dob,
      profileVisibility,
    } = req.body;

    if (!username || !`${username}`.trim()) {
      return new ErrorHandler(400, "Username is required").send(res);
    }

    user.username = `${username}`.trim();
    user.bio = normalizeListInput(bio, /\r?\n/);
    user.location = normalizeListInput(location);
    user.profession = `${profession ?? ""}`.trim() || null;
    user.talent = normalizeListInput(talent, /\r?\n|,/);
    user.externalLinks = normalizeExternalLinksInput(externalLinks);
    user.status = `${status ?? ""}`.trim() || null;
    user.gender = `${gender ?? ""}`.trim() || null;
    user.dob = `${dob ?? ""}`.trim() || null;

    if (profileVisibility && typeof profileVisibility === "object") {
      const visibilityKeys = [
        "email",
        "profession",
        "bio",
        "location",
        "talent",
        "links",
        "status",
        "gender",
        "dob",
        "friendsCount",
        "followersCount",
        "followingCount",
      ];

      visibilityKeys.forEach((key) => {
        if (typeof profileVisibility[key] === "boolean") {
          user.profileVisibility[key] = profileVisibility[key];
        }
      });
    }

    await user.save();

    return new SuccessHandler(
      200,
      "Profile updated successfully",
      toPublicUser(user, { viewerId: user._id }),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Profile could not be updated")
      .log("profile update error", error)
      .send(res);
  }
};

const updateCreatorMode = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const { creator } = req.body;

    if (typeof creator !== "boolean") {
      return new ErrorHandler(400, "Creator mode must be true or false").send(
        res,
      );
    }

    user.creator = creator;
    await user.save();

    return new SuccessHandler(
      200,
      creator ? "Creator mode enabled" : "Creator mode disabled",
      toPublicUser(user, { viewerId: user._id }),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Creator mode could not be updated")
      .log("creator mode update error", error)
      .send(res);
  }
};

const getProfileView = async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user?.id || req.user?._id;

    if (!mongoose.isValidObjectId(userId)) {
      return new ErrorHandler(400, "Invalid profile id").send(res);
    }

    const user = await User.findById(userId);
    const viewer = viewerId
      ? await User.findById(viewerId).select(
          "friends following friendRequestsSent friendRequestsReceived",
        )
      : null;

    if (!user) {
      return new ErrorHandler(404, "Profile not found").send(res);
    }

    const {
      changed: storyCleanupChanged,
      expiredEntries,
      activeStoryExpired,
    } = pruneExpiredStoriesFromUser(user);

    if (storyCleanupChanged) {
      await user.save();

      await Promise.all(expiredEntries.map((entry) => destroyStoryHistoryEntryAssets(entry)));

      if (activeStoryExpired) {
        await clearStoryLikes(user._id);
      }
    }

    const publicUser = toPublicUser(user, { viewerId });

    if (viewer && `${viewer._id}` !== `${user._id}`) {
      Object.assign(publicUser, getRelationshipSnapshot(viewer, user));
    }

    return new SuccessHandler(
      200,
      "Profile loaded successfully",
      publicUser,
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Profile could not be loaded")
      .log("profile view error", error)
      .send(res);
  }
};

module.exports = {
  uploadAvatar,
  uploadBanner,
  uploadStory,
  deleteAvatar,
  deleteBanner,
  deleteStory,
  getStoryEligiblePosts,
  updateProfileDetails,
  updateCreatorMode,
  getProfileView,
  deleteStoryHistoryEntry,
  getOwnerVideoLibrary,
  createOwnerPost,
  getOwnerPosts,
  getProfilePosts,
  togglePostLike,
  getPostLikes,
  getOwnerPlaylists,
  updateVideoCategory,
  toggleWatchLater,
  getWatchLaterVideos,
  createPlaylist,
  updatePlaylist,
  getPublicProfilePlaylists,
};
