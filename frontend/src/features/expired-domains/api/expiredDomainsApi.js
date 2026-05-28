import axiosClient from "../../../shared/api/axiosClient";

export const uploadExpiredDomains = async (domains) => {
  return axiosClient.post("/expired-domains/import", { domains });
};

export const listExpiredDomains = async () => {
  return axiosClient.get("/expired-domains");
};

export const getExpiredDomainProcessSubBatches = async () => {
  return axiosClient.get("/expired-domains/process/sub-batches");
};

export const getExpiredDomainProcessSubBatchDomains = async (batchNumber, subBatchNumber, status = "") => {
  return axiosClient.get(`/expired-domains/process/sub-batches/${batchNumber}/${subBatchNumber}/domains`, {
    params: status ? { status } : {},
  });
};

export const updateExpiredDomainProcessSubBatchStatus = async (batchNumber, subBatchNumber, status, options = {}) => {
  return axiosClient.patch(`/expired-domains/process/sub-batches/${batchNumber}/${subBatchNumber}/status`, {
    status,
    ...(Array.isArray(options.domains) ? { domains: options.domains } : {}),
    ...(Array.isArray(options.nawalaResults) ? { nawalaResults: options.nawalaResults } : {}),
  });
};

export const getCurrentExpiredDomainBatch = async () => {
  return axiosClient.get("/expired-domains/batch/current");
};

export const moveExpiredDomainBatchToProcess = async () => {
  return axiosClient.post("/expired-domains/batch/move-to-process");
};

export const deleteExpiredDomain = async (id) => {
  return axiosClient.delete(`/expired-domains/${id}`);
};
