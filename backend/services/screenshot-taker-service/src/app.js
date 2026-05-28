const express = require("express");
const cors = require("cors");
const screenshotTakerRoutes = require("./modules/screenshot-taker/screenshotTaker.route");
const { requireProxySecret } = require("./modules/screenshot-taker/screenshotTaker.middleware");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Screenshot Taker service is running" });
});

app.use(requireProxySecret);
app.use("/api", screenshotTakerRoutes);

module.exports = app;
