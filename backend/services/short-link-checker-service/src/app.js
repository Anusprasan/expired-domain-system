const express = require("express");
const cors = require("cors");
const shortLinkCheckerRoutes = require("./modules/short-link-checker/shortLinkChecker.route");
const { requireProxySecret } = require("./modules/short-link-checker/shortLinkChecker.middleware");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Short Link Checker service is running" });
});

app.use(requireProxySecret);
app.use("/api", shortLinkCheckerRoutes);

module.exports = app;
