import React, { useCallback, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { getToken } from "../../auth/utils/authStorage";
import { MONEY_SITE_PRIVILEGES } from "../../money-sites/constants/moneySitePrivileges";
import DashboardHeader from "../components/DashboardHeader";
import DashboardPanel from "../components/DashboardPanel";
import DashboardSummaryCard from "../components/DashboardSummaryCard";
import { useDashboard } from "../hooks/useDashboard";
import "../../../shared/styles/dashboard.css";
import "../../../shared/styles/management.css";
import { getSocketBaseUrl } from "../../../shared/utils/socketBaseUrl";
import { localizeDashboardData } from "../../../shared/constants/uiLanguage";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import { hasAnyPrivilege } from "../../../shared/utils/permissions";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { copy, language } = useUiLanguage();
  const { dashboard, loading, error, hasError, reloadDashboard } = useDashboard();
  const canViewMoneySiteAlerts = hasAnyPrivilege(user, MONEY_SITE_PRIVILEGES);
  const refreshInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const statusRefreshTimerRef = useRef(null);

  const refreshDashboardSafely = useCallback(async () => {
    if (refreshInFlightRef.current) {
      pendingRefreshRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;
    try {
      await reloadDashboard();
    } finally {
      refreshInFlightRef.current = false;
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        void refreshDashboardSafely();
      }
    }
  }, [reloadDashboard]);

  useEffect(
    () => () => {
      if (statusRefreshTimerRef.current) {
        window.clearTimeout(statusRefreshTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!canViewMoneySiteAlerts) {
      return undefined;
    }

    const token = getToken();

    if (!token) {
      return undefined;
    }

    const socket = io(`${getSocketBaseUrl()}/money-sites`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    const handleStructureRefresh = () => {
      void refreshDashboardSafely();
    };

    const handleStatusRefresh = () => {
      if (statusRefreshTimerRef.current) {
        return;
      }

      statusRefreshTimerRef.current = window.setTimeout(() => {
        statusRefreshTimerRef.current = null;
        void refreshDashboardSafely();
      }, 1200);
    };

    socket.on("money-sites:changed", handleStructureRefresh);
    socket.on("money-sites:status-updated", handleStatusRefresh);
    socket.on("money-sites:bulk-check-complete", handleStructureRefresh);

    return () => {
      if (statusRefreshTimerRef.current) {
        window.clearTimeout(statusRefreshTimerRef.current);
        statusRefreshTimerRef.current = null;
      }

      socket.off("money-sites:changed", handleStructureRefresh);
      socket.off("money-sites:status-updated", handleStatusRefresh);
      socket.off("money-sites:bulk-check-complete", handleStructureRefresh);
      socket.disconnect();
    };
  }, [canViewMoneySiteAlerts, refreshDashboardSafely]);

  if (loading) {
    return (
      <div className="dashboard-page">
        <section className="app-panel dashboard-state-panel">
          <h1>{copy.dashboard.page.loadingTitle}</h1>
          <p>{copy.dashboard.page.loadingDescription}</p>
        </section>
      </div>
    );
  }

  if (hasError || !dashboard) {
    return (
      <div className="dashboard-page">
        <section className="app-panel dashboard-state-panel">
          <h1>{copy.dashboard.page.loadingTitle}</h1>
          <p>{error || copy.dashboard.page.loadErrorFallback}</p>
        </section>
      </div>
    );
  }

  const localizedDashboard = localizeDashboardData(dashboard, language, user);

  return (
    <div className="dashboard-page">
      <DashboardHeader
        title={localizedDashboard.header.title}
        welcome={localizedDashboard.header.welcome}
        subtitle={localizedDashboard.header.subtitle}
      />

      <section className="dashboard-summary-grid">
        {localizedDashboard.summaryCards.map((card) => (
          <DashboardSummaryCard key={card.id} card={card} />
        ))}
      </section>

      <DashboardPanel
        title={copy.dashboard.page.notificationsTitle}
        description={copy.dashboard.page.notificationsDescription}
      >
        <div className="dashboard-alert-list">
          {localizedDashboard.alerts?.length ? (
            localizedDashboard.alerts.map((alert) => {
              const content = (
                <>
                  <div className="dashboard-alert-copy">
                    <strong>{alert.title}</strong>
                    <p>{alert.message}</p>
                  </div>
                  {alert.path ? <span className="dashboard-alert-action">{copy.dashboard.page.openAction}</span> : null}
                </>
              );

              if (alert.path) {
                return (
                  <button
                    key={alert.id}
                    type="button"
                    className={`dashboard-alert dashboard-alert-button is-${alert.tone || "neutral"}`}
                    onClick={() => navigate(alert.path)}
                  >
                    {content}
                  </button>
                );
              }

              return (
                <article key={alert.id} className={`dashboard-alert is-${alert.tone || "neutral"}`}>
                  {content}
                </article>
              );
            })
          ) : (
            <p className="dashboard-empty-state">{copy.dashboard.page.noActiveNotifications}</p>
          )}
        </div>
      </DashboardPanel>

      <DashboardPanel
        title={copy.dashboard.page.quickActionsTitle}
        description={
          localizedDashboard.role === "admin"
            ? copy.dashboard.page.quickActionsDescriptionAdmin
            : copy.dashboard.page.quickActionsDescriptionUser
        }
      >
        <div className="dashboard-quick-actions">
          {localizedDashboard.quickActions.length ? (
            localizedDashboard.quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="dashboard-quick-action"
                onClick={() => navigate(action.path)}
              >
                <strong>{action.label}</strong>
                <span>{action.description}</span>
              </button>
            ))
          ) : (
            <p className="dashboard-empty-state">{copy.dashboard.page.noQuickActions}</p>
          )}
        </div>
      </DashboardPanel>
    </div>
  );
}
