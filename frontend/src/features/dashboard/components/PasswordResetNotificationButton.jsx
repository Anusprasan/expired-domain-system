import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ToastNotice from "../../../shared/components/ToastNotice";
import { AppIcon } from "../../../shared/components/Icons";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { useTheme } from "../../../shared/context/ThemeContext";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";

function formatDateTime(value, language, fallback) {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(language === "indonesian" ? "id-ID" : undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const EMPTY_FORM = {
  newPassword: "",
  adminNotes: "",
};

export default function PasswordResetNotificationButton({
  className = "",
  count,
  requests,
  loading,
  error,
  onRefresh,
  onSubmitReset,
  onClearRequest,
  onClearAll,
}) {
  const { theme } = useTheme();
  const { copy, language } = useUiLanguage();
  const notificationCopy = copy.dashboard.passwordResetNotification;
  const [open, setOpen] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState("");
  const [formByRequestId, setFormByRequestId] = useState({});
  const [busyRequestId, setBusyRequestId] = useState("");
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("success");

  const sortedRequests = useMemo(
    () =>
      [...requests].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ),
    [requests]
  );

  useEscapeKey(open, () => setOpen(false));

  const getForm = (requestId) => formByRequestId[requestId] || EMPTY_FORM;

  const handleChange = (requestId, name, value) => {
    setFormByRequestId((current) => ({
      ...current,
      [requestId]: {
        ...getForm(requestId),
        [name]: value,
      },
    }));
  };

  const handleSubmit = async (requestId) => {
    const form = getForm(requestId);

    if (!form.newPassword.trim()) {
      setMessageTone("error");
      setMessage(notificationCopy.newPasswordRequired);
      return;
    }

    try {
      setBusyRequestId(requestId);
      setMessage("");
      await onSubmitReset(requestId, {
        newPassword: form.newPassword,
        adminNotes: form.adminNotes,
      });
      setFormByRequestId((current) => ({
        ...current,
        [requestId]: EMPTY_FORM,
      }));
      setExpandedRequestId("");
      setMessageTone("success");
      setMessage(notificationCopy.resetCompleted);
    } catch (submitError) {
      setMessageTone("error");
      setMessage(submitError?.response?.data?.message || notificationCopy.resetFailed);
    } finally {
      setBusyRequestId("");
    }
  };

  const handleClearRequest = async (requestId) => {
    try {
      setBusyRequestId(requestId);
      setMessage("");
      await onClearRequest(requestId, {});
      setFormByRequestId((current) => ({
        ...current,
        [requestId]: EMPTY_FORM,
      }));
      setExpandedRequestId((current) => (current === requestId ? "" : current));
      setMessageTone("success");
      setMessage(notificationCopy.clearSuccess);
    } catch (submitError) {
      setMessageTone("error");
      setMessage(submitError?.response?.data?.message || notificationCopy.clearFailed);
    } finally {
      setBusyRequestId("");
    }
  };

  const handleClearAll = async () => {
    try {
      setIsClearingAll(true);
      setMessage("");
      await onClearAll({});
      setExpandedRequestId("");
      setMessageTone("success");
      setMessage(notificationCopy.clearAllSuccess);
    } catch (submitError) {
      setMessageTone("error");
      setMessage(submitError?.response?.data?.message || notificationCopy.clearAllFailed);
    } finally {
      setIsClearingAll(false);
    }
  };

  return (
    <>
      <ToastNotice message={message} onClose={() => setMessage("")} tone={messageTone} />

      <div className="dashboard-notification-wrap">
        <button
          type="button"
          className={`dashboard-notification-button${className ? ` ${className}` : ""}${open ? " is-open" : ""}`}
          onClick={() => setOpen(true)}
          aria-label={notificationCopy.buttonAria(count)}
        >
          <span className="dashboard-notification-icon" aria-hidden="true">
            <AppIcon name="bell" />
          </span>
          {count ? <span className="dashboard-notification-badge">{count}</span> : null}
        </button>
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
        <div className={`dashboard-reset-modal-backdrop is-${theme}`}>
          <div className={`dashboard-reset-modal app-panel is-${theme}`}>
            <div className="dashboard-reset-modal-header">
              <div>
                <span className="dashboard-reset-modal-eyebrow">{notificationCopy.modalEyebrow}</span>
                <h2 className="dashboard-reset-modal-title">{notificationCopy.title}</h2>
                <p>{notificationCopy.description}</p>
              </div>
              <div className="dashboard-reset-modal-actions">
                <button type="button" className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`} onClick={onRefresh} disabled={loading}>
                  {loading ? notificationCopy.refreshing : notificationCopy.refresh}
                </button>
                <button
                  type="button"
                  className={`dashboard-inline-button dashboard-inline-button-compact dashboard-reset-modal-button is-${theme}`}
                  onClick={handleClearAll}
                  disabled={loading || !sortedRequests.length || isClearingAll}
                >
                  {isClearingAll ? notificationCopy.clearingAll : notificationCopy.clearAll}
                </button>
                <button type="button" className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`} onClick={() => setOpen(false)}>
                  {notificationCopy.close}
                </button>
              </div>
            </div>

            {error ? <p className="dashboard-reset-feedback is-error">{error}</p> : null}

            {loading ? <p className="dashboard-reset-empty">{notificationCopy.loading}</p> : null}

            {!loading && !sortedRequests.length ? (
              <p className="dashboard-reset-empty">{notificationCopy.empty}</p>
            ) : null}

            {!loading && sortedRequests.length ? (
              <div className="dashboard-reset-list">
                {sortedRequests.map((request) => {
                  const isExpanded = expandedRequestId === request._id;
                  const form = getForm(request._id);
                  const targetUser = request.userId;

                  return (
                    <article key={request._id} className="dashboard-reset-item">
                      <div className="dashboard-reset-item-main">
                        <div className="dashboard-reset-item-copy">
                          <strong>{targetUser?.fullName || request.email}</strong>
                          <span>{targetUser?.email || request.email}</span>
                          <p>{notificationCopy.requestedAt(formatDateTime(request.createdAt, language, notificationCopy.unknown))}</p>
                        </div>
                        <div className="dashboard-reset-item-actions">
                            <button
                              type="button"
                              className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`}
                              onClick={() =>
                                setExpandedRequestId((current) => (current === request._id ? "" : request._id))
                              }
                            disabled={busyRequestId === request._id}
                          >
                            {isExpanded ? notificationCopy.hideResetForm : notificationCopy.resetPassword}
                          </button>
                          <button
                            type="button"
                            className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`}
                            onClick={() => handleClearRequest(request._id)}
                            disabled={busyRequestId === request._id || isClearingAll}
                          >
                            {busyRequestId === request._id ? notificationCopy.working : notificationCopy.clear}
                          </button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="dashboard-reset-form">
                          <div className="dashboard-reset-field">
                            <label htmlFor={`reset-password-${request._id}`}>{notificationCopy.newPasswordLabel}</label>
                            <input
                              id={`reset-password-${request._id}`}
                              type="password"
                              value={form.newPassword}
                              onChange={(event) =>
                                handleChange(request._id, "newPassword", event.target.value)
                              }
                              placeholder={notificationCopy.newPasswordPlaceholder}
                            />
                          </div>

                          <div className="dashboard-reset-field">
                            <label htmlFor={`reset-notes-${request._id}`}>{notificationCopy.adminNotesLabel}</label>
                            <textarea
                              id={`reset-notes-${request._id}`}
                              value={form.adminNotes}
                              onChange={(event) =>
                                handleChange(request._id, "adminNotes", event.target.value)
                              }
                              placeholder={notificationCopy.adminNotesPlaceholder}
                            />
                          </div>

                          <div className="dashboard-reset-form-actions">
                            <button
                              type="button"
                              className={`dashboard-inline-button dashboard-inline-button-primary dashboard-reset-modal-button is-${theme}`}
                              onClick={() => handleSubmit(request._id)}
                              disabled={busyRequestId === request._id}
                            >
                              {busyRequestId === request._id ? notificationCopy.resetting : notificationCopy.confirmReset}
                            </button>
                            <button
                              type="button"
                              className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`}
                              onClick={() => setExpandedRequestId("")}
                              disabled={busyRequestId === request._id}
                            >
                              {notificationCopy.cancel}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
        ,
        document.body
      ) : null}
    </>
  );
}
