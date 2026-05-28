import axiosClient from "../../../shared/api/axiosClient";

function parseDownloadFileName(headers = {}, fallback = "database-backup.archive.gz") {
  const contentDisposition = headers["content-disposition"] || headers["Content-Disposition"] || "";
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallback;
}

export const getDatabaseBackupsApi = async () => {
  const response = await axiosClient.get("/database-backups");
  return response.data;
};

export const createDatabaseBackupApi = async () => {
  const response = await axiosClient.post("/database-backups/export");
  return response.data;
};

export const downloadDatabaseBackupApi = async (backupId, fallbackFileName) => {
  const response = await axiosClient.get(`/database-backups/${backupId}/download`, {
    responseType: "blob",
  });

  return {
    blob: response.data,
    fileName: parseDownloadFileName(response.headers, fallbackFileName),
  };
};

export const deleteDatabaseBackupApi = async (backupId) => {
  const response = await axiosClient.delete(`/database-backups/${backupId}`);
  return response.data;
};

export const sendDatabaseBackupToTelegramApi = async (backupId) => {
  const response = await axiosClient.post(`/database-backups/${backupId}/telegram/send`);
  return response.data;
};

export const getDatabaseBackupTelegramSettingsApi = async () => {
  const response = await axiosClient.get("/database-backups/telegram");
  return response.data;
};

export const updateDatabaseBackupTelegramSettingsApi = async (payload) => {
  const response = await axiosClient.put("/database-backups/telegram", payload);
  return response.data;
};

export const testDatabaseBackupTelegramSettingsApi = async (payload) => {
  const response = await axiosClient.post("/database-backups/telegram/test", payload);
  return response.data;
};

export const requestDatabaseRestoreVerificationCodeApi = async (backupId) => {
  const response = await axiosClient.post(`/database-backups/${backupId}/restore/request-code`);
  return response.data;
};

export const prepareDatabaseRestoreApi = async (backupId, payload) => {
  const response = await axiosClient.post(`/database-backups/${backupId}/restore/prepare`, payload);
  return response.data;
};

export const executeDatabaseRestoreApi = async (payload) => {
  const response = await axiosClient.post("/database-backups/restore/execute", payload);
  return response.data;
};
