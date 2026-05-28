import axiosClient from "../../../shared/api/axiosClient";

export async function getScreenshotSitesApi() {
  const response = await axiosClient.get("/screenshot-taker/sites");
  return response.data;
}

export async function assignScreenshotSiteApi(payload) {
  const response = await axiosClient.post("/screenshot-taker/sites", payload);
  return response.data;
}

export async function removeScreenshotSiteApi(siteId) {
  const response = await axiosClient.delete(`/screenshot-taker/sites/${siteId}`);
  return response.data;
}

export async function captureScreenshotSiteApi(siteId) {
  const response = await axiosClient.post(`/screenshot-taker/sites/${siteId}/capture`);
  return response.data;
}

export async function captureLiveScreenshotApi(payload) {
  const response = await axiosClient.post("/screenshot-taker/captures/live", payload);
  return response.data;
}

export async function getScreenshotScheduleApi() {
  const response = await axiosClient.get("/screenshot-taker/schedule");
  return response.data;
}

export async function getScreenshotStatusApi() {
  const response = await axiosClient.get("/screenshot-taker/status");
  return response.data;
}

export async function updateScreenshotScheduleApi(payload) {
  const response = await axiosClient.put("/screenshot-taker/schedule", payload);
  return response.data;
}

export async function fetchScreenshotImageBlobApi(captureId, config = {}) {
  const response = await axiosClient.get(`/screenshot-taker/captures/${captureId}/image`, {
    ...config,
    responseType: "blob",
  });
  return response.data;
}

export async function fetchScreenshotOriginalImageBlobApi(captureId, config = {}) {
  const response = await axiosClient.get(`/screenshot-taker/captures/${captureId}/image`, {
    ...config,
    params: {
      ...(config.params || {}),
      variant: "original",
    },
    responseType: "blob",
  });
  return response.data;
}

export async function getScreenshotImageStorageApi() {
  const response = await axiosClient.get("/screenshot-taker/captures/images/storage");
  return response.data;
}

export async function clearScreenshotImagesApi(payload) {
  const response = await axiosClient.post("/screenshot-taker/captures/images/clear", payload);
  return response.data;
}
