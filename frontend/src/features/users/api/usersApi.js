import axiosClient from "../../../shared/api/axiosClient";

export async function getUsersApi() {
  const response = await axiosClient.get("/users");
  return response.data;
}

export async function createUserApi(payload) {
  const response = await axiosClient.post("/users", payload);
  return response.data;
}

export async function updateUserApi(id, payload) {
  const response = await axiosClient.put(`/users/${id}`, payload);
  return response.data;
}

export async function changeUserGroupApi(id, groupId) {
  const response = await axiosClient.patch(`/users/${id}/group`, { groupId });
  return response.data;
}

export async function changeUserStatusApi(id, status) {
  const response = await axiosClient.patch(`/users/${id}/status`, { status });
  return response.data;
}

export async function deleteUserApi(id) {
  const response = await axiosClient.delete(`/users/${id}`);
  return response.data;
}
