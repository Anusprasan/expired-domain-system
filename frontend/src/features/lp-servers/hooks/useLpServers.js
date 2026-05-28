import { useCallback, useEffect, useState } from "react";
import {
  getLpServersApi,
  createLpServerApi,
  updateLpServerApi,
  deleteLpServerApi,
} from "../api/lpServersApi";
import { useLpServersUiCopy } from "./useLpServersUiCopy";

export function useLpServers(filters = {}) {
  const { copy } = useLpServersUiCopy();
  const search = String(filters.search || "").trim();
  const [lpServers, setLpServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLpServers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getLpServersApi({ search });
      setLpServers(res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || copy.page.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.page.loadError, search]);

  useEffect(() => {
    loadLpServers();
  }, [loadLpServers]);

  const createLpServer = async (payload) => {
    await createLpServerApi(payload);
    await loadLpServers();
  };

  const updateLpServer = async (id, payload) => {
    await updateLpServerApi(id, payload);
    await loadLpServers();
  };

  const deleteLpServer = async (id) => {
    await deleteLpServerApi(id);
    await loadLpServers();
  };

  return {
    lpServers,
    loading,
    error,
    createLpServer,
    updateLpServer,
    deleteLpServer,
    reloadLpServers: loadLpServers,
  };
}
