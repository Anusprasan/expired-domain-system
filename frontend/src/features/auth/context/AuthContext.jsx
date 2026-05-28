import React, { createContext, useEffect, useState } from "react";
import { getMeApi, loginApi } from "../api/authApi";
import { getToken, removeToken, setToken } from "../utils/authStorage";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = async ({ email, password }) => {
    const data = await loginApi({ email, password });

    setToken(data.data.token);
    setUser(data.data.user);

    return data;
  };

  const logout = () => {
    removeToken();
    setUser(null);
  };

  const fetchCurrentUser = async () => {
    try {
      const data = await getMeApi();
      setUser(data.data);
    } catch (error) {
      removeToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getToken();

    if (token) {
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshCurrentUser: fetchCurrentUser,
        setCurrentUser: setUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
