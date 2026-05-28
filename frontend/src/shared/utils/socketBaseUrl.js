export function getSocketBaseUrl() {
  const overrideUrl = String(import.meta.env.VITE_API_SOCKET_URL || "").trim();

  if (overrideUrl) {
    return new URL(overrideUrl, window.location.origin).toString().replace(/\/+$/, "");
  }

  const baseUrl = String(import.meta.env.VITE_API_BASE_URL || "").trim();

  if (!baseUrl) {
    return window.location.origin;
  }

  const resolvedUrl = new URL(baseUrl, window.location.origin);
  const normalizedPath = resolvedUrl.pathname.replace(/\/+$/, "");

  if (normalizedPath === "/api") {
    resolvedUrl.pathname = "";
  } else {
    resolvedUrl.pathname = normalizedPath.replace(/\/api$/, "");
  }

  return resolvedUrl.toString().replace(/\/+$/, "");
}
