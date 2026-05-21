const resolvePostAudience = (post) => {
  const normalizedVisibility = `${post?.visibility ?? ""}`.trim().toLowerCase();

  if (["private", "friends", "world", "all"].includes(normalizedVisibility)) {
    return normalizedVisibility;
  }

  return post?.isPublic === false ? "private" : "world";
};

const buildRelationshipIdSet = (userDoc, fieldName) =>
  new Set(
    Array.isArray(userDoc?.[fieldName])
      ? userDoc[fieldName].map((relationshipId) => `${relationshipId}`)
      : [],
  );

const buildFriendIdSet = (userDoc) =>
  buildRelationshipIdSet(userDoc, "friends");

const buildFollowingIdSet = (userDoc) =>
  buildRelationshipIdSet(userDoc, "following");

const buildHiddenViewerIdSet = (post) =>
  new Set(
    Array.isArray(post?.hiddenFromUsers)
      ? post.hiddenFromUsers
        .map((userId) => `${userId?._id || userId || ""}`)
        .filter(Boolean)
      : [],
  );

const buildIncludedViewerIdSet = (post) =>
  new Set(
    Array.isArray(post?.visibleToUsers)
      ? post.visibleToUsers
        .map((userId) => `${userId?._id || userId || ""}`)
        .filter(Boolean)
      : [],
  );

const canViewerAccessPostAudience = ({
  post,
  viewerId = null,
  viewerFriendIdSet = new Set(),
  viewerFollowingIdSet = new Set(),
}) => {
  const ownerId = `${post?.user?._id || post?.user || ""}`;

  if (viewerId && ownerId && `${viewerId}` === ownerId) {
    return true;
  }

  const hiddenViewerIdSet = buildHiddenViewerIdSet(post);
  const includedViewerIdSet = buildIncludedViewerIdSet(post);

  if (viewerId && hiddenViewerIdSet.has(`${viewerId}`)) {
    return false;
  }

  const visibility = resolvePostAudience(post);

  if (visibility === "private") {
    return viewerId ? includedViewerIdSet.has(`${viewerId}`) : false;
  }

  const viewerIsFriend = ownerId ? viewerFriendIdSet.has(ownerId) : false;
  const viewerIsSubscribedToOwner = ownerId ? viewerFollowingIdSet.has(ownerId) : false;

  if (visibility === "friends") {
    return viewerIsFriend;
  }

  if (visibility === "world") {
    if (!viewerIsFriend) {
      return true;
    }

    if (viewerIsSubscribedToOwner) {
      return true;
    }

    return viewerId ? includedViewerIdSet.has(`${viewerId}`) : false;
  }

  if (visibility === "all") {
    return true;
  }

  return false;
};

module.exports = {
  resolvePostAudience,
  buildRelationshipIdSet,
  buildFriendIdSet,
  buildFollowingIdSet,
  buildHiddenViewerIdSet,
  canViewerAccessPostAudience,
};
