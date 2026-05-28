import express from "express";
import cors from "cors";
import { activityLogMiddleware } from "./app/middleware/activityLog.middleware.js";

import activityLogRoutes from "./modules/activity-logs/activityLog.route.js";
import authRoutes from "./modules/auth/auth.route.js";
import userRoutes from "./modules/users/user.route.js";
import groupRoutes from "./modules/groups/group.route.js";
import passwordResetRoutes from "./modules/password-reset/passwordReset.route.js";
import privilegeRoutes from "./modules/privileges/privilege.route.js";
import brandRoutes from "./modules/brands/brand.route.js";
import lpServerRoutes from "./modules/lp-servers/lpServer.route.js";
import developmentRoutes from "./modules/development/development.route.js";
import articlePoolRoutes from "./modules/article-pool/articlePool.route.js";
import dashboardRoutes from "./modules/dashboard/dashboard.route.js";
import rankProxyRoutes from "./modules/rank-proxy/rankProxy.routes.js";
import screenshotProxyRoutes from "./modules/screenshot-proxy/screenshotProxy.routes.js";
import shortLinkProxyRoutes from "./modules/short-link-proxy/shortLinkProxy.routes.js";
import cuttlyLinkCheckerRoutes from "./modules/cuttly-link-checker/cuttlyLinkChecker.route.js";
import reportingRoutes from "./modules/reporting/reporting.route.js";
import reportingTaskRoutes from "./modules/reporting-tasks/reportingTask.route.js";
import moneySiteRoutes from "./modules/money-sites/moneySite.route.js";
import moneySiteExternalRoutes from "./modules/money-sites/moneySite.external.route.js";
import siteAnalyticsRoutes from "./modules/site-analytics/siteAnalytics.route.js";
import databaseBackupRoutes from "./modules/database-backups/databaseBackup.route.js";
import websiteSnapshotRoutes from "./modules/website-snapshots/websiteSnapshot.route.js";
import expiredDomainRoutes from "./modules/expired-domains/expiredDomain.route.js";

const app = express();
const jsonBodyLimit = process.env.API_JSON_LIMIT || "35mb";

app.use(cors());
app.use(express.json({ limit: jsonBodyLimit }));
app.use(activityLogMiddleware);

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/password-reset", passwordResetRoutes);
app.use("/api/privileges", privilegeRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/lp-servers", lpServerRoutes);
app.use("/api/development", developmentRoutes);
app.use("/api/article-pool", articlePoolRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reporting", reportingRoutes);
app.use("/api/reporting-tasks", reportingTaskRoutes);
app.use("/api/rank", rankProxyRoutes);
app.use("/api/screenshot-taker", screenshotProxyRoutes);
app.use("/api/short-link-checker", shortLinkProxyRoutes);
app.use("/api/cuttly-link-checker", cuttlyLinkCheckerRoutes);
app.use("/api/money-sites", moneySiteRoutes);
app.use("/api/urls", moneySiteExternalRoutes);
app.use("/api/site-analytics", siteAnalyticsRoutes);
app.use("/api/database-backups", databaseBackupRoutes);
app.use("/api/website-snapshots", websiteSnapshotRoutes);
app.use("/api/expired-domains", expiredDomainRoutes);

export default app;
