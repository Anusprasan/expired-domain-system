import { useCallback, useEffect, useState } from "react";
import { getActivityLogsApi } from "../api/activityLogsApi";

export function useActivityLogs(filters) {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const response = await getActivityLogsApi(filters);
      setLogs(response.data?.items || []);
      setPagination(
        response.data?.pagination || {
          page: 1,
          limit: 25,
          total: 0,
          totalPages: 1,
        }
      );
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return {
    logs,
    pagination,
    loading,
    error,
    reloadLogs: loadLogs,
  };
}
