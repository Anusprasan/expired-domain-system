import { useCallback, useEffect, useState } from "react";
import {
  adminResetUserPasswordApi,
  clearAllPasswordResetRequestsApi,
  clearPasswordResetRequestApi,
  getPendingPasswordResetRequestsApi,
} from "../api/passwordResetApi";

export function usePasswordResetRequests(enabled = true) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    if (!enabled) {
      setRequests([]);
      setLoading(false);
      setError("");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await getPendingPasswordResetRequestsApi();
      setRequests(response.data || []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Failed to load password reset requests");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const adminResetUserPassword = useCallback(
    async (id, payload) => {
      const response = await adminResetUserPasswordApi(id, payload);
      await loadRequests();
      return response;
    },
    [loadRequests]
  );

  const clearPasswordResetRequest = useCallback(
    async (id, payload) => {
      const response = await clearPasswordResetRequestApi(id, payload);
      await loadRequests();
      return response;
    },
    [loadRequests]
  );

  const clearAllPasswordResetRequests = useCallback(
    async (payload) => {
      const response = await clearAllPasswordResetRequestsApi(payload);
      await loadRequests();
      return response;
    },
    [loadRequests]
  );

  return {
    requests,
    loading,
    error,
    reloadRequests: loadRequests,
    adminResetUserPassword,
    clearPasswordResetRequest,
    clearAllPasswordResetRequests,
  };
}
