import { useCallback, useEffect, useState } from "react";
import { getPrivilegesApi } from "../api/privilegesApi";

export function usePrivileges() {
  const [privileges, setPrivileges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPrivileges = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const response = await getPrivilegesApi();
      setPrivileges(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load privileges");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrivileges();
  }, [loadPrivileges]);

  return {
    privileges,
    loading,
    error,
    reloadPrivileges: loadPrivileges,
  };
}
