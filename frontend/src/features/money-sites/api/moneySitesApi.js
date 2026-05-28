import axiosClient from "../../../shared/api/axiosClient";

export async function getMoneySitesApi(params = {}) {
  const response = await axiosClient.get("/money-sites", { params });
  return response.data;
}

export async function getMoneySiteDomainsApi() {
  const response = await axiosClient.get("/money-sites/domains");
  return response.data;
}

export async function getMoneySiteSummaryApi(params = {}) {
  const response = await axiosClient.get("/money-sites/summary", { params });
  return response.data;
}

export async function getMoneySiteActivityLogsApi(params = {}) {
  const response = await axiosClient.get("/money-sites/activity", { params });
  return response.data;
}

export async function getMoneySitePushConfigApi() {
  const response = await axiosClient.get("/money-sites/push/config");
  return response.data;
}

export async function subscribeMoneySitePushApi(payload) {
  const response = await axiosClient.post("/money-sites/push/subscribe", payload);
  return response.data;
}

export async function unsubscribeMoneySitePushApi(payload) {
  const response = await axiosClient.delete("/money-sites/push/subscribe", { data: payload });
  return response.data;
}

export async function createMoneySiteApi(payload) {
  const response = await axiosClient.post("/money-sites", payload);
  return response.data;
}

export async function previewMoneySitesCsvImportApi(payload) {
  const response = await axiosClient.post("/money-sites/import/preview", payload);
  return response.data;
}

export async function requestMoneySitesCsvImportVerificationApi(payload) {
  const response = await axiosClient.post("/money-sites/import/verification/request", payload);
  return response.data;
}

export async function importMoneySitesCsvApi(payload) {
  const response = await axiosClient.post("/money-sites/import", payload);
  return response.data;
}

export async function submitMoneySiteNawalaBulkUpdateApi(payload) {
  const response = await axiosClient.post("/money-sites/nawala/bulk-update", payload);
  return response.data;
}

export async function requestDeleteAllMoneySitesVerificationApi() {
  const response = await axiosClient.post("/money-sites/delete-all/verification/request");
  return response.data;
}

export async function deleteAllMoneySitesApi(payload) {
  const response = await axiosClient.post("/money-sites/delete-all", payload);
  return response.data;
}

export async function exportMoneySitesCsvApi(params = {}) {
  const response = await axiosClient.get("/money-sites/export", {
    params,
    responseType: "blob",
  });
  return response.data;
}

export async function updateMoneySiteApi(id, payload) {
  const response = await axiosClient.put(`/money-sites/${id}`, payload);
  return response.data;
}

export async function deleteMoneySiteApi(id) {
  const response = await axiosClient.delete(`/money-sites/${id}`);
  return response.data;
}

export async function bulkDeleteBlockedMoneySitesApi(payload) {
  const response = await axiosClient.post("/money-sites/bulk-delete-blocked", payload);
  return response.data;
}
