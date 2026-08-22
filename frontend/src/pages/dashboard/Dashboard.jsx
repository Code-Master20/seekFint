import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { NavLink, useNavigate } from "react-router-dom";
import {
  MdLockReset,
  MdLogout,
  MdOutlineOndemandVideo,
  MdOutlinePlaylistPlay,
  MdOutlineWatchLater,
  MdRefresh,
} from "react-icons/md";
import { toast } from "react-toastify";

import styles from "./Dashboard.module.css";
import { EmailUpdate } from "../controlls/emailUpdate/EmailUpdate";

import { usePageMetadata } from "../../hooks/usePageMetadata";
import api from "../../lib/api";
import { logOut } from "../../store/auth/authThunks";

const DASHBOARD_CACHE_TTL_MS = 60 * 1000;

const dashboardCache = new Map();

const initialPlaylistForm = {
  title: "",
  description: "",
  selectedVideoIds: [],
};

const formatLabel = (value) => {
  if (!value) {
    return "Uncategorized";
  }

  return `${value}`
    .split(" ")
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
};

const groupVideosByCategory = (posts) =>
  posts.reduce((accumulator, post) => {
    const category = post.category || "uncategorized";

    if (!accumulator[category]) {
      accumulator[category] = [];
    }

    accumulator[category].push(post);

    return accumulator;
  }, {});

const formatDuration = (seconds) => {
  const totalSeconds = Math.max(
    0,
    Math.round(Number(seconds) || 0),
  );

  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return `${minutes}:${`${remainder}`.padStart(2, "0")}`;
};

const DashboardSummarySkeleton = () =>
  Array.from({ length: 5 }).map((_, index) => (
    <article
      key={`summary-skeleton-${index}`}
      className={`${styles.summaryCard} ${styles.skeletonBlock}`}
    >
      <span className={styles.skeletonTextShort} />
      <strong className={styles.skeletonTextMedium} />
      <small className={styles.skeletonTextLong} />
    </article>
  ));

const DashboardPlaylistSkeleton = ({ count = 4 }) =>
  Array.from({ length: count }).map((_, index) => (
    <div
      key={`playlist-skeleton-${index}`}
      className={`${styles.playlistOption} ${styles.skeletonBlock}`}
    >
      <span className={styles.skeletonCheckbox} />

      <div className={styles.skeletonMetaStack}>
        <span className={styles.skeletonTextMedium} />
        <span className={styles.skeletonTextShort} />
      </div>
    </div>
  ));

const DashboardVideoWorkspaceSkeleton = () => (
  <>
    <div className={styles.categoryFilterRow}>
      {Array.from({ length: 4 }).map((_, index) => (
        <span
          key={`category-skeleton-${index}`}
          className={`${styles.categoryChip} ${styles.skeletonChip}`}
        />
      ))}
    </div>

    <div className={styles.videoGroupStack}>
      {Array.from({ length: 2 }).map(
        (_, groupIndex) => (
          <section
            key={`video-group-skeleton-${groupIndex}`}
            className={`${styles.videoGroup} ${styles.skeletonBlock}`}
          >
            <div className={styles.videoGroupHeader}>
              <span className={styles.skeletonTextMedium} />
              <span className={styles.skeletonTextShort} />
            </div>

            <div className={styles.videoList}>
              {Array.from({ length: 3 }).map(
                (_, cardIndex) => (
                  <article
                    key={`video-card-skeleton-${groupIndex}-${cardIndex}`}
                    className={`${styles.videoCard} ${styles.skeletonBlock}`}
                  >
                    <div
                      className={`${styles.videoThumbFrame} ${styles.skeletonFrame}`}
                    />

                    <div className={styles.videoBody}>
                      <div
                        className={styles.skeletonMetaStack}
                      >
                        <span
                          className={
                            styles.skeletonTextMedium
                          }
                        />

                        <span
                          className={
                            styles.skeletonTextLong
                          }
                        />
                      </div>

                      <div className={styles.inlineForm}>
                        <span
                          className={`${styles.skeletonInput} ${styles.skeletonBlock}`}
                        />

                        <span
                          className={`${styles.inlineAction} ${styles.skeletonButton}`}
                        />
                      </div>
                    </div>
                  </article>
                ),
              )}
            </div>
          </section>
        ),
      )}
    </div>
  </>
);

const DashboardSavedListSkeleton = ({ count = 3 }) => (
  <div className={styles.savedList}>
    {Array.from({ length: count }).map((_, index) => (
      <article
        key={`saved-skeleton-${index}`}
        className={`${styles.savedCard} ${styles.skeletonBlock}`}
      >
        <div
          className={`${styles.savedMeta} ${styles.skeletonMetaStack}`}
        >
          <span className={styles.skeletonTextMedium} />
          <span className={styles.skeletonTextLong} />
          <span className={styles.skeletonTextShort} />
        </div>

        <span
          className={`${styles.inlineAction} ${styles.skeletonButton}`}
        />
      </article>
    ))}
  </div>
);

const DashboardRecentPostsSkeleton = ({ count = 4 }) => (
  <div className={styles.recentPostGrid}>
    {Array.from({ length: count }).map((_, index) => (
      <article
        key={`recent-post-skeleton-${index}`}
        className={`${styles.recentPostCard} ${styles.skeletonBlock}`}
      >
        <div
          className={`${styles.recentPostFrame} ${styles.skeletonFrame}`}
        />

        <div
          className={`${styles.recentPostMeta} ${styles.skeletonMetaStack}`}
        >
          <span className={styles.skeletonTextMedium} />
          <span className={styles.skeletonTextShort} />
          <span className={styles.skeletonTextLong} />
        </div>
      </article>
    ))}
  </div>
);

export const Dashboard = () => {
  usePageMetadata({
    title: "Owner dashboard",
    description:
      "Manage profile-owner tools, account controls, and your video workspace.",
    robots: "noindex, nofollow",
  });

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { user, loading } = useSelector(
    (state) => state.auth,
  );

  const [ownerPosts, setOwnerPosts] = useState([]);
  const [videoLibrary, setVideoLibrary] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [watchLaterVideos, setWatchLaterVideos] =
    useState([]);
  const [videoCategories, setVideoCategories] =
    useState([]);

  const [libraryLoading, setLibraryLoading] =
    useState(true);

  const [libraryError, setLibraryError] = useState("");

  const [selectedCategory, setSelectedCategory] =
    useState("all");

  const [categoryDrafts, setCategoryDrafts] = useState(
    {},
  );

  const [savingCategoryId, setSavingCategoryId] =
    useState("");

  const [watchLaterBusyId, setWatchLaterBusyId] =
    useState("");

  const [playlistForm, setPlaylistForm] = useState(
    initialPlaylistForm,
  );

  const [editingPlaylistId, setEditingPlaylistId] =
    useState("");

  const [playlistLoading, setPlaylistLoading] =
    useState(false);

  const groupedVideos = groupVideosByCategory(
    selectedCategory === "all"
      ? videoLibrary
      : videoLibrary.filter(
          (post) =>
            (post.category || "uncategorized") ===
            selectedCategory,
        ),
  );

  const dashboardCacheKey = user?._id
    ? `dashboard:${user._id}`
    : "";

  const applyDashboardPayload = (payload) => {
    const nextOwnerPosts = Array.isArray(
      payload?.ownerPosts,
    )
      ? payload.ownerPosts
      : [];

    const nextPosts = Array.isArray(
      payload?.videoLibrary,
    )
      ? payload.videoLibrary
      : [];

    const nextCategories = Array.isArray(
      payload?.videoCategories,
    )
      ? payload.videoCategories
      : [];

    const nextWatchLater = Array.isArray(
      payload?.watchLaterVideos,
    )
      ? payload.watchLaterVideos
      : [];

    const nextPlaylists = Array.isArray(
      payload?.playlists,
    )
      ? payload.playlists
      : [];

    setOwnerPosts(nextOwnerPosts);
    setVideoLibrary(nextPosts);
    setVideoCategories(nextCategories);
    setWatchLaterVideos(nextWatchLater);
    setPlaylists(nextPlaylists);

    setCategoryDrafts(
      nextPosts.reduce((accumulator, post) => {
        accumulator[post._id] =
          post.category &&
          post.category !== "uncategorized"
            ? post.category
            : "";

        return accumulator;
      }, {}),
    );
  };

  const loadDashboardData = async () => {
    try {
      const cachedEntry = dashboardCacheKey
        ? dashboardCache.get(dashboardCacheKey)
        : null;

      const hasFreshCache =
        cachedEntry &&
        Date.now() - cachedEntry.updatedAt <
          DASHBOARD_CACHE_TTL_MS;

      if (hasFreshCache) {
        applyDashboardPayload(cachedEntry.payload);
        setLibraryLoading(false);
      } else {
        setLibraryLoading(true);
      }

      setLibraryError("");

      const [
        postsResponse,
        libraryResponse,
        watchLaterResponse,
        playlistsResponse,
      ] = await Promise.all([
        api.get("/user/posts"),
        api.get("/user/videos"),
        api.get("/user/watch-later"),
        api.get("/user/playlists"),
      ]);

      const libraryPayload =
        libraryResponse.data?.data || {};

      const payload = {
        ownerPosts: Array.isArray(
          postsResponse.data?.data,
        )
          ? postsResponse.data.data
          : [],

        videoLibrary: Array.isArray(
          libraryPayload.posts,
        )
          ? libraryPayload.posts
          : [],

        videoCategories: Array.isArray(
          libraryPayload.categories,
        )
          ? libraryPayload.categories
          : [],

        watchLaterVideos: Array.isArray(
          watchLaterResponse.data?.data,
        )
          ? watchLaterResponse.data.data
          : [],

        playlists: Array.isArray(
          playlistsResponse.data?.data,
        )
          ? playlistsResponse.data.data
          : [],
      };

      applyDashboardPayload(payload);

      if (dashboardCacheKey) {
        dashboardCache.set(dashboardCacheKey, {
          updatedAt: Date.now(),
          payload,
        });
      }
    } catch (error) {
      setLibraryError(
        error.response?.data?.message ||
          "Dashboard data could not be loaded.",
      );
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [dashboardCacheKey]);

  useEffect(() => {
    if (
      !dashboardCacheKey ||
      libraryLoading ||
      libraryError
    ) {
      return;
    }

    dashboardCache.set(dashboardCacheKey, {
      updatedAt: Date.now(),
      payload: {
        ownerPosts,
        videoLibrary,
        videoCategories,
        watchLaterVideos,
        playlists,
      },
    });
  }, [
    dashboardCacheKey,
    libraryError,
    libraryLoading,
    ownerPosts,
    playlists,
    videoCategories,
    videoLibrary,
    watchLaterVideos,
  ]);

  const handleLogout = async () => {
    const resultAction = await dispatch(logOut());

    if (logOut.rejected.match(resultAction)) {
      toast.error(
        resultAction.payload?.message ||
          "Logout failed",
      );

      return;
    }

    localStorage.removeItem("user");
    localStorage.removeItem("tries");
    localStorage.removeItem("timeRemains");
    localStorage.removeItem("otpResetTrigger");
    localStorage.removeItem("tryPassReset");
    localStorage.removeItem("tryRemains");
    localStorage.removeItem("runCount");

    toast.success(
      resultAction.payload?.message || "Logged out",
    );

    navigate("/", { replace: true });
  };

  const handleCategoryDraftChange = (
    postId,
    value,
  ) => {
    setCategoryDrafts((prev) => ({
      ...prev,
      [postId]: value.trim().toLowerCase(),
    }));
  };

  const handleCategorySave = async (postId) => {
    setSavingCategoryId(postId);

    try {
      const response = await api.patch(
        `/user/videos/${postId}/category`,
        {
          category: categoryDrafts[postId] || "",
        },
      );

      const nextCategory =
        response.data?.data?.category ||
        "uncategorized";

      setVideoLibrary((prev) =>
        prev.map((post) =>
          post._id === postId
            ? {
                ...post,
                category: nextCategory,
              }
            : post,
        ),
      );

      const nextPosts = videoLibrary.map((post) =>
        post._id === postId
          ? {
              ...post,
              category: nextCategory,
            }
          : post,
      );

      const nextSummary = Object.entries(
        nextPosts.reduce(
          (accumulator, post) => {
            const categoryKey =
              post.category || "uncategorized";

            accumulator[categoryKey] =
              (accumulator[categoryKey] || 0) + 1;

            return accumulator;
          },
          {},
        ),
      ).map(([category, count]) => ({
        category,
        count,
      }));

      setVideoCategories(nextSummary);

      toast.success(
        response.data?.message ||
          "Video category updated",
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Video category update failed",
      );
    } finally {
      setSavingCategoryId("");
    }
  };

  const handleWatchLaterToggle = async (postId) => {
    setWatchLaterBusyId(postId);

    try {
      const response = await api.post(
        `/user/watch-later/${postId}`,
      );

      const isSaved = Boolean(
        response.data?.data?.savedToWatchLater,
      );

      if (isSaved) {
        const targetPost = videoLibrary.find(
          (post) => post._id === postId,
        );

        if (targetPost) {
          setWatchLaterVideos((prev) =>
            prev.some(
              (post) => post._id === postId,
            )
              ? prev
              : [targetPost, ...prev],
          );
        }
      } else {
        setWatchLaterVideos((prev) =>
          prev.filter(
            (post) => post._id !== postId,
          ),
        );
      }

      toast.success(
        response.data?.message ||
          "Watch later updated",
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Watch later update failed",
      );
    } finally {
      setWatchLaterBusyId("");
    }
  };

  const handlePlaylistFieldChange = (event) => {
    const { name, value } = event.target;

    setPlaylistForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePlaylistVideoToggle = (postId) => {
    setPlaylistForm((prev) => ({
      ...prev,
      selectedVideoIds:
        prev.selectedVideoIds.includes(postId)
          ? prev.selectedVideoIds.filter(
              (item) => item !== postId,
            )
          : [
              ...prev.selectedVideoIds,
              postId,
            ],
    }));
  };

  const resetPlaylistForm = () => {
    setPlaylistForm(initialPlaylistForm);
    setEditingPlaylistId("");
  };

  const handlePlaylistEdit = (playlist) => {
    setEditingPlaylistId(playlist._id);

    setPlaylistForm({
      title: playlist.title || "",
      description: playlist.description || "",
      selectedVideoIds: Array.isArray(
        playlist.videos,
      )
        ? playlist.videos.map(
            (video) => video._id,
          )
        : [],
    });
  };

  const handlePlaylistSubmit = async (event) => {
    event.preventDefault();

    setPlaylistLoading(true);

    const payload = {
      title: playlistForm.title
        .trim()
        .toLowerCase(),

      description:
        playlistForm.description.trim(),

      videoPostIds:
        playlistForm.selectedVideoIds,
    };

    try {
      const response = editingPlaylistId
        ? await api.patch(
            `/user/playlists/${editingPlaylistId}`,
            payload,
          )
        : await api.post(
            "/user/playlists",
            payload,
          );

      const nextPlaylist =
        response.data?.data;

      if (editingPlaylistId) {
        setPlaylists((prev) =>
          prev.map((playlist) =>
            playlist._id ===
            editingPlaylistId
              ? nextPlaylist
              : playlist,
          ),
        );
      } else {
        setPlaylists((prev) => [
          nextPlaylist,
          ...prev,
        ]);
      }

      resetPlaylistForm();

      toast.success(
        response.data?.message ||
          "Playlist saved successfully",
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Playlist could not be saved",
      );
    } finally {
      setPlaylistLoading(false);
    }
  };

  const Navigate = useNavigate();


  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroActions}>
          <NavLink
            to="/profile"
            className={styles.secondaryAction}
          >
            Open profile
          </NavLink>

          <button
            type="button"
            className={styles.secondaryAction}
            onClick={loadDashboardData}
            disabled={libraryLoading}
          >
            <MdRefresh />
            Refresh
          </button>
        </div>
      </section>

      <section className={styles.summaryGrid}>
        {libraryLoading ? (
          <DashboardSummarySkeleton />
        ) : (
          <>
            <article className={styles.summaryCard} onClick={()=>Navigate("/emailupdate")}>
              <span>Current email</span>

              <strong>
                {user?.email || "Unavailable"}
              </strong>

              <small>
                Change your email using the email
                security panel below.
              </small>
            </article>

            <article className={styles.summaryCard}>
              <span>Your videos</span>

              <strong>
                {videoLibrary.length}
              </strong>

              <small>
                Grouped by category so you can
                organize them like a creator library.
              </small>
            </article>

            <article className={styles.summaryCard}>
              <span>Published posts</span>

              <strong>
                {ownerPosts.length}
              </strong>

              <small>
                Photo articles, photo reels, video
                reels, and long videos all count here.
              </small>
            </article>

            <article className={styles.summaryCard}>
              <span>Watch later</span>

              <strong>
                {watchLaterVideos.length}
              </strong>

              <small>
                Saved videos are collected here for
                your later viewing queue.
              </small>
            </article>

            <article className={styles.summaryCard}>
              <span>Public playlists</span>

              <strong>
                {playlists.length}
              </strong>

              <small>
                These playlist shelves are visible to
                visitors on your profile.
              </small>
            </article>

            <article className={styles.summaryCard}>
              <span>Creator Pannel</span>

              <strong>
                last Video views : 600k
              </strong>

              <small>
                Click here to open creator pannel
              </small>
            </article>
          </>
        )}
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p>Account actions</p>
              <h2>Owner controls</h2>
            </div>
          </div>

          <div className={styles.actionStack}>
            <NavLink
              to="/reset-password"
              className={styles.primaryAction}
            >
              <MdLockReset />
              Reset password
            </NavLink>

            <button
              type="button"
              className={styles.primaryAction}
              onClick={handleLogout}
            >
              <MdLogout />
              {loading
                ? "Logging out..."
                : "Logout"}
            </button>
          </div>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p>Public playlists</p>
              <h2>
                Build creator-style video shelves
              </h2>
            </div>
          </div>

          <form
            className={styles.form}
            onSubmit={handlePlaylistSubmit}
          >
            <label className={styles.field}>
              <span>Playlist title</span>

              <input
                type="text"
                name="title"
                placeholder="frontend tutorials"
                value={playlistForm.title}
                onChange={
                  handlePlaylistFieldChange
                }
              />
            </label>

            <label className={styles.field}>
              <span>Description</span>

              <input
                type="text"
                name="description"
                placeholder="Short description for visitors"
                value={
                  playlistForm.description
                }
                onChange={
                  handlePlaylistFieldChange
                }
              />
            </label>

            <div className={styles.playlistPicker}>
              {libraryLoading ? (
                <DashboardPlaylistSkeleton />
              ) : videoLibrary.length === 0 ? (
                <div className={styles.emptyState}>
                  Add video posts first, then you
                  can arrange them into public
                  playlists.
                </div>
              ) : (
                videoLibrary.map((post) => (
                  <label
                    key={post._id}
                    className={
                      styles.playlistOption
                    }
                  >
                    <input
                      type="checkbox"
                      checked={playlistForm.selectedVideoIds.includes(
                        post._id,
                      )}
                      onChange={() =>
                        handlePlaylistVideoToggle(
                          post._id,
                        )
                      }
                    />

                    <div>
                      <strong>
                        {formatLabel(
                          post.title,
                        ) ||
                          "Untitled video"}
                      </strong>

                      <small>
                        {formatLabel(
                          post.category,
                        )}
                      </small>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className={styles.formFooter}>
              {editingPlaylistId ? (
                <button
                  type="button"
                  className={
                    styles.secondaryAction
                  }
                  onClick={resetPlaylistForm}
                >
                  Cancel edit
                </button>
              ) : null}

              <button
                type="submit"
                className={
                  styles.primarySubmit
                }
                disabled={
                  playlistLoading ||
                  !playlistForm.title.trim() ||
                  playlistForm.selectedVideoIds
                    .length === 0
                }
              >
                <MdOutlinePlaylistPlay />

                {playlistLoading
                  ? "Saving..."
                  : editingPlaylistId
                    ? "Update playlist"
                    : "Create playlist"}
              </button>
            </div>
          </form>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p>Video library</p>
              <h2>
                Separate videos category-wise
              </h2>
            </div>
          </div>

          {libraryLoading ? (
            <DashboardVideoWorkspaceSkeleton />
          ) : libraryError ? (
            <div className={styles.emptyState}>
              {libraryError}
            </div>
          ) : videoLibrary.length === 0 ? (
            <div className={styles.emptyState}>
              Your uploaded video posts will appear
              here once they exist.
            </div>
          ) : (
            <>
              <div
                className={
                  styles.categoryFilterRow
                }
              >
                <button
                  type="button"
                  className={`${styles.categoryChip} ${
                    selectedCategory === "all"
                      ? styles.categoryChipActive
                      : ""
                  }`}
                  onClick={() =>
                    setSelectedCategory("all")
                  }
                >
                  All videos
                </button>

                {videoCategories.map(
                  (entry) => (
                    <button
                      type="button"
                      key={entry.category}
                      className={`${styles.categoryChip} ${
                        selectedCategory ===
                        entry.category
                          ? styles.categoryChipActive
                          : ""
                      }`}
                      onClick={() =>
                        setSelectedCategory(
                          entry.category,
                        )
                      }
                    >
                      {formatLabel(
                        entry.category,
                      )}{" "}
                      ({entry.count})
                    </button>
                  ),
                )}
              </div>

              <div
                className={
                  styles.videoGroupStack
                }
              >
                {Object.entries(
                  groupedVideos,
                ).map(
                  ([category, posts]) => (
                    <section
                      key={category}
                      className={
                        styles.videoGroup
                      }
                    >
                      <div
                        className={
                          styles.videoGroupHeader
                        }
                      >
                        <h3>
                          {formatLabel(
                            category,
                          )}
                        </h3>

                        <span>
                          {posts.length} videos
                        </span>
                      </div>

                      <div
                        className={
                          styles.videoList
                        }
                      >
                        {posts.map((post) => (
                          <article
                            key={post._id}
                            className={
                              styles.videoCard
                            }
                          >
                            <div
                              className={
                                styles.videoThumbFrame
                              }
                            >
                              <video
                                src={post.url}
                                className={
                                  styles.videoThumb
                                }
                                muted
                              />
                            </div>

                            <div
                              className={
                                styles.videoBody
                              }
                            >
                              <div>
                                <strong>
                                  {formatLabel(
                                    post.title,
                                  ) ||
                                    "Untitled video"}
                                </strong>

                                <p>
                                  {post.description ||
                                    "Add a tighter category label when needed."}
                                </p>
                              </div>

                              <div
                                className={
                                  styles.inlineForm
                                }
                              >
                                <input
                                  type="text"
                                  placeholder="category name"
                                  value={
                                    categoryDrafts[
                                      post._id
                                    ] || ""
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    handleCategoryDraftChange(
                                      post._id,
                                      event
                                        .target
                                        .value,
                                    )
                                  }
                                />

                                <button
                                  type="button"
                                  className={
                                    styles.inlineAction
                                  }
                                  onClick={() =>
                                    handleCategorySave(
                                      post._id,
                                    )
                                  }
                                  disabled={
                                    savingCategoryId ===
                                    post._id
                                  }
                                >
                                  <MdOutlineOndemandVideo />

                                  {savingCategoryId ===
                                  post._id
                                    ? "Saving..."
                                    : "Save category"}
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ),
                )}
              </div>
            </>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p>Saved queue</p>
              <h2>Watch later</h2>
            </div>
          </div>

          {libraryLoading ? (
            <DashboardSavedListSkeleton />
          ) : watchLaterVideos.length === 0 ? (
            <div className={styles.emptyState}>
              Save a few videos to watch later and
              they will appear here.
            </div>
          ) : (
            <div className={styles.savedList}>
              {watchLaterVideos.map((post) => (
                <article
                  key={post._id}
                  className={styles.savedCard}
                >
                  <div
                    className={
                      styles.savedMeta
                    }
                  >
                    <strong>
                      {formatLabel(
                        post.title,
                      ) || "Saved video"}
                    </strong>

                    <p>
                      {post.user?.username
                        ? `By ${formatLabel(
                            post.user.username,
                          )}`
                        : "Video creator"}
                    </p>

                    <small>
                      {formatLabel(
                        post.category,
                      )}
                    </small>
                  </div>

                  <button
                    type="button"
                    className={
                      styles.inlineAction
                    }
                    onClick={() =>
                      handleWatchLaterToggle(
                        post._id,
                      )
                    }
                    disabled={
                      watchLaterBusyId ===
                      post._id
                    }
                  >
                    <MdOutlineWatchLater />

                    {watchLaterBusyId === post._id
                      ? "Updating..."
                      : "Remove"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p>Playlist library</p>
              <h2>
                What visitors will see
              </h2>
            </div>
          </div>

          {libraryLoading ? (
            <DashboardSavedListSkeleton />
          ) : playlists.length === 0 ? (
            <div className={styles.emptyState}>
              Public playlists will appear here
              after you create them from your videos.
            </div>
          ) : (
            <div className={styles.savedList}>
              {playlists.map((playlist) => (
                <article
                  key={playlist._id}
                  className={
                    styles.playlistCard
                  }
                >
                  <div
                    className={
                      styles.savedMeta
                    }
                  >
                    <strong>
                      {formatLabel(
                        playlist.title,
                      )}
                    </strong>

                    <p>
                      {playlist.description ||
                        "No description yet."}
                    </p>

                    <small>
                      {playlist.videoCount ||
                        0}{" "}
                      videos
                    </small>
                  </div>

                  <button
                    type="button"
                    className={
                      styles.inlineAction
                    }
                    onClick={() =>
                      handlePlaylistEdit(
                        playlist,
                      )
                    }
                  >
                    <MdOutlinePlaylistPlay />
                    Edit
                  </button>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p>Recent uploads</p>
              <h2>Your latest posts</h2>
            </div>
          </div>

          {libraryLoading ? (
            <DashboardRecentPostsSkeleton />
          ) : ownerPosts.length === 0 ? (
            <div className={styles.emptyState}>
              Publish your first photo or video post
              and it will show up here.
            </div>
          ) : (
            <div
              className={
                styles.recentPostGrid
              }
            >
              {ownerPosts
                .slice(0, 8)
                .map((post) => (
                  <article
                    key={post._id}
                    className={
                      styles.recentPostCard
                    }
                  >
                    <div
                      className={
                        styles.recentPostFrame
                      }
                    >
                      {post.postType ===
                      "video" ? (
                        <video
                          src={post.url}
                          className={
                            styles.recentPostMedia
                          }
                          muted
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={post.url}
                          alt={
                            post.title ||
                            "Published post"
                          }
                          className={
                            styles.recentPostMedia
                          }
                        />
                      )}
                    </div>

                    <div
                      className={
                        styles.recentPostMeta
                      }
                    >
                      <strong>
                        {formatLabel(
                          post.title,
                        ) ||
                          "Untitled post"}
                      </strong>

                      <span>
                        {post.postType ===
                        "video"
                          ? `${formatLabel(
                              post.contentFormat,
                            )}${
                              post.durationSeconds
                                ? ` | ${formatDuration(
                                    post.durationSeconds,
                                  )}`
                                : ""
                            }`
                          : formatLabel(
                              post.contentFormat,
                            ) ||
                            "Article"}
                      </span>

                      {Array.isArray(
                        post.tags,
                      ) &&
                      post.tags.length ? (
                        <small>
                          {post.tags
                            .map(formatLabel)
                            .join(" | ")}
                        </small>
                      ) : null}
                    </div>
                  </article>
                ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
};