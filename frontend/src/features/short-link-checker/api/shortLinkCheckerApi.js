import axiosClient from "../../../shared/api/axiosClient";

export async function getShortLinksApi(params = {}) {
  const response = await axiosClient.get("/short-link-checker/links", { params });
  return response.data;
}

export async function createShortLinkApi(payload) {
  const response = await axiosClient.post("/short-link-checker/links", payload);
  return response.data;
}

export async function importShortLinksApi(payload) {
  const response = await axiosClient.post("/short-link-checker/links/import", payload);
  return response.data;
}

export async function updateShortLinkApi(linkId, payload) {
  const response = await axiosClient.put(`/short-link-checker/links/${linkId}`, payload);
  return response.data;
}

export async function deleteShortLinkApi(linkId) {
  const response = await axiosClient.delete(`/short-link-checker/links/${linkId}`);
  return response.data;
}

export async function deleteAllShortLinksApi(payload = {}) {
  const response = await axiosClient.delete("/short-link-checker/links", { data: payload });
  return response.data;
}

export async function checkShortLinkApi(linkId, payload = {}) {
  const response = await axiosClient.post(`/short-link-checker/links/${linkId}/check`, payload);
  return response.data;
}

export async function checkAllShortLinksApi(payload = {}) {
  const response = await axiosClient.post("/short-link-checker/checks/run", payload);
  return response.data;
}

export async function fetchShortLinkCheckImageBlobApi(checkId, config = {}) {
  const response = await axiosClient.get(`/short-link-checker/checks/${checkId}/image`, {
    ...config,
    responseType: "blob",
  });
  return response.data;
}

export async function clearShortLinkCheckImagesApi(payload = {}) {
  const response = await axiosClient.post("/short-link-checker/checks/images/clear", payload);
  return response.data;
}

export async function getShortLinkTelegramApi() {
  const response = await axiosClient.get("/short-link-checker/telegram");
  return response.data;
}

export async function updateShortLinkTelegramApi(payload) {
  const response = await axiosClient.put("/short-link-checker/telegram", payload);
  return response.data;
}

export async function getShortLinkCheckerStatusApi() {
  const response = await axiosClient.get("/short-link-checker/status");
  return response.data;
}

export async function getShortLinkScheduleApi() {
  const response = await axiosClient.get("/short-link-checker/schedule");
  return response.data;
}

export async function updateShortLinkScheduleApi(payload) {
  const response = await axiosClient.put("/short-link-checker/schedule", payload);
  return response.data;
}

export async function toggleShortLinkScheduleApi(enabled, payload = {}) {
  const response = await axiosClient.post("/short-link-checker/schedule/toggle", { ...payload, enabled });
  return response.data;
}
