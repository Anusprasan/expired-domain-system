import bcrypt from "bcryptjs";
import User from "../users/user.model.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SCREENSHOT_BASE_ACCESS_PRIVILEGES = [
  "ADMIN_ACCESS",
  "VIEW_SCREENSHOT_TAKER",
  "MANAGE_SCREENSHOT_TAKER",
  "CAPTURE_SCREENSHOT_TAKER",
  "SCHEDULE_SCREENSHOT_TAKER",
];
const SCREENSHOT_MANAGE_PRIVILEGES = ["ADMIN_ACCESS", "MANAGE_SCREENSHOT_TAKER"];
const SCREENSHOT_CAPTURE_PRIVILEGES = [
  "ADMIN_ACCESS",
  "MANAGE_SCREENSHOT_TAKER",
  "CAPTURE_SCREENSHOT_TAKER",
];
const SCREENSHOT_SCHEDULE_PRIVILEGES = ["ADMIN_ACCESS", "SCHEDULE_SCREENSHOT_TAKER"];

function normalizeBaseUrl() {
  const configuredBaseUrl = String(process.env.SCREENSHOT_TAKER_SERVICE_URL || "").trim();

  if (!configuredBaseUrl) {
    throw new Error("SCREENSHOT_TAKER_SERVICE_URL is not configured");
  }

  return configuredBaseUrl.replace(/\/+$/, "");
}

function normalizeServicePath(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedPath === "/" ? "" : normalizedPath;
}

function getRequestedServicePath(req) {
  const fromWildcardParam = req?.params?.[0];

  if (fromWildcardParam) {
    return normalizeServicePath(`/${String(fromWildcardParam).replace(/^\/+/, "")}`);
  }

  // Fallback for routers that do not populate wildcard params consistently.
  const baseUrlPath = String(req?.baseUrl || "");
  const originalPath = String(req?.originalUrl || req?.url || "").split("?")[0];
  let servicePath = originalPath;

  if (baseUrlPath && servicePath.startsWith(baseUrlPath)) {
    servicePath = servicePath.slice(baseUrlPath.length);
  }

  return normalizeServicePath(servicePath || "/");
}

function getProxyTimeoutMs(servicePath, method) {
  if (servicePath === "/captures/live" && method === "POST") {
    return Number(process.env.SCREENSHOT_PROXY_LIVE_TIMEOUT_MS || 120000);
  }

  return Number(process.env.SCREENSHOT_PROXY_TIMEOUT_MS || 60000);
}

function buildTargetUrl(req) {
  const servicePath = getRequestedServicePath(req);
  const targetUrl = new URL(`/api${servicePath}`, normalizeBaseUrl());
  const query = new URLSearchParams(req.query || {});
  const queryString = query.toString();

  if (queryString) {
    targetUrl.search = queryString;
  }

  return targetUrl;
}

function getPrivilegeKeys(req) {
  return req.user?.groupId?.privilegeIds?.map((item) => item.key) || [];
}

function hasAdminAccess(req) {
  const groupName = req.user?.groupId?.name?.toLowerCase();
  return groupName === "admin" || getPrivilegeKeys(req).includes("ADMIN_ACCESS");
}

function hasPrivilege(req, privilegeKey) {
  if (privilegeKey === "ADMIN_ACCESS") {
    return hasAdminAccess(req);
  }

  if (hasAdminAccess(req)) {
    return true;
  }

  return getPrivilegeKeys(req).includes(privilegeKey);
}

function hasAnyPrivilege(req, privilegeKeys = []) {
  return privilegeKeys.some((privilegeKey) => hasPrivilege(req, privilegeKey));
}

async function assertAdminPassword(req) {
  if (!hasAdminAccess(req)) {
    const error = new Error("Only admins can clear screenshot images");
    error.statusCode = 403;
    throw error;
  }

  const password = String(req.body?.password || "");

  if (!password) {
    const error = new Error("Admin password is required");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(req.user?._id).select("status passwordHash");

  if (!user || user.status !== "active" || !user.passwordHash) {
    const error = new Error("Admin account could not be verified");
    error.statusCode = 403;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);

  if (!isMatch) {
    const error = new Error("Admin password is incorrect");
    error.statusCode = 401;
    throw error;
  }
}

async function assertProxyAccess(req) {
  const servicePath = getRequestedServicePath(req);
  const method = String(req.method || "GET").toUpperCase();

  if (!hasAnyPrivilege(req, SCREENSHOT_BASE_ACCESS_PRIVILEGES)) {
    const error = new Error("You do not have permission to access Screenshot Taker");
    error.statusCode = 403;
    throw error;
  }

  if (servicePath === "/sites" && !READ_ONLY_METHODS.has(method)) {
    if (!hasAnyPrivilege(req, SCREENSHOT_MANAGE_PRIVILEGES)) {
      const error = new Error("You do not have permission to assign screenshot sites");
      error.statusCode = 403;
      throw error;
    }
  }

  if (servicePath.startsWith("/sites/") && method === "DELETE") {
    if (!hasAnyPrivilege(req, SCREENSHOT_MANAGE_PRIVILEGES)) {
      const error = new Error("You do not have permission to remove screenshot sites");
      error.statusCode = 403;
      throw error;
    }
  }

  if (servicePath.startsWith("/sites/") && servicePath.endsWith("/capture") && method === "POST") {
    if (!hasAnyPrivilege(req, SCREENSHOT_CAPTURE_PRIVILEGES)) {
      const error = new Error("You do not have permission to capture screenshot sites");
      error.statusCode = 403;
      throw error;
    }
  }

  if (servicePath === "/captures/live" && method === "POST") {
    if (!hasAnyPrivilege(req, SCREENSHOT_CAPTURE_PRIVILEGES)) {
      const error = new Error("You do not have permission to capture screenshot previews");
      error.statusCode = 403;
      throw error;
    }
  }

  if (servicePath === "/captures/images/storage" && !hasAdminAccess(req)) {
    const error = new Error("Only admins can view screenshot image storage");
    error.statusCode = 403;
    throw error;
  }

  if (
    (servicePath === "/captures/images" && method === "DELETE")
    || (servicePath === "/captures/images/clear" && method === "POST")
  ) {
    await assertAdminPassword(req);
  }

  if (servicePath === "/schedule" && !READ_ONLY_METHODS.has(method)) {
    if (!hasAnyPrivilege(req, SCREENSHOT_SCHEDULE_PRIVILEGES)) {
      const error = new Error("You do not have permission to manage screenshot schedules");
      error.statusCode = 403;
      throw error;
    }
  }
}

function buildForwardHeaders(req) {
  const forwardedHeaders = new Headers();

  Object.entries(req.headers || {}).forEach(([headerName, headerValue]) => {
    const normalizedHeaderName = headerName.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(normalizedHeaderName) || normalizedHeaderName === "authorization") {
      return;
    }

    if (Array.isArray(headerValue)) {
      headerValue.forEach((value) => {
        if (value !== undefined) {
          forwardedHeaders.append(headerName, String(value));
        }
      });
      return;
    }

    if (headerValue !== undefined) {
      forwardedHeaders.set(headerName, String(headerValue));
    }
  });

  const sharedSecret = String(process.env.SCREENSHOT_TAKER_PROXY_SECRET || "").trim();

  if (!sharedSecret) {
    throw new Error("SCREENSHOT_TAKER_PROXY_SECRET is not configured");
  }

  forwardedHeaders.set("x-screenshot-proxy-secret", sharedSecret);

  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    forwardedHeaders.set("content-type", "application/json");
  }

  forwardedHeaders.set("x-screenshot-proxy-user-id", String(req.user?._id || ""));
  forwardedHeaders.set("x-screenshot-proxy-user-email", String(req.user?.email || ""));
  forwardedHeaders.set(
    "x-screenshot-proxy-user-name",
    String(req.user?.fullName || req.user?.email || "User")
  );
  forwardedHeaders.set("x-screenshot-proxy-is-admin", hasAdminAccess(req) ? "true" : "false");
  forwardedHeaders.set("x-forwarded-for", req.ip || "");
  forwardedHeaders.set("x-forwarded-host", req.get("host") || "");
  forwardedHeaders.set("x-forwarded-proto", req.protocol || "http");

  return forwardedHeaders;
}

function buildRequestBody(req) {
  if (READ_ONLY_METHODS.has(String(req.method || "GET").toUpperCase())) {
    return undefined;
  }

  if (req.body === undefined || req.body === null) {
    return undefined;
  }

  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const servicePath = getRequestedServicePath(req);
  const method = String(req.method || "GET").toUpperCase();
  const body = { ...req.body };

  if (servicePath === "/schedule" && method === "PUT" && !hasAdminAccess(req)) {
    delete body.telegram;
  }

  return JSON.stringify(body);
}

async function parseProxyResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  if (contentType.startsWith("image/") || contentType.includes("application/octet-stream")) {
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  return response.text();
}

export async function forwardScreenshotProxyRequest(req) {
  await assertProxyAccess(req);

  const servicePath = getRequestedServicePath(req);
  const method = String(req.method || "GET").toUpperCase();
  const targetUrl = buildTargetUrl(req);
  const requestOptions = {
    method,
    headers: buildForwardHeaders(req),
    body: buildRequestBody(req),
    signal: AbortSignal.timeout(getProxyTimeoutMs(servicePath, method)),
  };

  let response;

  try {
    response = await fetch(targetUrl, requestOptions);
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    const proxyError = new Error(
      timedOut
        ? "Screenshot capture timed out. Please retry in a few seconds."
        : `Screenshot Taker service is unavailable at ${normalizeBaseUrl()}`
    );
    proxyError.statusCode = 502;
    proxyError.details = error.message;
    throw proxyError;
  }

  const payload = await parseProxyResponse(response);
  const responseHeaders = {};
  const contentType = response.headers.get("content-type");
  const cacheControl = response.headers.get("cache-control");

  if (contentType) {
    responseHeaders["content-type"] = contentType;
  }

  if (cacheControl) {
    responseHeaders["cache-control"] = cacheControl;
  }

  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: payload,
  };
}
