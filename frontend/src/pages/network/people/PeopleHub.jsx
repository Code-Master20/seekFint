import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import noProfile from "../../../assets/noProfile.png";
import api from "../../../lib/api";
import styles from "./PeopleHub.module.css";

const NETWORK_HUB_CACHE_TTL_MS = 60 * 1000;
const networkHubCache = new Map();

const getCachedNetworkHubEntry = (ownerId) =>
  ownerId ? networkHubCache.get(`${ownerId}`) || null : null;

const isNetworkHubCacheStale = (entry) =>
  !entry || Date.now() - entry.updatedAt > NETWORK_HUB_CACHE_TTL_MS;

const formatDisplayValue = (value) => {
  if (!value) return "";

  return `${value}`
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getLocationLabel = (value) => {
  if (!Array.isArray(value) || value.length === 0) {
    return "";
  }

  return value.map(formatDisplayValue).join(", ");
};

const createEmptyHub = () => ({
  creator: false,
  friends: [],
  following: [],
  followers: [],
  requests: {
    sent: [],
    received: [],
    rejectedByMe: [],
    rejectedMe: [],
  },
});

const requestTabs = [
  { key: "sent", label: "Requests I" },
  { key: "received", label: "Requests Me" },
  { key: "rejectedByMe", label: "Rejects I" },
  { key: "rejectedMe", label: "Rejects Me" },
];

const emptyStateCopy = {
  friends: "You do not have any friends here yet.",
  following: "You have not subscribed to any creator channels yet.",
  followers: "Enable creator mode to build your subscriber list.",
  sent: "You have not sent any friend requests yet.",
  received: "No pending friend requests right now.",
  rejectedByMe: "You have not rejected any requests yet.",
  rejectedMe: "Nobody has rejected your requests yet.",
};

export const PeopleHub = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useSelector((state) => state.auth);
  const ownerId = user?._id || "";
  const cachedEntry = getCachedNetworkHubEntry(ownerId);
  const [networkHub, setNetworkHub] = useState(() =>
    cachedEntry?.hub ? cachedEntry.hub : createEmptyHub(),
  );
  const [loading, setLoading] = useState(() => !cachedEntry);
  const [acceptingId, setAcceptingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [mutatingId, setMutatingId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");

  const loadNetworkHub = async ({ silent = false } = {}) => {
    const localCachedEntry = getCachedNetworkHubEntry(ownerId);
    const hadCachedEntry = Boolean(localCachedEntry);

    try {
      if (!silent && !hadCachedEntry) {
        setLoading(true);
      }

      const response = await api.get("/network/hub");
      const nextHub = response.data?.data || createEmptyHub();

      if (ownerId) {
        networkHubCache.set(`${ownerId}`, {
          hub: nextHub,
          updatedAt: Date.now(),
        });
      }

      setNetworkHub(nextHub);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load your network");
      if (!hadCachedEntry) {
        setNetworkHub(createEmptyHub());
      }
    } finally {
      if (!silent && !hadCachedEntry) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!ownerId) {
      setNetworkHub(createEmptyHub());
      setLoading(true);
      return;
    }

    const localCachedEntry = getCachedNetworkHubEntry(ownerId);

    if (localCachedEntry?.hub) {
      setNetworkHub(localCachedEntry.hub);
      setLoading(false);
    } else {
      setNetworkHub(createEmptyHub());
      setLoading(true);
    }

    if (localCachedEntry && !isNetworkHubCacheStale(localCachedEntry)) {
      return;
    }

    loadNetworkHub();
  }, [ownerId]);

  const creatorEnabled = Boolean(networkHub.creator);
  const mainTabs = [
    {
      key: "friends",
      label: "Friends",
      count: networkHub.friends.length,
      visible: true,
    },
    {
      key: "following",
      label: "Subscriptions",
      count: networkHub.following.length,
      visible: true,
    },
    {
      key: "followers",
      label: "Subscribers",
      count: networkHub.followers.length,
      visible: creatorEnabled,
    },
    {
      key: "requests",
      label: "Requests",
      count:
        networkHub.requests.sent.length +
        networkHub.requests.received.length +
        networkHub.requests.rejectedByMe.length +
        networkHub.requests.rejectedMe.length,
      visible: true,
    },
  ].filter((tab) => tab.visible);

  const availableMainTabs = mainTabs.map((tab) => tab.key);
  const requestedMainTab = searchParams.get("tab");
  const activeMainTab = availableMainTabs.includes(requestedMainTab)
    ? requestedMainTab
    : "friends";

  const requestedRequestTab = searchParams.get("requestTab");
  const availableRequestTabs = requestTabs.map((tab) => tab.key);
  const activeRequestTab = availableRequestTabs.includes(requestedRequestTab)
    ? requestedRequestTab
    : "received";

  const updateSearchTab = (tab, requestTab) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("tab", tab);

    if (tab === "requests") {
      nextSearchParams.set("requestTab", requestTab || "received");
    } else {
      nextSearchParams.delete("requestTab");
    }

    setSearchParams(nextSearchParams);
  };

  const handleAccept = async (requesterUserId) => {
    try {
      setAcceptingId(requesterUserId);
      const response = await api.post(
        `/network/friend-requests/${requesterUserId}/accept`,
      );

      await loadNetworkHub({ silent: true });
      toast.success(response.data?.message || "Friend request accepted");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not accept request");
    } finally {
      setAcceptingId(null);
    }
  };

  const handleReject = async (requesterUserId) => {
    try {
      setRejectingId(requesterUserId);
      const response = await api.post(
        `/network/friend-requests/${requesterUserId}/reject`,
      );

      await loadNetworkHub({ silent: true });
      toast.success(response.data?.message || "Friend request rejected");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not reject request");
    } finally {
      setRejectingId(null);
    }
  };

  const handleRemoveConnection = async ({
    personId,
    endpoint,
    successMessage,
    errorMessage,
  }) => {
    try {
      setMutatingId(personId);
      const response = await api.delete(endpoint);

      await loadNetworkHub({ silent: true });
      toast.success(response.data?.message || successMessage);
    } catch (error) {
      toast.error(error.response?.data?.message || errorMessage);
    } finally {
      setMutatingId(null);
    }
  };

  let visibleUsers = networkHub.friends;
  let emptyCopy = emptyStateCopy.friends;

  if (activeMainTab === "following") {
    visibleUsers = networkHub.following;
    emptyCopy = emptyStateCopy.following;
  }

  if (activeMainTab === "followers") {
    visibleUsers = networkHub.followers;
    emptyCopy = emptyStateCopy.followers;
  }

  if (activeMainTab === "requests") {
    visibleUsers = networkHub.requests[activeRequestTab] || [];
    emptyCopy = emptyStateCopy[activeRequestTab];
  }

  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredUsers = visibleUsers
    .filter((person) => {
      if (!normalizedSearchText) {
        return true;
      }

      const searchableText = [
        person.username,
        person.email,
        person.profession,
        ...(Array.isArray(person.location) ? person.location : []),
        ...(Array.isArray(person.bio) ? person.bio : []),
        ...(Array.isArray(person.talent) ? person.talent : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearchText);
    })
    .sort((firstPerson, secondPerson) => {
      const firstDate = new Date(firstPerson.createdAt || 0).getTime();
      const secondDate = new Date(secondPerson.createdAt || 0).getTime();

      return sortOrder === "oldest"
        ? firstDate - secondDate
        : secondDate - firstDate;
    });

  const networkInitialLoading = loading && !cachedEntry;

  const renderCardActions = (person) => {
    const isReceivedRequest = activeMainTab === "requests" && activeRequestTab === "received";
    const isSentRequest = activeMainTab === "requests" && activeRequestTab === "sent";
    const isRejectedByMe =
      activeMainTab === "requests" && activeRequestTab === "rejectedByMe";
    const isRejectedMe =
      activeMainTab === "requests" && activeRequestTab === "rejectedMe";
    const isFriendsTab = activeMainTab === "friends";
    const isFollowingTab = activeMainTab === "following";
    const isFollowersTab = activeMainTab === "followers";

    return (
      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.viewBtn}
          onClick={() => navigate(`/profile/${person._id}`)}
        >
          View profile
        </button>

        {isSentRequest ? (
          <span className={styles.statusBadge}>Awaiting response</span>
        ) : null}

        {isRejectedByMe ? (
          <span className={styles.statusBadgeMuted}>Rejected by you</span>
        ) : null}

        {isRejectedMe ? (
          <span className={styles.statusBadgeMuted}>Rejected your request</span>
        ) : null}

        {isReceivedRequest ? (
          <>
            <button
              type="button"
              className={styles.acceptBtn}
              onClick={() => handleAccept(person._id)}
              disabled={acceptingId === person._id || rejectingId === person._id}
            >
              {acceptingId === person._id ? "Accepting..." : "Accept"}
            </button>
            <button
              type="button"
              className={styles.rejectBtn}
              onClick={() => handleReject(person._id)}
              disabled={rejectingId === person._id || acceptingId === person._id}
            >
              {rejectingId === person._id ? "Rejecting..." : "Reject"}
            </button>
          </>
        ) : null}

        {isFriendsTab ? (
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() =>
              handleRemoveConnection({
                personId: person._id,
                endpoint: `/network/friends/${person._id}`,
                successMessage: "Friend removed",
                errorMessage: "Could not remove friend",
              })
            }
            disabled={mutatingId === person._id}
          >
            {mutatingId === person._id ? "Removing..." : "Unfriend"}
          </button>
        ) : null}

        {isFollowingTab ? (
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() =>
              handleRemoveConnection({
                personId: person._id,
                endpoint: `/network/following/${person._id}`,
                successMessage: "Subscription removed",
                errorMessage: "Could not unsubscribe",
              })
            }
            disabled={mutatingId === person._id}
          >
            {mutatingId === person._id ? "Removing..." : "Unsubscribe"}
          </button>
        ) : null}

        {isFollowersTab ? (
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() =>
              handleRemoveConnection({
                personId: person._id,
                endpoint: `/network/followers/${person._id}`,
                successMessage: "Subscriber removed",
                errorMessage: "Could not remove subscriber",
              })
            }
            disabled={mutatingId === person._id}
          >
            {mutatingId === person._id ? "Removing..." : "Remove subscriber"}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <main className={styles.page}>
      <section className={styles.content}>
        <header className={styles.pageHeader}>
          <div>
            <h1>Your network</h1>
          </div>

          <button
            type="button"
            onClick={() => loadNetworkHub()}
            className={styles.refreshBtn}
          >
            Refresh
          </button>
        </header>

        <section className={styles.tabsPanel}>
          {networkInitialLoading ? (
            <div className={styles.mainTabsSkeleton} aria-label="Loading network tabs">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={`network-tab-skeleton-${index}`}
                  className={`${styles.tabSkeleton} ${styles.skeletonBlock}`}
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : (
            <div className={styles.mainTabs} role="tablist" aria-label="Network sections">
              {mainTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`${styles.tabBtn} ${
                    activeMainTab === tab.key ? styles.tabBtnActive : ""
                  }`}
                  onClick={() => updateSearchTab(tab.key)}
                >
                  <span>{tab.label}</span>
                  <strong>{tab.count}</strong>
                </button>
              ))}
            </div>
          )}

          {!creatorEnabled ? (
            <div className={styles.creatorNotice}>
              Subscribers appear here when creator mode is enabled.
            </div>
          ) : null}

          {activeMainTab === "requests" && !networkInitialLoading ? (
            <div
              className={styles.requestTabs}
              role="tablist"
              aria-label="Request sections"
            >
              {requestTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`${styles.requestTabBtn} ${
                    activeRequestTab === tab.key ? styles.requestTabBtnActive : ""
                  }`}
                  onClick={() => updateSearchTab("requests", tab.key)}
                >
                  {tab.label}
                  <span>
                    {(networkHub.requests[tab.key] || []).length}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {networkInitialLoading ? (
          <>
            <section className={styles.listHeaderSkeleton} aria-label="Loading network controls">
              <div className={styles.sectionTitleSkeletonGroup}>
                <div className={`${styles.titleSkeleton} ${styles.skeletonBlock}`} />
                <div className={`${styles.countSkeleton} ${styles.skeletonBlock}`} />
              </div>
              <div className={styles.listControlsSkeleton}>
                <div className={`${styles.fieldSkeleton} ${styles.skeletonBlock}`} />
                <div className={`${styles.fieldSkeletonShort} ${styles.skeletonBlock}`} />
              </div>
            </section>

            <section className={styles.requestList} aria-label="Loading network list">
              {Array.from({ length: 4 }, (_, index) => (
                <article
                  key={`network-card-skeleton-${index}`}
                  className={`${styles.requestCard} ${styles.requestCardSkeleton}`}
                  aria-hidden="true"
                >
                  <div className={styles.requestMain}>
                    <div className={`${styles.avatarSkeleton} ${styles.skeletonBlock}`} />
                    <div className={styles.requestInfoSkeleton}>
                      <div className={styles.identitySkeletonRow}>
                        <div
                          className={`${styles.lineSkeletonPrimary} ${styles.skeletonBlock}`}
                        />
                        <div
                          className={`${styles.badgeSkeleton} ${styles.skeletonBlock}`}
                        />
                      </div>
                      <div
                        className={`${styles.lineSkeletonSecondary} ${styles.skeletonBlock}`}
                      />
                      <div
                        className={`${styles.lineSkeletonWide} ${styles.skeletonBlock}`}
                      />
                      <div
                        className={`${styles.lineSkeletonMedium} ${styles.skeletonBlock}`}
                      />
                      <div className={styles.tagsSkeletonRow}>
                        {Array.from({ length: 3 }, (_, tagIndex) => (
                          <span
                            key={`network-tag-skeleton-${index}-${tagIndex}`}
                            className={`${styles.tagSkeleton} ${styles.skeletonBlock}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={styles.cardActions}>
                    <div className={`${styles.actionSkeleton} ${styles.skeletonBlock}`} />
                    <div className={`${styles.actionSkeleton} ${styles.skeletonBlock}`} />
                  </div>
                </article>
              ))}
            </section>
          </>
        ) : (
          <section className={styles.listHeader}>
            <div className={styles.sectionTitleGroup}>
              <h2>
                {activeMainTab === "requests"
                  ? requestTabs.find((tab) => tab.key === activeRequestTab)?.label
                  : mainTabs.find((tab) => tab.key === activeMainTab)?.label}
              </h2>
              <span className={styles.peopleCountBadge}>
                {filteredUsers.length} {filteredUsers.length === 1 ? "person" : "persons"}
              </span>
            </div>
            <div className={styles.listControls}>
              <label className={styles.searchField}>
                <span>Search</span>
                <input
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search people"
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
            </div>
          </section>
        )}

        {!networkInitialLoading && visibleUsers.length === 0 ? (
          <section className={styles.placeholder}>{emptyCopy}</section>
        ) : !networkInitialLoading && filteredUsers.length === 0 ? (
          <section className={styles.placeholder}>
            No persons match that search.
          </section>
        ) : !networkInitialLoading ? (
          <section className={styles.requestList}>
            {filteredUsers.map((person) => {
              const location = getLocationLabel(person.location);
              const bio =
                Array.isArray(person.bio) && person.bio.length > 0 ? person.bio[0] : "";
              const talents =
                Array.isArray(person.talent) && person.talent.length > 0
                  ? person.talent.slice(0, 3)
                  : [];

              return (
                <article className={styles.requestCard} key={person._id}>
                  <button
                    type="button"
                    className={styles.requestMain}
                    onClick={() => navigate(`/profile/${person._id}`)}
                  >
                    <img
                      src={person.avatar || noProfile}
                      alt={person.username}
                      className={styles.avatar}
                    />
                    <div className={styles.requestInfo}>
                      <div className={styles.identity}>
                        <h2>{person.username}</h2>
                        {person.profession ? (
                          <span>{formatDisplayValue(person.profession)}</span>
                        ) : null}
                        {person.friendType ? (
                          <strong className={styles.creatorBadge}>
                            {person.friendType}
                          </strong>
                        ) : null}
                        {!person.friendType && person.subscriberType ? (
                          <strong className={styles.creatorBadge}>
                            {person.subscriberType}
                          </strong>
                        ) : null}
                      </div>

                      {person.email ? <p className={styles.email}>{person.email}</p> : null}
                      {location ? <p className={styles.location}>{location}</p> : null}
                      {bio ? <p className={styles.bio}>{bio}</p> : null}

                      {talents.length > 0 ? (
                        <div className={styles.tags}>
                          {talents.map((talent) => (
                            <span key={talent}>{formatDisplayValue(talent)}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </button>

                  {renderCardActions(person)}
                </article>
              );
            })}
          </section>
        ) : null}
      </section>
    </main>
  );
};
