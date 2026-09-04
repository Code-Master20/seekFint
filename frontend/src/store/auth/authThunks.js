import api from "../../lib/api";
import { createAsyncThunk } from "@reduxjs/toolkit";
//========================tracking if user is already logged in==========================
export const checkMe = createAsyncThunk("auth/isMe", async (_, thunkAPI) => {
  try {
    const response = await api.get("/auth/me");
    return response.data;
  } catch (error) {
    let brokenResponse = {
      status: null,
      message: "",
      success: null,
    };
    if (error.response.status === 401) {
      const backendBrokenResponse = error.response.data;
      const status = error.response.status;
      const { message, success } = backendBrokenResponse;
      brokenResponse.status = status;
      brokenResponse.message = message;
      brokenResponse.success = success;
      
    }
    if (error.response.status === 500) {
      const backendBrokenResponse = error.response.data;
      const status = error.response.status;
      const { message, success } = backendBrokenResponse;
      brokenResponse.status = status;
      brokenResponse.message = message;
      brokenResponse.success = success;
    }

    return thunkAPI.rejectWithValue(brokenResponse);
  }
});

//==========================sending otp before sign-up verification=======================
export const signUpOtpReceived = createAsyncThunk(
  "auth/sign-up-otp",
  async (clientCredentials, thunkAPI) => {
    try {
      const response = await api.post("/auth/sign-up", clientCredentials);
      return response.data;
    } catch (error) {
      let brokenResponse = {
        status: null,
        message: "",
        success: null,
      };
      const backendBrokenResponse = error.response?.data;
      const status = error.response.status;

      const { message, success } = backendBrokenResponse;
      brokenResponse.message = message;
      brokenResponse.status = status;
      brokenResponse.success = success;
      return thunkAPI.rejectWithValue(brokenResponse);
    }
  },
);

//========================otp verify for successfull sign-up==============================
export const otpVerifiedAndSignedUp = createAsyncThunk(
  "auth/verify-sign-up-otp",
  async (clientCredentials, thunkAPI) => {
    try {
      const response = await api.post(
        "/auth/sign-up/verify-otp",
        clientCredentials,
      );

      const dataFromBackend = response.data;
      return dataFromBackend;
    } catch (error) {
      let brokenResponse = {
        status: null,
        message: "",
        success: null,
        id: null,
      };
      const backendBrokenResponse = error.response?.data;
      const status = error.response.status;

      const { message, success, id } = backendBrokenResponse;
      brokenResponse.status = status;
      brokenResponse.success = success;
      brokenResponse.message = message;
      brokenResponse.id = id;
      return thunkAPI.rejectWithValue(brokenResponse);
    }
  },
);

//==========================sending otp before log-in verification=======================
export const logInOtpReceived = createAsyncThunk(
  "auth/log-in-otp",
  async (clientCredentials, thunkAPI) => {
    try {
      const response = await api.post("/auth/log-in", clientCredentials);
      return response.data;
    } catch (error) {
      let brokenResponse = {
        status: null,
        message: "",
        success: null,
        data: null,
      };

      const { message, success, data } = error.response.data;
      const { status } = error.response;

      brokenResponse.message = message;
      brokenResponse.success = success;
      brokenResponse.status = status;
      brokenResponse.data = data;

      return thunkAPI.rejectWithValue(brokenResponse);
    }
  },
);

export const otpVerifiedAndLoggedIn = createAsyncThunk(
  "auth/verify-log-in-otp",
  async (clientCredentials, thunkAPI) => {
    try {
      const response = await api.post(
        "/auth/log-in/verify-otp",
        clientCredentials,
      );

      return response.data;
    } catch (error) {
      const brokenResponse = {
        message: "",
        success: null,
        status: null,
        id: null,
      };

      const { message, success, id } = error.response.data;
      const { status } = error.response;
      brokenResponse.message = message;
      brokenResponse.success = success;
      brokenResponse.status = status;
      brokenResponse.id = id;
      return thunkAPI.rejectWithValue(brokenResponse);
    }
  },
);

export const resetPassViaOldPass = createAsyncThunk(
  "auth/pass-reset-via-old-pass",
  async (clientCredentials, thunkAPI) => {
    try {
      const response = await api.post(
        "/auth/reset-password-with-old-password",
        clientCredentials,
      );

      return response.data;
    } catch (error) {
      const brokenResponse = {
        message: "",
        success: null,
        status: null,
      };

      const responseData = error.response?.data || {};
      const { message, success } = responseData;
      const status = error.response?.status || null;
      brokenResponse.message = message;
      brokenResponse.success = success;
      brokenResponse.status = status;
      return thunkAPI.rejectWithValue(brokenResponse);
    }
  },
);

export const resetPassOtpReceived = createAsyncThunk(
  "auth/pass-reset-otp",
  async (clientCredentials, thunkAPI) => {
    try {
      const response = await api.post(
        "/auth/reset-password-with-otp",
        clientCredentials,
      );

      return response.data;
    } catch (error) {
      const brokenResponse = {
        message: "",
        success: null,
        status: null,
      };

      const responseData = error.response?.data || {};
      const { message, success } = responseData;
      const status = error.response?.status || null;
      brokenResponse.message = message;
      brokenResponse.success = success;
      brokenResponse.status = status;
      return thunkAPI.rejectWithValue(brokenResponse);
    }
  },
);

export const otpVerifiedAndResetPassword = createAsyncThunk(
  "auth/verify-reset-password-otp",
  async (clientCredentials, thunkAPI) => {
    try {
      const response = await api.post(
        "/auth/reset-password-with-otp/verify-otp",
        clientCredentials,
      );

      return response.data;
    } catch (error) {
      const brokenResponse = {
        message: "",
        success: null,
        status: null,
        id: null,
      };

      const responseData = error.response?.data || {};
      const { message, success, id } = responseData;
      const status = error.response?.status || null;
      brokenResponse.message = message;
      brokenResponse.success = success;
      brokenResponse.status = status;
      brokenResponse.id = id;
      return thunkAPI.rejectWithValue(brokenResponse);
    }
  },
);

export const logOut = createAsyncThunk(
  "auth/logout",
  async (_, thunkAPI) => {
    try {
      const response = await api.post("/auth/log-out");
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message: error.response?.data?.message || "Logout failed",
        success: false,
      });
    }
  },
);

export const uploadProfilePic = createAsyncThunk(
  "auth/uploadProfilePic",
  async (file, thunkAPI) => {
    try {
      const formData = new FormData();
      formData.append("image", file); // must match multer.single("image")

      const response = await api.post("/user/upload-avatar", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message: error.response?.data?.message || "Upload failed",
        success: false,
      });
    }
  },
);

export const uploadBanner = createAsyncThunk(
  "auth/uploadBanner",
  async (file, thunkAPI) => {
    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await api.post("/user/upload-banner", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message: error.response?.data?.message || "Upload failed",
        success: false,
      });
    }
  },
);

export const uploadStory = createAsyncThunk(
  "auth/uploadStory",
  async (storyPayload, thunkAPI) => {
    try {
      const formData = new FormData();

      if (storyPayload?.mediaFile) {
        formData.append("media", storyPayload.mediaFile);
      }

      if (storyPayload?.audioFile) {
        formData.append("audio", storyPayload.audioFile);
      }

      if (storyPayload?.sourcePostId) {
        formData.append("sourcePostId", storyPayload.sourcePostId);
      }

      if (typeof storyPayload?.audioStartSeconds === "number") {
        formData.append("audioStartSeconds", `${storyPayload.audioStartSeconds}`);
      }

      if (typeof storyPayload?.audioEndSeconds === "number") {
        formData.append("audioEndSeconds", `${storyPayload.audioEndSeconds}`);
      }

      if (typeof storyPayload?.audioPlaybackDurationSeconds === "number") {
        formData.append(
          "audioPlaybackDurationSeconds",
          `${storyPayload.audioPlaybackDurationSeconds}`,
        );
      }

      const response = await api.post("/user/upload-story", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const meResponse = await api.get("/auth/me");

      return {
        ...meResponse.data,
        message:
          response.data?.message || "Story uploaded successfully",
      };
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message: error.response?.data?.message || "Story upload failed",
        success: false,
      });
    }
  },
);

export const deleteStory = createAsyncThunk(
  "auth/deleteStory",
  async (_, thunkAPI) => {
    try {
      const response = await api.delete("/user/delete-story");
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message: error.response?.data?.message || "Story removal failed",
        success: false,
      });
    }
  },
);

export const deleteStoryHistory = createAsyncThunk(
  "auth/deleteStoryHistory",
  async (storyHistoryId, thunkAPI) => {
    try {
      const response = await api.delete(`/user/story-history/${storyHistoryId}`);
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message: error.response?.data?.message || "Story removal failed",
        success: false,
      });
    }
  },
);

export const updateProfileDetails = createAsyncThunk(
  "auth/updateProfileDetails",
  async (profileDetails, thunkAPI) => {
    try {
      const response = await api.patch("/user/profile", profileDetails);
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message: error.response?.data?.message || "Profile update failed",
        success: false,
      });
    }
  },
);

export const updateCreatorMode = createAsyncThunk(
  "auth/updateCreatorMode",
  async (creator, thunkAPI) => {
    try {
      const response = await api.patch("/user/profile/creator", { creator });
      return response.data;
    } catch (error) {
      return thunkAPI.rejectWithValue({
        status: error.response?.status,
        message: error.response?.data?.message || "Creator mode update failed",
        success: false,
      });
    }
  },
);
