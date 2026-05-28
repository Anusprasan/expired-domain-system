import { forwardShortLinkProxyRequest } from "./shortLinkProxy.service.js";

export const proxyShortLinkRequest = async (req, res) => {
  try {
    const response = await forwardShortLinkProxyRequest(req);

    Object.entries(response.headers || {}).forEach(([headerName, headerValue]) => {
      if (headerValue) {
        res.setHeader(headerName, headerValue);
      }
    });

    if (response.body === null) {
      return res.status(response.statusCode).end();
    }

    if (Buffer.isBuffer(response.body)) {
      return res.status(response.statusCode).send(response.body);
    }

    if (typeof response.body === "string") {
      return res.status(response.statusCode).send(response.body);
    }

    return res.status(response.statusCode).json(response.body);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to proxy Short Link Checker request",
      details: error.details || null,
    });
  }
};
