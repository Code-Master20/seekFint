import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Provider } from "react-redux";
import {
  MdCheckCircle,
  MdError,
  MdInfo,
  MdWarningAmber,
} from "react-icons/md";
import "./index.css";
import { router } from "./app/router.jsx";
import { store } from "./app/store.js";

const getToastIcon = ({ type }) => {
  switch (type) {
    case "success":
      return <MdCheckCircle size={22} />;
    case "error":
      return <MdError size={22} />;
    case "warning":
      return <MdWarningAmber size={22} />;
    default:
      return <MdInfo size={22} />;
  }
};

createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <RouterProvider router={router} />
    <ToastContainer
      position="top-right"
      autoClose={3000}
      hideProgressBar={false}
      newestOnTop={true}
      closeOnClick
      pauseOnHover
      draggable
      icon={getToastIcon}
      toastClassName={({ type }) =>
        `appToast appToast--${type || "default"}`
      }
      bodyClassName="appToastBody"
      progressClassName="appToastProgress"
      closeButton={false}
    />
  </Provider>
);
