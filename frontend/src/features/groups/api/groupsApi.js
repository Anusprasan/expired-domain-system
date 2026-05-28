import axiosClient from "../../../shared/api/axiosClient";

export async function getGroupsApi() {
  const response = await axiosClient.get("/groups");
  return response.data;
}

export async function createGroupApi(payload) {
  const response = await axiosClient.post("/groups", payload);
  return response.data;
}

export async function updateGroupApi(id, payload) {
  const response = await axiosClient.put(`/groups/${id}`, payload);
  return response.data;
}

export async function deleteGroupApi(id, targetGroupId) {
  const response = await axiosClient.delete(`/groups/${id}`, {
    data: targetGroupId ? { targetGroupId } : {},
  });
  return response.data;
}
