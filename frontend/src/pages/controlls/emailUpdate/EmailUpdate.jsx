import { useState } from "react";
import { useDispatch } from "react-redux";
import { MdAlternateEmail } from "react-icons/md";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

import styles from "./EmailUpdate.module.css";
import api from "../../../lib/api";
import { checkMe } from "../../../store/auth/authThunks";

const initialEmailForm = {
  newEmail: "",
  currentEmailOtp: "",
  newEmailOtp: "",
};

export const EmailUpdate = ({ user }) => {
  const dispatch = useDispatch();

  const [emailStep, setEmailStep] = useState("request");

  const [emailForm, setEmailForm] = useState(initialEmailForm);

  const [emailMeta, setEmailMeta] = useState({
    currentEmail: "",
    newEmail: "",
  });

  const [emailLoading, setEmailLoading] = useState(false);
  const Navigate = useNavigate();

  const handleEmailInputChange = (event) => {
    const { name, value } = event.target;

    setEmailForm((prev) => ({
      ...prev,
      [name]:
        name === "newEmail"
          ? value.trim().toLowerCase()
          : value.trim(),
    }));
  };

  const handleEmailRequest = async (event) => {
    event.preventDefault();

    if (!emailForm.newEmail) {
      toast.error("Please enter a new email address.");
      return;
    }

    setEmailLoading(true);

    try {
      const response = await api.post("/auth/change-email/request", {
        newEmail: emailForm.newEmail,
      });

      const payload = response.data?.data || {};

      setEmailMeta({
        currentEmail: payload.currentEmail || user?.email || "",
        newEmail: payload.newEmail || emailForm.newEmail,
      });

      setEmailStep("verify");

      toast.success(
        response.data?.message || "Verification codes sent",
      );
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Could not send email OTPs",
      );
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailVerify = async (event) => {
    event.preventDefault();

    if (
      !emailForm.currentEmailOtp ||
      !emailForm.newEmailOtp
    ) {
      toast.error("Please enter both OTPs.");
      return;
    }

    setEmailLoading(true);

    try {
      const response = await api.post("/auth/change-email/verify", {
        newEmail: emailMeta.newEmail || emailForm.newEmail,
        currentEmailOtp: emailForm.currentEmailOtp,
        newEmailOtp: emailForm.newEmailOtp,
      });

      /*
       * Refresh Redux auth state so the new email immediately
       * appears everywhere that uses state.auth.user.
       */
      await dispatch(checkMe());

      setEmailForm(initialEmailForm);

      setEmailMeta({
        currentEmail: "",
        newEmail: "",
      });

      setEmailStep("request");

      toast.success(
        response.data?.message ||
          "Email updated successfully",
      );

      Navigate("/dashboard");
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Email could not be updated",
      );
    } finally {
      setEmailLoading(false);
    }
  };

  const handleStartOver = () => {
    setEmailStep("request");

    setEmailMeta({
      currentEmail: "",
      newEmail: "",
    });

    setEmailForm(initialEmailForm);
  };

  return (
    <article className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <p>Email security</p>
          <h2>Change email with dual OTP</h2>
        </div>
      </div>

      {emailStep === "request" ? (
        <form
          className={styles.form}
          onSubmit={handleEmailRequest}
        >
          <label className={styles.field}>
            <span>New email address</span>

            <input
              type="email"
              name="newEmail"
              placeholder="new-email@example.com"
              value={emailForm.newEmail}
              onChange={handleEmailInputChange}
              autoComplete="email"
            />
          </label>

          <button
            type="submit"
            className={styles.primarySubmit}
            disabled={
              emailLoading || !emailForm.newEmail
            }
          >
            <MdAlternateEmail />

            {emailLoading
              ? "Sending OTPs..."
              : "Send OTPs to old and new email"}
          </button>
        </form>
      ) : (
        <form
          className={styles.form}
          onSubmit={handleEmailVerify}
        >
          <div className={styles.noticeBox}>
            <strong>Verification codes sent</strong>

            <p>
              Current email: {emailMeta.currentEmail}
            </p>

            <p>
              New email: {emailMeta.newEmail}
            </p>
          </div>

          <label className={styles.field}>
            <span>OTP from current email</span>

            <input
              type="text"
              name="currentEmailOtp"
              inputMode="numeric"
              maxLength={8}
              value={emailForm.currentEmailOtp}
              onChange={handleEmailInputChange}
              autoComplete="one-time-code"
            />
          </label>

          <label className={styles.field}>
            <span>OTP from new email</span>

            <input
              type="text"
              name="newEmailOtp"
              inputMode="numeric"
              maxLength={8}
              value={emailForm.newEmailOtp}
              onChange={handleEmailInputChange}
              autoComplete="one-time-code"
            />
          </label>

          <div className={styles.formFooter}>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={handleStartOver}
              disabled={emailLoading}
            >
              Start over
            </button>

            <button
              type="submit"
              className={styles.primarySubmit}
              disabled={
                emailLoading ||
                !emailForm.currentEmailOtp ||
                !emailForm.newEmailOtp
              }
            >
              <MdAlternateEmail />

              {emailLoading
                ? "Verifying..."
                : "Verify and update email"}
            </button>
          </div>
        </form>
      )}
    </article>
  );
};