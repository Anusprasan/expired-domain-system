import axiosClient from "../../../shared/api/axiosClient";

const buildQueryString = (params = {}) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    searchParams.set(key, value);
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
};

const request = async (config) => {
  const response = await axiosClient(config);
  return response.data;
};

export const getBrands = () =>
  request({
    url: `/rank/brands${buildQueryString({ active: true })}`,
    method: "get",
  });

export const getDomains = (params = {}) =>
  request({
    url: `/rank/domains${buildQueryString(params)}`,
    method: "get",
  });

export const createDomain = (payload) =>
  request({
    url: "/rank/domains",
    method: "post",
    data: payload,
  });

export const deleteDomain = (domainId) =>
  request({
    url: `/rank/domains/${domainId}`,
    method: "delete",
  });

export const checkTopTen = (payload) =>
  request({
    url: "/rank/serp/check",
    method: "post",
    data: payload,
  });

export const getSerperAvailability = () =>
  request({
    url: "/rank/serp/availability",
    method: "get",
  });

export const getGoogleRankAvailability = () =>
  request({
    url: "/rank/google-rank/availability",
    method: "get",
  });

export const checkGoogleRank = (payload) =>
  request({
    url: "/rank/google-rank/check",
    method: "post",
    data: payload,
  });

export const startAutoGoogleRankRun = (payload) =>
  request({
    url: "/rank/google-rank/auto-run/start",
    method: "post",
    data: payload || {},
  });

export const getAutoGoogleRankRun = (runId) =>
  request({
    url: `/rank/google-rank/auto-run/${runId}`,
    method: "get",
  });

export const stopAutoGoogleRankRun = (runId) =>
  request({
    url: `/rank/google-rank/auto-run/${runId}/stop`,
    method: "post",
  });

export const getGoogleRankAnalyticsOverview = (brandId, limit = 5) =>
  request({
    url: `/rank/analytics/google-rank/brands/${brandId}/overview${buildQueryString({ limit })}`,
    method: "get",
  });

export const startBulkDomainCheck = (payload) =>
  request({
    url: "/rank/serp/bulk-check/start",
    method: "post",
    data: payload,
  });

export const getBulkDomainCheck = (runId) =>
  request({
    url: `/rank/serp/bulk-check/${runId}`,
    method: "get",
  });

export const stopBulkDomainCheck = (runId) =>
  request({
    url: `/rank/serp/bulk-check/${runId}/stop`,
    method: "post",
  });

export const checkTrustPositifBulk = (payload) =>
  request({
    url: "/rank/serp/trust-positif/check",
    method: "post",
    data: payload,
  });

export const getRankingHistory = (brandId, range) =>
  request({
    url: `/rank/analytics/brands/${brandId}/ranking-history${buildQueryString({ range })}`,
    method: "get",
  });

export const getRecentAutoChecks = (brandId, limit = 5) =>
  request({
    url: `/rank/analytics/brands/${brandId}/recent-auto-checks${buildQueryString({ limit })}`,
    method: "get",
  });

export const getAdminDashboard = () =>
  request({
    url: "/rank/admin/dashboard",
    method: "get",
  });

export const getAdminSettings = () =>
  request({
    url: "/rank/admin/settings",
    method: "get",
  });

export const getAdminAutoCheckStatus = () =>
  request({
    url: "/rank/admin/auto-check-status",
    method: "get",
  });

export const getDomainActivityLogs = (limit = 100) =>
  request({
    url: `/rank/admin/domain-logs${buildQueryString({ limit })}`,
    method: "get",
  });

export const getAutoCheckLogs = (limit = 100) =>
  request({
    url: `/rank/admin/auto-check-logs${buildQueryString({ limit })}`,
    method: "get",
  });

export const getAutoCheckLogDetail = (logId) =>
  request({
    url: `/rank/admin/auto-check-logs/${logId}`,
    method: "get",
  });

export const updateAdminSchedule = (payload) =>
  request({
    url: "/rank/admin/settings/schedule",
    method: "patch",
    data: payload,
  });

export const updateAdminBackupSettings = (payload) =>
  request({
    url: "/rank/admin/settings/backup",
    method: "patch",
    data: payload,
  });

export const updateAdminNotificationSettings = (payload) =>
  request({
    url: "/rank/admin/settings/notifications",
    method: "patch",
    data: payload,
  });

export const addAdminApiKey = (payload) =>
  request({
    url: "/rank/admin/settings/keys",
    method: "post",
    data: payload,
  });

export const updateAdminApiKey = (keyId, payload) =>
  request({
    url: `/rank/admin/settings/keys/${keyId}`,
    method: "patch",
    data: payload,
  });

export const deleteAdminApiKey = (keyId) =>
  request({
    url: `/rank/admin/settings/keys/${keyId}`,
    method: "delete",
  });

export const addGoogleRankApiKey = (payload) =>
  request({
    url: "/rank/admin/settings/google-rank-keys",
    method: "post",
    data: payload,
  });

export const updateGoogleRankApiKey = (keyId, payload) =>
  request({
    url: `/rank/admin/settings/google-rank-keys/${keyId}`,
    method: "patch",
    data: payload,
  });

export const deleteGoogleRankApiKey = (keyId) =>
  request({
    url: `/rank/admin/settings/google-rank-keys/${keyId}`,
    method: "delete",
  });

export const runAutoNow = () =>
  request({
    url: "/rank/admin/run-now",
    method: "post",
  });

export const stopAutoRun = () =>
  request({
    url: "/rank/admin/stop-run",
    method: "post",
  });

export const runBackupNow = () =>
  request({
    url: "/rank/admin/backup/run-now",
    method: "post",
  });

export const testAdminBackupTelegram = (payload) =>
  request({
    url: "/rank/admin/backup/test-telegram",
    method: "post",
    data: payload || {},
  });

export const testAdminNotificationTelegram = (payload) =>
  request({
    url: "/rank/admin/notifications/test-telegram",
    method: "post",
    data: payload || {},
  });
