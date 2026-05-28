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
const SHORT_LINK_BASE_ACCESS_PRIVILEGES = [
  "ADMIN_ACCESS",
  "VIEW_SHORT_LINK_CHECKER",
  "MANAGE_SHORT_LINK_CHECKER",
  "CHECK_SHORT_LINKS",
  "MANAGE_SHORT_LINK_TELEGRAM",
  "SCHEDULE_SHORT_LINK_CHECKER",
];
const SHORT_LINK_MANAGE_PRIVILEGES = ["ADMIN_ACCESS", "MANAGE_SHORT_LINK_CHECKER"];
const SHORT_LINK_CHECK_PRIVILEGES = ["ADMIN_ACCESS", "MANAGE_SHORT_LINK_CHECKER", "CHECK_SHORT_LINKS"];
const SHORT_LINK_TELEGRAM_PRIVILEGES = ["ADMIN_ACCESS", "MANAGE_SHORT_LINK_TELEGRAM"];
const SHORT_LINK_SCHEDULE_PRIVILEGES = ["ADMIN_ACCESS", "MANAGE_SHORT_LINK_CHECKER", "SCHEDULE_SHORT_LINK_CHECKER"];

function getPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function normalizeBaseUrl() {
  const configuredBaseUrl = String(process.env.SHORT_LINK_CHECKER_SERVICE_URL || "").trim();

  if (!configuredBaseUrl) {
    throw new Error("SHORT_LINK_CHECKER_SERVICE_URL is not configured");
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

  const baseUrlPath = String(req?.baseUrl || "");
  const originalPath = String(req?.originalUrl || req?.url || "").split("?")[0];
  let servicePath = originalPath;

  if (baseUrlPath && servicePath.startsWith(baseUrlPath)) {
    servicePath = servicePath.slice(baseUrlPath.length);
  }

  return normalizeServicePath(servicePath || "/");
}

function getProxyTimeoutMs(servicePath, method) {
  if (
    (servicePath.startsWith("/links/") && servicePath.endsWith("/check") && method === "POST") ||
    (servicePath === "/checks/run" && method === "POST")
  ) {
    return getPositiveInteger(process.env.SHORT_LINK_PROXY_CHECK_TIMEOUT_MS, 900000);
  }

  return getPositiveInteger(process.env.SHORT_LINK_PROXY_TIMEOUT_MS, 60000);
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

async function assertCurrentUserPassword(req) {
  const password = String(req.body?.password || "");

  if (!password) {
    const error = new Error("Current password is required");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(req.user?._id).select("status passwordHash");

  if (!user || user.status !== "active" || !user.passwordHash) {
    const error = new Error("User account could not be verified");
    error.statusCode = 403;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);

  if (!isMatch) {
    const error = new Error("Current password is incorrect");
    error.statusCode = 401;
    throw error;
  }

  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    const { password: _password, ...safeBody } = req.body;
    req.body = safeBody;
  }
}

async function assertProxyAccess(req) {
  const servicePath = getRequestedServicePath(req);
  const method = String(req.method || "GET").toUpperCase();

  if (!hasAnyPrivilege(req, SHORT_LINK_BASE_ACCESS_PRIVILEGES)) {
    const error = new Error("You do not have permission to access Short Link Checker");
    error.statusCode = 403;
    throw error;
  }

  if ((servicePath === "/links" || servicePath === "/links/import") && !READ_ONLY_METHODS.has(method)) {
    if (!hasAnyPrivilege(req, SHORT_LINK_MANAGE_PRIVILEGES)) {
      const error = new Error("You do not have permission to manage short links");
      error.statusCode = 403;
      throw error;
    }
  }

  if (servicePath.startsWith("/links/") && ["PUT", "DELETE"].includes(method)) {
    if (!hasAnyPrivilege(req, SHORT_LINK_MANAGE_PRIVILEGES)) {
      const error = new Error("You do not have permission to manage short links");
      error.statusCode = 403;
      throw error;
    }
  }

  if (
    ((servicePath.startsWith("/links/") && servicePath.endsWith("/check")) || servicePath === "/checks/run") &&
    method === "POST"
  ) {
    if (!hasAnyPrivilege(req, SHORT_LINK_CHECK_PRIVILEGES)) {
      const error = new Error("You do not have permission to check short links");
      error.statusCode = 403;
      throw error;
    }
  }

  if (servicePath === "/checks/images/clear" && method === "POST") {
    if (!hasAnyPrivilege(req, SHORT_LINK_MANAGE_PRIVILEGES)) {
      const error = new Error("You do not have permission to clear Short Link Checker images");
      error.statusCode = 403;
      throw error;
    }
  }

  if (
    (servicePath === "/links" && method === "DELETE") ||
    (servicePath === "/checks/images/clear" && method === "POST")
  ) {
    await assertCurrentUserPassword(req);
  }

  if (servicePath === "/telegram" && method !== "GET") {
    if (!hasAnyPrivilege(req, SHORT_LINK_TELEGRAM_PRIVILEGES)) {
      const error = new Error("You do not have permission to manage Short Link Checker Telegram alerts");
      error.statusCode = 403;
      throw error;
    }
  }

  if (servicePath.startsWith("/schedule") && method !== "GET") {
    if (!hasAnyPrivilege(req, SHORT_LINK_SCHEDULE_PRIVILEGES)) {
      const error = new Error("You do not have permission to manage Short Link Checker schedule");
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

  const sharedSecret = String(process.env.SHORT_LINK_CHECKER_PROXY_SECRET || "").trim();

  if (!sharedSecret) {
    throw new Error("SHORT_LINK_CHECKER_PROXY_SECRET is not configured");
  }

  forwardedHeaders.set("x-short-link-proxy-secret", sharedSecret);

  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    forwardedHeaders.set("content-type", "application/json");
  }

  forwardedHeaders.set("x-short-link-proxy-user-id", String(req.user?._id || ""));
  forwardedHeaders.set("x-short-link-proxy-user-email", String(req.user?.email || ""));
  forwardedHeaders.set("x-short-link-proxy-user-name", String(req.user?.fullName || req.user?.email || "User"));
  forwardedHeaders.set("x-short-link-proxy-is-admin", hasAdminAccess(req) ? "true" : "false");
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

  return JSON.stringify(req.body);
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

export async function forwardShortLinkProxyRequest(req) {
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
        ? "Short link check timed out. Please retry in a few seconds."
        : `Short Link Checker service is unavailable at ${normalizeBaseUrl()}`
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
