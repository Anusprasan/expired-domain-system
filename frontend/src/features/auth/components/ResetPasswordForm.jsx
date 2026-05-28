import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPasswordApi } from "../api/authApi";

export default function ResetPasswordForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [form, setForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!token) {
      setError("Reset token is missing from the link.");
      return;
    }

    if (!form.newPassword.trim()) {
      setError("New password is required");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);

    try {
      const response = await resetPasswordApi({
        token,
        newPassword: form.newPassword,
      });

      setSuccessMessage(response?.message || "Password reset successful");
      window.setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1500);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <div className="auth-field">
        <label htmlFor="newPassword" className="auth-label">
          New password
        </label>

        <input
          id="newPassword"
          name="newPassword"
          type="password"
          value={form.newPassword}
          onChange={handleChange}
          autoComplete="new-password"
          placeholder="Enter your new password"
          className="auth-input"
          required
        />
      </div>

      <div className="auth-field">
        <label htmlFor="confirmPassword" className="auth-label">
          Confirm password
        </label>

        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={form.confirmPassword}
          onChange={handleChange}
          autoComplete="new-password"
          placeholder="Confirm your new password"
          className="auth-input"
          required
        />
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      {successMessage ? <p className="auth-success">{successMessage}</p> : null}

      <button type="submit" disabled={submitting || !token} className="auth-submit">
        {submitting ? "Resetting..." : "Reset password"}
      </button>

      <div className="auth-secondary-actions">
        <Link to="/login" className="auth-secondary-link">
          Back to login
        </Link>
      </div>
    </form>
  );
}
