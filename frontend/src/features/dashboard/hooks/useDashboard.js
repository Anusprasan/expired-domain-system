import { useCallback, useEffect, useState } from "react";
import { getDashboardApi } from "../api/dashboardApi";

export function useDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasError, setHasError] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setHasError(false);
      const response = await getDashboardApi();
      setDashboard(response.data);
    } catch (err) {
      setError(err.response?.data?.message || "");
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return {
    dashboard,
    loading,
    error,
    hasError,
    reloadDashboard: loadDashboard,
  };
}
