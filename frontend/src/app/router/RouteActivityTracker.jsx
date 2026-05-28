import React, { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { recordPageVisitApi } from "../../features/activity-logs/api/activityLogsApi";
import { NAV_ITEMS } from "../../shared/constants/navigation";

function getPageMeta(pathname) {
  const navItem = NAV_ITEMS.find((item) => item.path === pathname);

  if (navItem) {
    return {
      path: pathname,
      pageLabel: navItem.label,
      pageKey: navItem.path,
      module: navItem.path.replace("/", "") || "dashboard",
    };
  }

  if (pathname === "/dashboard") {
    return {
      path: pathname,
      pageLabel: "Dashboard",
      pageKey: pathname,
      module: "dashboard",
    };
  }

  return {
    path: pathname,
    pageLabel: pathname,
    pageKey: pathname,
    module: "navigation",
  };
}

export default function RouteActivityTracker() {
  const location = useLocation();
  const { user, loading, isAuthenticated } = useAuth();
  const currentVisitRef = useRef(null);
  const currentMeta = useMemo(() => getPageMeta(location.pathname), [location.pathname]);

  useEffect(() => {
    if (loading || !isAuthenticated || !user || location.pathname === "/login") {
      currentVisitRef.current = null;
      return undefined;
    }

    const now = Date.now();
    const previousVisit = currentVisitRef.current;

    if (previousVisit && previousVisit.path !== currentMeta.path) {
      void recordPageVisitApi({
        ...previousVisit,
        durationMs: Math.max(0, now - previousVisit.startedAt),
      }).catch(() => {});
    }

    currentVisitRef.current = {
      ...currentMeta,
      startedAt: now,
      referrer: previousVisit?.path || document.referrer || "",
    };

    return undefined;
  }, [currentMeta, isAuthenticated, loading, location.pathname, user]);
  return null;
}
