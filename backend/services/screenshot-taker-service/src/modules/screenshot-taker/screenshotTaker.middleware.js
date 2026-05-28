function requireProxySecret(req, res, next) {
  const expectedSecret = String(
    process.env.SCREENSHOT_TAKER_PROXY_SECRET || process.env.SCREENSHOT_PROXY_SHARED_SECRET || ""
  ).trim();
  const providedSecret = String(req.headers["x-screenshot-proxy-secret"] || "").trim();

  if (!expectedSecret) {
    return res.status(500).json({
      success: false,
      message: "SCREENSHOT_TAKER_PROXY_SECRET is not configured",
    });
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized screenshot proxy request",
    });
  }

  return next();
}

module.exports = {
  requireProxySecret,
};

