const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), override: true });

const app = require("./app");
const { startScreenshotScheduler } = require("./modules/screenshot-taker/screenshotTaker.scheduler.service");
const {
  closeStateStorage,
  initializeStateStorage,
} = require("./modules/screenshot-taker/screenshotTaker.storage");

const port = Number(process.env.PORT || 4010);

async function start() {
  await initializeStateStorage();
  startScreenshotScheduler();

  const server = app.listen(port, () => {
    console.log(`Screenshot Taker service running on port ${port}`);
  });

  const shutdown = async (signal) => {
    console.log(`[screenshot-taker] ${signal} received. Shutting down...`);
    server.close(async () => {
      try {
        await closeStateStorage();
      } finally {
        process.exit(0);
      }
    });
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

start().catch((error) => {
  console.error("[screenshot-taker] Failed to start service:", error);
  process.exit(1);
});
