import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FaUserEdit } from "react-icons/fa";
import { RiImageCircleAiFill, RiImageEditLine } from "react-icons/ri";
import {
  MdClose,
  MdEditLocationAlt,
  MdLockOutline,
  MdMailOutline,
  MdOutlineAutoAwesome,
  MdOutlineCake,
  MdOutlineCalendarMonth,
  MdOutlineFavoriteBorder,
  MdOutlinePublic,
  MdOutlineWorkOutline,
  MdPlayArrow,
  MdOutlineWc,
} from "react-icons/md";
import { toast } from "react-toastify";
import styles from "./Profile.module.css";
import noBanner from "../../assets/noBanner.png";
import noProfile from "../../assets/noProfile.png";
import { AuthAccessPrompt } from "../../components/auth/AuthAccessPrompt";
import { EditProfileInfo } from "../../components/profile/EditProfileInfo";
import { ImageCropperModal } from "../../components/profile/ImageCropperModal";
import { ImageUpload } from "../../components/media/ImgUpload";
import { StoryRail } from "../../components/story/StoryRail";
import { usePageMetadata } from "../../hooks/usePageMetadata";
import { StoryViewerModal } from "../../components/story/StoryViewerModal";
import {
  updateCreatorMode,
  uploadBanner,
  uploadProfilePic,
  uploadStory,
} from "../../store/auth/authThunks";
import api from "../../lib/api";

const MAX_STORY_DURATION_SECONDS = 90;
const STORY_CLIP_SLIDER_STEP_SECONDS = 0.1;
const STORY_CLIP_STOP_TOLERANCE_SECONDS = 0.2;
const STORY_POSTS_CACHE_TTL_MS = 60 * 1000;
const storyPostsCache = new Map();
const VISITOR_PROFILE_CACHE_TTL_MS = 60 * 1000;
const visitorProfileCache = new Map();
const visitorProfilePostsCache = new Map();
const visitorProfilePlaylistsCache = new Map();

const getCachedStoryPostsEntry = (ownerId) =>
  ownerId ? storyPostsCache.get(`${ownerId}`) || null : null;

const isStoryPostsCacheStale = (entry) =>
  !entry || Date.now() - entry.updatedAt > STORY_POSTS_CACHE_TTL_MS;

const getCachedVisitorProfileEntry = (profileId) =>
  profileId ? visitorProfileCache.get(`${profileId}`) || null : null;

const getCachedVisitorProfilePostsEntry = (profileId) =>
  profileId ? visitorProfilePostsCache.get(`${profileId}`) || null : null;

const getCachedVisitorProfilePlaylistsEntry = (profileId) =>
  profileId ? visitorProfilePlaylistsCache.get(`${profileId}`) || null : null;

const isVisitorProfileCacheStale = (entry) =>
  !entry || Date.now() - entry.updatedAt > VISITOR_PROFILE_CACHE_TTL_MS;

const listify = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => `${item ?? ""}`.trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
};

const formatDisplayValue = (value) => {
  if (!value) return "";

  return `${value}`
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const profileLinkTypeLabels = {
  app: "App",
  facebook: "Facebook",
  github: "GitHub",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  other: "Link",
  telegram: "Telegram",
  twitter: "Twitter / X",
  website: "Website",
  whatsapp: "WhatsApp",
  x: "Twitter / X",
  youtube: "YouTube",
};

const formatProfileLinkType = (value) =>
  profileLinkTypeLabels[`${value ?? ""}`.trim().toLowerCase()] || "Link";

const formatStoryExpiry = (value) => {
  if (!value) return "";

  const expiryDate = new Date(value);

  if (Number.isNaN(expiryDate.getTime())) {
    return "";
  }

  return expiryDate.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getStoryTimeLeftLabel = (value) => {
  if (!value) return "";

  const remainingMs = new Date(value).getTime() - Date.now();

  if (remainingMs <= 0) {
    return "Ending soon";
  }

  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));

  if (remainingHours >= 24) {
    const days = Math.floor(remainingHours / 24);
    const hours = remainingHours % 24;

    if (!hours) {
      return `${days}d left`;
    }

    return `${days}d ${hours}h left`;
  }

  return `${remainingHours}h left`;
};

const getStorySortTime = (storyEntry) => {
  const candidateValue = storyEntry?.createdAt || storyEntry?.expiresAt || "";

  if (!candidateValue) {
    return 0;
  }

  const dateValue = new Date(candidateValue);

  return Number.isNaN(dateValue.getTime()) ? 0 : dateValue.getTime();
};

const shouldShowViewCount = (post) =>
  post?.postType === "video" || post?.contentFormat === "reel";

const hasFutureStoryExpiry = (value) => {
  if (!value) {
    return false;
  }

  const expiryDate = new Date(value);

  return !Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() > Date.now();
};

const getLocalMediaDuration = (file) =>
  new Promise((resolve, reject) => {
    const mediaElement = document.createElement(
      file?.type?.startsWith("audio/") ? "audio" : "video",
    );
    const objectUrl = URL.createObjectURL(file);

    mediaElement.preload = "metadata";
    mediaElement.onloadedmetadata = () => {
      const duration = Number(mediaElement.duration);
      URL.revokeObjectURL(objectUrl);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    mediaElement.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Media duration could not be read"));
    };
    mediaElement.src = objectUrl;
  });

const formatDurationLabel = (value) => {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const wholeSeconds = Math.floor(safeValue);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;

  return `${minutes}:${`${seconds}`.padStart(2, "0")}`;
};

const mergeConnectionState = (currentProfile, payload) => {
  if (!currentProfile) {
    return currentProfile;
  }

  return {
    ...currentProfile,
    relationshipStatus:
      payload?.relationshipStatus ?? currentProfile.relationshipStatus ?? "none",
    friendType: payload?.friendType ?? null,
    subscriberType: payload?.subscriberType ?? null,
    connectionType: payload?.connectionType ?? "none",
    canSubscribe: payload?.canSubscribe ?? Boolean(currentProfile.creator),
    friendsCount:
      typeof payload?.counts?.friendsCount === "number"
        ? payload.counts.friendsCount
        : currentProfile.friendsCount,
    followersCount:
      typeof payload?.counts?.followersCount === "number"
        ? payload.counts.followersCount
        : currentProfile.followersCount,
    followingCount:
      typeof payload?.counts?.followingCount === "number"
        ? payload.counts.followingCount
        : currentProfile.followingCount,
    fradosCount:
      typeof payload?.counts?.fradosCount === "number"
        ? payload.counts.fradosCount
        : currentProfile.fradosCount,
    safrosCount:
      typeof payload?.counts?.safrosCount === "number"
        ? payload.counts.safrosCount
        : currentProfile.safrosCount,
    sabosCount:
      typeof payload?.counts?.sabosCount === "number"
        ? payload.counts.sabosCount
        : currentProfile.sabosCount,
    saboingsCount:
      typeof payload?.counts?.saboingsCount === "number"
        ? payload.counts.saboingsCount
        : currentProfile.saboingsCount,
    safroingsCount:
      typeof payload?.counts?.safroingsCount === "number"
        ? payload.counts.safroingsCount
        : currentProfile.safroingsCount,
  };
};

const shouldTrimStoryVideoClip = ({ durationSeconds, startSeconds, endSeconds }) => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return false;
  }

  const cappedEnd = Math.min(durationSeconds, MAX_STORY_DURATION_SECONDS);

  if (durationSeconds > MAX_STORY_DURATION_SECONDS + 0.05) {
    return true;
  }

  return startSeconds > 0.05 || endSeconds < cappedEnd - 0.05;
};

const getSupportedRecorderMimeType = () => {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const supportedTypes = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  return supportedTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const waitForVideoSeek = (video, targetTime) =>
  new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - targetTime) < STORY_CLIP_SLIDER_STEP_SECONDS) {
      resolve();
      return;
    }

    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("The selected video could not be prepared."));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = targetTime;
  });

const buildTrimmedStoryVideoFile = async ({ file, startSeconds, endSeconds }) => {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("Story trimming is not available in this browser.");
  }

  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  const supportedMimeType = getSupportedRecorderMimeType();

  video.preload = "auto";
  video.playsInline = true;
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.controls = false;
  video.src = objectUrl;

  try {
    await new Promise((resolve, reject) => {
      const handleLoadedMetadata = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("The selected video could not be read."));
      };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("error", handleError);
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
      video.addEventListener("error", handleError, { once: true });
      video.load();
    });

    const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;
    const safeStart = Math.max(0, Math.min(startSeconds, durationSeconds));
    const safeEnd = Math.max(safeStart, Math.min(endSeconds, durationSeconds));
    const captureStream =
      typeof video.captureStream === "function"
        ? video.captureStream()
        : typeof video.mozCaptureStream === "function"
          ? video.mozCaptureStream()
          : null;

    if (!captureStream) {
      throw new Error("This browser cannot trim story videos yet.");
    }

    const recorder = supportedMimeType
      ? new MediaRecorder(captureStream, { mimeType: supportedMimeType })
      : new MediaRecorder(captureStream);

    await waitForVideoSeek(video, safeStart);

    return await new Promise((resolve, reject) => {
      const chunks = [];
      let hasStopped = false;

      const stopRecording = () => {
        if (hasStopped) {
          return;
        }

        hasStopped = true;

        if (!video.paused) {
          video.pause();
        }

        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      };

      const handleTimeUpdate = () => {
        if (video.currentTime >= safeEnd - STORY_CLIP_STOP_TOLERANCE_SECONDS) {
          stopRecording();
        }
      };
      const handleDataAvailable = (event) => {
        if (event.data?.size) {
          chunks.push(event.data);
        }
      };
      const handleRecorderStop = () => {
        cleanup();

        if (!chunks.length) {
          reject(new Error("No story clip was created. Please try another range."));
          return;
        }

        const extension = recorder.mimeType.includes("webm") ? "webm" : "mp4";
        const baseName = file.name.replace(/\.[^.]+$/, "");
        resolve(
          new File(chunks, `${baseName}-story-clip.${extension}`, {
            type: recorder.mimeType || supportedMimeType || file.type,
            lastModified: Date.now(),
          }),
        );
      };
      const handleRecorderError = () => {
        cleanup();
        reject(new Error("The selected story clip could not be recorded."));
      };
      const handlePlaybackError = () => {
        cleanup();
        reject(new Error("The selected story clip could not be played."));
      };
      const cleanup = () => {
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("ended", stopRecording);
        video.removeEventListener("error", handlePlaybackError);
        recorder.removeEventListener("dataavailable", handleDataAvailable);
        recorder.removeEventListener("stop", handleRecorderStop);
        recorder.removeEventListener("error", handleRecorderError);
      };

      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("ended", stopRecording);
      video.addEventListener("error", handlePlaybackError);
      recorder.addEventListener("dataavailable", handleDataAvailable);
      recorder.addEventListener("stop", handleRecorderStop);
      recorder.addEventListener("error", handleRecorderError);

      try {
        recorder.start(250);
        video.play().catch(() => {
          stopRecording();
          reject(new Error("Story clip preview permissions blocked trimming."));
        });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const Profile = () => {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, loading } = useSelector((state) => state.auth);
  const initialVisitorProfileEntry = userId ? getCachedVisitorProfileEntry(userId) : null;
  const initialVisitorPostsEntry = userId ? getCachedVisitorProfilePostsEntry(userId) : null;
  const initialVisitorPlaylistsEntry = userId
    ? getCachedVisitorProfilePlaylistsEntry(userId)
    : null;

  const [width, setWidth] = useState(window.innerWidth);
  const [uploadTarget, setUploadTarget] = useState(null);
  const [viewedUser, setViewedUser] = useState(() => initialVisitorProfileEntry?.profile || null);
  const [profileLoading, setProfileLoading] = useState(
    () => Boolean(userId) && !initialVisitorProfileEntry,
  );
  const [profileError, setProfileError] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [relationshipLoading, setRelationshipLoading] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [storyPosts, setStoryPosts] = useState([]);
  const [storyPostsLoading, setStoryPostsLoading] = useState(false);
  const [storyPostsError, setStoryPostsError] = useState("");
  const [uploadedPosts, setUploadedPosts] = useState(
    () => initialVisitorPostsEntry?.posts || [],
  );
  const [uploadedPostsLoading, setUploadedPostsLoading] = useState(
    () => Boolean(userId) && !initialVisitorPostsEntry,
  );
  const [uploadedPostsError, setUploadedPostsError] = useState("");
  const [pendingStoryMediaFile, setPendingStoryMediaFile] = useState(null);
  const [pendingStoryAudioFile, setPendingStoryAudioFile] = useState(null);
  const [selectedStoryPost, setSelectedStoryPost] = useState(null);
  const [pendingStoryMediaPreview, setPendingStoryMediaPreview] = useState("");
  const [pendingStoryAudioPreview, setPendingStoryAudioPreview] = useState("");
  const [pendingStoryVideoDurationSeconds, setPendingStoryVideoDurationSeconds] = useState(0);
  const [pendingStoryAudioDurationSeconds, setPendingStoryAudioDurationSeconds] = useState(0);
  const [storyClipStartSeconds, setStoryClipStartSeconds] = useState(0);
  const [storyClipEndSeconds, setStoryClipEndSeconds] = useState(0);
  const [storyClipPreviewing, setStoryClipPreviewing] = useState(false);
  const [storyClipExportLoading, setStoryClipExportLoading] = useState(false);
  const [storyAudioClipStartSeconds, setStoryAudioClipStartSeconds] = useState(0);
  const [storyAudioClipEndSeconds, setStoryAudioClipEndSeconds] = useState(0);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerInitialIndex, setStoryViewerInitialIndex] = useState(0);
  const [storyViewerStories, setStoryViewerStories] = useState([]);
  const [storyViewerLoading, setStoryViewerLoading] = useState(false);
  const [autoOpenedStoryKey, setAutoOpenedStoryKey] = useState("");
  const [playlists, setPlaylists] = useState(
    () => initialVisitorPlaylistsEntry?.playlists || [],
  );
  const [playlistsLoading, setPlaylistsLoading] = useState(
    () => Boolean(userId) && !initialVisitorPlaylistsEntry,
  );
  const [playlistsError, setPlaylistsError] = useState("");
  const [playlistRefreshNonce, setPlaylistRefreshNonce] = useState(0);
  const [selectedContentView, setSelectedContentView] = useState("all");
  const [selectedPhotoView, setSelectedPhotoView] = useState("all");
  const [selectedVideoView, setSelectedVideoView] = useState("all");
  const [hasChosenContentView, setHasChosenContentView] = useState(false);
  const [hasChosenPhotoView, setHasChosenPhotoView] = useState(false);
  const [hasChosenVideoView, setHasChosenVideoView] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [activeInlineVideoPost, setActiveInlineVideoPost] = useState(null);
  const [playlistPickerPost, setPlaylistPickerPost] = useState(null);
  const [playlistPickerIds, setPlaylistPickerIds] = useState([]);
  const [playlistPickerSaving, setPlaylistPickerSaving] = useState(false);
  const [playlistVisibilitySavingId, setPlaylistVisibilitySavingId] = useState("");
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [likesViewerPost, setLikesViewerPost] = useState(null);
  const [likesViewerLoading, setLikesViewerLoading] = useState(false);
  const [likesViewerItems, setLikesViewerItems] = useState([]);
  const [likesViewerError, setLikesViewerError] = useState("");
  const [imageCropState, setImageCropState] = useState({
    file: null,
    open: false,
    variant: "avatar",
  });
  const pendingStoryAudioRef = useRef(null);
  const pendingStoryVideoRef = useRef(null);

  const isOwner = !userId || (user?._id && `${userId}` === `${user._id}`);
  const profileContentKey = isOwner ? user?._id || "owner" : userId || "guest";
  const metadataProfile = isOwner ? user : viewedUser;
  const profileUser = isOwner ? user : viewedUser;
  const activeStory = profileUser?.story || "";
  const activeStoryType = profileUser?.storyType || "image";
  const activeStoryAudio = profileUser?.storyAudio || "";
  const storyExpiresAt = profileUser?.storyExpiresAt || "";
  const hasActiveStory = Boolean(activeStory && hasFutureStoryExpiry(storyExpiresAt));
  const ownerStoryHistory =
    isOwner && Array.isArray(profileUser?.storyHistory)
      ? profileUser.storyHistory.filter(
          (item) => item?.mediaUrl && hasFutureStoryExpiry(item?.expiresAt),
        )
      : [];
  const activeOwnerStoryEntry =
    ownerStoryHistory.find((item) => item?.isActive) ||
    ownerStoryHistory.find(
      (item) =>
        item?.isLive &&
        item?.mediaUrl === activeStory &&
        (item?.audioUrl || "") === activeStoryAudio,
    ) ||
    null;
  const ownerStoryCards = isOwner
    ? [
        ...(hasActiveStory && !activeOwnerStoryEntry
          ? [
              {
                _id: "live",
                mediaUrl: activeStory,
                mediaType: activeStoryType,
                audioUrl: activeStoryAudio || null,
                likeCount:
                  typeof profileUser?.storyLikeCount === "number"
                    ? profileUser.storyLikeCount
                    : 0,
                createdAt: null,
                expiresAt: storyExpiresAt,
                isLive: true,
                isActive: true,
              },
            ]
          : []),
        ...ownerStoryHistory,
      ]
        .filter((item) => item?.mediaUrl)
        .sort((left, right) => {
          if (left?.isActive && !right?.isActive) {
            return -1;
          }

          if (!left?.isActive && right?.isActive) {
            return 1;
          }

          return getStorySortTime(right) - getStorySortTime(left);
        })
    : [];
  const ownerStoryViewerStories = isOwner
    ? ownerStoryCards.map((item) => ({
        user: {
          _id: profileUser?._id || "",
          username: profileUser?.username || "",
          avatar: profileUser?.avatar || "",
          profession: profileUser?.profession || "",
        },
        story: {
          storyEntryId: item?._id ? `${item._id}` : "",
          mediaUrl: item?.mediaUrl || "",
          mediaType: item?.mediaType || "image",
          audioUrl: item?.audioUrl || null,
          likeCount: typeof item?.likeCount === "number" ? item.likeCount : 0,
          likedByViewer: false,
          expiresAt: item?.expiresAt || null,
        },
      }))
    : [];
  const ownerStoryRailItems = ownerStoryCards.map((item, index) => {
    const createdLabel = item?.createdAt ? formatStoryExpiry(item.createdAt) : "";
    const timeLeftLabel = item?.expiresAt ? getStoryTimeLeftLabel(item.expiresAt) : "";

    return {
      id: `${item?._id || "story"}`,
      mediaUrl: item?.mediaUrl || "",
      mediaType: item?.mediaType || "image",
      title: item?.isActive ? "Current story" : `Story ${index + 1}`,
      subtitle: item?.isActive
        ? timeLeftLabel || "live now"
        : createdLabel
          ? `shared ${createdLabel}`
          : "tap to view",
      badge: item?.mediaType === "video" ? "video" : "photo",
      accent: item?.isActive ? "current" : "live",
    };
  });
  const visitorStoryRailItems =
    !isOwner && hasActiveStory
      ? [
          {
            id: `${profileUser?._id || "profile"}-story`,
            mediaUrl: activeStory,
            mediaType: activeStoryType,
            title: profileUser?.username || "Member story",
            subtitle: storyExpiresAt ? getStoryTimeLeftLabel(storyExpiresAt) : "live now",
            badge: activeStoryType === "video" ? "video" : "photo",
            accent: "current",
          },
        ]
      : [];

  usePageMetadata({
    title: metadataProfile?.username
      ? `${formatDisplayValue(metadataProfile.username)} profile`
      : "Public profile",
    description:
      listify(metadataProfile?.bio)[0] ||
      formatDisplayValue(metadataProfile?.profession) ||
      "Browse public member profiles on globMe before creating an account.",
    robots: isOwner ? "noindex, nofollow" : "index, follow",
  });

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!loading) {
      setUploadTarget(null);
    }
  }, [loading]);

  useEffect(() => {
    if (!pendingStoryMediaFile) {
      setPendingStoryMediaPreview("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(pendingStoryMediaFile);
    setPendingStoryMediaPreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [pendingStoryMediaFile]);

  useEffect(() => {
    if (!pendingStoryAudioFile) {
      setPendingStoryAudioPreview("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(pendingStoryAudioFile);
    setPendingStoryAudioPreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [pendingStoryAudioFile]);

  useEffect(() => {
    if (!pendingStoryAudioFile) {
      setPendingStoryAudioDurationSeconds(0);
      setStoryAudioClipStartSeconds(0);
      setStoryAudioClipEndSeconds(0);
      return undefined;
    }

    let ignore = false;

    const loadStoryAudioDuration = async () => {
      try {
        const duration = await getLocalMediaDuration(pendingStoryAudioFile);

        if (!ignore) {
          setPendingStoryAudioDurationSeconds(duration);
          setStoryAudioClipStartSeconds(0);
          setStoryAudioClipEndSeconds(Math.min(duration, MAX_STORY_DURATION_SECONDS));
        }
      } catch {
        if (!ignore) {
          setPendingStoryAudioDurationSeconds(0);
          setStoryAudioClipStartSeconds(0);
          setStoryAudioClipEndSeconds(0);
          toast.error("We could not read that soundtrack length");
        }
      }
    };

    loadStoryAudioDuration();

    return () => {
      ignore = true;
    };
  }, [pendingStoryAudioFile]);

  useEffect(() => {
    if (!pendingStoryAudioPreview || !pendingStoryAudioRef.current) {
      return undefined;
    }

    const audioElement = pendingStoryAudioRef.current;
    const clipStart = Math.max(0, storyAudioClipStartSeconds);
    const clipEnd = Math.max(
      clipStart,
      storyAudioClipEndSeconds || pendingStoryAudioDurationSeconds || clipStart,
    );

    const seekToStart = () => {
      try {
        audioElement.currentTime = clipStart;
      } catch {
        return;
      }
    };

    const handleLoadedMetadata = () => {
      seekToStart();
      const playPromise = audioElement.play();

      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    };

    const handleTimeUpdate = () => {
      if (audioElement.currentTime >= clipEnd - STORY_CLIP_STOP_TOLERANCE_SECONDS) {
        seekToStart();
        const playPromise = audioElement.play();

        if (playPromise?.catch) {
          playPromise.catch(() => {});
        }
      }
    };

    audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    audioElement.addEventListener("timeupdate", handleTimeUpdate);

    if (audioElement.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audioElement.removeEventListener("timeupdate", handleTimeUpdate);
      audioElement.pause();
      audioElement.currentTime = 0;
    };
  }, [
    pendingStoryAudioDurationSeconds,
    pendingStoryAudioPreview,
    storyAudioClipEndSeconds,
    storyAudioClipStartSeconds,
  ]);

  useEffect(() => {
    if (
      !pendingStoryMediaFile ||
      !pendingStoryMediaFile.type?.startsWith("video/")
    ) {
      setPendingStoryVideoDurationSeconds(0);
      setStoryClipStartSeconds(0);
      setStoryClipEndSeconds(0);
      setStoryClipPreviewing(false);
      setStoryClipExportLoading(false);
      return undefined;
    }

    let ignore = false;

    const loadStoryVideoDuration = async () => {
      try {
        const duration = await getLocalMediaDuration(pendingStoryMediaFile);

        if (!ignore) {
          setPendingStoryVideoDurationSeconds(duration);
          setStoryClipStartSeconds(0);
          setStoryClipEndSeconds(Math.min(duration, MAX_STORY_DURATION_SECONDS));
        }
      } catch {
        if (!ignore) {
          setPendingStoryVideoDurationSeconds(0);
          setStoryClipStartSeconds(0);
          setStoryClipEndSeconds(0);
          toast.error("We could not read that video length");
        }
      }
    };

    loadStoryVideoDuration();

    return () => {
      ignore = true;
    };
  }, [pendingStoryMediaFile]);

  useEffect(() => {
    if (!storyClipPreviewing) {
      return undefined;
    }

    const videoElement = pendingStoryVideoRef.current;

    if (!videoElement) {
      return undefined;
    }

    const handleTimeUpdate = () => {
      if (videoElement.currentTime >= storyClipEndSeconds - STORY_CLIP_STOP_TOLERANCE_SECONDS) {
        videoElement.pause();
        setStoryClipPreviewing(false);
      }
    };
    const handlePause = () => {
      setStoryClipPreviewing(false);
    };

    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("pause", handlePause);

    return () => {
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("pause", handlePause);
    };
  }, [storyClipEndSeconds, storyClipPreviewing]);

  useEffect(() => {
    if (!storyComposerOpen) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !(loading && uploadTarget === "story")) {
        setStoryComposerOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [loading, storyComposerOpen, uploadTarget]);

  useEffect(() => {
    if (width > 640 && showInfo) {
      setShowInfo(false);
    }
  }, [showInfo, width]);

  useEffect(() => {
    if (!activeInlineVideoPost) {
      return undefined;
    }

    api.post(`/public/posts/${activeInlineVideoPost._id}/view`)
      .then((response) => {
        const nextViewCount = Number(response.data?.data?.viewCount ?? 0);

        setUploadedPosts((prev) =>
          prev.map((post) =>
            post._id === activeInlineVideoPost._id
              ? {
                  ...post,
                  viewCount: nextViewCount,
                }
              : post,
          ),
        );
        setPlaylists((prev) =>
          prev.map((playlist) => ({
            ...playlist,
            videos: Array.isArray(playlist.videos)
              ? playlist.videos.map((post) =>
                  post._id === activeInlineVideoPost._id
                    ? {
                        ...post,
                        viewCount: nextViewCount,
                      }
                    : post,
                )
              : playlist.videos,
          })),
        );
        setActiveInlineVideoPost((prev) =>
          prev && prev._id === activeInlineVideoPost._id
            ? {
                ...prev,
                viewCount: nextViewCount,
              }
            : prev,
        );
      })
      .catch(() => {});

    const previousBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setActiveInlineVideoPost(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeInlineVideoPost]);

  useEffect(() => {
    setActiveInlineVideoPost(null);
  }, [profileContentKey]);

  useEffect(() => {
    if (!playlistPickerPost) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !playlistPickerSaving) {
        setPlaylistPickerPost(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [playlistPickerPost, playlistPickerSaving]);

  useEffect(() => {
    if (!likesViewerPost) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setLikesViewerPost(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [likesViewerPost]);

  useEffect(() => {
    setPlaylistPickerPost(null);
    setPlaylistPickerIds([]);
    setPlaylistPickerSaving(false);
    setPlaylistVisibilitySavingId("");
    setNewPlaylistTitle("");
    setNewPlaylistDescription("");
    setLikesViewerPost(null);
    setLikesViewerItems([]);
    setLikesViewerError("");
  }, [profileContentKey]);

  useEffect(() => {
    if (!storyComposerOpen || !isOwner || !user?._id) {
      return undefined;
    }

    let ignore = false;
    const cacheKey = `${user._id}`;
    const cachedEntry = getCachedStoryPostsEntry(cacheKey);

    if (cachedEntry) {
      setStoryPosts(Array.isArray(cachedEntry.posts) ? cachedEntry.posts : []);
      setStoryPostsError("");
      setStoryPostsLoading(false);
    }

    if (cachedEntry && !isStoryPostsCacheStale(cachedEntry)) {
      return () => {
        ignore = true;
      };
    }

    const loadStoryPosts = async () => {
      try {
        if (!cachedEntry) {
          setStoryPostsLoading(true);
          setStoryPostsError("");
        }
        const response = await api.get("/user/story-posts");
        const nextPosts = Array.isArray(response.data?.data) ? response.data.data : [];

        if (!ignore) {
          storyPostsCache.set(cacheKey, {
            posts: nextPosts,
            updatedAt: Date.now(),
          });
          setStoryPosts(nextPosts);
          setStoryPostsError("");
        }
      } catch (error) {
        if (!ignore) {
          if (!cachedEntry) {
            setStoryPosts([]);
            setStoryPostsError(
              error.response?.data?.message || "Could not load your uploaded posts.",
            );
          }
        }
      } finally {
        if (!ignore) {
          if (!cachedEntry) {
            setStoryPostsLoading(false);
          }
        }
      }
    };

    loadStoryPosts();

    return () => {
      ignore = true;
    };
  }, [storyComposerOpen, isOwner, user]);

  useEffect(() => {
    if (isOwner && !user) {
      setViewedUser(null);
      return;
    }

    if (isOwner) {
      setViewedUser(null);
      setProfileError("");
      setProfileLoading(false);
      return;
    }

    let ignore = false;
    const cachedEntry = getCachedVisitorProfileEntry(userId);

    if (cachedEntry?.profile) {
      setViewedUser(cachedEntry.profile);
      setProfileError("");
      setProfileLoading(false);
    } else {
      setViewedUser(null);
      setProfileLoading(true);
    }

    if (cachedEntry && !isVisitorProfileCacheStale(cachedEntry)) {
      return () => {
        ignore = true;
      };
    }

    const loadViewedProfile = async () => {
      try {
        if (!cachedEntry) {
          setProfileLoading(true);
          setProfileError("");
        }
        const response = await api.get(`/user/profile/${userId}`);
        const nextProfile = response.data?.data || null;

        if (!ignore) {
          visitorProfileCache.set(`${userId}`, {
            profile: nextProfile,
            updatedAt: Date.now(),
          });
          setViewedUser(nextProfile);
          setProfileError("");
        }
      } catch (error) {
        if (!ignore) {
          if (!cachedEntry) {
            setViewedUser(null);
            setProfileError(
              error.response?.data?.message || "That profile could not be loaded.",
            );
          }
        }
      } finally {
        if (!ignore) {
          if (!cachedEntry) {
            setProfileLoading(false);
          }
        }
      }
    };

    loadViewedProfile();

    return () => {
      ignore = true;
    };
  }, [isOwner, user, userId]);

  useEffect(() => {
    const profileId = isOwner ? user?._id : userId;

    if (!profileId) {
      setPlaylists([]);
      setPlaylistsError("");
      setPlaylistsLoading(false);
      return undefined;
    }

    let ignore = false;
    const cachedEntry = !isOwner
      ? getCachedVisitorProfilePlaylistsEntry(profileId)
      : null;

    if (!isOwner && cachedEntry) {
      setPlaylists(Array.isArray(cachedEntry.playlists) ? cachedEntry.playlists : []);
      setPlaylistsError("");
      setPlaylistsLoading(false);
    } else if (!isOwner) {
      setPlaylists([]);
      setPlaylistsLoading(true);
    }

    if (!isOwner && cachedEntry && !isVisitorProfileCacheStale(cachedEntry)) {
      return () => {
        ignore = true;
      };
    }

    const loadPlaylists = async () => {
      try {
        if (isOwner || !cachedEntry) {
          setPlaylistsLoading(true);
          setPlaylistsError("");
        }
        const response = isOwner
          ? await api.get("/user/playlists")
          : await api.get(`/user/profile/${profileId}/playlists`);
        const nextPlaylists = Array.isArray(response.data?.data) ? response.data.data : [];

        if (!ignore) {
          if (!isOwner) {
            visitorProfilePlaylistsCache.set(`${profileId}`, {
              playlists: nextPlaylists,
              updatedAt: Date.now(),
            });
          }
          setPlaylists(nextPlaylists);
        }
      } catch (error) {
        if (!ignore) {
          if (isOwner || !cachedEntry) {
            setPlaylists([]);
            setPlaylistsError(
              error.response?.data?.message || "Playlists could not be loaded.",
            );
          }
        }
      } finally {
        if (!ignore) {
          if (isOwner || !cachedEntry) {
            setPlaylistsLoading(false);
          }
        }
      }
    };

    loadPlaylists();

    return () => {
      ignore = true;
    };
  }, [isOwner, playlistRefreshNonce, user?._id, userId]);

  useEffect(() => {
    const profileId = isOwner ? user?._id : userId;

    if (!profileId) {
      setUploadedPosts([]);
      setUploadedPostsError("");
      setUploadedPostsLoading(false);
      return undefined;
    }

    let ignore = false;
    const cachedEntry = !isOwner ? getCachedVisitorProfilePostsEntry(profileId) : null;

    if (!isOwner && cachedEntry) {
      setUploadedPosts(Array.isArray(cachedEntry.posts) ? cachedEntry.posts : []);
      setUploadedPostsError("");
      setUploadedPostsLoading(false);
    } else if (!isOwner) {
      setUploadedPosts([]);
      setUploadedPostsLoading(true);
    }

    if (!isOwner && cachedEntry && !isVisitorProfileCacheStale(cachedEntry)) {
      return () => {
        ignore = true;
      };
    }

    const loadUploadedPosts = async () => {
      try {
        if (isOwner || !cachedEntry) {
          setUploadedPostsLoading(true);
          setUploadedPostsError("");
        }
        const response = isOwner
          ? await api.get("/user/posts")
          : await api.get(`/user/profile/${profileId}/posts`);
        const nextPosts = Array.isArray(response.data?.data) ? response.data.data : [];

        if (!ignore) {
          if (!isOwner) {
            visitorProfilePostsCache.set(`${profileId}`, {
              posts: nextPosts,
              updatedAt: Date.now(),
            });
          }
          setUploadedPosts(nextPosts);
        }
      } catch (error) {
        if (!ignore) {
          if (isOwner || !cachedEntry) {
            setUploadedPosts([]);
            setUploadedPostsError(
              error.response?.data?.message || "Your uploaded posts could not be loaded.",
            );
          }
        }
      } finally {
        if (!ignore) {
          if (isOwner || !cachedEntry) {
            setUploadedPostsLoading(false);
          }
        }
      }
    };

    loadUploadedPosts();

    return () => {
      ignore = true;
    };
  }, [isOwner, user?._id, userId]);

  useEffect(() => {
    setSelectedContentView("all");
    setSelectedPhotoView("all");
    setSelectedVideoView("all");
    setHasChosenContentView(false);
    setHasChosenPhotoView(false);
    setHasChosenVideoView(false);
  }, [profileContentKey]);

  useEffect(() => {
    const hasUploadedPosts = uploadedPosts.length > 0;
    const hasPhotos = uploadedPosts.some((post) => post.postType === "image");
    const hasShortVideos = uploadedPosts.some(
      (post) => post.postType === "video" && post.contentFormat !== "long",
    );
    const hasLongVideos = uploadedPosts.some(
      (post) => post.postType === "video" && post.contentFormat === "long",
    );
    const hasPlaylists = playlists.length > 0;
    const availableViews = [
      hasUploadedPosts ? "all" : "",
      hasPhotos ? "photos" : "",
      hasShortVideos || hasLongVideos ? "videos" : "",
      hasPlaylists ? "playlists" : "",
    ].filter(Boolean);

    if (!availableViews.length) {
      return;
    }

    if (!hasChosenContentView && !availableViews.includes(selectedContentView)) {
      setSelectedContentView(availableViews[0]);
    }
  }, [hasChosenContentView, playlists, selectedContentView, uploadedPosts]);

  useEffect(() => {
    const hasRawPhotos = uploadedPosts.some(
      (post) => post.postType === "image" && post.contentFormat !== "reel",
    );
    const hasReelsPhotos = uploadedPosts.some(
      (post) => post.postType === "image" && post.contentFormat === "reel",
    );
    const availablePhotoViews = [
      hasRawPhotos || hasReelsPhotos ? "all" : "",
      hasRawPhotos ? "raw" : "",
      hasReelsPhotos ? "reels" : "",
    ].filter(Boolean);

    if (!availablePhotoViews.length) {
      return;
    }

    if (!hasChosenPhotoView && !availablePhotoViews.includes(selectedPhotoView)) {
      setSelectedPhotoView(availablePhotoViews[0]);
    }
  }, [hasChosenPhotoView, selectedPhotoView, uploadedPosts]);

  useEffect(() => {
    const hasShortVideos = uploadedPosts.some(
      (post) => post.postType === "video" && post.contentFormat !== "long",
    );
    const hasLongVideos = uploadedPosts.some(
      (post) => post.postType === "video" && post.contentFormat === "long",
    );
    const availableVideoViews = [
      hasShortVideos || hasLongVideos ? "all" : "",
      hasShortVideos ? "shorts" : "",
      hasLongVideos ? "longs" : "",
    ].filter(Boolean);

    if (!availableVideoViews.length) {
      return;
    }

    if (!hasChosenVideoView && !availableVideoViews.includes(selectedVideoView)) {
      setSelectedVideoView(availableVideoViews[0]);
    }
  }, [hasChosenVideoView, selectedVideoView, uploadedPosts]);

  useEffect(() => {
    if (!playlists.length) {
      setSelectedPlaylistId("");
      return;
    }

    if (!playlists.some((playlist) => playlist._id === selectedPlaylistId)) {
      setSelectedPlaylistId(playlists[0]._id);
    }
  }, [playlists, selectedPlaylistId]);

  const handleAvatarSelect = (file) => {
    if (!file?.type?.startsWith("image/")) {
      toast.error("Choose an image for your profile photo");
      return;
    }

    setImageCropState({
      file,
      open: true,
      variant: "avatar",
    });
  };

  const handleBannerSelect = (file) => {
    if (!file?.type?.startsWith("image/")) {
      toast.error("Choose an image for your banner");
      return;
    }

    setImageCropState({
      file,
      open: true,
      variant: "banner",
    });
  };

  const handleCloseImageCropper = () => {
    if (loading) {
      return;
    }

    setImageCropState({
      file: null,
      open: false,
      variant: "avatar",
    });
  };

  const handleConfirmImageCrop = (croppedFile) => {
    const nextVariant = imageCropState.variant;

    setImageCropState({
      file: null,
      open: false,
      variant: "avatar",
    });
    setUploadTarget(nextVariant);

    if (nextVariant === "banner") {
      dispatch(uploadBanner(croppedFile));
      return;
    }

    dispatch(uploadProfilePic(croppedFile));
  };

  const handleStoryMediaSelect = async (file) => {
    if (file?.type?.startsWith("video/")) {
      try {
        const duration = await getLocalMediaDuration(file);

        if (duration > MAX_STORY_DURATION_SECONDS) {
          toast.info("Long story videos will be trimmed to 1 minute 30 seconds");
        }
      } catch {
        toast.error("We could not read that video length");
        return;
      }
    }

    setSelectedStoryPost(null);
    setPendingStoryMediaFile(file);
  };

  const handleStoryAudioSelect = async (file) => {
    try {
      const duration = await getLocalMediaDuration(file);

      if (duration > MAX_STORY_DURATION_SECONDS) {
        toast.info("Long soundtrack files can be shifted left or right inside a 1 minute 30 second window");
      }
    } catch {
      toast.error("We could not read that soundtrack length");
      return;
    }

    setPendingStoryAudioFile(file);
  };

  const resetStoryComposer = () => {
    setPendingStoryMediaFile(null);
    setPendingStoryAudioFile(null);
    setSelectedStoryPost(null);
    setPendingStoryVideoDurationSeconds(0);
    setPendingStoryAudioDurationSeconds(0);
    setStoryClipStartSeconds(0);
    setStoryClipEndSeconds(0);
    setStoryClipPreviewing(false);
    setStoryClipExportLoading(false);
    setStoryAudioClipStartSeconds(0);
    setStoryAudioClipEndSeconds(0);
  };

  const handleStoryClipStartChange = (event) => {
    const nextStart = Number(event.target.value);
    const nextEnd = Math.min(
      pendingStoryVideoDurationSeconds,
      nextStart + MAX_STORY_DURATION_SECONDS,
    );

    setStoryClipStartSeconds(nextStart);
    setStoryClipEndSeconds(nextEnd);
    setStoryClipPreviewing(false);
  };

  const handleStoryAudioClipStartChange = (event) => {
    const nextStart = Number(event.target.value);
    const nextEnd = Math.min(
      pendingStoryAudioDurationSeconds,
      nextStart + MAX_STORY_DURATION_SECONDS,
    );

    setStoryAudioClipStartSeconds(nextStart);
    setStoryAudioClipEndSeconds(nextEnd);
  };

  const updateStoryClipWindowFromClientX = (clientX, bounds) => {
    if (!bounds || bounds.width <= 0 || pendingStoryVideoDurationSeconds <= 0) {
      return;
    }

    const maxStart = Math.max(
      0,
      pendingStoryVideoDurationSeconds - MAX_STORY_DURATION_SECONDS,
    );
    const relativeRatio = Math.min(
      1,
      Math.max(0, (clientX - bounds.left) / bounds.width),
    );
    const nextStart = Math.min(maxStart, Math.max(0, relativeRatio * maxStart));
    const nextEnd = Math.min(
      pendingStoryVideoDurationSeconds,
      nextStart + MAX_STORY_DURATION_SECONDS,
    );

    setStoryClipStartSeconds(nextStart);
    setStoryClipEndSeconds(nextEnd);
    setStoryClipPreviewing(false);
  };

  const updateStoryAudioClipWindowFromClientX = (clientX, bounds) => {
    if (!bounds || bounds.width <= 0 || pendingStoryAudioDurationSeconds <= 0) {
      return;
    }

    const relativeX = Math.min(Math.max(clientX - bounds.left, 0), bounds.width);
    const relativeRatio = relativeX / bounds.width;
    const nextStart = Math.max(
      0,
      Math.min(
        pendingStoryAudioDurationSeconds - MAX_STORY_DURATION_SECONDS,
        relativeRatio * pendingStoryAudioDurationSeconds,
      ),
    );
    const nextEnd = Math.min(
      pendingStoryAudioDurationSeconds,
      nextStart + MAX_STORY_DURATION_SECONDS,
    );

    setStoryAudioClipStartSeconds(nextStart);
    setStoryAudioClipEndSeconds(nextEnd);
  };

  const handleStoryClipWindowPointerDown = (event) => {
    if (!hasAdjustableStoryClipWindow) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    updateStoryClipWindowFromClientX(event.clientX, bounds);

    const handlePointerMove = (moveEvent) => {
      updateStoryClipWindowFromClientX(moveEvent.clientX, bounds);
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleStoryAudioClipWindowPointerDown = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();

    updateStoryAudioClipWindowFromClientX(event.clientX, bounds);

    const handlePointerMove = (moveEvent) => {
      updateStoryAudioClipWindowFromClientX(moveEvent.clientX, bounds);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handlePreviewStoryClip = async () => {
    const videoElement = pendingStoryVideoRef.current;

    if (!videoElement) {
      return;
    }

    try {
      videoElement.currentTime = storyClipStartSeconds;
      setStoryClipPreviewing(true);
      await videoElement.play();
    } catch {
      setStoryClipPreviewing(false);
      toast.error("Story clip preview could not start");
    }
  };

  const handleUseDefaultStoryClip = () => {
    setStoryClipStartSeconds(0);
    setStoryClipEndSeconds(
      Math.min(pendingStoryVideoDurationSeconds, MAX_STORY_DURATION_SECONDS),
    );
    setStoryClipPreviewing(false);
  };

  const handleUseDefaultStoryAudioClip = () => {
    setStoryAudioClipStartSeconds(0);
    setStoryAudioClipEndSeconds(
      Math.min(pendingStoryAudioDurationSeconds, MAX_STORY_DURATION_SECONDS),
    );
  };

  const handlePublishStory = async () => {
    if (!pendingStoryMediaFile && !selectedStoryPost?._id) {
      toast.error("Choose a photo, video, or one of your posts first");
      return;
    }

    if (selectedStoryPostTooLong) {
      toast.error("Uploaded video posts longer than 1 minute 30 seconds cannot be used directly as stories yet");
      return;
    }

    let mediaFileForUpload = pendingStoryMediaFile;

    if (
      pendingStoryMediaFile?.type?.startsWith("video/") &&
      pendingStoryVideoDurationSeconds > 0 &&
      shouldTrimStoryVideoClip({
        durationSeconds: pendingStoryVideoDurationSeconds,
        startSeconds: storyClipStartSeconds,
        endSeconds: storyClipEndSeconds,
      })
    ) {
      try {
        setStoryClipExportLoading(true);
        mediaFileForUpload = await buildTrimmedStoryVideoFile({
          file: pendingStoryMediaFile,
          startSeconds: storyClipStartSeconds,
          endSeconds: storyClipEndSeconds,
        });
      } catch (error) {
        setStoryClipExportLoading(false);
        toast.error(error.message || "Story video could not be prepared");
        return;
      }
    }

    setUploadTarget("story");
    const resultAction = await dispatch(
      uploadStory({
        mediaFile: mediaFileForUpload,
        audioFile: pendingStoryAudioFile,
        sourcePostId: selectedStoryPost?._id || "",
        audioStartSeconds: pendingStoryAudioFile ? storyAudioClipStartSeconds : 0,
        audioEndSeconds: pendingStoryAudioFile ? storyAudioClipEndSeconds : 0,
        audioPlaybackDurationSeconds: pendingStoryAudioFile
          ? MAX_STORY_DURATION_SECONDS
          : 0,
      }),
    );

    if (uploadStory.rejected.match(resultAction)) {
      setStoryClipExportLoading(false);
      toast.error(resultAction.payload?.message || "Story could not be uploaded");
      return;
    }

    setStoryClipExportLoading(false);
    toast.success(resultAction.payload?.message || "Story uploaded successfully");
    resetStoryComposer();
    setStoryComposerOpen(false);
  };

  const handleOpenProfileStory = async () => {
    if (!profileUser?._id || !hasActiveStory) {
      return;
    }

    try {
      setStoryViewerLoading(true);
      const response = await api.get(`/public/stories/${profileUser._id}`);
      setStoryViewerInitialIndex(0);
      setStoryViewerStories([response.data?.data].filter(Boolean));
      setStoryViewerOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.message || "Story could not be opened");
    } finally {
      setStoryViewerLoading(false);
    }
  };

  const handleOpenOwnerStoryDetail = (storyEntryId) => {
    if (!ownerStoryViewerStories.length) {
      return;
    }

    const nextIndex = ownerStoryViewerStories.findIndex(
      (item) => `${item?.story?.storyEntryId || ""}` === `${storyEntryId || ""}`,
    );

    setStoryViewerStories(ownerStoryViewerStories);
    setStoryViewerInitialIndex(nextIndex >= 0 ? nextIndex : 0);
    setStoryViewerOpen(true);
  };

  useEffect(() => {
    const shouldAutoOpenStory =
      searchParams.get("story") === "1" || searchParams.get("story") === "true";
    const storyKey = profileUser?._id && storyExpiresAt
      ? `${profileUser._id}:${storyExpiresAt}`
      : "";

    if (
      !shouldAutoOpenStory ||
      !storyKey ||
      !hasActiveStory ||
      storyViewerOpen ||
      storyViewerLoading ||
      autoOpenedStoryKey === storyKey
    ) {
      return;
    }

    setAutoOpenedStoryKey(storyKey);

    const openStoryFromLink = async () => {
      try {
        setStoryViewerLoading(true);
        const response = await api.get(`/public/stories/${profileUser._id}`);
        setStoryViewerInitialIndex(0);
        setStoryViewerStories([response.data?.data].filter(Boolean));
        setStoryViewerOpen(true);
      } catch (error) {
        toast.error(error.response?.data?.message || "Story could not be opened");
      } finally {
        setStoryViewerLoading(false);
      }
    };

    openStoryFromLink();
  }, [
    autoOpenedStoryKey,
    hasActiveStory,
    profileUser?._id,
    searchParams,
    storyExpiresAt,
    storyViewerLoading,
    storyViewerOpen,
  ]);

  const handleSendFriendRequest = async () => {
    if (!profileUser?._id || isOwner) {
      return;
    }

    if (!user) {
      setShowAuthPrompt(true);
      return;
    }

    try {
      setRelationshipLoading(true);
      const response = await api.post(`/network/friend-requests/${profileUser._id}`);

      setViewedUser((prev) =>
        mergeConnectionState(prev, response.data?.data),
      );

      toast.success(response.data?.message || "Friend request sent");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not send request");
    } finally {
      setRelationshipLoading(false);
    }
  };

  const handleAcceptFriendRequest = async () => {
    if (!profileUser?._id || isOwner) {
      return;
    }

    if (!user) {
      setShowAuthPrompt(true);
      return;
    }

    try {
      setRelationshipLoading(true);
      const response = await api.post(
        `/network/friend-requests/${profileUser._id}/accept`,
      );

      setViewedUser((prev) =>
        mergeConnectionState(prev, response.data?.data),
      );

      toast.success(response.data?.message || "Friend request accepted");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not accept request");
    } finally {
      setRelationshipLoading(false);
    }
  };

  if (isOwner && !user) {
    return (
      <main className={styles.mainContainer}>
        <section className={styles.emptyState}>
          <h1>Log in to open your profile.</h1>
          <p>Your own profile tools stay private until your account session is active.</p>
        </section>
      </main>
    );
  }

  if (!isOwner && profileLoading) {
    return (
      <main className={styles.mainContainer}>
        <section className={styles.contentContainer}>
          <div className={styles.visitorProfileSkeleton} aria-label="Loading public profile">
            <div className={`${styles.visitorBannerSkeleton} ${styles.profileSkeletonBlock}`} />

            <div className={styles.visitorProfileCardSkeleton}>
              <div className={styles.visitorProfileHeaderSkeleton}>
                <div className={styles.visitorProfileLeftSkeleton}>
                  <div
                    className={`${styles.visitorAvatarSkeleton} ${styles.profileSkeletonBlock}`}
                  />
                  <div className={styles.visitorProfileTextSkeleton}>
                    <div
                      className={`${styles.visitorNameSkeleton} ${styles.profileSkeletonBlock}`}
                    />
                    <div
                      className={`${styles.visitorMetaSkeleton} ${styles.profileSkeletonBlock}`}
                    />
                    <div
                      className={`${styles.visitorMetaSkeletonShort} ${styles.profileSkeletonBlock}`}
                    />
                    <div className={styles.visitorSkillRowSkeleton}>
                      {Array.from({ length: 2 }, (_, index) => (
                        <span
                          key={`visitor-skill-skeleton-${index}`}
                          className={`${styles.visitorSkillSkeleton} ${styles.profileSkeletonBlock}`}
                        />
                      ))}
                    </div>
                    <div
                      className={`${styles.visitorBioSkeleton} ${styles.profileSkeletonBlock}`}
                    />
                    <div
                      className={`${styles.visitorLocationSkeleton} ${styles.profileSkeletonBlock}`}
                    />
                    <div
                      className={`${styles.visitorActionSkeleton} ${styles.profileSkeletonBlock}`}
                    />
                    <div
                      className={`${styles.visitorNoteSkeleton} ${styles.profileSkeletonBlock}`}
                    />
                  </div>
                </div>

                <div className={styles.visitorStatsSkeleton}>
                  {Array.from({ length: 2 }, (_, index) => (
                    <div
                      key={`visitor-stat-skeleton-${index}`}
                      className={`${styles.visitorStatCardSkeleton} ${styles.profileSkeletonBlock}`}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.visitorUploadsSkeleton}>
                <div className={styles.visitorUploadsHeaderSkeleton}>
                  <div className={styles.visitorNavRowSkeleton}>
                    {Array.from({ length: 4 }, (_, index) => (
                      <span
                        key={`visitor-nav-skeleton-${index}`}
                        className={`${styles.visitorNavSkeleton} ${styles.profileSkeletonBlock}`}
                      />
                    ))}
                  </div>
                </div>

                <div className={styles.visitorUploadsGridSkeleton}>
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={`visitor-upload-skeleton-${index}`}
                      className={styles.visitorUploadCardSkeleton}
                    >
                      <div
                        className={`${styles.visitorUploadThumbSkeleton} ${styles.profileSkeletonBlock}`}
                      />
                      <div
                        className={`${styles.visitorUploadLineSkeleton} ${styles.profileSkeletonBlock}`}
                      />
                      <div
                        className={`${styles.visitorUploadLineSkeletonShort} ${styles.profileSkeletonBlock}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!profileUser) {
    return (
      <main className={styles.mainContainer}>
        <section className={styles.emptyState}>
          <h1>Profile unavailable</h1>
          <p>{profileError || "That profile could not be found right now."}</p>
        </section>
      </main>
    );
  }

  const profileSize = width < 768 ? 120 : 160;
  const isSmallScreen = width <= 640;
  const ownerCreatorEnabled = Boolean(profileUser.creator);
  const creatorActive = isOwner
    ? ownerCreatorEnabled
    : Boolean(profileUser.canSubscribe ?? profileUser.creator);
  const bioItems = listify(profileUser.bio);
  const locationItems = listify(profileUser.location);
  const talentItems = listify(profileUser.talent);
  const rawProfileLinks = Array.isArray(profileUser?.externalLinks)
    ? profileUser.externalLinks
    : Array.isArray(profileUser?.links)
      ? profileUser.links
      : isOwner && Array.isArray(user?.externalLinks)
        ? user.externalLinks
        : isOwner && Array.isArray(user?.links)
          ? user.links
          : [];
  const profileLinks = rawProfileLinks
    .map((link) => ({
      label: `${link?.label || ""}`.trim(),
      type: `${link?.type || "website"}`.trim().toLowerCase(),
      url: `${link?.url || ""}`.trim(),
    }))
    .filter((link) => link.url);
  const professionLabel = formatDisplayValue(profileUser.profession);

  const profileCompletionFields = [
    profileUser.username,
    profileUser.email,
    profileUser.avatar,
    profileUser.banner,
    profileUser.profession,
    bioItems.length,
    locationItems.length,
    profileUser.status,
    profileUser.gender,
    profileUser.dob,
    talentItems.length,
  ];

  const completedFields = profileCompletionFields.filter(Boolean).length;
  const profileCompletion = Math.round(
    (completedFields / profileCompletionFields.length) * 100,
  );
  const profileCompletionRemainder = Math.max(0, 100 - profileCompletion);

  const joinedOn = profileUser.createdAt
    ? new Date(profileUser.createdAt).toLocaleDateString()
    : "Recently";

  const locationLabel =
    locationItems.length > 0
      ? locationItems.map(formatDisplayValue).join(", ")
      : "";
  const profileIntro = bioItems[0] || "";
  const canVisitorSeeFriends = typeof profileUser.friendsCount === "number";
  const canVisitorSeeFollowers = typeof profileUser.followersCount === "number";
  const canVisitorSeeFollowing = typeof profileUser.followingCount === "number";
  const fradosCount =
    typeof profileUser.fradosCount === "number" ? profileUser.fradosCount : 0;
  const safrosCount =
    typeof profileUser.safrosCount === "number" ? profileUser.safrosCount : 0;
  const sabosCount =
    typeof profileUser.sabosCount === "number" ? profileUser.sabosCount : 0;
  const saboingsCount =
    typeof profileUser.saboingsCount === "number" ? profileUser.saboingsCount : 0;
  const safroingsCount =
    typeof profileUser.safroingsCount === "number"
      ? profileUser.safroingsCount
      : 0;
  const relationshipStatus = profileUser.relationshipStatus || "none";
  const friendType = profileUser.friendType || null;
  const subscriberType = profileUser.subscriberType || null;
  const isSubscribed = ["sabo", "safro"].includes(subscriberType);
  const relationshipTypeLabel = friendType
    ? friendType === "safro"
      ? "Safro"
      : "Frado"
    : relationshipStatus === "pending_sent"
      ? "Friend request sent"
      : relationshipStatus === "pending_received"
        ? "Sent you a friend request"
        : "";
  const subscriptionTypeLabel = subscriberType
    ? subscriberType === "safro"
      ? "Safro subscriber"
      : "Sabo subscriber"
    : "";
  const storyExpiryLabel = formatStoryExpiry(storyExpiresAt);
  const pendingStoryType = pendingStoryMediaFile
    ? (pendingStoryMediaFile.type?.startsWith("video/") ? "video" : "image")
    : (selectedStoryPost?.postType || "image");
  const composerHasSelection = Boolean(pendingStoryMediaFile || selectedStoryPost?._id);
  const isDeviceStoryVideo =
    Boolean(pendingStoryMediaFile) && pendingStoryType === "video";
  const hasAdjustableStoryClipWindow =
    isDeviceStoryVideo && pendingStoryVideoDurationSeconds > MAX_STORY_DURATION_SECONDS;
  const selectedStoryClipDuration = Math.max(
    0,
    storyClipEndSeconds - storyClipStartSeconds,
  );
  const pendingStoryAudioSourceType = pendingStoryAudioFile?.type?.startsWith("video/")
    ? "video"
    : "audio";
  const hasStorySoundtrack = Boolean(pendingStoryAudioFile);
  const hasAdjustableStoryAudioClipWindow =
    hasStorySoundtrack && pendingStoryAudioDurationSeconds > MAX_STORY_DURATION_SECONDS;
  const selectedStoryAudioClipDuration = Math.max(
    0,
    storyAudioClipEndSeconds - storyAudioClipStartSeconds,
  );
  const storyClipWindowStartPercent =
    pendingStoryVideoDurationSeconds > 0
      ? (storyClipStartSeconds / pendingStoryVideoDurationSeconds) * 100
      : 0;
  const storyClipWindowEndPercent =
    pendingStoryVideoDurationSeconds > 0
      ? (storyClipEndSeconds / pendingStoryVideoDurationSeconds) * 100
      : 0;
  const storyAudioClipWindowStartPercent =
    pendingStoryAudioDurationSeconds > 0
      ? (storyAudioClipStartSeconds / pendingStoryAudioDurationSeconds) * 100
      : 0;
  const storyAudioClipWindowEndPercent =
    pendingStoryAudioDurationSeconds > 0
      ? (storyAudioClipEndSeconds / pendingStoryAudioDurationSeconds) * 100
      : 0;
  const selectedStoryPostTooLong =
    !pendingStoryMediaFile &&
    selectedStoryPost?.postType === "video" &&
    Number(selectedStoryPost?.durationSeconds || 0) > MAX_STORY_DURATION_SECONDS;
  const storyComposerInitialLoading =
    storyComposerOpen && storyPostsLoading && !storyPosts.length;
  const visitorUploadsInitialLoading =
    !isOwner &&
    ((selectedContentView === "playlists" && playlistsLoading && !playlists.length) ||
      (selectedContentView !== "playlists" && uploadedPostsLoading && !uploadedPosts.length));
  const rawPhotoPosts = uploadedPosts.filter(
    (post) => post.postType === "image" && post.contentFormat !== "reel",
  );
  const allUploadedPosts = [...uploadedPosts].sort(
    (left, right) =>
      new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime(),
  );
  const reelsPhotoPosts = uploadedPosts.filter(
    (post) => post.postType === "image" && post.contentFormat === "reel",
  );
  const allPhotoPosts = [...rawPhotoPosts, ...reelsPhotoPosts].sort(
    (left, right) =>
      new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime(),
  );
  const shortVideoPosts = uploadedPosts.filter(
    (post) => post.postType === "video" && post.contentFormat !== "long",
  );
  const longVideoPosts = uploadedPosts.filter(
    (post) => post.postType === "video" && post.contentFormat === "long",
  );
  const allVideoPosts = [...longVideoPosts, ...shortVideoPosts].sort(
    (left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime(),
  );
  const selectedPlaylist =
    playlists.find((playlist) => playlist._id === selectedPlaylistId) || playlists[0] || null;
  const playlistVideos = Array.isArray(selectedPlaylist?.videos)
    ? selectedPlaylist.videos
    : [];
  const hasFloatingOptions =
    selectedContentView === "photos" ||
    selectedContentView === "videos" ||
    (selectedContentView === "playlists" && playlists.length > 0);

  const connectionStats = [
    {
      label: "Frados",
      value: fradosCount,
      visible: isOwner || canVisitorSeeFriends,
    },
    {
      label: "Safros",
      value: safrosCount,
      visible: isOwner ? creatorActive : canVisitorSeeFollowers,
    },
    {
      label: "Saboings",
      value: saboingsCount,
      visible: isOwner || canVisitorSeeFollowing,
    },
    {
      label: "Safroings",
      value: safroingsCount,
      visible: isOwner || canVisitorSeeFollowing,
    },
    {
      label: "Sabos",
      value: sabosCount,
      visible: isOwner ? creatorActive : canVisitorSeeFollowers,
    },
  ].filter((item) => item.visible);
  const hasExpandedConnectionStats = connectionStats.length > 3;
  const shouldStackHeaderMeta = connectionStats.length >= 3;

  const summaryStats = [
    {
      label: "Completion",
      value: `${profileCompletion}%`,
      caption: "Profile filled",
      editField: "",
    },
    {
      label: "Bio",
      value: bioItems.length || "--",
      caption: "About lines",
      editField: "bio",
    },
    {
      label: "Talents/Skills",
      value: talentItems.length || "--",
      caption: "Listed skills",
      editField: "talent",
    },
    {
      label: "Creator",
      value: creatorActive ? "On" : "Off",
      caption: ownerCreatorEnabled ? "Saved on account" : "Disabled",
      editField: "",
    },
  ];

  const detailRows = [
    {
      label: "Email",
      value: profileUser.email || "--",
      icon: <MdMailOutline />,
    },
    {
      label: "Profession",
      value: professionLabel || "--",
      icon: <MdOutlineWorkOutline />,
    },
    {
      label: "Relationship",
      value: formatDisplayValue(profileUser.status) || "--",
      icon: <MdOutlineFavoriteBorder />,
    },
    {
      label: "Gender",
      value: formatDisplayValue(profileUser.gender) || "--",
      icon: <MdOutlineWc />,
    },
    {
      label: "Birthday",
      value: profileUser.dob || "--",
      icon: <MdOutlineCake />,
    },
    {
      label: "Joined",
      value: joinedOn,
      icon: <MdOutlineCalendarMonth />,
    },
  ];

  const statusPillLabel = creatorActive ? "Channel profile" : "Personal profile";

  const renderOwnerEditButton = (
    focusField,
    label,
    className = styles.cardEditButton,
  ) => {
    if (!focusField) {
      return null;
    }

    return (
      <EditProfileInfo
        Icon={FaUserEdit}
        className={className}
        initialFocusField={focusField}
        compact
        iconSize={14}
        buttonLabel={label}
      />
    );
  };

  const handleCreatorModeToggle = async () => {
    const nextCreatorValue = !ownerCreatorEnabled;
    const resultAction = await dispatch(updateCreatorMode(nextCreatorValue));

    if (updateCreatorMode.fulfilled.match(resultAction)) {
      toast.success(
        resultAction.payload?.message ||
          (nextCreatorValue
            ? "Creator mode enabled"
            : "Creator mode disabled"),
      );
      return;
    }

    toast.error(
      resultAction.payload?.message || "Creator mode could not be updated",
    );
  };

  const handleSubscribe = async () => {
    if (!profileUser?._id || isOwner || !creatorActive) {
      return;
    }

    if (!user) {
      setShowAuthPrompt(true);
      return;
    }

    try {
      setSubscriptionLoading(true);
      const response = await api.post(`/network/subscriptions/${profileUser._id}`);

      setViewedUser((prev) => mergeConnectionState(prev, response.data?.data));
      toast.success(response.data?.message || "Subscribed successfully");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not subscribe");
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!profileUser?._id || isOwner || !creatorActive) {
      return;
    }

    if (!user) {
      setShowAuthPrompt(true);
      return;
    }

    try {
      setSubscriptionLoading(true);
      const response = await api.delete(`/network/following/${profileUser._id}`);

      setViewedUser((prev) => mergeConnectionState(prev, response.data?.data));
      toast.success(response.data?.message || "Subscription removed");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not unsubscribe");
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const renderVisitorRelationshipAction = () => {
    if (isOwner) {
      return null;
    }

    const friendButtonLabel = "Add friend";
    const friendButtonClassName =
      relationshipStatus === "friends"
        ? styles.friendActionGhostBtn
        : styles.friendActionBtn;
    const friendButtonHandler = !user
      ? () => setShowAuthPrompt(true)
      : relationshipStatus === "pending_received"
        ? handleAcceptFriendRequest
        : relationshipStatus === "none"
          ? handleSendFriendRequest
          : undefined;
    const subscribeButtonLabel = "Subscribe";
    const subscribeButtonClassName = isSubscribed
      ? styles.friendActionGhostBtn
      : styles.friendActionBtn;
    const subscribeButtonHandler = !user
      ? () => setShowAuthPrompt(true)
      : isSubscribed
        ? handleUnsubscribe
        : handleSubscribe;

    return (
      <div className={styles.visitorRelationshipRow}>
        <button
          type="button"
          className={friendButtonClassName}
          onClick={friendButtonHandler}
          disabled={
            relationshipLoading ||
            (!friendButtonHandler && relationshipStatus !== "pending_received")
          }
        >
          {relationshipLoading
            ? relationshipStatus === "pending_received"
              ? "Accepting..."
              : "Sending..."
            : friendButtonLabel}
        </button>

        {creatorActive ? (
          <button
            type="button"
            className={subscribeButtonClassName}
            onClick={subscribeButtonHandler}
            disabled={subscriptionLoading}
          >
            {subscriptionLoading
              ? isSubscribed
                ? "Updating..."
                : "Subscribing..."
              : subscribeButtonLabel}
          </button>
        ) : null}

        {relationshipTypeLabel ? (
          <span className={`${styles.relationshipChip} ${styles.relationshipFriends}`}>
            {relationshipTypeLabel}
          </span>
        ) : null}

        {creatorActive && subscriptionTypeLabel ? (
          <span className={styles.relationshipChip}>{subscriptionTypeLabel}</span>
        ) : null}

        {!user ? (
          <span className={styles.relationshipChip}>
            Log in or create an account to connect
          </span>
        ) : null}
      </div>
    );
  };

  const handleUploadedPostSelect = (post) => {
    if (!post?._id) {
      return;
    }

    if (isOwner && post.postType === "video") {
      setActiveInlineVideoPost(post);
      return;
    }

    navigate(`/posts/${post._id}`);
  };

  const handleOpenLikesViewer = async (event, post) => {
    event.stopPropagation();

    if (!isOwner || !post?._id) {
      return;
    }

    try {
      setLikesViewerPost(post);
      setLikesViewerLoading(true);
      setLikesViewerError("");
      const response = await api.get(`/user/posts/${post._id}/likes`);
      const payload = response.data?.data || {};
      setLikesViewerItems(Array.isArray(payload.likes) ? payload.likes : []);
    } catch (error) {
      setLikesViewerItems([]);
      setLikesViewerError(error.response?.data?.message || "Likes could not be loaded");
    } finally {
      setLikesViewerLoading(false);
    }
  };

  const handleOpenPlaylistPicker = (post) => {
    if (!isOwner || !post?._id) {
      return;
    }

    const linkedPlaylistIds = playlists
      .filter((playlist) =>
        Array.isArray(playlist.videos) &&
        playlist.videos.some((video) => video?._id === post._id),
      )
      .map((playlist) => playlist._id);

    setPlaylistPickerPost(post);
    setPlaylistPickerIds(linkedPlaylistIds);
    setNewPlaylistTitle("");
    setNewPlaylistDescription("");
  };

  const handlePlaylistPickerToggle = (playlistId) => {
    setPlaylistPickerIds((prev) =>
      prev.includes(playlistId)
        ? prev.filter((item) => item !== playlistId)
        : [...prev, playlistId],
    );
  };

  const handlePlaylistPickerSave = async () => {
    if (!playlistPickerPost?._id) {
      return;
    }

    const targetPostId = playlistPickerPost._id;
    const normalizedNewTitle = newPlaylistTitle.trim().toLowerCase();
    const normalizedNewDescription = newPlaylistDescription.trim();
    const updates = playlists.reduce((items, playlist) => {
      const currentVideoIds = Array.isArray(playlist.videos)
        ? playlist.videos.map((video) => video._id)
        : [];
      const currentlyLinked = currentVideoIds.includes(targetPostId);
      const shouldBeLinked = playlistPickerIds.includes(playlist._id);

      if (currentlyLinked === shouldBeLinked) {
        return items;
      }

      items.push({
        playlistId: playlist._id,
        payload: {
          title: `${playlist.title || ""}`.trim().toLowerCase(),
          description: playlist.description || "",
          videoPostIds: shouldBeLinked
            ? Array.from(new Set([...currentVideoIds, targetPostId]))
            : currentVideoIds.filter((item) => item !== targetPostId),
        },
      });

      return items;
    }, []);

    if (!updates.length && !normalizedNewTitle) {
      setPlaylistPickerPost(null);
      return;
    }

    try {
      setPlaylistPickerSaving(true);
      const responses = await Promise.all(
        updates.map(({ playlistId, payload }) =>
          api.patch(`/user/playlists/${playlistId}`, payload),
        ),
      );
      const createResponse = normalizedNewTitle
        ? await api.post("/user/playlists", {
          title: normalizedNewTitle,
          description: normalizedNewDescription,
          videoPostIds: [targetPostId],
        })
        : null;

      const updatedMap = new Map(
        responses
          .map((response) => response.data?.data)
          .filter(Boolean)
          .map((playlist) => [playlist._id, playlist]),
      );

      setPlaylists((prev) =>
        [
          ...(createResponse?.data?.data ? [createResponse.data.data] : []),
          ...prev.map((playlist) => updatedMap.get(playlist._id) || playlist),
        ],
      );
      setPlaylistPickerPost(null);
      setNewPlaylistTitle("");
      setNewPlaylistDescription("");
      setPlaylistRefreshNonce((prev) => prev + 1);
      toast.success("Playlist selections updated");
    } catch (error) {
      toast.error(error.response?.data?.message || "Playlist update failed");
    } finally {
      setPlaylistPickerSaving(false);
    }
  };

  const handlePlaylistVisibilityToggle = async () => {
    if (!isOwner || !selectedPlaylist?._id) {
      return;
    }

    try {
      setPlaylistVisibilitySavingId(selectedPlaylist._id);
      const response = await api.patch(`/user/playlists/${selectedPlaylist._id}`, {
        isPublic: !selectedPlaylist.isPublic,
      });
      const nextPlaylist = response.data?.data;

      if (!nextPlaylist) {
        throw new Error("Playlist update did not return data");
      }

      setPlaylists((prev) =>
        prev.map((playlist) =>
          playlist._id === nextPlaylist._id ? nextPlaylist : playlist,
        ),
      );
      toast.success(
        nextPlaylist.isPublic
          ? "Playlist is now public"
          : "Playlist is now private",
      );
    } catch (error) {
      toast.error(error.response?.data?.message || "Playlist visibility could not be updated");
    } finally {
      setPlaylistVisibilitySavingId("");
    }
  };

  const activeInlineVideoOverlay = activeInlineVideoPost ? (
    <div
      className={styles.inlineVideoOverlay}
      onClick={() => setActiveInlineVideoPost(null)}
    >
      <div
        className={styles.inlineVideoDialog}
        role="dialog"
        aria-modal="true"
        aria-label={activeInlineVideoPost.title || "Profile video"}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.inlineVideoClose}
          onClick={() => setActiveInlineVideoPost(null)}
          aria-label="Close video player"
        >
          <MdClose />
        </button>

        <div className={styles.inlineVideoFrame}>
          <video
            src={activeInlineVideoPost.url}
            className={styles.inlineVideoPlayer}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        </div>

        <div className={styles.inlineVideoMeta}>
          <p className={styles.inlineVideoKicker}>
            {formatDisplayValue(activeInlineVideoPost.postType) || "Video"}
            {activeInlineVideoPost.contentFormat
              ? ` | ${formatDisplayValue(activeInlineVideoPost.contentFormat)}`
              : ""}
          </p>
          <h2>
            {formatDisplayValue(activeInlineVideoPost.title) || "Untitled video"}
          </h2>
          <p>
            {formatDisplayValue(activeInlineVideoPost.category) || "Uploaded from your profile"}
          </p>
        </div>
      </div>
    </div>
  ) : null;

  const playlistPickerOverlay = playlistPickerPost ? (
    <div
      className={styles.playlistPickerOverlay}
      onClick={() => {
        if (!playlistPickerSaving) {
          setPlaylistPickerPost(null);
        }
      }}
    >
      <div
        className={styles.playlistPickerDialog}
        role="dialog"
        aria-modal="true"
        aria-label="Add post to playlists"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.playlistPickerHeader}>
          <div>
            <p>Add to playlist</p>
            <h2>
              {formatDisplayValue(playlistPickerPost.title) || "Untitled post"}
            </h2>
          </div>

          <button
            type="button"
            className={styles.playlistPickerClose}
            onClick={() => setPlaylistPickerPost(null)}
            disabled={playlistPickerSaving}
            aria-label="Close playlist picker"
          >
            <MdClose />
          </button>
        </div>

        {playlistsLoading ? (
          <div className={styles.playlistPickerEmpty}>Loading your playlists...</div>
        ) : playlists.length === 0 ? (
          <div className={styles.playlistPickerEmpty}>
            You have not created any playlists yet.
          </div>
        ) : (
          <div className={styles.playlistPickerList}>
            {playlists.map((playlist) => {
              const checked = playlistPickerIds.includes(playlist._id);

              return (
                <label key={playlist._id} className={styles.playlistPickerOption}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handlePlaylistPickerToggle(playlist._id)}
                    disabled={playlistPickerSaving}
                  />
                  <div>
                    <strong>{formatDisplayValue(playlist.title) || "Untitled playlist"}</strong>
                    <small>{playlist.postCount || playlist.videoCount || 0} posts</small>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className={styles.playlistPickerCreate}>
          <label className={styles.playlistPickerField}>
            <span>Create new playlist</span>
            <input
              type="text"
              value={newPlaylistTitle}
              onChange={(event) => setNewPlaylistTitle(event.target.value)}
              placeholder="travel reels, portraits, tutorials..."
              disabled={playlistPickerSaving}
            />
          </label>
          <label className={styles.playlistPickerField}>
            <span>Description</span>
            <textarea
              value={newPlaylistDescription}
              onChange={(event) => setNewPlaylistDescription(event.target.value)}
              placeholder="Tell people what belongs in this playlist"
              disabled={playlistPickerSaving}
            />
          </label>
        </div>

        <div className={styles.playlistPickerActions}>
          <button
            type="button"
            className={styles.playlistPickerSecondary}
            onClick={() => setPlaylistPickerPost(null)}
            disabled={playlistPickerSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.playlistPickerPrimary}
            onClick={handlePlaylistPickerSave}
            disabled={
              playlistPickerSaving ||
              playlistsLoading ||
              (playlists.length === 0 && !newPlaylistTitle.trim())
            }
          >
            {playlistPickerSaving ? "Saving..." : "Save playlists"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const likesViewerOverlay = likesViewerPost ? (
    <div
      className={styles.playlistPickerOverlay}
      onClick={() => setLikesViewerPost(null)}
    >
      <div
        className={styles.playlistPickerDialog}
        role="dialog"
        aria-modal="true"
        aria-label="Post likes"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.playlistPickerHeader}>
          <div>
            <p>Post likes</p>
            <h2>{formatDisplayValue(likesViewerPost.title) || "Untitled post"}</h2>
          </div>

          <button
            type="button"
            className={styles.playlistPickerClose}
            onClick={() => setLikesViewerPost(null)}
            aria-label="Close likes viewer"
          >
            <MdClose />
          </button>
        </div>

        {likesViewerLoading ? (
          <div className={styles.playlistPickerEmpty}>Loading likes...</div>
        ) : likesViewerError ? (
          <div className={styles.playlistPickerEmpty}>{likesViewerError}</div>
        ) : likesViewerItems.length === 0 ? (
          <div className={styles.playlistPickerEmpty}>No one has liked this post yet.</div>
        ) : (
          <div className={styles.playlistPickerList}>
            {likesViewerItems.map((item) => (
              <button
                key={item._id}
                type="button"
                className={styles.playlistPickerOption}
                onClick={() => navigate(`/profile/${item.user?._id}`)}
              >
                <img
                  src={item.user?.avatar || noProfile}
                  alt={item.user?.username || "Profile"}
                  className={styles.likesViewerAvatar}
                />
                <div>
                  <strong>{item.user?.username || "globMe member"}</strong>
                  <small>
                    {formatDisplayValue(item.user?.profession) || "globMe member"}
                  </small>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const storyComposerOverlay = isOwner && storyComposerOpen ? (
    <div
      className={styles.storyComposerOverlay}
      onClick={() => {
        if (!(loading && uploadTarget === "story")) {
          setStoryComposerOpen(false);
        }
      }}
    >
      <div
        className={styles.storyComposerDialog}
        role="dialog"
        aria-modal="true"
        aria-label="Create story"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.storyComposerDialogHeader}>
          <div>
            <p className={styles.storyEyebrow}>Create story</p>
            <h2>Upload story</h2>
          </div>

          <button
            type="button"
            className={styles.storyComposerClose}
            onClick={() => setStoryComposerOpen(false)}
            disabled={loading && uploadTarget === "story"}
            aria-label="Close story composer"
          >
            <MdClose />
          </button>
        </div>

        <div className={`${styles.storyComposer} ${styles.storyComposerElevated}`}>
          <p className={styles.storyComposerIntro}>
            Build one live story from a photo or video on your device, add
            optional music, or turn one of your uploaded posts into the story.
            Video and music clips must stay within 1 minute 30 seconds.
          </p>

          <div className={styles.storyComposerActions}>
            <ImageUpload
              Icon={RiImageEditLine}
              className={styles.storyUploader}
              buttonClassName={styles.storyUploadButton}
              onFileSelect={handleStoryMediaSelect}
              disabled={loading}
              size={18}
              accept="image/*,video/*"
              label={
                pendingStoryMediaFile ? "Change photo/video" : "Choose photo/video"
              }
              title="Choose a photo or video for your story"
            />

            <ImageUpload
              Icon={RiImageEditLine}
              className={styles.storyUploader}
              buttonClassName={styles.storySecondaryButton}
              onFileSelect={handleStoryAudioSelect}
              disabled={loading}
              size={18}
              accept="audio/*,video/*"
              label={pendingStoryAudioFile ? "Change music" : "Add music"}
              title="Attach optional sound from an audio or video file"
            />

            {(pendingStoryMediaFile || pendingStoryAudioFile || selectedStoryPost) ? (
              <button
                type="button"
                className={styles.storySecondaryButton}
                onClick={resetStoryComposer}
                disabled={loading}
              >
                Clear draft
              </button>
            ) : null}
          </div>

          <div
            className={`${styles.storyComposerGrid} ${
              pendingStoryMediaFile ? styles.storyComposerGridMediaActive : ""
            }`}
          >
            <div
              className={`${styles.storyComposerCard} ${styles.storyComposerDraftCard} ${
                pendingStoryMediaFile ? styles.storyComposerDraftExpanded : ""
              }`}
            >
              <div className={styles.storyComposerSectionHeader}>
                <h3>Draft preview</h3>
                <span>
                  {selectedStoryPost
                    ? "Using one of your posts"
                    : pendingStoryMediaFile
                      ? "Using device media"
                      : "Nothing selected yet"}
                </span>
              </div>

              {storyComposerInitialLoading ? (
                <div
                  className={styles.storyDraftSkeleton}
                  aria-label="Loading story draft preview"
                >
                  <div
                    className={`${styles.storyDraftSkeletonMedia} ${styles.storySkeletonBlock}`}
                    aria-hidden="true"
                  />
                  <div className={styles.storyDraftSkeletonMeta}>
                    <span
                      className={`${styles.storyDraftSkeletonBadge} ${styles.storySkeletonBlock}`}
                    />
                    <span
                      className={`${styles.storyDraftSkeletonLinePrimary} ${styles.storySkeletonBlock}`}
                    />
                    <span
                      className={`${styles.storyDraftSkeletonLineSecondary} ${styles.storySkeletonBlock}`}
                    />
                  </div>
                </div>
              ) : composerHasSelection ? (
                <div className={styles.storyDraftPreview}>
                  {pendingStoryType === "video" ? (
                    <div className={styles.storyVideoDraftShell}>
                      <video
                        ref={pendingStoryVideoRef}
                        src={pendingStoryMediaPreview || selectedStoryPost?.url}
                        className={styles.storyImage}
                        controls
                        preload="metadata"
                      />

                      {isDeviceStoryVideo && pendingStoryVideoDurationSeconds > 0 ? (
                        <div className={styles.storyClipPanel}>
                          <div className={styles.storyClipHeader}>
                            <div>
                              <strong>Story video clip</strong>
                              <small>
                                {formatDurationLabel(storyClipStartSeconds)} to{" "}
                                {formatDurationLabel(storyClipEndSeconds)}
                              </small>
                            </div>
                            <span className={styles.storyClipBadge}>
                              Length {formatDurationLabel(selectedStoryClipDuration)}
                            </span>
                          </div>

                          {hasAdjustableStoryClipWindow ? (
                            <div className={styles.storyClipControl}>
                              <div className={styles.storyClipLabelRow}>
                                <label htmlFor="story-video-window">
                                  Move the 1:30 window
                                </label>
                                <span>{formatDurationLabel(storyClipStartSeconds)}</span>
                              </div>
                              <div className={styles.storyClipRangeShell}>
                                <button
                                  type="button"
                                  className={styles.storyClipDragSurface}
                                  onPointerDown={handleStoryClipWindowPointerDown}
                                  aria-label="Drag the selected 1 minute 30 second story clip window"
                                >
                                  <span
                                    className={styles.storyClipRangeBackdrop}
                                    aria-hidden="true"
                                  >
                                    <span
                                      className={styles.storyClipRangeActive}
                                      style={{
                                        left: `${storyClipWindowStartPercent}%`,
                                        width: `${Math.max(
                                          0,
                                          storyClipWindowEndPercent - storyClipWindowStartPercent,
                                        )}%`,
                                      }}
                                    >
                                      <span className={styles.storyClipHandle} />
                                      <span className={styles.storyClipHandle} />
                                    </span>
                                  </span>
                                </button>
                                <input
                                  id="story-video-window"
                                  type="range"
                                  min="0"
                                  max={Math.max(
                                    0,
                                    pendingStoryVideoDurationSeconds - MAX_STORY_DURATION_SECONDS,
                                  )}
                                  step={STORY_CLIP_SLIDER_STEP_SECONDS}
                                  value={storyClipStartSeconds}
                                  onInput={handleStoryClipStartChange}
                                  onChange={handleStoryClipStartChange}
                                  className={styles.storyClipSlider}
                                  aria-hidden="true"
                                  tabIndex={-1}
                                />
                              </div>
                              <div className={styles.storyClipTimelineLabels}>
                                <span>{formatDurationLabel(0)}</span>
                                <span>
                                  {formatDurationLabel(pendingStoryVideoDurationSeconds)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className={styles.storyClipStaticNote}>
                              This video already fits inside the 1 minute 30 second story limit,
                              so the full video will be used.
                            </div>
                          )}

                          <div className={styles.storyClipActions}>
                            <button
                              type="button"
                              className={styles.storySecondaryButton}
                              onClick={handlePreviewStoryClip}
                            >
                              {storyClipPreviewing ? "Previewing..." : "Preview selected clip"}
                            </button>
                            <button
                              type="button"
                              className={styles.storySecondaryButton}
                              onClick={handleUseDefaultStoryClip}
                              disabled={!hasAdjustableStoryClipWindow}
                            >
                              Use first 1:30
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <img
                      src={pendingStoryMediaPreview || selectedStoryPost?.url}
                      alt="Story draft"
                      className={styles.storyImage}
                    />
                  )}

                  <div className={styles.storyMeta}>
                    <span className={styles.storyBadge}>
                      {pendingStoryType === "video" ? "Video story" : "Photo story"}
                    </span>
                    <p>
                      {selectedStoryPost
                        ? formatDisplayValue(selectedStoryPost.title) || "Selected post"
                        : pendingStoryMediaFile?.name || "Device upload"}
                    </p>
                    {isDeviceStoryVideo && pendingStoryVideoDurationSeconds > 0 ? (
                      <>
                        <p>
                          Original length:{" "}
                          {formatDurationLabel(pendingStoryVideoDurationSeconds)}
                        </p>
                        <p>
                          Story clip: {formatDurationLabel(storyClipStartSeconds)} to{" "}
                          {formatDurationLabel(storyClipEndSeconds)} (
                          {formatDurationLabel(selectedStoryClipDuration)})
                        </p>
                      </>
                    ) : null}
                    {selectedStoryPostTooLong ? (
                      <p className={styles.storyTrimWarning}>
                        This uploaded video post is longer than 1 minute 30 seconds.
                        Select a device video instead if you want to trim a deliberate part for story.
                      </p>
                    ) : null}

                    {pendingStoryAudioFile && pendingStoryAudioDurationSeconds > 0 ? (
                      <div className={styles.storyClipPanel}>
                        <div className={styles.storyClipHeader}>
                          <div>
                            <strong>
                              {pendingStoryAudioSourceType === "video"
                                ? "Video soundtrack"
                                : "Audio soundtrack"}
                            </strong>
                            <small>
                              {formatDurationLabel(storyAudioClipStartSeconds)} to{" "}
                              {formatDurationLabel(storyAudioClipEndSeconds)}
                            </small>
                          </div>
                          <span className={styles.storyClipBadge}>
                            Clip {formatDurationLabel(selectedStoryAudioClipDuration)}
                          </span>
                        </div>

                        {hasAdjustableStoryAudioClipWindow ? (
                          <div className={styles.storyClipControl}>
                            <div className={styles.storyClipLabelRow}>
                              <label htmlFor="story-audio-window">
                                Move the 1:30 sound window
                              </label>
                              <span>{formatDurationLabel(storyAudioClipStartSeconds)}</span>
                            </div>
                            <div className={styles.storyClipRangeShell}>
                              <button
                                type="button"
                                className={styles.storyClipDragSurface}
                                onPointerDown={handleStoryAudioClipWindowPointerDown}
                                aria-label="Drag the selected 1 minute 30 second soundtrack window"
                              >
                                <span
                                  className={styles.storyClipRangeBackdrop}
                                  aria-hidden="true"
                                >
                                  <span
                                    className={styles.storyClipRangeActive}
                                    style={{
                                      left: `${storyAudioClipWindowStartPercent}%`,
                                      width: `${Math.max(
                                        0,
                                        storyAudioClipWindowEndPercent -
                                          storyAudioClipWindowStartPercent,
                                      )}%`,
                                    }}
                                  >
                                    <span className={styles.storyClipHandle} />
                                    <span className={styles.storyClipHandle} />
                                  </span>
                                </span>
                              </button>
                              <input
                                id="story-audio-window"
                                type="range"
                                min="0"
                                max={Math.max(
                                  0,
                                  pendingStoryAudioDurationSeconds - MAX_STORY_DURATION_SECONDS,
                                )}
                                step={STORY_CLIP_SLIDER_STEP_SECONDS}
                                value={storyAudioClipStartSeconds}
                                onInput={handleStoryAudioClipStartChange}
                                onChange={handleStoryAudioClipStartChange}
                                className={styles.storyClipSlider}
                                aria-hidden="true"
                                tabIndex={-1}
                              />
                            </div>
                            <div className={styles.storyClipTimelineLabels}>
                              <span>{formatDurationLabel(0)}</span>
                              <span>
                                {formatDurationLabel(pendingStoryAudioDurationSeconds)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.storyClipStaticNote}>
                            This soundtrack is shorter than 1 minute 30 seconds, so it will
                            repeat automatically until the story sound reaches 1:30.
                          </div>
                        )}

                        <div className={styles.storyClipActions}>
                          <button
                            type="button"
                            className={styles.storySecondaryButton}
                            onClick={handleUseDefaultStoryAudioClip}
                            disabled={!hasAdjustableStoryAudioClipWindow}
                          >
                            Use first 1:30
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {pendingStoryAudioFile ? (
                      pendingStoryAudioSourceType === "video" ? (
                        <video
                          key={pendingStoryAudioPreview}
                          ref={pendingStoryAudioRef}
                          src={pendingStoryAudioPreview}
                          preload="metadata"
                          className={styles.storyAudioPlayer}
                        />
                      ) : (
                        <audio
                          key={pendingStoryAudioPreview}
                          ref={pendingStoryAudioRef}
                          src={pendingStoryAudioPreview}
                          preload="metadata"
                          className={styles.storyAudioPlayer}
                        />
                      )
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className={styles.storyPlaceholder}>
                  Choose a photo or video, or select one of your posts below.
                </div>
              )}
            </div>

            <div className={`${styles.storyComposerCard} ${styles.storyComposerLibraryCard}`}>
              <div className={styles.storyComposerSectionHeader}>
                <h3>Your uploaded posts</h3>
                <span>Image and video posts can become your story</span>
              </div>

              {storyComposerInitialLoading ? (
                <div
                  className={styles.storyPostSkeletonList}
                  aria-label="Loading your uploaded story posts"
                >
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={`story-post-skeleton-${index}`}
                      className={styles.storyPostSkeletonCard}
                      aria-hidden="true"
                    >
                      <div
                        className={`${styles.storyPostSkeletonThumb} ${styles.storySkeletonBlock}`}
                      />
                      <div className={styles.storyPostSkeletonMeta}>
                        <span
                          className={`${styles.storyPostSkeletonBadge} ${styles.storySkeletonBlock}`}
                        />
                        <span
                          className={`${styles.storyPostSkeletonTitle} ${styles.storySkeletonBlock}`}
                        />
                        <span
                          className={`${styles.storyPostSkeletonType} ${styles.storySkeletonBlock}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : storyPostsError ? (
                <div className={styles.storyPostsState}>{storyPostsError}</div>
              ) : storyPosts.length === 0 ? (
                <div className={styles.storyPostsState}>
                  No image or video posts are available yet.
                </div>
              ) : (
                <div className={styles.storyPostList}>
                  {storyPosts.map((post) => {
                    const isSelected = selectedStoryPost?._id === post._id;

                    return (
                      <button
                        type="button"
                        key={post._id}
                        className={`${styles.storyPostCard} ${
                          isSelected ? styles.storyPostCardActive : ""
                        }`}
                        onClick={() => {
                          setPendingStoryMediaFile(null);
                          setSelectedStoryPost(post);
                        }}
                      >
                        {post.postType === "video" ? (
                          <video
                            src={post.url}
                            className={styles.storyPostThumb}
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={post.url}
                            alt={post.title || "Uploaded post"}
                            className={styles.storyPostThumb}
                          />
                        )}

                        <div className={styles.storyPostMeta}>
                          <strong>
                            {formatDisplayValue(post.title) || "Untitled post"}
                          </strong>
                          <span>{formatDisplayValue(post.postType)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className={styles.storyComposerFooter}>
            <span>
              Published stories stay live for 36 hours, then disappear
              automatically. Video and music length is capped at 1 minute
              30 seconds.
            </span>
            <button
              type="button"
              className={styles.storyPublishButton}
              onClick={handlePublishStory}
              disabled={loading || storyClipExportLoading || !composerHasSelection}
            >
              {storyClipExportLoading
                ? "Preparing clip..."
                : loading && uploadTarget === "story"
                  ? "Publishing..."
                  : "Publish story"}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <main className={styles.mainContainer}>
        <section
          className={`${styles.contentContainer} ${
            storyComposerOpen ? styles.contentContainerMuted : ""
          }`}
        >
        <div className={styles.bannerWrapper}>
          <img
            src={profileUser.banner || noBanner}
            alt={`${profileUser.username || "User"} banner`}
            className={styles.bannerImg}
          />
          <div className={styles.bannerOverlay} />
          <div className={styles.bannerContent}>
            <div className={styles.bannerText}>
              <h2>{profileUser.username}</h2>
            </div>
          </div>
          {isOwner ? (
            <ImageUpload
              Icon={RiImageEditLine}
              className={styles.bannerUploader}
              buttonClassName={styles.bannerUploadButton}
              onFileSelect={handleBannerSelect}
              disabled={loading}
              title={
                loading && uploadTarget === "banner"
                  ? "Uploading banner"
                  : "Upload profile banner"
              }
            />
          ) : null}
        </div>

        <div className={styles.profileCard}>
          <div
            className={`${styles.profileHeader} ${
              !isOwner ? styles.profileHeaderVisitor : ""
            }`}
          >
            <div className={styles.profileLeft}>
              <article className={styles.profilePicContainer}>
                <button
                  type="button"
                  className={`${styles.profileAvatarButton} ${
                    hasActiveStory ? styles.profileAvatarButtonStory : ""
                  }`}
                  onClick={handleOpenProfileStory}
                  disabled={!hasActiveStory || storyViewerLoading}
                  aria-label={
                    hasActiveStory
                      ? `Open ${profileUser.username || "user"} story`
                      : "Profile photo"
                  }
                >
                  <img
                    src={profileUser.avatar || noProfile}
                    alt={`${profileUser.username || "User"} profile`}
                    height={profileSize}
                    width={profileSize}
                    className={styles.profilePic}
                  />
                </button>

                {isOwner && ownerCreatorEnabled ? (
                  <strong className={styles.creatorBadge}>channel</strong>
                ) : null}

                {isOwner ? (
                  <ImageUpload
                    Icon={RiImageCircleAiFill}
                    className={styles.profileUploader}
                    buttonClassName={styles.avatarUploadButton}
                    onFileSelect={handleAvatarSelect}
                    size={18}
                    disabled={loading}
                    title={
                      loading && uploadTarget === "avatar"
                        ? "Uploading profile photo"
                        : "Upload profile photo"
                    }
                  />
                ) : null}
              </article>

              {connectionStats.length > 0 ? (
                <div className={styles.mobileConnectionStatsWrap}>
                  <div
                    className={`${styles.connectionStats} ${styles.connectionStatsMobile}`}
                  >
                    {connectionStats.map((item) => (
                      <div key={item.label} className={styles.connectionCard}>
                        <strong>{item.value}</strong>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {isOwner && isSmallScreen ? (
                    <div className={styles.mobileOwnerTools}>
                      <EditProfileInfo
                        Icon={FaUserEdit}
                        className={styles.editProfileBtn}
                      />

                      <button
                        type="button"
                        className={styles.creatorBtn}
                        onClick={handleCreatorModeToggle}
                        disabled={loading}
                      >
                        creator
                        <span className={styles.creatorIndicator}>
                          {creatorActive ? "✓" : "x"}
                        </span>
                      </button>

                      <button
                        type="button"
                        className={styles.infoToggleBtn}
                        onClick={() => setShowInfo((prev) => !prev)}
                        aria-expanded={showInfo}
                      >
                        info
                        <span className={styles.infoToggleIndicator}>
                          {showInfo ? "-" : "+"}
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.userInfo}>
                <div className={styles.identityRow}>
                  <h1 className={styles.name}>{profileUser.username}</h1>
                  {isOwner ? (
                    <span className={styles.statusPill}>{statusPillLabel}</span>
                  ) : null}
                </div>

                <div
                  className={`${styles.headerMetaRow} ${
                    shouldStackHeaderMeta ? styles.headerMetaRowStacked : ""
                  }`}
                >
                  <div className={styles.headerMetaText}>
                    {professionLabel || isOwner ? (
                      <p className={styles.profession}>{professionLabel || "--"}</p>
                    ) : null}

                    {profileUser.email ? (
                      <p className={styles.emailLine}>{profileUser.email}</p>
                    ) : null}
                  </div>

                  {connectionStats.length > 0 ? (
                    <div
                      className={`${styles.connectionStats} ${styles.connectionStatsDesktop} ${
                        hasExpandedConnectionStats ? styles.connectionStatsExpanded : ""
                      }`}
                    >
                      {connectionStats.map((item) => (
                        <div key={item.label} className={styles.connectionCard}>
                          <strong>{item.value}</strong>
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                {talentItems.length > 0 ? (
                  <div className={styles.topSkills}>
                    {talentItems.map((talent) => (
                      <span key={talent} className={styles.topSkillTag}>
                        {formatDisplayValue(talent)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {profileIntro ? (
                  <p className={styles.profileStory}>{profileIntro}</p>
                ) : isOwner ? (
                  <p className={styles.profileStory}>
                    Add a short intro so visitors understand your personality,
                    work, and interests at a glance.
                  </p>
                ) : null}

                {profileLinks.length > 0 ? (
                  <div className={styles.profileLinksSection}>
                    {profileLinks.map((link, index) => {
                      const linkLabel = link.label || formatProfileLinkType(link.type);
                      const opensInNewTab = /^https?:/i.test(link.url);

                      return (
                        <a
                          key={`${link.url}-${index}`}
                          href={link.url}
                          className={styles.profileLinkChip}
                          target={opensInNewTab ? "_blank" : undefined}
                          rel={opensInNewTab ? "noreferrer noopener" : undefined}
                          aria-label={`Open ${linkLabel}`}
                          title={link.url}
                        >
                          <span className={styles.profileLinkChipLabel}>
                            <MdOutlinePublic />
                            {linkLabel}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                ) : null}

                {locationLabel ? (
                  <div className={styles.locationLine}>
                    <MdEditLocationAlt />
                    <span>{locationLabel}</span>
                  </div>
                ) : null}

                {isOwner ? (
                  <div className={styles.ownerActionRow}>
                    <div className={styles.profileStoryActionRow}>
                    <button
                      type="button"
                      className={styles.storyUploadButton}
                      onClick={() => setStoryComposerOpen((prev) => !prev)}
                    >
                      {storyComposerOpen
                        ? "Close composer"
                        : hasActiveStory
                          ? "Create new story"
                          : "Create story"}
                    </button>
                    </div>

                    {!isSmallScreen ? (
                      <div className={styles.actionsRow}>
                        <div className={styles.ownerTools}>
                          <EditProfileInfo
                            Icon={FaUserEdit}
                            className={styles.editProfileBtn}
                          />
                        </div>

                        <button
                          type="button"
                          className={styles.creatorBtn}
                          onClick={handleCreatorModeToggle}
                          disabled={loading}
                        >
                          creator
                          <span className={styles.creatorIndicator}>
                            {creatorActive ? "✓" : "x"}
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {renderVisitorRelationshipAction()}
                    <div className={styles.viewerNote}>
                      Only information this member chose to share is visible here.
                    </div>
                  </>
                )}
              </div>
            </div>

            {isOwner && !isSmallScreen ? (
              <aside className={styles.summaryColumn}>
                {profileCompletion < 100 ? (
                  <div className={styles.completionCard}>
                    <div className={styles.panelHeader}>
                      <h2>Profile strength</h2>
                      <span>{profileCompletion}% complete</span>
                    </div>

                    <div className={styles.progressTrack} aria-hidden="true">
                      <span
                        className={styles.progressFill}
                        style={{
                          width: `${profileCompletion}%`,
                          flexBasis: `${profileCompletion}%`,
                        }}
                      />
                      <span
                        className={styles.progressRest}
                        style={{
                          width: `${profileCompletionRemainder}%`,
                          flexBasis: `${profileCompletionRemainder}%`,
                        }}
                      />
                    </div>

                    <p className={styles.completionCopy}>
                      Add more details, talents, and profile media to make the
                      page feel richer and easier to trust.
                    </p>
                  </div>
                ) : null}

                <ul className={styles.stats}>
                  {summaryStats.map((stat) => (
                    <li key={stat.label}>
                      <div className={styles.statCardHeaderDesktop}>
                        <span>{stat.label}</span>
                      </div>
                      <strong>{stat.value}</strong>
                      <small>{stat.caption}</small>
                    </li>
                  ))}
                </ul>
              </aside>
            ) : null}
          </div>

          {isOwner && !isSmallScreen ? (
            <section className={styles.gridLayout}>
              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2>About</h2>
                  <div className={styles.panelHeaderMeta}>
                    <span>{bioItems.length || 0} lines</span>
                  </div>
                </div>

                {bioItems.length > 0 ? (
                  <div className={styles.bioSection}>
                    {bioItems.map((line, index) => (
                      <p key={`${line}-${index}`}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <div className={styles.placeholderBox}>
                    Add a bio so people can understand what you are about.
                  </div>
                )}
              </article>

              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2>Details</h2>
                  <div className={styles.panelHeaderMeta}>
                    <span>Account info</span>
                  </div>
                </div>

                <div className={styles.detailsGrid}>
                  {detailRows.map((detail) => (
                    <div className={styles.detailCard} key={detail.label}>
                      <span className={styles.detailIcon}>{detail.icon}</span>
                      <div>
                        <small>{detail.label}</small>
                        <p>{detail.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2>Talents/Skills</h2>
                  <div className={styles.panelHeaderMeta}>
                    <span>{talentItems.length || 0} listed</span>
                  </div>
                </div>

                {talentItems.length > 0 ? (
                  <div className={styles.tagGroup}>
                    {talentItems.map((talent) => (
                      <span key={talent} className={styles.tag}>
                        <MdOutlineAutoAwesome />
                        {formatDisplayValue(talent)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={styles.placeholderBox}>
                    Highlight your strengths here so your profile feels alive.
                  </div>
                )}
              </article>

              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h2>Profile status</h2>
                  <span>Quick overview</span>
                </div>

                <div className={styles.statusStack}>
                  <div className={styles.statusRow}>
                    <span>Avatar</span>
                    <strong>{profileUser.avatar ? "Uploaded" : "Missing"}</strong>
                  </div>
                  <div className={styles.statusRow}>
                    <span>Banner</span>
                    <strong>{profileUser.banner ? "Uploaded" : "Missing"}</strong>
                  </div>
                  <div className={styles.statusRow}>
                    <span>Location</span>
                    <strong>
                      {locationItems.length > 0 ? "Added" : "Missing"}
                    </strong>
                  </div>
                  <div className={styles.statusRow}>
                    <span>Creator mode</span>
                    <strong>{creatorActive ? "Active" : "Inactive"}</strong>
                  </div>
                </div>
              </article>
            </section>
          ) : null}

          {hasActiveStory || (isOwner && ownerStoryCards.length > 0) ? (
            <section className={styles.storyPanel}>
              <div className={styles.storyPanelHeader}>
                <div>
                  <p className={styles.storyEyebrow}>
                    {isOwner ? "Your story" : `${profileUser.username}'s story`}
                  </p>
                  {!hasActiveStory ? <h2>Share a story</h2> : null}
                </div>
              </div>

              {!isOwner && hasActiveStory ? (
                <div className={styles.storyRailSection}>
                  <StoryRail
                    items={visitorStoryRailItems}
                    onSelect={handleOpenProfileStory}
                    getItemLabel={() =>
                      `Open ${profileUser.username || "user"} story`
                    }
                  />

                  <p className={styles.storyRailHint}>
                    This story stays visible until {storyExpiryLabel} and then
                    disappears automatically.
                  </p>
                </div>
              ) : null}

              {isOwner && ownerStoryCards.length > 0 ? (
                <div className={styles.storyHistorySection}>
                  <div className={styles.storyHistoryHeader}>
                    <h3>Recent stories</h3>
                    <span>
                      {ownerStoryCards.length}{" "}
                      {ownerStoryCards.length === 1 ? "story" : "stories"}
                    </span>
                  </div>

                  <StoryRail
                    items={ownerStoryRailItems}
                    onSelect={(item) => handleOpenOwnerStoryDetail(item?.id)}
                    getItemLabel={(item, index) =>
                      `Open your story ${index + 1}${item?.subtitle ? `, ${item.subtitle}` : ""}`
                    }
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          {profileUser ? (
            <section className={styles.uploadsSection}>
              <section className={styles.uploadsPanel}>
                <div
                  className={`${styles.uploadsPanelHeader} ${
                    hasFloatingOptions ? styles.uploadsPanelHeaderWithControls : ""
                  }`}
                >
                  <div className={styles.contentNavStack}>
                    <div className={styles.contentNav}>
                      <button
                        type="button"
                        className={`${styles.contentNavButton} ${
                          selectedContentView === "all" ? styles.contentNavButtonActive : ""
                        }`}
                        onClick={() => {
                          setHasChosenContentView(true);
                          setSelectedContentView("all");
                        }}
                      >
                        <strong>All</strong>
                      </button>
                      <button
                        type="button"
                        className={`${styles.contentNavButton} ${
                          selectedContentView === "photos" ? styles.contentNavButtonActive : ""
                        }`}
                        onClick={() => {
                          setHasChosenContentView(true);
                          setSelectedContentView("photos");
                        }}
                      >
                        <strong>Photos</strong>
                      </button>
                      <button
                        type="button"
                        className={`${styles.contentNavButton} ${
                          selectedContentView === "videos" ? styles.contentNavButtonActive : ""
                        }`}
                        onClick={() => {
                          setHasChosenContentView(true);
                          setSelectedContentView("videos");
                        }}
                      >
                        <strong>Videos</strong>
                      </button>
                      <button
                        type="button"
                        className={`${styles.contentNavButton} ${
                          selectedContentView === "playlists"
                            ? styles.contentNavButtonActive
                            : ""
                        }`}
                        onClick={() => {
                          setHasChosenContentView(true);
                          setSelectedContentView("playlists");
                        }}
                      >
                        <strong>Playlists</strong>
                      </button>
                    </div>
                    <div
                      className={`${styles.uploadsControlsShelf} ${
                        hasFloatingOptions ? styles.uploadsControlsShelfActive : ""
                      }`}
                      aria-hidden={!hasFloatingOptions}
                    >
                      {hasFloatingOptions ? (
                        <div className={styles.uploadsControls}>
                          {selectedContentView === "photos" ? (
                            <div className={styles.contentSubnavBar}>
                              <button
                                type="button"
                                className={`${styles.contentSubnavButton} ${
                                  selectedPhotoView === "all"
                                    ? styles.contentSubnavButtonActive
                                    : ""
                                }`}
                                onClick={() => {
                                  setHasChosenPhotoView(true);
                                  setSelectedPhotoView("all");
                                }}
                              >
                                <strong>All</strong>
                              </button>
                              <button
                                type="button"
                                className={`${styles.contentSubnavButton} ${
                                  selectedPhotoView === "raw"
                                    ? styles.contentSubnavButtonActive
                                    : ""
                                }`}
                                onClick={() => {
                                  setHasChosenPhotoView(true);
                                  setSelectedPhotoView("raw");
                                }}
                              >
                                <strong>Raw photos</strong>
                              </button>
                              <button
                                type="button"
                                className={`${styles.contentSubnavButton} ${
                                  selectedPhotoView === "reels"
                                    ? styles.contentSubnavButtonActive
                                    : ""
                                }`}
                              onClick={() => {
                                  setHasChosenPhotoView(true);
                                  setSelectedPhotoView("reels");
                                }}
                              >
                                <strong>Photo Shorts</strong>
                              </button>
                            </div>
                          ) : null}

                          {selectedContentView === "videos" ? (
                            <div className={styles.contentSubnavBar}>
                              <button
                                type="button"
                                className={`${styles.contentSubnavButton} ${
                                  selectedVideoView === "all"
                                    ? styles.contentSubnavButtonActive
                                    : ""
                                }`}
                                onClick={() => {
                                  setHasChosenVideoView(true);
                                  setSelectedVideoView("all");
                                }}
                              >
                                <strong>All</strong>
                              </button>
                              <button
                                type="button"
                                className={`${styles.contentSubnavButton} ${
                                  selectedVideoView === "longs"
                                    ? styles.contentSubnavButtonActive
                                    : ""
                                }`}
                                onClick={() => {
                                  setHasChosenVideoView(true);
                                  setSelectedVideoView("longs");
                                }}
                              >
                                <strong>Longs</strong>
                              </button>
                              <button
                                type="button"
                                className={`${styles.contentSubnavButton} ${
                                  selectedVideoView === "shorts"
                                    ? styles.contentSubnavButtonActive
                                    : ""
                                }`}
                                onClick={() => {
                                  setHasChosenVideoView(true);
                                  setSelectedVideoView("shorts");
                                }}
                              >
                                <strong>Shorts</strong>
                              </button>
                            </div>
                          ) : null}

                          {selectedContentView === "playlists" && playlists.length > 0 ? (
                            <div className={styles.playlistControlsStack}>
                              <div className={styles.playlistOptionsRow}>
                                {playlists.map((playlist) => (
                                  <button
                                    type="button"
                                    key={playlist._id}
                                    className={`${styles.playlistOptionButton} ${
                                      selectedPlaylist?._id === playlist._id
                                        ? styles.playlistOptionButtonActive
                                        : ""
                                    }`}
                                    onClick={() => setSelectedPlaylistId(playlist._id)}
                                  >
                                    {formatDisplayValue(playlist.title) || "Untitled playlist"}
                                  </button>
                                ))}
                              </div>
                              {isOwner && selectedPlaylist ? (
                                <div className={styles.playlistVisibilityRow}>
                                  <span className={styles.playlistVisibilityStatus}>
                                    {selectedPlaylist.isPublic ? (
                                      <>
                                        <MdOutlinePublic size={16} />
                                        Public
                                      </>
                                    ) : (
                                      <>
                                        <MdLockOutline size={16} />
                                        Private
                                      </>
                                    )}
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.playlistVisibilityButton}
                                    onClick={handlePlaylistVisibilityToggle}
                                    disabled={playlistVisibilitySavingId === selectedPlaylist._id}
                                  >
                                    {playlistVisibilitySavingId === selectedPlaylist._id
                                      ? "Saving..."
                                      : selectedPlaylist.isPublic
                                        ? "Make private"
                                        : "Make public"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className={styles.uploadsCanvas}>
                  {visitorUploadsInitialLoading ? (
                <div
                  className={styles.visitorUploadsGridSkeleton}
                  aria-label="Loading profile posts"
                >
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={`visitor-content-skeleton-${index}`}
                      className={styles.visitorUploadCardSkeleton}
                    >
                      <div
                        className={`${styles.visitorUploadThumbSkeleton} ${styles.profileSkeletonBlock}`}
                      />
                      <div
                        className={`${styles.visitorUploadLineSkeleton} ${styles.profileSkeletonBlock}`}
                      />
                      <div
                        className={`${styles.visitorUploadLineSkeletonShort} ${styles.profileSkeletonBlock}`}
                      />
                    </div>
                  ))}
                </div>
              ) : uploadedPostsLoading || (selectedContentView === "playlists" && playlistsLoading) ? (
                <div className={styles.storyPlaceholder}>
                  {selectedContentView === "playlists"
                    ? "Loading playlists..."
                    : isOwner
                      ? "Loading your uploaded posts..."
                      : "Loading profile posts..."}
                </div>
              ) : selectedContentView === "playlists" && playlistsError ? (
                <div className={styles.storyPlaceholder}>{playlistsError}</div>
              ) : selectedContentView === "playlists" && playlists.length === 0 ? (
                <div className={styles.storyPlaceholder}>
                  {isOwner
                    ? "Create playlists from your dashboard and they will appear here."
                    : "This profile has not published any playlists yet."}
                </div>
              ) : uploadedPostsError ? (
                <div className={styles.storyPlaceholder}>{uploadedPostsError}</div>
              ) : selectedContentView === "all" && allUploadedPosts.length === 0 ? (
                <div className={styles.storyPlaceholder}>
                  {isOwner ? "No posts yet." : "This profile has not uploaded posts yet."}
                </div>
              ) : selectedContentView === "photos" && selectedPhotoView === "all" && allPhotoPosts.length === 0 ? (
                <div className={styles.storyPlaceholder}>
                  {isOwner ? "No photos yet." : "This profile has not uploaded photos yet."}
                </div>
              ) : selectedContentView === "photos" && selectedPhotoView === "raw" && rawPhotoPosts.length === 0 ? (
                <div className={styles.storyPlaceholder}>
                  {isOwner ? "No raw photos yet." : "This profile has not uploaded raw photos yet."}
                </div>
              ) : selectedContentView === "photos" && selectedPhotoView === "reels" && reelsPhotoPosts.length === 0 ? (
                <div className={styles.storyPlaceholder}>
                  {isOwner
                    ? "No photo shorts yet."
                    : "This profile has not uploaded photo shorts yet."}
                </div>
              ) : selectedContentView === "videos" && selectedVideoView === "all" && allVideoPosts.length === 0 ? (
                <div className={styles.storyPlaceholder}>
                  {isOwner ? "No videos yet." : "This profile has not uploaded videos yet."}
                </div>
              ) : selectedContentView === "videos" && selectedVideoView === "shorts" && shortVideoPosts.length === 0 ? (
                <div className={styles.storyPlaceholder}>
                  {isOwner
                    ? "No short videos yet."
                    : "This profile has not uploaded short videos yet."}
                </div>
              ) : selectedContentView === "videos" && selectedVideoView === "longs" && longVideoPosts.length === 0 ? (
                <div className={styles.storyPlaceholder}>
                  {isOwner ? "No long videos yet." : "This profile has not uploaded long videos yet."}
                </div>
              ) : selectedContentView === "playlists" && playlistVideos.length === 0 ? (
                <div className={styles.storyPlaceholder}>
                  This playlist does not have any posts yet.
                </div>
                  ) : (
                    <div className={styles.uploadsGrid}>
                      {(selectedContentView === "all"
                        ? allUploadedPosts
                        : selectedContentView === "photos"
                        ? selectedPhotoView === "all"
                          ? allPhotoPosts
                          : selectedPhotoView === "reels"
                          ? reelsPhotoPosts
                          : rawPhotoPosts
                        : selectedContentView === "videos"
                          ? selectedVideoView === "all"
                            ? allVideoPosts
                            : selectedVideoView === "longs"
                            ? longVideoPosts
                            : shortVideoPosts
                            : playlistVideos
                      ).map((post) => (
                        <button
                          type="button"
                          key={post._id}
                          className={styles.uploadPostCard}
                          onClick={() => handleUploadedPostSelect(post)}
                        >
                          <div className={styles.uploadPostFrame}>
                            {post.postType === "video" ? (
                              <>
                                <video
                                  src={post.url}
                                  className={styles.uploadPostThumb}
                                  muted
                                  preload="metadata"
                                />
                                <button
                                  type="button"
                                  className={styles.uploadPostPlayButton}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleUploadedPostSelect(post);
                                  }}
                                  aria-label={`Play ${post.title || "uploaded video"}`}
                                >
                                  <MdPlayArrow size={26} />
                                </button>
                              </>
                            ) : (
                              <img
                                src={post.url}
                                alt={post.title || "Uploaded post"}
                                className={styles.uploadPostThumb}
                              />
                            )}
                          </div>

                          <div className={styles.uploadPostMeta}>
                            <div className={styles.uploadPostMetaTop}>
                              <span>{formatDisplayValue(post.postType) || "Post"}</span>
                              <span>
                                {formatDisplayValue(post.contentFormat) ||
                                  (selectedContentView === "playlists" ? "Playlist" : "Standard")}
                              </span>
                            </div>
                            <strong>{formatDisplayValue(post.title) || "Untitled post"}</strong>
                            <p>{formatDisplayValue(post.category) || "No category"}</p>
                            <div className={styles.uploadPostStats}>
                              {shouldShowViewCount(post) ? (
                                <span>{post.viewCount || 0} views</span>
                              ) : null}
                              {isOwner ? (
                                <button
                                  type="button"
                                  className={styles.uploadPostStatButton}
                                  onClick={(event) => handleOpenLikesViewer(event, post)}
                                >
                                  {post.likeCount || 0} likes
                                </button>
                              ) : (
                                <span>{post.likeCount || 0} likes</span>
                              )}
                              <span>{post.commentCount || 0} comments</span>
                              <span>{post.shareCount || 0} shares</span>
                            </div>
                            <div className={styles.uploadPostActions}>
                              {isOwner ? (
                                <button
                                  type="button"
                                  className={styles.uploadPostActionButton}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenPlaylistPicker(post);
                                  }}
                                >
                                  Add to playlist
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </section>
          ) : null}

        </div>

        {isOwner && isSmallScreen ? (
          <div
            className={`${styles.infoModal} ${showInfo ? styles.infoModalOpen : ""}`}
            onClick={() => setShowInfo(false)}
          >
            <div
              className={styles.infoSheet}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.infoSheetHeader}>
                <div>
                  <p>Profile info</p>
                  <h2>Quick details</h2>
                </div>
                <button
                  type="button"
                  className={styles.infoSheetClose}
                  onClick={() => setShowInfo(false)}
                  aria-label="Close profile info"
                >
                  <MdClose size={20} />
                </button>
              </div>

              <div className={styles.infoSheetBody}>
                {profileCompletion < 100 ? (
                  <div className={styles.completionCard}>
                    <div className={styles.panelHeader}>
                      <h2>Profile strength</h2>
                      <span>{profileCompletion}% complete</span>
                    </div>

                    <div className={styles.progressTrack} aria-hidden="true">
                      <span
                        className={styles.progressFill}
                        style={{
                          width: `${profileCompletion}%`,
                          flexBasis: `${profileCompletion}%`,
                        }}
                      />
                      <span
                        className={styles.progressRest}
                        style={{
                          width: `${profileCompletionRemainder}%`,
                          flexBasis: `${profileCompletionRemainder}%`,
                        }}
                      />
                    </div>

                    <p className={styles.completionCopy}>
                      Add more details, talents, and profile media to make the
                      page feel richer and easier to trust.
                    </p>
                  </div>
                ) : null}

                <ul className={styles.stats}>
                  {summaryStats.map((stat) => (
                    <li
                      key={stat.label}
                      className={stat.editField ? styles.editableInfoCard : ""}
                    >
                      {renderOwnerEditButton(
                        stat.editField,
                        `Edit ${stat.label}`,
                      )}
                      <span>{stat.label}</span>
                      <strong>{stat.value}</strong>
                      <small>{stat.caption}</small>
                    </li>
                  ))}
                </ul>

                <section className={styles.gridLayout}>
                  <article className={styles.panel}>
                    <div className={styles.panelHeader}>
                      <h2>About</h2>
                      <div className={styles.panelHeaderMeta}>
                        <span>{bioItems.length || 0} lines</span>
                        {renderOwnerEditButton("bio", "Edit About")}
                      </div>
                    </div>

                    {bioItems.length > 0 ? (
                      <div className={styles.bioSection}>
                        {bioItems.map((line, index) => (
                          <p key={`${line}-${index}`}>{line}</p>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.placeholderBox}>
                        Add a bio so people can understand what you are about.
                      </div>
                    )}
                  </article>

                  <article className={styles.panel}>
                    <div className={styles.panelHeader}>
                      <h2>Details</h2>
                      <div className={styles.panelHeaderMeta}>
                        <span>Account info</span>
                        {renderOwnerEditButton("profession", "Edit Details")}
                      </div>
                    </div>

                    <div className={styles.detailsGrid}>
                      {detailRows.map((detail) => (
                        <div className={styles.detailCard} key={detail.label}>
                          <span className={styles.detailIcon}>{detail.icon}</span>
                          <div>
                            <small>{detail.label}</small>
                            <p>{detail.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className={styles.panel}>
                    <div className={styles.panelHeader}>
                      <h2>Talents/Skills</h2>
                      <div className={styles.panelHeaderMeta}>
                        <span>{talentItems.length || 0} listed</span>
                        {renderOwnerEditButton("talent", "Edit Talents and Skills")}
                      </div>
                    </div>

                    {talentItems.length > 0 ? (
                      <div className={styles.tagGroup}>
                        {talentItems.map((talent) => (
                          <span key={talent} className={styles.tag}>
                            <MdOutlineAutoAwesome />
                            {formatDisplayValue(talent)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.placeholderBox}>
                        Highlight your strengths here so your profile feels alive.
                      </div>
                    )}
                  </article>

                  <article className={styles.panel}>
                    <div className={styles.panelHeader}>
                      <h2>Profile status</h2>
                      <span>Quick overview</span>
                    </div>

                    <div className={styles.statusStack}>
                      <div className={styles.statusRow}>
                        <span>Avatar</span>
                        <strong>
                          {profileUser.avatar ? "Uploaded" : "Missing"}
                        </strong>
                      </div>
                      <div className={styles.statusRow}>
                        <span>Banner</span>
                        <strong>
                          {profileUser.banner ? "Uploaded" : "Missing"}
                        </strong>
                      </div>
                      <div className={styles.statusRow}>
                        <span>Location</span>
                        <strong>
                          {locationItems.length > 0 ? "Added" : "Missing"}
                        </strong>
                      </div>
                      <div className={styles.statusRow}>
                        <span>Creator mode</span>
                        <strong>{creatorActive ? "Active" : "Inactive"}</strong>
                      </div>
                    </div>
                  </article>
                </section>
              </div>
            </div>
          </div>
        ) : null}
        </section>
      </main>

      {storyComposerOverlay}

      {activeInlineVideoOverlay}

      {playlistPickerOverlay}
      {likesViewerOverlay}
      <ImageCropperModal
        open={imageCropState.open}
        file={imageCropState.file}
        variant={imageCropState.variant}
        submitting={loading && ["avatar", "banner"].includes(uploadTarget || "")}
        onCancel={handleCloseImageCropper}
        onConfirm={handleConfirmImageCrop}
      />

      <AuthAccessPrompt
        open={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
        title="Log in to interact with this profile"
        description="Public visitors can browse profiles, but adding friends and responding to requests needs an account so the relationship can be saved."
      />

      <StoryViewerModal
        open={storyViewerOpen}
        stories={storyViewerStories}
        initialIndex={storyViewerInitialIndex}
        onClose={() => setStoryViewerOpen(false)}
        isAuthenticated={Boolean(user)}
        currentUserId={user?._id || ""}
        onRequireAuth={(message) => {
          if (message) {
            toast.info(message);
          }

          if (!user) {
            setShowAuthPrompt(true);
          }
        }}
        onStoriesChange={(nextStories) => {
          setStoryViewerStories(nextStories);

          const nextStory = nextStories[0]?.story;

          if (!nextStory || !isOwner) {
            return;
          }

          setViewedUser((prev) => {
            if (!prev) {
              return prev;
            }

            return {
              ...prev,
              storyLikeCount: nextStory.likeCount,
            };
          });
        }}
      />
    </>
  );
};
