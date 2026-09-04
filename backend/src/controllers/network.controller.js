const mongoose = require("mongoose");
const User = require("../models/auth/user.model");
const Notification = require("../models/notification.model");
const ErrorHandler = require("../utils/errorHandler.util");
const SuccessHandler = require("../utils/successHandler.util");
const sendRelationshipEmail = require("../services/network/sendRelationshipEmail.util");
const toPublicUser = require("../utils/auth/publicUser.util");
const {
  hasRelationship,
  addRelationshipIfMissing,
  removeRelationshipIfPresent,
  getRelationshipSnapshot,
  buildRelationshipPayload,
} = require("../utils/network/relationship.util");

const networkProfileFields =
  "username email avatar profession location bio talent status gender dob profileVisibility creator";

const mapUsersToPublic = (users = [], viewer) =>
  users.map((person) => ({
    ...toPublicUser(person, { viewerId: viewer?._id || viewer?.id || null }),
    ...getRelationshipSnapshot(viewer, person),
  }));

const clearRejectHistoryBetweenUsers = (firstUser, secondUser) => {
  firstUser.friendRequestRejectsSent = removeRelationshipIfPresent(
    firstUser.friendRequestRejectsSent,
    secondUser._id,
  );
  firstUser.friendRequestRejectsReceived = removeRelationshipIfPresent(
    firstUser.friendRequestRejectsReceived,
    secondUser._id,
  );
  secondUser.friendRequestRejectsSent = removeRelationshipIfPresent(
    secondUser.friendRequestRejectsSent,
    firstUser._id,
  );
  secondUser.friendRequestRejectsReceived = removeRelationshipIfPresent(
    secondUser.friendRequestRejectsReceived,
    firstUser._id,
  );
};

const searchUsers = async (req, res) => {
  try {
    const query = `${req.query.q ?? ""}`.trim();

    if (!query) {
      return new SuccessHandler(200, "Search results", []).send(res);
    }

    if (query.length > 80) {
      return new ErrorHandler(400, "Search query is too long").send(res);
    }

    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(safeQuery, "i");

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { username: searchRegex },
        {
          $and: [{ "profileVisibility.email": true }, { email: searchRegex }],
        },
      ],
    })
      .select(
        "username email avatar profession location bio talent status gender dob profileVisibility creator",
      )
      .limit(12);

    const results = users.map((user) => ({
      ...toPublicUser(user, { viewerId: req.user._id }),
      ...getRelationshipSnapshot(req.user, user),
    }));

    return new SuccessHandler(200, "Search results", results).send(res);
  } catch (error) {
    return new ErrorHandler(500, "User search failed")
      .log("user search error", error)
      .send(res);
  }
};

const getReceivedFriendRequests = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("friendRequestsReceived", networkProfileFields)
      .select("friendRequestsReceived");

    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    const requests = (user.friendRequestsReceived || []).map((requestUser) =>
      toPublicUser(requestUser, { viewerId: req.user._id }),
    );

    return new SuccessHandler(200, "Friend requests", requests).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Could not fetch friend requests")
      .log("friend requests error", error)
      .send(res);
  }
};

const getOwnerNetworkHub = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("friends", networkProfileFields)
      .populate("following", networkProfileFields)
      .populate("followers", networkProfileFields)
      .populate("friendRequestsSent", networkProfileFields)
      .populate("friendRequestsReceived", networkProfileFields)
      .populate("friendRequestRejectsSent", networkProfileFields)
      .populate("friendRequestRejectsReceived", networkProfileFields)
      .select(
        [
          "creator",
          "friends",
          "following",
          "followers",
          "friendRequestsSent",
          "friendRequestsReceived",
          "friendRequestRejectsSent",
          "friendRequestRejectsReceived",
        ].join(" "),
      );

    if (!user) {
      return new ErrorHandler(404, "User not found").send(res);
    }

      return new SuccessHandler(200, "Network hub", {
      creator: Boolean(user.creator),
      friends: mapUsersToPublic(user.friends, req.user),
      following: mapUsersToPublic(user.following, req.user),
      followers: user.creator ? mapUsersToPublic(user.followers, req.user) : [],
      requests: {
        sent: mapUsersToPublic(user.friendRequestsSent, req.user),
        received: mapUsersToPublic(user.friendRequestsReceived, req.user),
        rejectedByMe: mapUsersToPublic(
          user.friendRequestRejectsSent,
          req.user,
        ),
        rejectedMe: mapUsersToPublic(
          user.friendRequestRejectsReceived,
          req.user,
        ),
      },
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Could not load your network hub")
      .log("owner network hub error", error)
      .send(res);
  }
};

const getNotifications = async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(
      `${req.query.limit ?? "30"}`,
      10,
    );

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 30;

    const requestedPage = Number.parseInt(
      `${req.query.page ?? "1"}`,
      10,
    );

    const page = Number.isFinite(requestedPage)
      ? Math.max(requestedPage, 1)
      : 1;

    const skip = (page - 1) * limit;

    const notifications = await Notification.find({
      user: req.user._id,
    })
      .populate(
        "actor",
        "username avatar profession profileVisibility",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Count ALL unread notifications belonging to the receiver.
    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      read: false,
    });

    // If we received fewer than `limit`, there are no more pages.
    const hasMore = notifications.length === limit;

    const normalizedNotifications = notifications.map((notification) => ({
      _id: notification._id,
      type: notification.type,
      message: notification.message,
      link: notification.link || null,
      read: notification.read,
      createdAt: notification.createdAt,
      actor: notification.actor
        ? toPublicUser(notification.actor, {
            viewerId: req.user._id,
          })
        : null,
    }));

    return new SuccessHandler(200, "Notifications", {
      items: normalizedNotifications,
      unreadCount,
      page,
      limit,
      hasMore,
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Could not fetch notifications")
      .log("notifications error", error)
      .send(res);
  }
};

const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    if (!mongoose.isValidObjectId(notificationId)) {
      return new ErrorHandler(400, "Invalid notification id").send(res);
    }

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      user: req.user._id,
    });

    if (!notification) {
      return new ErrorHandler(404, "Notification not found").send(res);
    }

    return new SuccessHandler(200, "Notification removed", {
      notificationId: notification._id,
      unreadCountDelta: notification.read ? 0 : -1,
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Notification could not be removed")
      .log("notification delete error", error)
      .send(res);
  }
};

const markNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true } },
    );

    return new SuccessHandler(200, "Notifications marked as read", {
      unreadCount: 0,
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Could not update notifications")
      .log("notification read error", error)
      .send(res);
  }
};

const unfriendUser = async (req, res) => {
  try {
    const { targetUserId } = req.params;

    if (!mongoose.isValidObjectId(targetUserId)) {
      return new ErrorHandler(400, "Invalid target user id").send(res);
    }

    const owner = await User.findById(req.user._id);
    const target = await User.findById(targetUserId);

    if (!owner) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    if (!target) {
      return new ErrorHandler(404, "Target user not found").send(res);
    }

    if (`${owner._id}` === `${target._id}`) {
      return new ErrorHandler(400, "You cannot unfriend yourself").send(res);
    }

    owner.friends = removeRelationshipIfPresent(owner.friends, target._id);
    target.friends = removeRelationshipIfPresent(target.friends, owner._id);

    await Promise.all([owner.save(), target.save()]);

    return new SuccessHandler(
      200,
      "Friend removed",
      buildRelationshipPayload(owner, target),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Friend could not be removed")
      .log("unfriend error", error)
      .send(res);
  }
};

const unfollowUser = async (req, res) => {
  try {
    const { targetUserId } = req.params;

    if (!mongoose.isValidObjectId(targetUserId)) {
      return new ErrorHandler(400, "Invalid target user id").send(res);
    }

    const owner = await User.findById(req.user._id);
    const target = await User.findById(targetUserId);

    if (!owner) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    if (!target) {
      return new ErrorHandler(404, "Target user not found").send(res);
    }

    if (`${owner._id}` === `${target._id}`) {
      return new ErrorHandler(400, "You cannot unfollow yourself").send(res);
    }

    owner.following = removeRelationshipIfPresent(owner.following, target._id);
    target.followers = removeRelationshipIfPresent(target.followers, owner._id);

    await Promise.all([owner.save(), target.save()]);

    return new SuccessHandler(
      200,
      "Subscription removed",
      buildRelationshipPayload(owner, target),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Subscription could not be removed")
      .log("unfollow error", error)
      .send(res);
  }
};

const removeFollower = async (req, res) => {
  try {
    const { targetUserId } = req.params;

    if (!mongoose.isValidObjectId(targetUserId)) {
      return new ErrorHandler(400, "Invalid target user id").send(res);
    }

    const owner = await User.findById(req.user._id);
    const target = await User.findById(targetUserId);

    if (!owner) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    if (!target) {
      return new ErrorHandler(404, "Target user not found").send(res);
    }

    if (`${owner._id}` === `${target._id}`) {
      return new ErrorHandler(400, "You cannot remove yourself as a follower").send(
        res,
      );
    }

    owner.followers = removeRelationshipIfPresent(owner.followers, target._id);
    target.following = removeRelationshipIfPresent(target.following, owner._id);

    await Promise.all([owner.save(), target.save()]);

    return new SuccessHandler(200, "Subscriber removed", {
      targetUserId: target._id,
    }).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Subscriber could not be removed")
      .log("remove follower error", error)
      .send(res);
  }
};

const subscribeToUser = async (req, res) => {
  try {
    const { targetUserId } = req.params;

    if (!mongoose.isValidObjectId(targetUserId)) {
      return new ErrorHandler(400, "Invalid target user id").send(res);
    }

    const subscriber = await User.findById(req.user._id);
    const channel = await User.findById(targetUserId);

    if (!subscriber) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    if (!channel) {
      return new ErrorHandler(404, "Profile not found").send(res);
    }

    if (`${subscriber._id}` === `${channel._id}`) {
      return new ErrorHandler(400, "You cannot subscribe to yourself").send(res);
    }

    if (!channel.creator) {
      return new ErrorHandler(400, "Only creator-mode profiles can be subscribed to").send(
        res,
      );
    }

    if (hasRelationship(subscriber.following, channel._id)) {
      return new ErrorHandler(400, "You are already subscribed").send(res);
    }

    subscriber.following = addRelationshipIfMissing(subscriber.following, channel._id);
    channel.followers = addRelationshipIfMissing(channel.followers, subscriber._id);

    await Promise.all([subscriber.save(), channel.save()]);

    try {
      await Notification.create({
        user: channel._id,
        actor: subscriber._id,
        type: "subscription_started",
        message: `${subscriber.username} subscribed to your channel`,
        link: `/profile/${subscriber._id}`,
      });
    } catch (notificationError) {
      console.error("subscription notification error", notificationError);
    }

    return new SuccessHandler(
      200,
      "Subscribed successfully",
      buildRelationshipPayload(subscriber, channel),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Subscription could not be created")
      .log("subscribe error", error)
      .send(res);
  }
};

const sendFriendRequest = async (req, res) => {
  try {
    const { targetUserId } = req.params;

    if (!mongoose.isValidObjectId(targetUserId)) {
      return new ErrorHandler(400, "Invalid target user id").send(res);
    }

    const sender = await User.findById(req.user._id);
    const receiver = await User.findById(targetUserId);

    if (!sender) {
      return new ErrorHandler(404, "Sender not found").send(res);
    }

    if (!receiver) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    if (`${sender._id}` === `${receiver._id}`) {
      return new ErrorHandler(400, "You cannot send a request to yourself").send(
        res,
      );
    }

    if (hasRelationship(sender.friends, receiver._id)) {
      return new ErrorHandler(400, "You are already friends").send(res);
    }

    if (
      (sender.friendRequestsSent || []).some(
        (id) => `${id}` === `${receiver._id}`,
      )
    ) {
      return new ErrorHandler(400, "Friend request already sent").send(res);
    }

    if (
      (sender.friendRequestsReceived || []).some(
        (id) => `${id}` === `${receiver._id}`,
      )
    ) {
      return new ErrorHandler(
        400,
        "This user has already sent you a friend request",
      ).send(res);
    }

    clearRejectHistoryBetweenUsers(sender, receiver);

    sender.friendRequestsSent.push(receiver._id);
    receiver.friendRequestsReceived.push(sender._id);

    await Promise.all([sender.save(), receiver.save()]);
    await Notification.create({
      user: receiver._id,
      actor: sender._id,
      type: "friend_request",
      message: `${sender.username} sent you a friend request`,
    });

    try {
      await sendRelationshipEmail({
        to: receiver.email,
        subject: "New friend request on globMe",
        text: `${sender.username} sent you a friend request on globMe.`,
        html: `
          <h2>New friend request</h2>
          <p><b>${sender.username}</b> sent you a friend request on globMe.</p>
          <p>Open your People page to review it.</p>
        `,
      });
    } catch (emailError) {
      console.error("friend request email error", emailError);
    }

    return new SuccessHandler(
      200,
      "Friend request sent",
      buildRelationshipPayload(sender, receiver),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Friend request could not be sent")
      .log("friend request error", error)
      .send(res);
  }
};

const acceptFriendRequest = async (req, res) => {
  try {
    const { requesterUserId } = req.params;

    if (!mongoose.isValidObjectId(requesterUserId)) {
      return new ErrorHandler(400, "Invalid requester user id").send(res);
    }

    const receiver = await User.findById(req.user._id);
    const sender = await User.findById(requesterUserId);

    if (!receiver) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    if (!sender) {
      return new ErrorHandler(404, "Request sender not found").send(res);
    }

    const hasIncomingRequest = (receiver.friendRequestsReceived || []).some(
      (id) => `${id}` === `${sender._id}`,
    );

    if (!hasIncomingRequest) {
      return new ErrorHandler(400, "No pending request from this user").send(res);
    }

    receiver.friendRequestsReceived = (receiver.friendRequestsReceived || []).filter(
      (id) => `${id}` !== `${sender._id}`,
    );
    sender.friendRequestsSent = (sender.friendRequestsSent || []).filter(
      (id) => `${id}` !== `${receiver._id}`,
    );

    receiver.friends = addRelationshipIfMissing(receiver.friends, sender._id);
    sender.friends = addRelationshipIfMissing(sender.friends, receiver._id);
    clearRejectHistoryBetweenUsers(receiver, sender);

    await Promise.all([receiver.save(), sender.save()]);
    await Notification.create({
      user: sender._id,
      actor: receiver._id,
      type: "request_accepted",
      message: `${receiver.username} accepted your friend request`,
    });

    const senderPerspective = getRelationshipSnapshot(sender, receiver);
    const acceptedType =
      senderPerspective.friendType === "safro" ? "safro" : "frado";

    try {
      await sendRelationshipEmail({
        to: sender.email,
        subject: "Your friend request was accepted",
        text: `${receiver.username} accepted your friend request on globMe.`,
        html: `
          <h2>Friend request accepted</h2>
          <p><b>${receiver.username}</b> accepted your friend request on globMe.</p>
          <p>You are now connected as ${acceptedType} on globMe.</p>
        `,
      });
    } catch (emailError) {
      console.error("friend acceptance email error", emailError);
    }

    return new SuccessHandler(
      200,
      "Friend request accepted",
      buildRelationshipPayload(receiver, sender),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Friend request could not be accepted")
      .log("friend acceptance error", error)
      .send(res);
  }
};

const rejectFriendRequest = async (req, res) => {
  try {
    const { requesterUserId } = req.params;

    if (!mongoose.isValidObjectId(requesterUserId)) {
      return new ErrorHandler(400, "Invalid requester user id").send(res);
    }

    const receiver = await User.findById(req.user._id);
    const sender = await User.findById(requesterUserId);

    if (!receiver) {
      return new ErrorHandler(404, "User not found").send(res);
    }

    if (!sender) {
      return new ErrorHandler(404, "Request sender not found").send(res);
    }

    const hasIncomingRequest = (receiver.friendRequestsReceived || []).some(
      (id) => `${id}` === `${sender._id}`,
    );

    if (!hasIncomingRequest) {
      return new ErrorHandler(400, "No pending request from this user").send(res);
    }

    receiver.friendRequestsReceived = removeRelationshipIfPresent(
      receiver.friendRequestsReceived,
      sender._id,
    );
    sender.friendRequestsSent = removeRelationshipIfPresent(
      sender.friendRequestsSent,
      receiver._id,
    );
    receiver.friendRequestRejectsSent = addRelationshipIfMissing(
      receiver.friendRequestRejectsSent,
      sender._id,
    );
    sender.friendRequestRejectsReceived = addRelationshipIfMissing(
      sender.friendRequestRejectsReceived,
      receiver._id,
    );

    await Promise.all([receiver.save(), sender.save()]);

    return new SuccessHandler(
      200,
      "Friend request rejected",
      buildRelationshipPayload(receiver, sender),
    ).send(res);
  } catch (error) {
    return new ErrorHandler(500, "Friend request could not be rejected")
      .log("friend rejection error", error)
      .send(res);
  }
};

module.exports = {
  searchUsers,
  getReceivedFriendRequests,
  getOwnerNetworkHub,
  getNotifications,
  deleteNotification,
  markNotificationsRead,
  unfriendUser,
  unfollowUser,
  removeFollower,
  subscribeToUser,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
};
