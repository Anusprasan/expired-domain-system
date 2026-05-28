import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import ToastNotice from "../../../shared/components/ToastNotice";
import { AppIcon } from "../../../shared/components/Icons";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import { useTheme } from "../../../shared/context/ThemeContext";

const EMPTY_FORM = {
  newPassword: "",
  adminNotes: "",
};

function formatDateTime(value, language, fallback) {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(language === "indonesian" ? "id-ID" : undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function NotificationCenterButton({
  className = "",
  showMoneySiteNotifications = false,
  moneySiteSummary,
  moneySiteLoading = false,
  moneySiteError = "",
  unreadBlockedItems = [],
  unreadBlockedCount = 0,
  latestBlockedEvent,
  onDismissLatestBlockedEvent,
  onRefreshMoneySites,
  onMarkMoneySiteRead,
  onMarkAllMoneySiteNotificationsRead,
  showResetNotifications = false,
  passwordResetRequests = [],
  passwordResetLoading = false,
  passwordResetError = "",
  onRefreshPasswordResets,
  onSubmitReset,
  onMarkPasswordResetRead,
  onMarkAllPasswordResetsRead,
}) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { copy, language } = useUiLanguage();
  const notificationCopy = copy.dashboard.notificationCenter;
  const notificationWrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState("");
  const [formByRequestId, setFormByRequestId] = useState({});
  const [busyRequestId, setBusyRequestId] = useState("");
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isMarkingAllPasswordResetsRead, setIsMarkingAllPasswordResetsRead] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("success");
  const [blockedPreviewStyle, setBlockedPreviewStyle] = useState(null);

  const sortedPasswordResetRequests = useMemo(
    () =>
      [...passwordResetRequests].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ),
    [passwordResetRequests]
  );
  const activeBlockedCount = Number(moneySiteSummary?.blocked || 0);
  const totalMoneySites = Number(moneySiteSummary?.total || 0);
  const totalUnreadCount = unreadBlockedCount + sortedPasswordResetRequests.length;
  const blockedPreview = useMemo(() => {
    if (!latestBlockedEvent?.domains?.length) {
      return null;
    }

    if (latestBlockedEvent.domains.length === 1) {
      return {
        title: notificationCopy.blockedPreviewSingleTitle,
        message: latestBlockedEvent.domains[0].domain,
      };
    }

    return {
      title: notificationCopy.blockedPreviewMultiTitle(latestBlockedEvent.domains.length),
      message: latestBlockedEvent.domains
        .slice(0, 2)
        .map((item) => item.domain)
        .join(" • "),
    };
  }, [latestBlockedEvent, notificationCopy]);
  const latestMoneySiteTimestamp = useMemo(() => {
    const timestamps = unreadBlockedItems
      .map((item) => item?.nawala?.lastChecked || item?.updatedAt || item?.createdAt)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));

    if (latestBlockedEvent?.createdAt) {
      const eventTime = new Date(latestBlockedEvent.createdAt).getTime();

      if (Number.isFinite(eventTime)) {
        timestamps.push(eventTime);
      }
    }

    if (!timestamps.length) {
      return "";
    }

    return new Date(Math.max(...timestamps)).toISOString();
  }, [latestBlockedEvent, unreadBlockedItems]);
  const moneySitePreviewDomains = useMemo(() => {
    if (unreadBlockedItems.length) {
      return unreadBlockedItems
        .slice(0, 3)
        .map((item) => item?.domain)
        .filter(Boolean);
    }

    return (latestBlockedEvent?.domains || []).slice(0, 3).map((item) => item.domain).filter(Boolean);
  }, [latestBlockedEvent, unreadBlockedItems]);
  const shouldShowMoneySiteCard =
    showMoneySiteNotifications &&
    (moneySiteLoading || Boolean(moneySiteError) || unreadBlockedCount > 0 || activeBlockedCount > 0);
  const combinedNotifications = useMemo(() => {
    const items = [];

    if (shouldShowMoneySiteCard) {
      items.push({
        id: "money-site-summary",
        type: "money-site-summary",
        sortTime: latestMoneySiteTimestamp || new Date(0).toISOString(),
      });
    }

    if (showResetNotifications) {
      sortedPasswordResetRequests.forEach((request) => {
        items.push({
          id: request._id,
          type: "password-reset",
          sortTime: request.createdAt || new Date(0).toISOString(),
          request,
        });
      });
    }

    return items.sort(
      (left, right) => new Date(right.sortTime).getTime() - new Date(left.sortTime).getTime()
    );
  }, [
    latestMoneySiteTimestamp,
    shouldShowMoneySiteCard,
    showResetNotifications,
    sortedPasswordResetRequests,
  ]);
  const hasLoadingState =
    (showMoneySiteNotifications && moneySiteLoading) ||
    (showResetNotifications && passwordResetLoading);
  const showMarkAllMoneySiteReadAction = showMoneySiteNotifications && unreadBlockedCount > 0;
  const showMarkAllPasswordResetReadAction =
    showResetNotifications && sortedPasswordResetRequests.length > 0;
  const showNotificationToolbar =
    (showMoneySiteNotifications || showResetNotifications) &&
    (showMarkAllMoneySiteReadAction || showMarkAllPasswordResetReadAction || showMoneySiteNotifications);

  useEscapeKey(open, () => setOpen(false));

  useEffect(() => {
    if (!latestBlockedEvent || !onDismissLatestBlockedEvent) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onDismissLatestBlockedEvent();
    }, 4800);

    return () => window.clearTimeout(timeoutId);
  }, [latestBlockedEvent, onDismissLatestBlockedEvent]);

  useEffect(() => {
    if (!blockedPreview || open || typeof window === "undefined") {
      setBlockedPreviewStyle(null);
      return undefined;
    }

    const updatePreviewPosition = () => {
      const wrap = notificationWrapRef.current;

      if (!wrap) {
        return;
      }

      const rect = wrap.getBoundingClientRect();
      const viewportPadding = 16;
      const width = Math.min(296, window.innerWidth - viewportPadding * 2);
      const left = Math.max(
        viewportPadding,
        Math.min(rect.right + 14, window.innerWidth - width - viewportPadding)
      );
      const top = Math.max(viewportPadding, Math.min(rect.top - 6, window.innerHeight - 96));

      setBlockedPreviewStyle({
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
      });
    };

    updatePreviewPosition();
    window.addEventListener("resize", updatePreviewPosition);
    window.addEventListener("scroll", updatePreviewPosition, true);

    return () => {
      window.removeEventListener("resize", updatePreviewPosition);
      window.removeEventListener("scroll", updatePreviewPosition, true);
    };
  }, [blockedPreview, open]);

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

  const handleRefreshAll = async () => {
    try {
      setIsRefreshingAll(true);
      setMessage("");

      await Promise.allSettled([
        showMoneySiteNotifications && onRefreshMoneySites ? onRefreshMoneySites() : null,
        showResetNotifications && onRefreshPasswordResets ? onRefreshPasswordResets() : null,
      ]);
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const handleOpenMoneySites = () => {
    setOpen(false);
    onDismissLatestBlockedEvent?.();
    navigate("/money-sites");
  };

  const handleMarkAllMoneySiteNotificationsRead = () => {
    onMarkAllMoneySiteNotificationsRead?.();
    setMessageTone("success");
    setMessage(notificationCopy.allMoneySitesMarkedRead);
  };

  const handleSubmitReset = async (requestId) => {
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

  const handleMarkPasswordResetRead = async (requestId) => {
    try {
      setBusyRequestId(requestId);
      setMessage("");
      await onMarkPasswordResetRead(requestId, {});
      setFormByRequestId((current) => ({
        ...current,
        [requestId]: EMPTY_FORM,
      }));
      setExpandedRequestId((current) => (current === requestId ? "" : current));
      setMessageTone("success");
      setMessage(notificationCopy.requestMarkedRead);
    } catch (submitError) {
      setMessageTone("error");
      setMessage(submitError?.response?.data?.message || notificationCopy.requestMarkReadFailed);
    } finally {
      setBusyRequestId("");
    }
  };

  const handleMarkAllPasswordResetsRead = async () => {
    try {
      setIsMarkingAllPasswordResetsRead(true);
      setMessage("");
      await onMarkAllPasswordResetsRead({});
      setExpandedRequestId("");
      setMessageTone("success");
      setMessage(notificationCopy.allResetsMarkedRead);
    } catch (submitError) {
      setMessageTone("error");
      setMessage(submitError?.response?.data?.message || notificationCopy.allResetsMarkReadFailed);
    } finally {
      setIsMarkingAllPasswordResetsRead(false);
    }
  };

  return (
    <>
      <ToastNotice message={message} onClose={() => setMessage("")} tone={messageTone} />

      <div ref={notificationWrapRef} className="dashboard-notification-wrap">
        <button
          type="button"
          className={`dashboard-notification-button${className ? ` ${className}` : ""}${open ? " is-open" : ""}`}
          onClick={() => setOpen(true)}
          aria-label={notificationCopy.buttonAria(totalUnreadCount)}
        >
          <span className="dashboard-notification-icon" aria-hidden="true">
            <AppIcon name="bell" />
          </span>
          {totalUnreadCount ? (
            <span className="dashboard-notification-badge">{totalUnreadCount}</span>
          ) : null}
        </button>
      </div>

      {blockedPreview && !open && blockedPreviewStyle && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              className="dashboard-bell-alert-preview"
              style={blockedPreviewStyle}
              onClick={handleOpenMoneySites}
            >
              <span className="dashboard-bell-alert-preview-icon" aria-hidden="true">
                <AppIcon name="shield" />
              </span>
              <span className="dashboard-bell-alert-preview-copy">
                <strong>{blockedPreview.title}</strong>
                <span>{blockedPreview.message}</span>
              </span>
            </button>,
            document.body
          )
        : null}

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className={`dashboard-reset-modal-backdrop is-${theme}`}>
              <div className={`dashboard-reset-modal app-panel is-${theme}`}>
                <div className="dashboard-reset-modal-header">
                  <div>
                    <span className="dashboard-reset-modal-eyebrow">{notificationCopy.modalEyebrow}</span>
                    <h2 className="dashboard-reset-modal-title">{notificationCopy.modalTitle}</h2>
                    <p>{notificationCopy.modalDescription}</p>
                  </div>
                  <div className="dashboard-reset-modal-actions">
                    <button
                      type="button"
                      className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`}
                      onClick={handleRefreshAll}
                      disabled={isRefreshingAll}
                    >
                      {isRefreshingAll ? notificationCopy.refreshingAll : notificationCopy.refreshAll}
                    </button>
                    <button
                      type="button"
                      className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`}
                      onClick={() => setOpen(false)}
                    >
                      {notificationCopy.close}
                    </button>
                  </div>
                </div>

                <div className="dashboard-site-summary-grid">
                  <div className="dashboard-site-summary-card">
                    <span>{notificationCopy.unreadNotifications}</span>
                    <strong>{totalUnreadCount}</strong>
                  </div>
                  {showMoneySiteNotifications ? (
                    <div className="dashboard-site-summary-card">
                      <span>{notificationCopy.blockedMoneySites}</span>
                      <strong>{activeBlockedCount}</strong>
                    </div>
                  ) : null}
                  {showResetNotifications ? (
                    <div className="dashboard-site-summary-card">
                      <span>{notificationCopy.passwordResetRequests}</span>
                      <strong>{sortedPasswordResetRequests.length}</strong>
                    </div>
                  ) : null}
                </div>

                {showNotificationToolbar ? (
                  <div className="dashboard-reset-item-actions dashboard-notification-toolbar">
                    {showMoneySiteNotifications ? (
                      <button
                        type="button"
                        className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`}
                        onClick={handleOpenMoneySites}
                      >
                        {notificationCopy.openMoneySites}
                      </button>
                    ) : null}
                    {showMarkAllMoneySiteReadAction ? (
                      <button
                        type="button"
                        className={`dashboard-inline-button dashboard-inline-button-compact dashboard-reset-modal-button is-${theme}`}
                        onClick={handleMarkAllMoneySiteNotificationsRead}
                      >
                        {notificationCopy.markMoneySiteAlertsRead}
                      </button>
                    ) : null}
                    {showMarkAllPasswordResetReadAction ? (
                      <button
                        type="button"
                        className={`dashboard-inline-button dashboard-inline-button-compact dashboard-reset-modal-button is-${theme}`}
                        onClick={handleMarkAllPasswordResetsRead}
                        disabled={passwordResetLoading || isMarkingAllPasswordResetsRead}
                      >
                        {isMarkingAllPasswordResetsRead ? notificationCopy.working : notificationCopy.markPasswordResetsRead}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {moneySiteError ? (
                  <p className="dashboard-reset-feedback is-error">{moneySiteError}</p>
                ) : null}
                {passwordResetError ? (
                  <p className="dashboard-reset-feedback is-error">{passwordResetError}</p>
                ) : null}

                {hasLoadingState && !combinedNotifications.length ? (
                  <p className="dashboard-reset-empty">{notificationCopy.loadingNotifications}</p>
                ) : null}

                {!hasLoadingState && !combinedNotifications.length ? (
                  <p className="dashboard-reset-empty">{notificationCopy.noNotifications}</p>
                ) : null}

                {combinedNotifications.length ? (
                  <div className="dashboard-reset-list">
                    {combinedNotifications.map((notification) => {
                      if (notification.type === "money-site-summary") {
                        return (
                          <article
                            key={notification.id}
                            className="dashboard-reset-item dashboard-notification-item dashboard-site-alert-item"
                          >
                            <div className="dashboard-reset-item-main">
                              <div className="dashboard-reset-item-copy">
                                <div className="dashboard-notification-title-row">
                                  <strong>{notificationCopy.moneySiteMonitoringTitle}</strong>
                                  <span className="dashboard-notification-kind">{notificationCopy.moneySitesKind}</span>
                                </div>
                                <span>
                                  {activeBlockedCount
                                    ? notificationCopy.moneySiteSummaryBlocked(activeBlockedCount, totalMoneySites)
                                    : unreadBlockedCount
                                      ? notificationCopy.moneySiteSummaryUnread(unreadBlockedCount)
                                      : notificationCopy.moneySiteSummaryClear}
                                </span>
                                <p className="dashboard-site-alert-time">
                                  {latestMoneySiteTimestamp
                                    ? notificationCopy.updatedAt(
                                        formatDateTime(
                                          latestMoneySiteTimestamp,
                                          language,
                                          notificationCopy.unknown
                                        )
                                      )
                                    : notificationCopy.watchingLive}
                                </p>
                                {moneySitePreviewDomains.length ? (
                                  <p className="dashboard-site-alert-note">
                                    {notificationCopy.latestPrefix}: {moneySitePreviewDomains.join(", ")}
                                  </p>
                                ) : null}
                              </div>
                              <div className="dashboard-reset-item-actions">
                                {activeBlockedCount ? (
                                  <span className="dashboard-site-alert-pill">
                                    {notificationCopy.blockedPill(activeBlockedCount)}
                                  </span>
                                ) : null}
                                {unreadBlockedCount ? (
                                  <button
                                    type="button"
                                    className={`dashboard-inline-button dashboard-inline-button-compact dashboard-reset-modal-button is-${theme}`}
                                    onClick={handleMarkAllMoneySiteNotificationsRead}
                                  >
                                    {notificationCopy.markAsRead}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      }

                      const request = notification.request;
                      const isExpanded = expandedRequestId === request._id;
                      const form = getForm(request._id);
                      const targetUser = request.userId;

                      return (
                        <article
                          key={request._id}
                          className="dashboard-reset-item dashboard-notification-item"
                        >
                          <div className="dashboard-reset-item-main">
                            <div className="dashboard-reset-item-copy">
                              <div className="dashboard-notification-title-row">
                                <strong>{targetUser?.fullName || request.email}</strong>
                                <span className="dashboard-notification-kind">{notificationCopy.passwordResetKind}</span>
                              </div>
                              <span>{targetUser?.email || request.email}</span>
                              <p>
                                {notificationCopy.requestedAt(
                                  formatDateTime(request.createdAt, language, notificationCopy.unknown)
                                )}
                              </p>
                            </div>
                            <div className="dashboard-reset-item-actions">
                              <button
                                type="button"
                                className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`}
                                onClick={() =>
                                  setExpandedRequestId((current) =>
                                    current === request._id ? "" : request._id
                                  )
                                }
                                disabled={busyRequestId === request._id}
                              >
                                {isExpanded ? notificationCopy.hideResetForm : notificationCopy.resetPassword}
                              </button>
                              <button
                                type="button"
                                className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`}
                                onClick={() => handleMarkPasswordResetRead(request._id)}
                                disabled={
                                  busyRequestId === request._id || isMarkingAllPasswordResetsRead
                                }
                              >
                                {busyRequestId === request._id ? notificationCopy.working : notificationCopy.markAsRead}
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
                                  onClick={() => handleSubmitReset(request._id)}
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
            </div>,
            document.body
          )
        : null}
    </>
  );
}
