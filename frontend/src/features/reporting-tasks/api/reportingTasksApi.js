import axiosClient, { apiBaseUrl } from "../../../shared/api/axiosClient";

export async function getReportingTasksApi(date) {
  const response = await axiosClient.get("/reporting-tasks", { params: date ? { date } : {} });
  return response.data;
}

export async function createReportingTaskApi(payload) {
  const response = await axiosClient.post("/reporting-tasks", payload);
  return response.data;
}

export async function updateReportingTaskApi(taskId, payload) {
  const response = await axiosClient.patch(`/reporting-tasks/${taskId}`, payload);
  return response.data;
}

export async function deleteReportingTaskItemApi(taskId) {
  const response = await axiosClient.delete(`/reporting-tasks/${taskId}`);
  return response.data;
}

export async function acceptReportingTaskApi(taskId) {
  const response = await axiosClient.patch(`/reporting-tasks/${taskId}/accept`);
  return response.data;
}

export async function submitReportingTaskEvidenceApi(taskId, payload) {
  const response = await axiosClient.post(`/reporting-tasks/${taskId}/evidence`, payload);
  return response.data;
}

export async function submitReportingTaskDdosEvidenceApi(taskId, payload) {
  const response = await axiosClient.post(`/reporting-tasks/${taskId}/ddos-evidence`, payload);
  return response.data;
}

export async function getReportingTaskStaffApi() {
  const response = await axiosClient.get("/reporting-tasks/staff");
  return response.data;
}

export function getReportingTaskEvidenceImageUrl(image, options = {}) {
  if (!image?.taskId || !image?.id) return image?.url || "";

  const token = localStorage.getItem("token") || "";
  const baseUrl = apiBaseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  if (options.download) params.set("download", "1");

  const query = params.toString();
  return `${baseUrl}/reporting-tasks/${encodeURIComponent(image.taskId)}/evidence-images/${encodeURIComponent(image.id)}${query ? `?${query}` : ""}`;
}
