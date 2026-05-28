import axiosClient from "../../../shared/api/axiosClient";

export async function getLpServersApi(params = {}) {
  const response = await axiosClient.get("/lp-servers", { params });
  return response.data;
}

export async function previewLpServersCsvImportApi(payload) {
  const response = await axiosClient.post("/lp-servers/import/preview", payload);
  return response.data;
}

export async function importLpServersCsvApi(payload) {
  const response = await axiosClient.post("/lp-servers/import", payload);
  return response.data;
}

export async function exportLpServersCsvApi() {
  const response = await axiosClient.get("/lp-servers/export", {
    responseType: "blob",
  });
  return response.data;
}

export async function createLpServerApi(payload) {
  const response = await axiosClient.post("/lp-servers", payload);
  return response.data;
}

export async function updateLpServerApi(id, payload) {
  const response = await axiosClient.put(`/lp-servers/${id}`, payload);
  return response.data;
}

export async function deleteLpServerApi(id) {
  const response = await axiosClient.delete(`/lp-servers/${id}`);
  return response.data;
}
