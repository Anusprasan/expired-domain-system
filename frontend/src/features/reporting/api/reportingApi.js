import axiosClient from "../../../shared/api/axiosClient";

function parseAttachmentFilename(contentDisposition = "", fallback = "reporting-evidence-cleanup.zip") {
  const encodedMatch = String(contentDisposition || "").match(/filename\*=UTF-8''([^;]+)/i);

  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const plainMatch = String(contentDisposition || "").match(/filename="?([^";]+)"?/i);

  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallback;
}

export async function getReportingOverviewApi() {
  const response = await axiosClient.get("/reporting/overview");
  return response.data;
}

export async function getReportingSettingsApi() {
  const response = await axiosClient.get("/reporting/settings");
  return response.data;
}

export async function updateReportingSettingsApi(payload) {
  const response = await axiosClient.patch("/reporting/settings", payload);
  return response.data;
}

export async function getReportingEvidenceStorageSummaryApi(params = {}) {
  const response = await axiosClient.get("/reporting/evidence-storage", { params });
  return response.data;
}

export async function cleanupReportingEvidenceStorageApi(payload) {
  const response = await axiosClient.post("/reporting/evidence-storage/cleanup", payload, {
    responseType: "blob",
  });

  return {
    blob: response.data,
    filename: parseAttachmentFilename(
      response.headers?.["content-disposition"],
      "reporting-evidence-cleanup-global.zip"
    ),
    deletedCount: Number(response.headers?.["x-reporting-deleted-image-count"] || 0),
    deletedBytes: Number(response.headers?.["x-reporting-deleted-image-bytes"] || 0),
    affectedSubmissionCount: Number(
      response.headers?.["x-reporting-affected-submission-count"] || 0
    ),
  };
}

export async function getReportingMailProfilesAdminApi() {
  const response = await axiosClient.get("/reporting/mail-profiles/admin");
  return response.data;
}

export async function getReportingMailProfilesMineApi() {
  const response = await axiosClient.get("/reporting/mail-profiles/mine");
  return response.data;
}

export async function createReportingMailProfileApi(payload) {
  const response = await axiosClient.post("/reporting/mail-profiles/admin", payload);
  return response.data;
}

export async function createReportingMyMailProfileApi(payload) {
  const response = await axiosClient.post("/reporting/mail-profiles/mine", payload);
  return response.data;
}

export async function updateReportingMailProfileApi(profileId, payload) {
  const response = await axiosClient.patch(`/reporting/mail-profiles/admin/${profileId}`, payload);
  return response.data;
}

export async function updateReportingMyMailProfileApi(profileId, payload) {
  const response = await axiosClient.patch(`/reporting/mail-profiles/mine/${profileId}`, payload);
  return response.data;
}

export async function deleteReportingMailProfileApi(profileId) {
  const response = await axiosClient.delete(`/reporting/mail-profiles/admin/${profileId}`);
  return response.data;
}

export async function deleteReportingMyMailProfileApi(profileId) {
  const response = await axiosClient.delete(`/reporting/mail-profiles/mine/${profileId}`);
  return response.data;
}

export async function sendReportingMailProfileTestApi(profileId, payload) {
  const response = await axiosClient.post(`/reporting/mail-profiles/admin/${profileId}/test`, payload);
  return response.data;
}

export async function sendReportingMyMailProfileTestApi(profileId, payload) {
  const response = await axiosClient.post(`/reporting/mail-profiles/mine/${profileId}/test`, payload);
  return response.data;
}

export async function getReportingWorkflowsApi() {
  const response = await axiosClient.get("/reporting/workflows");
  return response.data;
}

export async function getReportingReportsApi(params = {}) {
  const response = await axiosClient.get("/reporting/reports", { params });
  return response.data;
}

export async function getReportingReportDetailApi(reportId) {
  const response = await axiosClient.get(`/reporting/reports/${reportId}`);
  return response.data;
}

export async function createReportingReportApi(payload) {
  const response = await axiosClient.post("/reporting/reports", payload);
  return response.data;
}

export async function updateReportingTaskApi(reportId, payload) {
  const response = await axiosClient.patch(`/reporting/reports/${reportId}`, payload);
  return response.data;
}

export async function deleteReportingTaskApi(reportId) {
  const response = await axiosClient.delete(`/reporting/reports/${reportId}`);
  return response.data;
}

export async function claimReportingReportApi(reportId) {
  const response = await axiosClient.patch(`/reporting/reports/${reportId}/claim`);
  return response.data;
}

export async function unclaimReportingReportApi(reportId) {
  const response = await axiosClient.patch(`/reporting/reports/${reportId}/unclaim`);
  return response.data;
}

export async function updateReportingReportStatusApi(reportId, payload) {
  const response = await axiosClient.patch(`/reporting/reports/${reportId}/status`, payload);
  return response.data;
}

export async function createReportingSubmissionApi(reportId, payload, options = {}) {
  const response = await axiosClient.post(`/reporting/reports/${reportId}/submissions`, payload, {
    onUploadProgress: options.onUploadProgress,
  });
  return response.data;
}

export async function updateReportingSubmissionApi(reportId, submissionId, payload, options = {}) {
  const response = await axiosClient.patch(
    `/reporting/reports/${reportId}/submissions/${submissionId}`,
    payload,
    {
      onUploadProgress: options.onUploadProgress,
    }
  );
  return response.data;
}

export async function deleteReportingSubmissionApi(reportId, submissionId) {
  const response = await axiosClient.delete(`/reporting/reports/${reportId}/submissions/${submissionId}`);
  return response.data;
}

export async function getReportingSubmissionImageBlobApi(reportId, submissionId, imageId, options = {}) {
  const response = await axiosClient.get(
    `/reporting/reports/${encodeURIComponent(reportId)}/submissions/${encodeURIComponent(
      submissionId
    )}/images/${encodeURIComponent(imageId)}`,
    {
      responseType: "blob",
      signal: options.signal,
    }
  );
  return response.data;
}

export async function deleteReportingSubmissionOldImagesApi(reportId, submissionId, payload) {
  const response = await axiosClient.post(
    `/reporting/reports/${encodeURIComponent(reportId)}/submissions/${encodeURIComponent(
      submissionId
    )}/images/cleanup-old`,
    payload,
    {
      responseType: "blob",
    }
  );

  return {
    blob: response.data,
    filename: parseAttachmentFilename(response.headers?.["content-disposition"]),
    deletedCount: Number(response.headers?.["x-reporting-deleted-image-count"] || 0),
    deletedBytes: Number(response.headers?.["x-reporting-deleted-image-bytes"] || 0),
  };
}

export async function markReportingClaimCheckedApi(reportId, reporterId) {
  const response = await axiosClient.patch(`/reporting/reports/${reportId}/claims/${reporterId}/check`);
  return response.data;
}

export async function rejectReportingClaimApi(reportId, reporterId, payload) {
  const response = await axiosClient.patch(`/reporting/reports/${reportId}/claims/${reporterId}/reject`, payload);
  return response.data;
}

export async function reverseReportingClaimCheckedApi(reportId, reporterId) {
  const response = await axiosClient.patch(`/reporting/reports/${reportId}/claims/${reporterId}/uncheck`);
  return response.data;
}

export async function generateReportingEmailApi(reportId, payload) {
  const response = await axiosClient.post(`/reporting/reports/${reportId}/ai/generate`, payload);
  return response.data;
}

export async function saveReportingEmailDraftApi(reportId, payload) {
  const response = await axiosClient.post(`/reporting/reports/${reportId}/ai/draft`, payload);
  return response.data;
}

export async function sendReportingEmailApi(reportId, payload) {
  const response = await axiosClient.post(`/reporting/reports/${reportId}/ai/send`, payload);
  return response.data;
}

export async function updateReportingWorkflowApi(issueType, payload) {
  const response = await axiosClient.patch(`/reporting/workflows/${issueType}`, payload);
  return response.data;
}

export async function getReportingTaskTrackingApi() {
  const response = await axiosClient.get("/reporting/task-tracking");
  return response.data;
}
