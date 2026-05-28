import "./app/config/env.js";
import express from "express";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import app from "./app.js";
import { connectDB } from "./app/config/db.js";
import { attachRealtimeServer, createRealtimeHttpServer } from "./app/realtime/socket.js";
//Temp: Import seed function to seed privileges on server start
import { seedPrivileges } from "./modules/privileges/privilege.seed.js";
import { startActivityLogArchiver } from "./modules/activity-logs/activityLogArchive.service.js";
import { cleanupDevelopmentTemplateIndexes } from "./modules/development/developmentTemplate.model.js";
import { cleanupLPServerIndexes } from "./modules/lp-servers/lpServer.model.js";
import { startCuttlyLinkCheckerScheduleRunner } from "./modules/cuttly-link-checker/cuttlyLinkChecker.service.js";
import { startReportingTaskAutoCleanup } from "./modules/reporting-tasks/reportingTask.service.js";

const PORT = process.env.PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDistPath = join(__dirname, "../../frontend/dist");
const frontendIndexPath = join(frontendDistPath, "index.html");

function configureFrontendHosting() {
  if (!existsSync(frontendIndexPath)) {
    console.warn(`Frontend build was not found at ${frontendDistPath}. Serving API only.`);
    return;
  }

  app.use(express.static(frontendDistPath));

  // Keep `/api` for backend routes and let the backend serve the SPA for everything else.
  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(frontendIndexPath);
  });
  

  console.log(`Serving frontend from ${frontendDistPath}`);
}

const startServer = async () => {
  await connectDB();
  await cleanupDevelopmentTemplateIndexes();
  await cleanupLPServerIndexes();
  //Temp: Seed privileges on server start if not already seeded
  await seedPrivileges();
  startActivityLogArchiver();
  startCuttlyLinkCheckerScheduleRunner();
  startReportingTaskAutoCleanup();
  configureFrontendHosting();
  const server = createRealtimeHttpServer(app);
  attachRealtimeServer(server, app);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
