const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
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
const ADMIN_PATH_PREFIXES = ["/admin"];
const MUTATING_DOMAIN_PREFIX = "/domains";
const MANUAL_CHECK_PATH = "/serp/check";
const GOOGLE_RANK_CHECK_PATH = "/google-rank/check";
const GOOGLE_RANK_PATH_PREFIX = "/google-rank";
const GOOGLE_RANK_ANALYTICS_PATH_PREFIX = "/analytics/google-rank";
const BULK_CHECK_PATH_PREFIX = "/serp/bulk-check";
const RANK_CHECKER_LOG_PATHS = new Set(["/admin/domain-logs", "/admin/auto-check-logs"]);
const RANK_CHECKER_BASE_ACCESS_PRIVILEGES = [
  "ADMIN_ACCESS",
  "SHOW_RANK_CHECKER",
  "RANK_CHECKER_ADMIN_PRIVS",
  "RANK_CHECKER_MANUAL_CHECKER",
  "RANK_CHECKER_BULK_CHECKER",
  "RANK_CHECKER_ADD_DOMAINS",
  "RANK_CHECKER_LOGS",
];
const RANK_CHECKER_ADMIN_PRIVILEGES = ["ADMIN_ACCESS", "RANK_CHECKER_ADMIN_PRIVS"];
const RANK_CHECKER_LOG_PRIVILEGES = ["ADMIN_ACCESS", "RANK_CHECKER_ADMIN_PRIVS", "RANK_CHECKER_LOGS"];
const RANK_CHECKER_MANUAL_CHECKER_PRIVILEGES = [
  "ADMIN_ACCESS",
  "RANK_CHECKER_ADMIN_PRIVS",
  "RANK_CHECKER_MANUAL_CHECKER",
];
const RANK_CHECKER_BULK_CHECKER_PRIVILEGES = [
  "ADMIN_ACCESS",
  "RANK_CHECKER_ADMIN_PRIVS",
  "RANK_CHECKER_BULK_CHECKER",
];
const RANK_CHECKER_DOMAIN_MUTATION_PRIVILEGES = [
  "ADMIN_ACCESS",
  "RANK_CHECKER_ADMIN_PRIVS",
  "RANK_CHECKER_ADD_DOMAINS",
];
const RANK_CHECKER_MANAGER_PRIVILEGES = [
  "ADMIN_ACCESS",
  "RANK_CHECKER_ADMIN_PRIVS",
  "RANK_CHECKER_ADD_DOMAINS",
  "RANK_CHECKER_LOGS",
];

function normalizeBaseUrl() {
  const configuredBaseUrl = String(process.env.RANK_CHECKER_SERVICE_URL || "").trim();

  if (!configuredBaseUrl) {
    throw new Error("RANK_CHECKER_SERVICE_URL is not configured");
  }

  return configuredBaseUrl.replace(/\/+$/, "");
}

function normalizeServicePath(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedPath === "/" ? "" : normalizedPath;
}

function buildTargetUrl(req) {
  const servicePath = normalizeServicePath(req.params[0] || "");
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

function hasPrivilege(req, privilegeKey) {
  return getPrivilegeKeys(req).includes(privilegeKey);
}

function hasAnyPrivilege(req, privilegeKeys = []) {
  return privilegeKeys.some((privilegeKey) => hasPrivilege(req, privilegeKey));
}

function resolveServiceRole(req) {
  if (hasPrivilege(req, "ADMIN_ACCESS")) {
    return "admin";
  }

  if (hasAnyPrivilege(req, RANK_CHECKER_MANAGER_PRIVILEGES)) {
    return "manager";
  }

  return "user";
}

function assertProxyAccess(req) {
  const servicePath = normalizeServicePath(req.params[0] || "");
  const method = String(req.method || "GET").toUpperCase();
  const canAccessRankChecker = hasAnyPrivilege(req, RANK_CHECKER_BASE_ACCESS_PRIVILEGES);

  if (!canAccessRankChecker) {
    const error = new Error("You do not have permission to access Rank Checker");
    error.statusCode = 403;
    throw error;
  }

  if (servicePath === MANUAL_CHECK_PATH && !hasAnyPrivilege(req, RANK_CHECKER_MANUAL_CHECKER_PRIVILEGES)) {
    const error = new Error("You do not have permission to use the Rank Checker manual checker");
    error.statusCode = 403;
    throw error;
  }

  if (
    (
      servicePath === GOOGLE_RANK_CHECK_PATH ||
      servicePath.startsWith(`${GOOGLE_RANK_PATH_PREFIX}/`) ||
      servicePath.startsWith(`${GOOGLE_RANK_ANALYTICS_PATH_PREFIX}/`)
    ) &&
    !hasAnyPrivilege(req, RANK_CHECKER_MANUAL_CHECKER_PRIVILEGES)
  ) {
    const error = new Error("You do not have permission to use the Rank Checker Google Rank checker");
    error.statusCode = 403;
    throw error;
  }

  if (
    (servicePath === BULK_CHECK_PATH_PREFIX || servicePath.startsWith(`${BULK_CHECK_PATH_PREFIX}/`)) &&
    !hasAnyPrivilege(req, RANK_CHECKER_BULK_CHECKER_PRIVILEGES)
  ) {
    const error = new Error("You do not have permission to use the Rank Checker bulk checker");
    error.statusCode = 403;
    throw error;
  }

  if (
    servicePath === "/auth" ||
    servicePath.startsWith("/auth/") ||
    servicePath === "/users" ||
    servicePath.startsWith("/users/")
  ) {
    const error = new Error("This Rank Checker endpoint is not available through the main application");
    error.statusCode = 403;
    throw error;
  }

  if (RANK_CHECKER_LOG_PATHS.has(servicePath)) {
    if (!hasAnyPrivilege(req, RANK_CHECKER_LOG_PRIVILEGES)) {
      const error = new Error("You do not have permission to view Rank Checker logs");
      error.statusCode = 403;
      throw error;
    }
  } else if (ADMIN_PATH_PREFIXES.some((prefix) => servicePath === prefix || servicePath.startsWith(`${prefix}/`))) {
    if (!hasAnyPrivilege(req, RANK_CHECKER_ADMIN_PRIVILEGES)) {
      const error = new Error("You do not have permission to manage Rank Checker settings");
      error.statusCode = 403;
      throw error;
    }
  }

  if (
    servicePath === MUTATING_DOMAIN_PREFIX &&
    !READ_ONLY_METHODS.has(method) &&
    !hasAnyPrivilege(req, RANK_CHECKER_DOMAIN_MUTATION_PRIVILEGES)
  ) {
    const error = new Error("You do not have permission to modify Rank Checker domains");
    error.statusCode = 403;
    throw error;
  }

  if (
    servicePath.startsWith(`${MUTATING_DOMAIN_PREFIX}/`) &&
    !READ_ONLY_METHODS.has(method) &&
    !hasAnyPrivilege(req, RANK_CHECKER_DOMAIN_MUTATION_PRIVILEGES)
  ) {
    const error = new Error("You do not have permission to modify Rank Checker domains");
    error.statusCode = 403;
    throw error;
  }
}

function buildForwardHeaders(req) {
  const forwardedHeaders = new Headers();

  Object.entries(req.headers || {}).forEach(([headerName, headerValue]) => {
    const normalizedHeaderName = headerName.toLowerCase();

    if (HOP_BY_HOP_HEADERS.has(normalizedHeaderName)) {
      return;
    }

    if (normalizedHeaderName === "authorization") {
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

  const sharedSecret = String(process.env.RANK_PROXY_SHARED_SECRET || "").trim();

  if (!sharedSecret) {
    throw new Error("RANK_PROXY_SHARED_SECRET is not configured");
  }

  forwardedHeaders.set("x-rank-proxy-secret", sharedSecret);
  forwardedHeaders.set("x-rank-proxy-user-id", String(req.user?._id || ""));
  forwardedHeaders.set("x-rank-proxy-user-email", String(req.user?.email || ""));
  forwardedHeaders.set("x-rank-proxy-user-name", String(req.user?.fullName || req.user?.email || "User"));
  forwardedHeaders.set("x-rank-proxy-user-role", resolveServiceRole(req));
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

  return response.text();
}

export async function forwardRankProxyRequest(req) {
  assertProxyAccess(req);

  const targetUrl = buildTargetUrl(req);
  const requestOptions = {
    method: req.method,
    headers: buildForwardHeaders(req),
    body: buildRequestBody(req),
  };

  let response;

  try {
    response = await fetch(targetUrl, requestOptions);
  } catch (error) {
    const proxyError = new Error(
      `Rank Checker service is unavailable at ${normalizeBaseUrl()}`
    );
    proxyError.statusCode = 502;
    proxyError.details = error.message;
    throw proxyError;
  }

  const payload = await parseProxyResponse(response);
  const responseHeaders = {};
  const contentType = response.headers.get("content-type");

  if (contentType) {
    responseHeaders["content-type"] = contentType;
  }

  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: payload,
  };
}
