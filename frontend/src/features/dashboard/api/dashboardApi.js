import axiosClient from "../../../shared/api/axiosClient";

export async function getDashboardApi() {
  const response = await axiosClient.get("/dashboard");
  return response.data;
}
