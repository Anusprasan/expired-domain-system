import React from "react";

export default function DashboardPanel({ title, description, children, action }) {
  return (
    <section className="app-panel dashboard-panel">
      <div className="dashboard-panel-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
