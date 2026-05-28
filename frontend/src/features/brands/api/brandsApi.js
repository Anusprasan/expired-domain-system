import axiosClient from "../../../shared/api/axiosClient";

export async function getBrandsApi() {
  const response = await axiosClient.get("/brands");
  return response.data;
}

export async function createBrandApi(payload) {
  const response = await axiosClient.post("/brands", payload);
  return response.data;
}

export async function updateBrandApi(id, payload) {
  const response = await axiosClient.put(`/brands/${id}`, payload);
  return response.data;
}

export async function deleteBrandApi(id) {
  const response = await axiosClient.delete(`/brands/${id}`);
  return response.data;
}
