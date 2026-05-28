import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { canAccessNavItem } from "../../shared/utils/permissions";

export default function PrivilegeRoute({ item, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: "20px" }}>Loading...</div>;
  }

  if (!canAccessNavItem(user, item)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
