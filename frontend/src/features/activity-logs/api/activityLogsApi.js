import axiosClient from "../../../shared/api/axiosClient";
import { getToken } from "../../auth/utils/authStorage";

export async function getActivityLogsApi(params = {}) {
  const response = await axiosClient.get("/activity-logs", { params });
  return response.data;
}

export async function recordPageVisitApi(payload) {
  const response = await axiosClient.post("/activity-logs/page-visits", payload);
  return response.data;
}

export function sendPageVisitBeacon(payload) {
  const token = getToken();
  const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const url = `${baseUrl}/activity-logs/page-visits`;

  try {
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignore unload logging failures.
  }
}
