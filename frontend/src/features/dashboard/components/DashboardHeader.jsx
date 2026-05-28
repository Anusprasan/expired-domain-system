import React from "react";

export default function DashboardHeader({
  title,
  welcome,
  subtitle,
}) {
  return (
    <section className="app-panel dashboard-header-panel">
      <div className="dashboard-header-main">
        <div className="dashboard-header-copy">
          <span className="dashboard-header-eyebrow">{title}</span>
          <h1>{welcome}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
    </section>
  );
}
