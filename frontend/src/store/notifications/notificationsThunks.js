import { createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../lib/api";

export const fetchNotifications = createAsyncThunk(
  "notifications/fetchNotifications",
  async (params = {}, thunkAPI) => {
    try {
      const response = await api.get("/network/notifications", {
        params: {
          page: params.page ?? 1,
          limit: params.limit ?? 30,
        },
      });

      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message:
          error.response?.data?.message ||
          "Could not fetch notifications",
      });
    }
  },
);

export const deleteNotification = createAsyncThunk(
  "notifications/deleteNotification",
  async (notificationId, thunkAPI) => {
    try {
      const response = await api.delete(`/network/notifications/${notificationId}`);
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message: error.response?.data?.message || "Could not remove notification",
        notificationId,
      });
    }
  },
);

export const markNotificationsRead = createAsyncThunk(
  "notifications/markNotificationsRead",
  async (_, thunkAPI) => {
    try {
      const response = await api.patch("/network/notifications/read");
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message:
          error.response?.data?.message || "Could not mark notifications as read",
      });
    }
  },
);
