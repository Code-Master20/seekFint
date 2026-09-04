import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import noProfile from "../../../assets/noProfile.png";
import {
  deleteNotification,
  fetchNotifications,
  markNotificationsRead,
} from "../../../store/notifications/notificationsThunks";
import styles from "./NotificationCenter.module.css";

const SWIPE_DELETE_THRESHOLD = 96;
const SWIPE_MAX_OFFSET = 132;
const NOTIFICATIONS_CACHE_TTL_MS = 60 * 1000;
const notificationsPageCache = new Map();
const NOTIFICATIONS_PAGE_SIZE = 30;

const getCachedNotificationsEntry = (ownerId) =>
  ownerId ? notificationsPageCache.get(`${ownerId}`) || null : null;

const isNotificationsCacheStale = (entry) =>
  !entry || Date.now() - entry.updatedAt > NOTIFICATIONS_CACHE_TTL_MS;

const formatDisplayValue = (value) => {
  if (!value) return "";

  return `${value}`
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getNotificationTarget = (notification) =>
  notification.link ||
  (notification.actor?._id ? `/profile/${notification.actor._id}` : "");

const getNotificationActionLabel = (notification) =>
  notification.type === "story_added" && notification.link
    ? "View story"
    : notification.type === "story_comment" && notification.link
      ? "Open messages"
      : notification.type === "post_like" && notification.link
        ? "Open post"
        : "View profile";

export const NotificationCenter = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const {
    items,
    loading,
    loadingMore,
    deletingId,
    errorMessage,
    page,
    hasMore,
  } = useSelector((state) => state.notifications);
  const cacheKey = user?._id || "";
  const cachedEntry = getCachedNotificationsEntry(cacheKey);
  const [searchText, setSearchText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [cachedItemsSnapshot, setCachedItemsSnapshot] = useState(
    () => cachedEntry?.items || [],
  );
  const [activeSwipe, setActiveSwipe] = useState({
    notificationId: "",
    offsetX: 0,
  });
  const swipeGestureRef = useRef({
    notificationId: "",
    startX: 0,
    startY: 0,
    offsetX: 0,
    suppressClickFor: "",
  });
  const loadMoreRef = useRef(null);

  useEffect(() => {
    const hydrateNotifications = async () => {
      const activeCacheEntry = getCachedNotificationsEntry(cacheKey);
      const shouldFetch =
        !items.length &&
        (!activeCacheEntry || isNotificationsCacheStale(activeCacheEntry));

      if (shouldFetch) {
        await dispatch(
          fetchNotifications({
            page: 1,
            limit: NOTIFICATIONS_PAGE_SIZE,
          }),
        );
      } else if (
        activeCacheEntry &&
        isNotificationsCacheStale(activeCacheEntry)
      ) {
        await dispatch(
          fetchNotifications({
            page: 1,
            limit: NOTIFICATIONS_PAGE_SIZE,
          }),
        );
      }

      await dispatch(markNotificationsRead());
    };

    if (cacheKey) {
      hydrateNotifications();
    }
  }, [cacheKey, dispatch]);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || !hasMore || loading || loadingMore) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];

        if (!firstEntry.isIntersecting) {
          return;
        }

        dispatch(
          fetchNotifications({
            page: page + 1,
            limit: NOTIFICATIONS_PAGE_SIZE,
          }),
        );
      },
      {
        root: null,
        rootMargin: "300px",
        threshold: 0,
      },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [dispatch, page, hasMore, loading, loadingMore]);

  useEffect(() => {
    if (!cacheKey) {
      setCachedItemsSnapshot([]);
      return;
    }

    const activeCacheEntry = getCachedNotificationsEntry(cacheKey);
    setCachedItemsSnapshot(activeCacheEntry?.items || []);
  }, [cacheKey]);

  useEffect(() => {
    if (!cacheKey || loading) {
      return;
    }

    notificationsPageCache.set(`${cacheKey}`, {
      items,
      updatedAt: Date.now(),
    });
    setCachedItemsSnapshot(items);
  }, [cacheKey, items, loading]);

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage);
    }
  }, [errorMessage]);

  const effectiveItems = items.length ? items : cachedItemsSnapshot;
  const notificationsInitialLoading = loading && !effectiveItems.length;
  const normalizedSearchText = searchText.trim().toLowerCase();
  const visibleItems = [...effectiveItems]
    .filter((notification) => {
      if (!normalizedSearchText) {
        return true;
      }

      const searchableText = [
        notification.message,
        notification.actor?.username,
        notification.actor?.profession,
        notification.actor?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearchText);
    })
    .sort((firstItem, secondItem) => {
      const firstDate = new Date(firstItem.createdAt).getTime();
      const secondDate = new Date(secondItem.createdAt).getTime();

      return sortOrder === "oldest"
        ? firstDate - secondDate
        : secondDate - firstDate;
    });

  const handleDeleteNotification = async (notificationId) => {
    setActiveSwipe((current) =>
      current.notificationId === notificationId
        ? { notificationId: "", offsetX: 0 }
        : current,
    );

    const resultAction = await dispatch(deleteNotification(notificationId));

    if (deleteNotification.fulfilled.match(resultAction)) {
      toast.success(resultAction.payload?.message || "Notification removed");
    }
  };

  const handleSwipeStart = (notificationId, touch) => {
    swipeGestureRef.current = {
      notificationId,
      startX: touch.clientX,
      startY: touch.clientY,
      offsetX: 0,
      suppressClickFor: swipeGestureRef.current.suppressClickFor,
    };

    setActiveSwipe((current) =>
      current.notificationId === notificationId
        ? current
        : { notificationId, offsetX: 0 },
    );
  };

  const handleSwipeMove = (notificationId, touch) => {
    if (swipeGestureRef.current.notificationId !== notificationId) {
      return;
    }

    const deltaX = touch.clientX - swipeGestureRef.current.startX;
    const deltaY = touch.clientY - swipeGestureRef.current.startY;

    if (Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    const nextOffsetX = Math.max(-SWIPE_MAX_OFFSET, Math.min(0, deltaX));
    swipeGestureRef.current.offsetX = nextOffsetX;

    if (Math.abs(nextOffsetX) > 10) {
      swipeGestureRef.current.suppressClickFor = notificationId;
    }

    setActiveSwipe({ notificationId, offsetX: nextOffsetX });
  };

  const handleSwipeEnd = (notificationId) => {
    if (swipeGestureRef.current.notificationId !== notificationId) {
      return;
    }

    const offsetX = swipeGestureRef.current.offsetX;
    swipeGestureRef.current.notificationId = "";
    swipeGestureRef.current.offsetX = 0;

    if (offsetX <= -SWIPE_DELETE_THRESHOLD) {
      handleDeleteNotification(notificationId);
      return;
    }

    setActiveSwipe((current) =>
      current.notificationId === notificationId
        ? { notificationId: "", offsetX: 0 }
        : current,
    );
  };

  const handleNotificationNavigation = (notification, event) => {
    if (swipeGestureRef.current.suppressClickFor === notification._id) {
      swipeGestureRef.current.suppressClickFor = "";
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const target = getNotificationTarget(notification);

    if (target) {
      navigate(target);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.content}>
        <header className={styles.pageHeader}>
          <p>Network</p>
          <h1>Notifications</h1>
        </header>

        {notificationsInitialLoading ? (
          <>
            <section
              className={styles.toolbarSkeleton}
              aria-label="Loading notification controls"
            >
              <div className={styles.fieldSkeletonStack}>
                <span
                  className={`${styles.fieldLabelSkeleton} ${styles.skeletonBlock}`}
                />
                <div
                  className={`${styles.fieldSkeleton} ${styles.skeletonBlock}`}
                />
              </div>

              <div className={styles.fieldSkeletonStack}>
                <span
                  className={`${styles.fieldLabelSkeleton} ${styles.skeletonBlock}`}
                />
                <div
                  className={`${styles.fieldSkeletonShort} ${styles.skeletonBlock}`}
                />
              </div>
            </section>

            <section
              className={styles.notificationList}
              aria-label="Loading notifications"
            >
              {Array.from({ length: 4 }, (_, index) => (
                <article
                  key={`notification-skeleton-${index}`}
                  className={`${styles.notificationRow} ${styles.notificationRowSkeleton}`}
                  aria-hidden="true"
                >
                  <div className={styles.notificationCard}>
                    <div className={styles.notificationMain}>
                      <div
                        className={`${styles.avatarSkeleton} ${styles.skeletonBlock}`}
                      />
                      <div className={styles.notificationBodySkeleton}>
                        <div className={styles.notificationTopSkeleton}>
                          <div
                            className={`${styles.notificationLinePrimary} ${styles.skeletonBlock}`}
                          />
                          <div
                            className={`${styles.notificationTimeSkeleton} ${styles.skeletonBlock}`}
                          />
                        </div>
                        <div
                          className={`${styles.notificationLineSecondary} ${styles.skeletonBlock}`}
                        />
                        <div
                          className={`${styles.notificationLineTertiary} ${styles.skeletonBlock}`}
                        />
                      </div>
                    </div>

                    <div className={styles.notificationActions}>
                      <div
                        className={`${styles.actionSkeleton} ${styles.skeletonBlock}`}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </>
        ) : (
          <section className={styles.toolbar}>
            <label className={styles.searchField}>
              <span>Search</span>
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search by name or notification text"
              />
            </label>

            <label className={styles.sortField}>
              <span>Order</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              >
                <option value="newest">New to old</option>
                <option value="oldest">Old to new</option>
              </select>
            </label>
          </section>
        )}

        {!notificationsInitialLoading && effectiveItems.length === 0 ? (
          <section className={styles.placeholder}>
            You do not have any notifications yet.
          </section>
        ) : visibleItems.length === 0 ? (
          <section className={styles.placeholder}>
            No notifications match that search.
          </section>
        ) : (
          <section className={styles.notificationList}>
            {visibleItems.map((notification) => (
              <article
                key={notification._id}
                className={`${styles.notificationRow} ${
                  notification.read ? styles.readCard : styles.unreadCard
                }`}
                onTouchStart={(event) =>
                  handleSwipeStart(notification._id, event.changedTouches[0])
                }
                onTouchMove={(event) =>
                  handleSwipeMove(notification._id, event.changedTouches[0])
                }
                onTouchEnd={() => handleSwipeEnd(notification._id)}
                onTouchCancel={() => handleSwipeEnd(notification._id)}
              >
                <button
                  type="button"
                  className={styles.swipeDeleteAction}
                  onClick={() => handleDeleteNotification(notification._id)}
                  disabled={deletingId === notification._id}
                  aria-label={`Delete notification from ${
                    notification.actor?.username || "user"
                  }`}
                >
                  {deletingId === notification._id ? "Removing..." : "Delete"}
                </button>

                <div
                  className={styles.notificationCard}
                  style={{
                    transform:
                      activeSwipe.notificationId === notification._id
                        ? `translateX(${activeSwipe.offsetX}px)`
                        : "translateX(0px)",
                  }}
                >
                  <button
                    type="button"
                    className={styles.notificationMain}
                    onClick={(event) =>
                      handleNotificationNavigation(notification, event)
                    }
                    disabled={!getNotificationTarget(notification)}
                  >
                    <img
                      src={notification.actor?.avatar || noProfile}
                      alt={notification.actor?.username || "user"}
                      className={styles.avatar}
                    />

                    <div className={styles.notificationBody}>
                      <div className={styles.notificationTop}>
                        <h2>{notification.message}</h2>

                        <span>
                          {new Date(notification.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {notification.actor?.profession ? (
                        <p className={styles.actorMeta}>
                          {formatDisplayValue(notification.actor.profession)}
                        </p>
                      ) : null}

                      {notification.actor?.email ? (
                        <p className={styles.actorMeta}>
                          {notification.actor.email}
                        </p>
                      ) : null}
                    </div>
                  </button>

                  <div className={styles.notificationActions}>
                    <button
                      type="button"
                      className={styles.viewBtn}
                      onClick={(event) =>
                        handleNotificationNavigation(notification, event)
                      }
                      disabled={!getNotificationTarget(notification)}
                    >
                      {getNotificationActionLabel(notification)}
                    </button>
                  </div>
                </div>

                <span className={styles.swipeHint}>Swipe left to delete</span>
              </article>
            ))}

            {/* Infinite-scroll trigger */}
            {hasMore ? (
              <div
                ref={loadMoreRef}
                aria-hidden="true"
                style={{
                  minHeight: "1px",
                }}
              />
            ) : null}

            {loadingMore ? (
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                }}
              >
                Loading more notifications...
              </div>
            ) : null}
          </section>
        )}
      </section>
    </main>
  );
};
