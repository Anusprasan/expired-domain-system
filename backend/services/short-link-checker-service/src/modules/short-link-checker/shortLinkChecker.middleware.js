function requireProxySecret(req, res, next) {
  const expectedSecret = String(process.env.SHORT_LINK_CHECKER_PROXY_SECRET || "").trim();
  const receivedSecret = String(req.headers["x-short-link-proxy-secret"] || "").trim();

  if (!expectedSecret) {
    return res.status(500).json({
      success: false,
      message: "SHORT_LINK_CHECKER_PROXY_SECRET is not configured",
    });
  }

  if (!receivedSecret || receivedSecret !== expectedSecret) {
    return res.status(401).json({
      success: false,
      message: "Invalid Short Link Checker proxy secret",
    });
  }

  return next();
}

module.exports = {
  requireProxySecret,
};
