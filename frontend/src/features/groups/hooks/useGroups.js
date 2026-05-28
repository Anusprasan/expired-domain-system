import { useCallback, useEffect, useState } from "react";
import {
  createGroupApi,
  deleteGroupApi,
  getGroupsApi,
  updateGroupApi,
} from "../api/groupsApi";

export function useGroups(enabled = true) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const loadGroups = useCallback(async () => {
    if (!enabled) {
      setGroups([]);
      setError("");
      setLoading(false);
      return { data: [] };
    }

    try {
      setError("");
      setLoading(true);
      const response = await getGroupsApi();
      setGroups(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const createGroup = useCallback(async (payload) => {
    const response = await createGroupApi(payload);
    await loadGroups();
    return response;
  }, [loadGroups]);

  const updateGroup = useCallback(async (id, payload) => {
    const response = await updateGroupApi(id, payload);
    await loadGroups();
    return response;
  }, [loadGroups]);

  const deleteGroup = useCallback(async (id, targetGroupId) => {
    const response = await deleteGroupApi(id, targetGroupId);
    await loadGroups();
    return response;
  }, [loadGroups]);

  return {
    groups,
    loading,
    error,
    reloadGroups: loadGroups,
    createGroup,
    updateGroup,
    deleteGroup,
  };
}
