import axiosClient from "../../../shared/api/axiosClient";

export async function getPendingPasswordResetRequestsApi() {
  const response = await axiosClient.get("/password-reset/requests");
  return response.data;
}

export async function adminResetUserPasswordApi(id, payload) {
  const response = await axiosClient.post(`/password-reset/requests/${id}/admin-reset`, payload);
  return response.data;
}

export async function clearPasswordResetRequestApi(id, payload = {}) {
  const response = await axiosClient.post(`/password-reset/requests/${id}/clear`, payload);
  return response.data;
}

export async function clearAllPasswordResetRequestsApi(payload = {}) {
  const response = await axiosClient.post("/password-reset/requests/clear-all", payload);
  return response.data;
}
