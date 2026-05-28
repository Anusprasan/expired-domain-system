import React from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "../../shared/components/Sidebar";
import "../../shared/styles/app-shell.css";

export default function DashboardLayout({ children }) {
  const { pathname } = useLocation();
  const isRankCheckerLayout = pathname === "/rank-checker";

  return (
    <div className={`app-shell${isRankCheckerLayout ? " is-rank-checker-layout" : ""}`}>
      <Sidebar />

      <div className="app-shell-main">
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
