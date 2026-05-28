import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import logo200m from "../../assets/images/200m-logo.png";
import { useAuth } from "../../features/auth/hooks/useAuth";
import NotificationCenterButton from "../../features/dashboard/components/NotificationCenterButton";
import { MONEY_SITE_PRIVILEGES } from "../../features/money-sites/constants/moneySitePrivileges";
import { useMoneySiteNotifications } from "../../features/money-sites/hooks/useMoneySiteNotifications";
import { usePasswordResetRequests } from "../../features/password-reset/hooks/usePasswordResetRequests";
import { NAV_ITEMS } from "../constants/navigation";
import { getNavItemCopy } from "../constants/uiLanguage";
import { useGlobalDateFilter } from "../context/GlobalDateContext";
import { useTheme } from "../context/ThemeContext";
import { useUiLanguage } from "../hooks/useUiLanguage";
import { canAccessNavItem, hasAnyPrivilege } from "../utils/permissions";
import DatePicker from "./DatePicker";
import { AppIcon } from "./Icons";
import "../styles/dashboard.css";

const SIDEBAR_COLLAPSE_STORAGE_KEY = "app_sidebar_collapsed";

function NavItemLink({
  item,
  isSidebarCollapsed,
  onCollapsedPreviewEnter,
  onCollapsedPreviewLeave,
}) {
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
      aria-label={item.label}
      title={isSidebarCollapsed ? undefined : item.label}
      onMouseEnter={(event) => onCollapsedPreviewEnter?.(event, item.label)}
      onFocus={(event) => onCollapsedPreviewEnter?.(event, item.label)}
      onMouseLeave={onCollapsedPreviewLeave}
      onBlur={onCollapsedPreviewLeave}
    >
      {item.icon ? (
        <span className="app-nav-icon">
          <AppIcon name={item.icon} />
        </span>
      ) : null}
      <span className="app-nav-copy">
        <span className="app-nav-title">{item.label}</span>
        <span className="app-nav-description">{item.description}</span>
      </span>
    </NavLink>
  );
}

function getCompactProfileName(fullName) {
  const normalized = String(fullName || "").trim().replace(/\s+/g, " ");

  if (!normalized) {
    return "Admin";
  }

  return normalized;
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { copy } = useUiLanguage();
  const navigate = useNavigate();
  const sidebarRef = useRef(null);
  const navRef = useRef(null);
  const profileMenuRef = useRef(null);
  const globalDateRef = useRef(null);
  const previewHideTimeoutRef = useRef(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [collapsedPreview, setCollapsedPreview] = useState(null);
  const [isGlobalDatePanelOpen, setIsGlobalDatePanelOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "true";
  });
  const showResetNotifications = hasAnyPrivilege(user, [
    "ADMIN_ACCESS",
    "RESET_OTHER_USER_PASSWORDS",
  ]);
  const showMoneySiteNotifications = hasAnyPrivilege(user, MONEY_SITE_PRIVILEGES);
  const showNotificationCenter = showMoneySiteNotifications || showResetNotifications;
  const visibleNavItems = NAV_ITEMS.filter((item) => canAccessNavItem(user, item)).map((item) =>
    getNavItemCopy(item, user?.preferredLanguage || user?.moneySiteLanguage)
  );
  const {
    singleDate,
    useRange,
    fromDate,
    toDate,
    summaryLabel,
    setSingleDate,
    setRangeMode,
    setRange,
    resetDateFilter,
  } = useGlobalDateFilter();
  const fullProfileName = user?.fullName || "Admin";
  const compactProfileName = getCompactProfileName(fullProfileName);
  const {
    requests: resetRequests,
    loading: resetRequestsLoading,
    error: resetRequestsError,
    reloadRequests: reloadResetRequests,
    adminResetUserPassword,
    clearPasswordResetRequest,
    clearAllPasswordResetRequests,
  } = usePasswordResetRequests(showResetNotifications);
  const {
    summary: moneySiteSummary,
    loading: moneySiteNotificationsLoading,
    error: moneySiteNotificationsError,
    latestBlockedEvent,
    unreadBlockedItems,
    unreadBlockedCount,
    clearLatestBlockedEvent,
    markBlockedNotificationRead,
    markAllBlockedNotificationsRead,
    reloadSummary: reloadMoneySiteNotifications,
  } = useMoneySiteNotifications(showMoneySiteNotifications, {
    applyLiveSummaryUpdates: false,
  });

  const handleLogout = () => {
    setIsProfileMenuOpen(false);
    logout();
    navigate("/login");
  };

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }

      if (!globalDateRef.current?.contains(event.target)) {
        setIsGlobalDatePanelOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!isSidebarCollapsed) {
      setCollapsedPreview(null);
      setIsGlobalDatePanelOpen(false);
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const navElement = navRef.current;

    if (!navElement) {
      return undefined;
    }

    const handleScroll = () => {
      setCollapsedPreview(null);
    };

    navElement.addEventListener("scroll", handleScroll);

    return () => {
      navElement.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewHideTimeoutRef.current) {
        window.clearTimeout(previewHideTimeoutRef.current);
      }
    };
  }, []);

  const handleProfileCardClick = () => {
    setIsProfileMenuOpen((current) => !current);
  };

  const handleProfileMenuItemClick = () => {
    setIsProfileMenuOpen(false);
  };

  const handleNavigateToProfile = () => {
    handleProfileMenuItemClick();
    navigate("/my-profile");
  };

  const handleSidebarToggle = () => {
    setIsProfileMenuOpen(false);
    setIsGlobalDatePanelOpen(false);
    if (previewHideTimeoutRef.current) {
      window.clearTimeout(previewHideTimeoutRef.current);
      previewHideTimeoutRef.current = null;
    }
    setCollapsedPreview(null);
    setIsSidebarCollapsed((current) => !current);
  };

  const handleCollapsedPreviewEnter = (event, label) => {
    if (!isSidebarCollapsed || !sidebarRef.current) {
      return;
    }

    const sidebarRect = sidebarRef.current.getBoundingClientRect();
    const itemRect = event.currentTarget.getBoundingClientRect();
    const nextPreview = {
      label,
      top: itemRect.top - sidebarRect.top + itemRect.height / 2,
      isActive:
        event.currentTarget.classList.contains("active") ||
        event.currentTarget.getAttribute("aria-current") === "page",
    };

    if (previewHideTimeoutRef.current) {
      window.clearTimeout(previewHideTimeoutRef.current);
      previewHideTimeoutRef.current = null;
    }

    setCollapsedPreview((current) => {
      if (current) {
        return {
          ...nextPreview,
          visible: true,
        };
      }

      return {
        ...nextPreview,
        visible: false,
      };
    });

    window.requestAnimationFrame(() => {
      setCollapsedPreview((current) =>
        current
          ? {
              ...current,
              ...nextPreview,
              visible: true,
            }
          : current,
      );
    });
  };

  const handleCollapsedPreviewLeave = () => {
    setCollapsedPreview((current) =>
      current
        ? {
            ...current,
            visible: false,
          }
        : current,
    );

    if (previewHideTimeoutRef.current) {
      window.clearTimeout(previewHideTimeoutRef.current);
    }

    previewHideTimeoutRef.current = window.setTimeout(() => {
      setCollapsedPreview(null);
      previewHideTimeoutRef.current = null;
    }, 320);
  };

  const profileInitial = (user?.fullName || "A").trim().charAt(0).toUpperCase() || "A";

  return (
    <aside
      ref={sidebarRef}
      className={`app-sidebar${isSidebarCollapsed ? " is-collapsed" : ""}`}
    >
      <div className="app-brand">
        <div className="app-brand-row">
          <img src={logo200m} alt="200M Logo" className="app-brand-logo" />
          <div className="app-brand-actions">
            {showNotificationCenter ? (
              <NotificationCenterButton
                className={`app-brand-notification-button${unreadBlockedCount ? " app-brand-notification-button-alert" : ""}`}
                showMoneySiteNotifications={showMoneySiteNotifications}
                moneySiteSummary={moneySiteSummary}
                moneySiteLoading={moneySiteNotificationsLoading}
                moneySiteError={moneySiteNotificationsError}
                unreadBlockedItems={unreadBlockedItems}
                unreadBlockedCount={unreadBlockedCount}
                latestBlockedEvent={latestBlockedEvent}
                onDismissLatestBlockedEvent={clearLatestBlockedEvent}
                onRefreshMoneySites={reloadMoneySiteNotifications}
                onMarkMoneySiteRead={markBlockedNotificationRead}
                onMarkAllMoneySiteNotificationsRead={markAllBlockedNotificationsRead}
                showResetNotifications={showResetNotifications}
                passwordResetRequests={resetRequests}
                passwordResetLoading={resetRequestsLoading}
                passwordResetError={resetRequestsError}
                onRefreshPasswordResets={reloadResetRequests}
                onSubmitReset={adminResetUserPassword}
                onMarkPasswordResetRead={clearPasswordResetRequest}
                onMarkAllPasswordResetsRead={clearAllPasswordResetRequests}
              />
            ) : null}
            <button
              type="button"
              className="app-sidebar-toggle"
              onClick={handleSidebarToggle}
              aria-label={isSidebarCollapsed ? copy.sidebar.expandSidebar : copy.sidebar.collapseSidebar}
              title={isSidebarCollapsed ? copy.sidebar.expandSidebar : copy.sidebar.collapseSidebar}
              aria-pressed={isSidebarCollapsed}
            >
              <span className="app-sidebar-toggle-icon" aria-hidden="true">
                <AppIcon name={isSidebarCollapsed ? "chevron-right" : "chevron-left"} />
              </span>
            </button>
          </div>
        </div>
      </div>

      <nav ref={navRef} className="app-nav" aria-label="Primary">
        {visibleNavItems.map((item) => (
          <NavItemLink
            key={item.path}
            item={item}
            isSidebarCollapsed={isSidebarCollapsed}
            onCollapsedPreviewEnter={handleCollapsedPreviewEnter}
            onCollapsedPreviewLeave={handleCollapsedPreviewLeave}
          />
        ))}
      </nav>

      <div
        ref={globalDateRef}
        className={`app-sidebar-global-date${isSidebarCollapsed ? " is-collapsed" : ""}${isGlobalDatePanelOpen ? " is-open" : ""}`}
      >
        {isSidebarCollapsed ? (
          <>
            <button
              type="button"
              className="app-sidebar-global-date-toggle"
              onClick={() => setIsGlobalDatePanelOpen((current) => !current)}
              aria-label={copy.sidebar.openGlobalDateFilter}
              title={summaryLabel}
              aria-expanded={isGlobalDatePanelOpen}
            >
              <span className="app-sidebar-global-date-toggle-icon" aria-hidden="true">
                <AppIcon name="calendar" />
              </span>
            </button>

            {isGlobalDatePanelOpen ? (
              <div className="app-sidebar-global-date-popover">
                <div className="app-sidebar-global-date-header">
                  <div>
                    <strong className="app-sidebar-global-date-title">{copy.sidebar.globalDateTitle}</strong>
                    <p className="app-sidebar-global-date-summary">{summaryLabel}</p>
                  </div>
                  <button
                    type="button"
                    className="app-sidebar-global-date-reset"
                    onClick={resetDateFilter}
                  >
                    {copy.sidebar.today}
                  </button>
                </div>

                <p className="app-sidebar-global-date-copy">
                  {copy.sidebar.globalDateCopy}
                </p>

                <DatePicker
                  id="app-global-date-collapsed"
                  label=""
                  singleDate={singleDate}
                  useRange={useRange}
                  fromDate={fromDate}
                  toDate={toDate}
                  onSingleDateChange={setSingleDate}
                  onRangeModeChange={setRangeMode}
                  onRangeChange={setRange}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="app-sidebar-global-date-panel">
            <div className="app-sidebar-global-date-header">
              <div>
                <strong className="app-sidebar-global-date-title">{copy.sidebar.globalDateTitle}</strong>
                <p className="app-sidebar-global-date-summary">{summaryLabel}</p>
              </div>
              <button
                type="button"
                className="app-sidebar-global-date-reset"
                onClick={resetDateFilter}
              >
                {copy.sidebar.today}
              </button>
            </div>

            

            <DatePicker
              id="app-global-date"
              label=""
              singleDate={singleDate}
              useRange={useRange}
              fromDate={fromDate}
              toDate={toDate}
              onSingleDateChange={setSingleDate}
              onRangeModeChange={setRangeMode}
              onRangeChange={setRange}
              renderInPortal
              preferredPlacement="right"
            />
          </div>
        )}
      </div>

      {isSidebarCollapsed && collapsedPreview ? (
        <div
          className={`app-sidebar-preview${collapsedPreview.isActive ? " is-active" : ""}${collapsedPreview.visible ? " is-visible" : ""}`}
          style={{ top: `${collapsedPreview.top}px` }}
          aria-hidden="true"
        >
          <span className="app-sidebar-preview-label">{collapsedPreview.label}</span>
        </div>
      ) : null}

      <div className="app-sidebar-footer">
        <div className="app-sidebar-footer-controls">
          <div className="app-profile-menu" ref={profileMenuRef}>
            <button
              type="button"
              className={`app-profile-card${isProfileMenuOpen ? " open" : ""}`}
              onClick={handleProfileCardClick}
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
              title={isSidebarCollapsed ? fullProfileName : undefined}
            >
              <span className="app-profile-avatar" aria-hidden="true">
                {profileInitial}
              </span>
              <span className="app-profile-copy">
                <span className="app-profile-name" title={fullProfileName}>
                  {compactProfileName}
                </span>
              </span>
            </button>

            {isProfileMenuOpen ? (
              <div className="app-profile-dropdown" role="menu" aria-label={copy.sidebar.profileOptions}>
                <button
                  type="button"
                  className="app-profile-dropdown-item"
                  role="menuitem"
                  onClick={handleNavigateToProfile}
                >
                  {copy.sidebar.myProfile}
                </button>
                <button
                  type="button"
                  className="app-profile-dropdown-item app-profile-dropdown-item-danger"
                  role="menuitem"
                  onClick={handleLogout}
                >
                  <span className="app-profile-dropdown-icon" aria-hidden="true">
                    <AppIcon name="power" />
                  </span>
                  {copy.sidebar.logout}
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="app-theme-icon-button app-sidebar-theme-button"
            onClick={toggleTheme}
            aria-label={theme === "light" ? copy.sidebar.switchToDarkMode : copy.sidebar.switchToLightMode}
            title={theme === "light" ? copy.sidebar.darkMode : copy.sidebar.lightMode}
          >
            <span className="app-theme-icon">
              <AppIcon name={theme === "light" ? "moon" : "sun"} />
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
