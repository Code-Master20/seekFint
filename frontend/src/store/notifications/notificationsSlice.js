import { createSlice } from "@reduxjs/toolkit";
import {
  deleteNotification,
  fetchNotifications,
  markNotificationsRead,
} from "./notificationsThunks";

const notificationsSlice = createSlice({
  name: "notifications",

  initialState: {
    loading: false,
    loadingMore: false,
    items: [],
    unreadCount: 0,
    deletingId: null,
    errorMessage: null,

    page: 1,
    hasMore: true,
  },

  reducers: {},

  extraReducers: (builder) => {
    builder

      // -----------------------------
      // FETCH NOTIFICATIONS
      // -----------------------------
      .addCase(fetchNotifications.pending, (state, action) => {
        const requestedPage = action.meta.arg?.page ?? 1;

        if (requestedPage === 1) {
          state.loading = true;
        } else {
          state.loadingMore = true;
        }

        state.errorMessage = null;
      })

      .addCase(fetchNotifications.fulfilled, (state, action) => {
        const requestedPage = action.meta.arg?.page ?? 1;

        const newItems = action.payload?.data?.items || [];
        const unreadCount =
          action.payload?.data?.unreadCount ?? 0;

        const hasMore =
          action.payload?.data?.hasMore ?? false;

        const page =
          action.payload?.data?.page ?? requestedPage;

        if (requestedPage === 1) {
          /*
           * Refresh page 1 without throwing away older pages
           * that the user may already have loaded.
           *
           * This is important because Root.jsx refreshes
           * notifications every 15 seconds.
           */
          const existingItems = state.items;

          const itemMap = new Map();

          for (const item of existingItems) {
            itemMap.set(`${item._id}`, item);
          }

          for (const item of newItems) {
            itemMap.set(`${item._id}`, item);
          }

          state.items = Array.from(itemMap.values());

          state.loading = false;
        } else {
          /*
           * Page 2, 3, 4...
           * Add new notifications to the existing array.
           */
          const existingIds = new Set(
            state.items.map((item) => `${item._id}`),
          );

          for (const item of newItems) {
            if (!existingIds.has(`${item._id}`)) {
              state.items.push(item);
            }
          }

          state.loadingMore = false;
        }

        state.unreadCount = unreadCount;
        state.page = page;
        state.hasMore = hasMore;
      })

      .addCase(fetchNotifications.rejected, (state, action) => {
        const requestedPage = action.meta.arg?.page ?? 1;

        if (requestedPage === 1) {
          state.loading = false;
        } else {
          state.loadingMore = false;
        }

        state.errorMessage =
          action.payload?.message ||
          "Could not load notifications";
      })

      // -----------------------------
      // MARK AS READ
      // -----------------------------
      .addCase(markNotificationsRead.fulfilled, (state) => {
        state.unreadCount = 0;

        state.items = state.items.map((item) => ({
          ...item,
          read: true,
        }));
      })

      // -----------------------------
      // DELETE
      // -----------------------------
      .addCase(deleteNotification.pending, (state, action) => {
        state.deletingId = action.meta.arg || null;
        state.errorMessage = null;
      })

      .addCase(deleteNotification.fulfilled, (state, action) => {
        const notificationId =
          action.payload?.data?.notificationId;

        const unreadCountDelta =
          action.payload?.data?.unreadCountDelta || 0;

        state.deletingId = null;

        state.items = state.items.filter(
          (item) => item._id !== `${notificationId}`,
        );

        state.unreadCount = Math.max(
          0,
          state.unreadCount + unreadCountDelta,
        );
      })

      .addCase(deleteNotification.rejected, (state, action) => {
        state.deletingId = null;

        state.errorMessage =
          action.payload?.message ||
          "Could not remove notification";
      });
  },
});

export default notificationsSlice.reducer;
