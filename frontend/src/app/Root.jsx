import "./Root.css";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { HeaderOne } from "../components/layout/Header/HeaderOne";
import { HeaderTwo } from "../components/layout/Header/HeaderTwo";
import { Outlet, useLocation } from "react-router-dom";
import { checkMe } from "../store/auth/authThunks";
import { fetchNotifications } from "../store/notifications/notificationsThunks";
import { PublicSiteHeader } from "../components/layout/Header/PublicSiteHeader";

const shouldShowGuestHeader = (pathname) => {
  if (
    pathname === "/" ||
    pathname === "/home-feed" ||
    pathname === "/photo-feed" ||
    pathname === "/video-feed" ||
    pathname === "/post-feed"
  ) {
    return true;
  }

  if (/^\/games\/[^/]+$/.test(pathname)) {
    return true;
  }
  return /^\/profile\/[^/]+$/.test(pathname);
};

export const Root = () => {
  const dispatch = useDispatch();
  const { checkingAuth, isAuthenticated } = useSelector((state) => state.auth);
  const location = useLocation();

  useEffect(() => {
    dispatch(checkMe());
  }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated) {
      const refreshNotifications = () => {
        dispatch(fetchNotifications());
      };
      const handleVisibilityRefresh = () => {
        if (document.visibilityState === "visible") {
          refreshNotifications();
        }
      };

      refreshNotifications();
      window.addEventListener("focus", refreshNotifications);
      document.addEventListener("visibilitychange", handleVisibilityRefresh);

      const timer = setInterval(() => {
        refreshNotifications();
      }, 15000);

      return () => {
        clearInterval(timer);
        window.removeEventListener("focus", refreshNotifications);
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityRefresh,
        );
      };
    }
  }, [dispatch, isAuthenticated]);

  return (
    <div className="root-container">
      {isAuthenticated && (
        <div className="app-header-stack">
          <div className="primary-header-shell">
            <HeaderOne />
          </div>
          <HeaderTwo />
        </div>
      )}
      {!isAuthenticated &&
      (!checkingAuth || shouldShowGuestHeader(location.pathname)) &&
      shouldShowGuestHeader(location.pathname) ? (
        <div className="app-header-stack">
          <PublicSiteHeader />
        </div>
      ) : null}
      <Outlet />
    </div>
  );
};
