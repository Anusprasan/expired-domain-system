import { useCallback, useEffect, useState } from "react";
import { getBrandsApi } from "../../brands/api/brandsApi";
import {
  claimReportingReportApi,
  createReportingReportApi,
  createReportingSubmissionApi,
  deleteReportingSubmissionApi,
  deleteReportingTaskApi,
  getReportingOverviewApi,
  getReportingReportDetailApi,
  getReportingReportsApi,
  markReportingClaimCheckedApi,
  rejectReportingClaimApi,
  reverseReportingClaimCheckedApi,
  unclaimReportingReportApi,
  updateReportingTaskApi,
  updateReportingSubmissionApi,
  updateReportingReportStatusApi,
} from "../api/reportingApi";

export function useReporting(filters, options = {}) {
  const { loadWorkspace = true, loadBrands: shouldLoadBrands = true } = options;
  const [overview, setOverview] = useState(null);
  const [brands, setBrands] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    if (!loadWorkspace) {
      setOverview(null);
      return null;
    }

    const response = await getReportingOverviewApi();
    setOverview(response.data);
    return response.data;
  }, [loadWorkspace]);

  const loadBrands = useCallback(async () => {
    if (!shouldLoadBrands) {
      setBrands([]);
      return [];
    }

    const response = await getBrandsApi();
    const loadedBrands = response.data || [];
    setBrands(loadedBrands);
    return loadedBrands;
  }, [shouldLoadBrands]);

  const loadReports = useCallback(async () => {
    if (!loadWorkspace) {
      setReports([]);
      return [];
    }

    const response = await getReportingReportsApi(filters);
    const loadedReports = response.data || [];
    setReports(loadedReports);
    return loadedReports;
  }, [filters, loadWorkspace]);

  const loadDetail = useCallback(async (reportId) => {
    if (!loadWorkspace || !reportId) {
      setSelectedReport(null);
      setSubmissions([]);
      return null;
    }

    setDetailLoading(true);
    try {
      const response = await getReportingReportDetailApi(reportId);
      setSelectedReport(response.data?.report || null);
      setSubmissions(response.data?.submissions || []);
      return response.data?.report || null;
    } finally {
      setDetailLoading(false);
    }
  }, [loadWorkspace]);

  const reloadAll = useCallback(
    async (selectedReportId = null) => {
      try {
        setError("");
        if (!hasLoadedOnce) {
          setLoading(true);
        }
        const tasks = [];

        if (loadWorkspace) {
          tasks.push(loadReports(), loadOverview());
        } else {
          setOverview(null);
          setReports([]);
          setSelectedReport(null);
          setSubmissions([]);
        }

        if (shouldLoadBrands) {
          tasks.push(loadBrands());
        } else {
          setBrands([]);
        }

        const taskResults = await Promise.all(tasks);
        const loadedReports = loadWorkspace ? taskResults[0] || [] : [];

        if (loadWorkspace) {
          await loadDetail(selectedReportId || null);
        }
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load reporting data");
      } finally {
        setLoading(false);
        setHasLoadedOnce(true);
      }
    },
    [hasLoadedOnce, loadBrands, loadDetail, loadOverview, loadReports, loadWorkspace, shouldLoadBrands]
  );

  useEffect(() => {
    void reloadAll(null);
  }, [filters, reloadAll]);

  const createReport = useCallback(
    async (payload) => {
      const response = await createReportingReportApi(payload);
      await reloadAll(response.data?._id || null);
      return response;
    },
    [reloadAll]
  );

  const claimReport = useCallback(
    async (reportId) => {
      const response = await claimReportingReportApi(reportId);
      await reloadAll(reportId);
      return response;
    },
    [reloadAll]
  );

  const updateTask = useCallback(
    async (reportId, payload) => {
      const response = await updateReportingTaskApi(reportId, payload);
      await reloadAll(reportId);
      return response;
    },
    [reloadAll]
  );

  const deleteTask = useCallback(
    async (reportId) => {
      const response = await deleteReportingTaskApi(reportId);
      await reloadAll(null);
      return response;
    },
    [reloadAll]
  );

  const updateReportStatus = useCallback(
    async (reportId, status) => {
      const response = await updateReportingReportStatusApi(reportId, { status });
      await reloadAll(reportId);
      return response;
    },
    [reloadAll]
  );

  const submitEvidence = useCallback(
    async (reportId, payload, options = {}) => {
      const response = await createReportingSubmissionApi(reportId, payload, options);
      await reloadAll(reportId);
      return response;
    },
    [reloadAll]
  );

  const unclaimReport = useCallback(
    async (reportId) => {
      const response = await unclaimReportingReportApi(reportId);
      await reloadAll(null);
      return response;
    },
    [reloadAll]
  );

  const markClaimChecked = useCallback(
    async (reportId, reporterId) => {
      const response = await markReportingClaimCheckedApi(reportId, reporterId);
      await reloadAll(reportId);
      return response;
    },
    [reloadAll]
  );

  const reverseClaimChecked = useCallback(
    async (reportId, reporterId) => {
      const response = await reverseReportingClaimCheckedApi(reportId, reporterId);
      await reloadAll(reportId);
      return response;
    },
    [reloadAll]
  );

  const rejectClaim = useCallback(
    async (reportId, reporterId, payload) => {
      const response = await rejectReportingClaimApi(reportId, reporterId, payload);
      await reloadAll(reportId);
      return response;
    },
    [reloadAll]
  );

  const updateSubmission = useCallback(
    async (reportId, submissionId, payload, options = {}) => {
      const response = await updateReportingSubmissionApi(reportId, submissionId, payload, options);
      await reloadAll(reportId);
      return response;
    },
    [reloadAll]
  );

  const deleteSubmission = useCallback(
    async (reportId, submissionId) => {
      const response = await deleteReportingSubmissionApi(reportId, submissionId);
      await reloadAll(reportId);
      return response;
    },
    [reloadAll]
  );

  return {
    overview,
    brands,
    reports,
    selectedReport,
    submissions,
    loading,
    detailLoading,
    error,
    reloadAll,
    loadDetail,
    createReport,
    updateTask,
    deleteTask,
    claimReport,
    unclaimReport,
    markClaimChecked,
    reverseClaimChecked,
    rejectClaim,
    updateSubmission,
    deleteSubmission,
    updateReportStatus,
    submitEvidence,
  };
}
