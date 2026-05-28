import axiosClient from "../../../shared/api/axiosClient";

function parseDownloadFileName(headers = {}, fallback = "website-snapshot.zip") {
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

export const searchWebsiteSnapshotsApi = async (params) => {
  const response = await axiosClient.get("/website-snapshots", { params });
  return response.data;
};

export const checkWebsiteSnapshotArchiveStatusApi = async (params) => {
  const response = await axiosClient.get("/website-snapshots/archive-status", { params });
  return response.data;
};

export const getWebsiteSnapshotHistoryApi = async (params) => {
  const response = await axiosClient.get("/website-snapshots/history", { params });
  return response.data;
};

export const deleteWebsiteSnapshotHistoryApi = async (historyId) => {
  const response = await axiosClient.delete(`/website-snapshots/history/${historyId}`);
  return response.data;
};

export const getWebsiteSnapshotViewStatesApi = async (payload) => {
  const response = await axiosClient.post("/website-snapshots/view-states", payload);
  return response.data;
};

export const setWebsiteSnapshotViewStateApi = async (payload) => {
  const response = await axiosClient.post("/website-snapshots/view-state", payload);
  return response.data;
};

export const downloadWebsiteSnapshotApi = async (payload) => {
  let response;

  try {
    response = await axiosClient.post("/website-snapshots/download", payload, {
      responseType: "blob",
    });
  } catch (error) {
    if (error.response?.data instanceof Blob) {
      const text = await error.response.data.text();
      try {
        error.response.data = JSON.parse(text);
      } catch {
        error.response.data = { message: text };
      }
    }

    throw error;
  }

  return {
    blob: response.data,
    fileName: parseDownloadFileName(response.headers),
  };
};
