import React from "react";
import LoginForm from "../components/LoginForm";
import logo200m from "../../../assets/images/200m-logo.png";
import "../auth.css";

export default function LoginPage() {
  return (
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-brand-panel">
          <img src={logo200m} alt="200M Logo" className="auth-brand-logo" />
        </div>

        <div className="auth-form-panel">
          <div className="auth-form-wrap">
            <div className="auth-copy">
              <button type="button" className="auth-pill">
                <span className="auth-pill-dot" />
                <span>200M Platform</span>
              </button>
              <h2 className="auth-title">Welcome back</h2>
              <p className="auth-subtitle">
                Sign in to continue to your dashboard and manage your account.
              </p>
            </div>

            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
