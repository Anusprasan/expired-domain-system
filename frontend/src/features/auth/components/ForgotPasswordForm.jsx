import React, { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPasswordApi } from "../api/authApi";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
    setSubmitting(true);

    try {
      const response = await forgotPasswordApi({ email });
      setSuccessMessage(
        response?.message ||
          "If the email exists in the system, the password reset flow has been initiated."
      );
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to start password reset");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <div className="auth-field">
        <label htmlFor="email" className="auth-label">
          Email
        </label>

        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          className="auth-input"
          required
        />
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      {successMessage ? <p className="auth-success">{successMessage}</p> : null}

      <button type="submit" disabled={submitting} className="auth-submit">
        {submitting ? "Sending..." : "Send reset instructions"}
      </button>

      <div className="auth-secondary-actions">
        <Link to="/login" className="auth-secondary-link">
          Back to login
        </Link>
      </div>
    </form>
  );
}
