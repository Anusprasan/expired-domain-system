import axiosClient from "../../../shared/api/axiosClient";

export async function getWaybackBatchesApi() {
  const response = await axiosClient.get("/wayback-checker/batches");
  return response.data?.data || { items: [], currentBatchNumber: null };
}

export async function createWaybackBatchApi(payload) {
  const response = await axiosClient.post("/wayback-checker/batches", payload);
  return response.data?.data || null;
}

export async function getWaybackBatchApi(batchNumber) {
  const response = await axiosClient.get(`/wayback-checker/batches/${batchNumber}`);
  return response.data?.data || { batch: null, domains: [] };
}

export async function getWaybackResultsApi(batchNumber, status = "passed") {
  const response = await axiosClient.get(`/wayback-checker/batches/${batchNumber}/results`, {
    params: { status },
  });
  return response.data?.data || { items: [] };
}

export async function takeWaybackDomainApi(domainId) {
  const response = await axiosClient.post(`/wayback-checker/domains/${domainId}/take`);
  return response.data?.data || null;
}

export async function submitWaybackDomainResultApi(domainId, payload) {
  const response = await axiosClient.post(`/wayback-checker/domains/${domainId}/result`, payload);
  return response.data?.data || null;
}
