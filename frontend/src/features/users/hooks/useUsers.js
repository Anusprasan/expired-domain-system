import { useCallback, useEffect, useState } from "react";
import {
  changeUserGroupApi,
  changeUserStatusApi,
  createUserApi,
  deleteUserApi,
  getUsersApi,
  updateUserApi,
} from "../api/usersApi";

export function useUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const response = await getUsersApi();
      setUsers(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const createUser = useCallback(async (payload) => {
    const response = await createUserApi(payload);
    await loadUsers();
    return response;
  }, [loadUsers]);

  const updateUser = useCallback(async (id, payload) => {
    const response = await updateUserApi(id, payload);
    await loadUsers();
    return response;
  }, [loadUsers]);

  const changeUserGroup = useCallback(async (id, groupId) => {
    const response = await changeUserGroupApi(id, groupId);
    await loadUsers();
    return response;
  }, [loadUsers]);

  const changeUserStatus = useCallback(async (id, status) => {
    const response = await changeUserStatusApi(id, status);
    await loadUsers();
    return response;
  }, [loadUsers]);

  const deleteUser = useCallback(async (id) => {
    const response = await deleteUserApi(id);
    await loadUsers();
    return response;
  }, [loadUsers]);

  return {
    users,
    loading,
    error,
    reloadUsers: loadUsers,
    createUser,
    updateUser,
    changeUserGroup,
    changeUserStatus,
    deleteUser,
  };
}
