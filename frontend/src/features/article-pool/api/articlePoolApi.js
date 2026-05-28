import axiosClient from "../../../shared/api/axiosClient";

export async function getArticlePoolArticlesApi(params = {}) {
  const response = await axiosClient.get("/article-pool/articles", { params });
  return response.data;
}

export async function getArticlePoolArticleApi(id) {
  const response = await axiosClient.get(`/article-pool/articles/${id}`);
  return response.data;
}

export async function previewArticlePoolCsvImportApi(payload) {
  const response = await axiosClient.post("/article-pool/import/preview", payload);
  return response.data;
}

export async function importArticlePoolCsvApi(payload) {
  const response = await axiosClient.post("/article-pool/import", payload);
  return response.data;
}

export async function exportArticlePoolCsvApi() {
  const response = await axiosClient.get("/article-pool/export", {
    responseType: "blob",
  });
  return response.data;
}

export async function createArticlePoolArticleApi(payload) {
  const response = await axiosClient.post("/article-pool/articles", payload);
  return response.data;
}

export async function updateArticlePoolArticleApi(id, payload) {
  const response = await axiosClient.put(`/article-pool/articles/${id}`, payload);
  return response.data;
}

export async function deleteArticlePoolArticleApi(id) {
  const response = await axiosClient.delete(`/article-pool/articles/${id}`);
  return response.data;
}
