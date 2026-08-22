import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
} from "react-router-dom";
import { Root } from "./Root.jsx";
import { EditPassword } from "../pages/auth/EditPassword.jsx";
import { LogIn } from "../pages/auth/LogIn.jsx";
import { OtpVerification } from "../pages/auth/OtpVerification.jsx";
import { SignUp } from "../pages/auth/SignUp.jsx";
import { PrivateRoute } from "../routes/auth/PrivateRoute.jsx";
import { PublicRoute } from "../routes/auth/PublicRoute.jsx";
import { Dashboard } from "../pages/dashboard/Dashboard.jsx";
import { EmailUpdate } from "../pages/controlls/emailUpdate/EmailUpdate.jsx";
import { HomeFeed } from "../pages/feeds/home/HomeFeed.jsx";
import { PhotoFeed } from "../pages/feeds/photo/PhotoFeed.jsx";
import { PostFeed } from "../pages/feeds/post/PostFeed.jsx";
import { VideoFeed } from "../pages/feeds/video/VideoFeed.jsx";
import { GameArena } from "../pages/games/GameArena.jsx";
import { NotificationCenter } from "../pages/network/notifications/NotificationCenter.jsx";
import { PeopleHub } from "../pages/network/people/PeopleHub.jsx";
import { PublicPostDetail } from "../pages/posts/PublicPostDetail.jsx";
import { Profile } from "../pages/profile/Profile.jsx";
import { ProfileStoryDetail } from "../pages/profile/ProfileStoryDetail.jsx";
import { UploadStudio } from "../pages/upload/UploadStudio.jsx";

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<Root />}>
      <Route index element={<HomeFeed />} />
      <Route
        path="login"
        element={
          <PublicRoute>
            <LogIn />
          </PublicRoute>
        }
      />
      <Route
        path="signup"
        element={
          <PublicRoute>
            <SignUp />
          </PublicRoute>
        }
      />
      <Route path="reset-password" element={<EditPassword />} />
      <Route path="verify-otp" element={<OtpVerification />} />

      <Route 
      path="emailupdate"
      element={
        <PrivateRoute>
          <EmailUpdate/>
        </PrivateRoute>
      }
      />
      

      <Route
        path="dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="upload"
        element={
          <PrivateRoute>
            <UploadStudio />
          </PrivateRoute>
        }
      />
      <Route path="home-feed" element={<HomeFeed />} />
      <Route path="video-feed" element={<VideoFeed />} />
      <Route path="photo-feed" element={<PhotoFeed />} />
      <Route path="post-feed" element={<PostFeed />} />
      <Route path="games/:gameKey" element={<GameArena />} />
      <Route path="posts/:postId" element={<PublicPostDetail />} />
      <Route
        path="people"
        element={
          <PrivateRoute>
            <PeopleHub />
          </PrivateRoute>
        }
      />
      <Route
        path="notifications"
        element={
          <PrivateRoute>
            <NotificationCenter />
          </PrivateRoute>
        }
      />
      <Route
        path="profile"
        element={
          <PrivateRoute>
            <Profile />
          </PrivateRoute>
        }
      />
      <Route path="profile/:userId" element={<Profile />} />
      <Route
        path="profile/stories/:storyEntryId"
        element={
          <PrivateRoute>
            <ProfileStoryDetail />
          </PrivateRoute>
        }
      />
    </Route>,
  ),
);
