import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ActivityLogsPage from "../../features/activity-logs/pages/ActivityLogsPage";
import ContentPoolImportPage from "../../features/article-pool/pages/ContentPoolImportPage";
import ForgotPasswordPage from "../../features/auth/pages/ForgotPasswordPage";
import LoginPage from "../../features/auth/pages/LoginPage";
import ResetPasswordPage from "../../features/auth/pages/ResetPasswordPage";
import BrandsPage from "../../features/brands/pages/BrandsPage";
import DashboardPage from "../../features/dashboard/pages/DashboardPage";
import ProtectedRoute from "./ProtectedRoute";
import PrivilegeRoute from "./PrivilegeRoute";
import RouteActivityTracker from "./RouteActivityTracker";
import DashboardLayout from "../layouts/DashboardLayout";
import ModulePage from "../../shared/components/ModulePage";
import { NAV_ITEMS } from "../../shared/constants/navigation";
import UsersPage from "../../features/users/pages/UsersPage";
import GroupsPage from "../../features/groups/pages/GroupsPage";
import LpServerPage from "../../features/lp-servers/pages/LpServerPage";
import LpServerImportPage from "../../features/lp-servers/pages/LpServerImportPage";
import PrivilegesPage from "../../features/privileges/pages/PrivilegesPage";
import DevelopmentPage from "../../features/development/pages/DevelopmentPage";
import ArticlePoolPage from "../../features/article-pool/pages/ArticlePoolPage";
import ProfilePage from "../../features/profile/pages/ProfilePage";
import ReportingPage from "../../features/reporting/pages/ReportingPage";
import ReportingTasksPage from "../../features/reporting-tasks/pages/ReportingTasksPage";
import ReportingReviewPage from "../../features/reporting/pages/ReportingReviewPage";
import RankCheckerPage from "../../features/rank-checker/pages/RankCheckerPage";
import ScreenshotTakerPage from "../../features/screenshot-taker/pages/ScreenshotTakerPage";
import ShortLinkCheckerPage from "../../features/short-link-checker/pages/ShortLinkCheckerPage";
import CuttlyLinkCheckerPage from "../../features/cuttly-link-checker/pages/CuttlyLinkCheckerPage";
import MoneySiteImportPage from "../../features/money-sites/pages/MoneySiteImportPage";
import MoneySitesPage from "../../features/money-sites/pages/MoneySitesPage";
import DatabaseBackupsPage from "../../features/database-backups/pages/DatabaseBackupsPage";
import SiteAnalyticsPage from "../../features/site-analytics/pages/SiteAnalyticsPage";
import SiteAnalyticsDetailPage from "../../features/site-analytics/pages/SiteAnalyticsDetailPage";
import WebsiteSnapshotsPage from "../../features/website-snapshots/pages/WebsiteSnapshotsPage";
import ExpiredDomainsPage from "../../features/expired-domains/pages/ExpiredDomainsPage";
import WaybackCheckerPage from "../../features/wayback-checker/pages/WaybackCheckerPage";

const moduleRoutes = NAV_ITEMS.filter((item) => item.path !== "/dashboard");
const reportingReviewRouteItem = {
  requiredAnyPrivileges: [
    "VIEW_REPORTING_ADMIN_REVIEW",
    "GENERATE_REPORTING_AI_EMAIL",
    "SEND_REPORTING_EMAIL",
  ],
};
const moneySiteImportRouteItem = {
  requiredPrivilege: "CREATE_MONEY_SITES",
};
const contentPoolImportRouteItem = {
  requiredPrivilege: "IMPORT_ARTICLE_POOL",
};
const lpServerImportRouteItem = {
  requiredPrivilege: "IMPORT_LP_SERVERS_DETAILS",
};
const siteAnalyticsDetailRouteItem = {
  requiredAnyPrivileges: ["VIEW_SITE_ANALYTICS", "MANAGE_SITE_ANALYTICS"],
};

function renderProtectedPage(element) {
  return (
    <ProtectedRoute>
      <DashboardLayout>{element}</DashboardLayout>
    </ProtectedRoute>
  );
}

function renderPrivilegedPage(item, element) {
  return renderProtectedPage(<PrivilegeRoute item={item}>{element}</PrivilegeRoute>);
}

const pageByPath = {
  "/brands": <BrandsPage />,
  "/users": <UsersPage />,
  "/groups": <GroupsPage />,
  "/lp-servers": <LpServerPage />,
  "/privileges": <PrivilegesPage />,
  "/database-backups": <DatabaseBackupsPage />,
  "/development": <DevelopmentPage />,
  "/article-pool": <ArticlePoolPage />,
  "/reporting-tasks": <ReportingTasksPage />,
  "/reporting": <ReportingPage />,
  "/activity-logs": <ActivityLogsPage />,
  "/rank-checker": <RankCheckerPage />,
  "/screenshot-taker": <ScreenshotTakerPage />,
  "/short-link-checker": <ShortLinkCheckerPage />,
  "/cuttly-link-checker": <CuttlyLinkCheckerPage />,
  "/money-sites": <MoneySitesPage />,
  "/expired-domains": <ExpiredDomainsPage />,
  "/wayback-checker": <WaybackCheckerPage />,
  "/site-analytics": <SiteAnalyticsPage />,
  "/website-snapshots": <WebsiteSnapshotsPage />,
};

export default function AppRouter() {
  return (
    <BrowserRouter>
      <RouteActivityTracker />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route path="/dashboard" element={renderProtectedPage(<DashboardPage />)} />
        <Route path="/my-profile" element={renderProtectedPage(<ProfilePage />)} />
        <Route
          path="/article-pool/import"
          element={renderProtectedPage(
            <PrivilegeRoute item={contentPoolImportRouteItem}>
              <ContentPoolImportPage />
            </PrivilegeRoute>
          )}
        />
        <Route
          path="/lp-servers/import"
          element={renderProtectedPage(
            <PrivilegeRoute item={lpServerImportRouteItem}>
              <LpServerImportPage />
            </PrivilegeRoute>
          )}
        />
        <Route
          path="/money-sites/import"
          element={renderProtectedPage(
            <PrivilegeRoute item={moneySiteImportRouteItem}>
              <MoneySiteImportPage />
            </PrivilegeRoute>
          )}
        />
        <Route
          path="/site-analytics/details"
          element={renderProtectedPage(
            <PrivilegeRoute item={siteAnalyticsDetailRouteItem}>
              <SiteAnalyticsDetailPage />
            </PrivilegeRoute>
          )}
        />
        <Route
          path="/reporting/review/:reportId"
          element={renderProtectedPage(
            <PrivilegeRoute item={reportingReviewRouteItem}>
              <ReportingReviewPage />
            </PrivilegeRoute>
          )}
        />
        {moduleRoutes.map((item) => (
          <Route
            key={item.path}
            path={item.path}
            element={renderPrivilegedPage(
              item,
              pageByPath[item.path] || <ModulePage title={item.label} description={item.description} />
            )}
          />
        ))}

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
