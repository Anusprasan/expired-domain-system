import axiosClient from "../../../shared/api/axiosClient";

export async function getCuttlyLinksApi(params = {}) {
  const response = await axiosClient.get("/cuttly-link-checker", { params });
  return response.data;
}

export async function createCuttlyLinkApi(payload) {
  const response = await axiosClient.post("/cuttly-link-checker", payload);
  return response.data;
}

export async function updateCuttlyLinkApi(id, payload) {
  const response = await axiosClient.put(`/cuttly-link-checker/${id}`, payload);
  return response.data;
}

export async function deleteCuttlyLinkApi(id) {
  const response = await axiosClient.delete(`/cuttly-link-checker/${id}`);
  return response.data;
}

export async function checkCuttlyLinkApi(id) {
  const response = await axiosClient.post(`/cuttly-link-checker/${id}/check`);
  return response.data;
}

export async function checkAllCuttlyLinksApi(payload = {}) {
  const response = await axiosClient.post("/cuttly-link-checker/checks/run", payload);
  return response.data;
}

export async function getCuttlyStatusApi() {
  const response = await axiosClient.get("/cuttly-link-checker/status");
  return response.data;
}

export async function getCuttlySettingsApi() {
  const response = await axiosClient.get("/cuttly-link-checker/settings");
  return response.data;
}

export async function updateCuttlyApiSettingsApi(payload) {
  const response = await axiosClient.put("/cuttly-link-checker/settings/api", payload);
  return response.data;
}

export async function updateCuttlyTelegramApi(payload) {
  const response = await axiosClient.put("/cuttly-link-checker/telegram", payload);
  return response.data;
}

export async function updateCuttlyScheduleApi(payload) {
  const response = await axiosClient.put("/cuttly-link-checker/schedule", payload);
  return response.data;
}

export async function toggleCuttlyScheduleApi(enabled, payload = {}) {
  const response = await axiosClient.post("/cuttly-link-checker/schedule/toggle", {
    ...payload,
    enabled,
  });
  return response.data;
}
