import axiosClient from "../../../shared/api/axiosClient";

export async function getPrivilegesApi() {
  const response = await axiosClient.get("/privileges");
  return response.data;
}
