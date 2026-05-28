import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import ToastNotice from "../../../shared/components/ToastNotice";
import { AppIcon } from "../../../shared/components/Icons";
import { useTheme } from "../../../shared/context/ThemeContext";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
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

export default function MoneySiteNotificationButton({
  className = "",
  summary,
  loading,
  error,
  latestBlockedEvent,
  onDismissLatestBlockedEvent,
  onRefresh,
}) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { copy, language } = useUiLanguage();
  const notificationCopy = copy.dashboard.moneySiteNotification;
  const [open, setOpen] = useState(false);
  const blockedItems = summary?.blockedItems || [];
  const count = Number(summary?.blocked || 0);
  const toastMessage = useMemo(() => {
    if (!latestBlockedEvent?.domains?.length) {
      return "";
    }

    if (latestBlockedEvent.domains.length === 1) {
      return notificationCopy.toastSingle(latestBlockedEvent.domains[0].domain);
    }

    return notificationCopy.toastMultiple(latestBlockedEvent.domains.length);
  }, [latestBlockedEvent, notificationCopy]);

  useEscapeKey(open, () => setOpen(false));

  const handleOpenMoneySites = () => {
    setOpen(false);
    navigate("/money-sites");
  };

  return (
    <>
      <ToastNotice
        message={toastMessage}
        onClose={onDismissLatestBlockedEvent}
        tone="notice"
      />

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
                  <button
                    type="button"
                    className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`}
                    onClick={onRefresh}
                    disabled={loading}
                  >
                    {loading ? notificationCopy.refreshing : notificationCopy.refresh}
                  </button>
                  <button
                    type="button"
                    className={`dashboard-inline-button dashboard-reset-modal-button is-${theme}`}
                    onClick={handleOpenMoneySites}
                  >
                    {notificationCopy.openMoneySites}
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

              {error ? <p className="dashboard-reset-feedback is-error">{error}</p> : null}

              <div className="dashboard-site-summary-grid">
                <div className="dashboard-site-summary-card">
                  <span>{notificationCopy.blocked}</span>
                  <strong>{summary?.blocked || 0}</strong>
                </div>
                <div className="dashboard-site-summary-card">
                  <span>{notificationCopy.totalMoneySites}</span>
                  <strong>{summary?.total || 0}</strong>
                </div>
                <div className="dashboard-site-summary-card">
                  <span>{notificationCopy.notBlocked}</span>
                  <strong>{summary?.notBlocked || 0}</strong>
                </div>
              </div>

              {loading ? <p className="dashboard-reset-empty">{notificationCopy.loading}</p> : null}

              {!loading && !blockedItems.length ? (
                <p className="dashboard-reset-empty">{notificationCopy.empty}</p>
              ) : null}

              {!loading && blockedItems.length ? (
                <div className="dashboard-reset-list">
                  {blockedItems.map((item) => (
                    <article key={item._id} className="dashboard-reset-item dashboard-site-alert-item">
                      <div className="dashboard-site-alert-top">
                        <div className="dashboard-site-alert-copy">
                          <strong>{item.domain}</strong>
                          <span>{item.brandId?.brandName || notificationCopy.unknownBrand}</span>
                        </div>
                        <span className="dashboard-site-alert-pill">{notificationCopy.blocked}</span>
                      </div>
                      <p className="dashboard-site-alert-time">
                        {notificationCopy.checkedAt(
                          formatDateTime(item.nawala?.lastChecked, language, notificationCopy.justNow)
                        )}
                      </p>
                      {item.note ? <p className="dashboard-site-alert-note">{item.note}</p> : null}
                    </article>
                  ))}
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
