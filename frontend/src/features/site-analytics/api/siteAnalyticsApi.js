import axiosClient from "../../../shared/api/axiosClient";

export const getSiteAnalyticsSummaryApi = async () => {
  const response = await axiosClient.get("/site-analytics");
  return response.data;
};

export const getSiteAnalyticsDetailApi = async (mainUrl, params = {}) => {
  const response = await axiosClient.get("/site-analytics/detail", {
    params: { mainUrl, ...params },
  });
  return response.data;
};

export const blockTrackedSiteAnalyticsUrlApi = async (payload) => {
  const response = await axiosClient.post("/site-analytics/url/block", payload);
  return response.data;
};

export const unblockTrackedSiteAnalyticsUrlApi = async (payload) => {
  const response = await axiosClient.post("/site-analytics/url/unblock", payload);
  return response.data;
};

export const clearTrackedSiteAnalyticsUrlStatsApi = async (payload) => {
  const response = await axiosClient.post("/site-analytics/url/clear", payload);
  return response.data;
};

export const deleteTrackedSiteAnalyticsUrlApi = async (payload) => {
  const response = await axiosClient.post("/site-analytics/url/delete", payload);
  return response.data;
};
