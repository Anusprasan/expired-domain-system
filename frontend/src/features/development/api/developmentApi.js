import axiosClient from "../../../shared/api/axiosClient";

export async function getDevelopmentDomainsApi(params = {}) {
  const response = await axiosClient.get("/development/domains", { params });
  return response.data;
}

export async function createDevelopmentDomainApi(payload) {
  const response = await axiosClient.post("/development/domains", payload);
  return response.data;
}

export async function updateDevelopmentDomainApi(id, payload) {
  const response = await axiosClient.put(`/development/domains/${id}`, payload);
  return response.data;
}

export async function deleteDevelopmentDomainApi(id) {
  const response = await axiosClient.delete(`/development/domains/${id}`);
  return response.data;
}

export async function assignDevelopmentDomainApi(id, developerId) {
  const response = await axiosClient.patch(`/development/domains/${id}/assign`, {
    developerId,
  });
  return response.data;
}

export async function acquireDevelopmentContentLockApi(id) {
  const response = await axiosClient.patch(`/development/domains/${id}/content-lock`);
  return response.data;
}

export async function releaseDevelopmentContentLockApi(id) {
  const response = await axiosClient.delete(`/development/domains/${id}/content-lock`);
  return response.data;
}

export async function updateDevelopmentProgressApi(id, payload) {
  const response = await axiosClient.patch(`/development/domains/${id}/progress`, payload);
  return response.data;
}

export async function getDevelopmentDevelopersApi() {
  const response = await axiosClient.get("/development/developers");
  return response.data;
}

export async function getDevelopmentTemplatesApi() {
  const response = await axiosClient.get("/development/templates");
  return response.data;
}

export async function createDevelopmentTemplateApi(payload) {
  const response = await axiosClient.post("/development/templates", payload);
  return response.data;
}

export async function deleteDevelopmentTemplateApi(id) {
  const response = await axiosClient.delete(`/development/templates/${id}`);
  return response.data;
}
