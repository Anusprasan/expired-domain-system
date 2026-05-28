import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginForm() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(form);
      navigate("/dashboard");
    } catch (error) {
      setError(error?.response?.data?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <div className="auth-field">
        <label htmlFor="email" className="auth-label">
          Username or Email
        </label>

        <input
          id="email"
          name="email"
          type="text"
          value={form.email}
          onChange={handleChange}
          autoComplete="username"
          placeholder="you@example.com"
          className="auth-input"
        />
      </div>

      <div className="auth-field">
        <label htmlFor="password" className="auth-label">
          Password
        </label>

        <input
          id="password"
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          autoComplete="current-password"
          placeholder="Enter your password"
          className="auth-input"
        />
      </div>

      <div className="auth-actions">
        <Link to="/forgot-password" className="auth-link-button">
          Forgot password?
        </Link>
      </div>

      {error ? (
        <p className="auth-error">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="auth-submit"
      >
        {submitting ? "Logging in..." : "Login"}
      </button>

      <p className="auth-footnote">
        Protected access for authorized users only.
      </p>
    </form>
  );
}
