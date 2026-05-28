import React from "react";
import logo200m from "../../../assets/images/200m-logo.png";
import ForgotPasswordForm from "../components/ForgotPasswordForm";
import "../auth.css";

export default function ForgotPasswordPage() {
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
              <h2 className="auth-title">Forgot your password?</h2>
              <p className="auth-subtitle">
                Enter your email address and the backend will start the password reset flow for your account.
              </p>
            </div>

            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
