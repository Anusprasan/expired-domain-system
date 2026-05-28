import { forwardRankProxyRequest } from "./rankProxy.service.js";

export const proxyRankRequest = async (req, res) => {
  try {
    const response = await forwardRankProxyRequest(req);

    Object.entries(response.headers || {}).forEach(([headerName, headerValue]) => {
      if (headerValue) {
        res.setHeader(headerName, headerValue);
      }
    });

    if (response.body === null) {
      return res.status(response.statusCode).end();
    }

    if (typeof response.body === "string") {
      return res.status(response.statusCode).send(response.body);
    }

    return res.status(response.statusCode).json(response.body);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to proxy Rank Checker request",
      details: error.details || null,
    });
  }
};
