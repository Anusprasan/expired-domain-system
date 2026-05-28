import React from "react";
import { AppIcon } from "../../../shared/components/Icons";

export default function DashboardSummaryCard({ card }) {
  return (
    <article className={`app-panel dashboard-summary-card is-${card.tone || "neutral"}`}>
      <div className="dashboard-summary-top">
        <span className="dashboard-summary-label">{card.label}</span>
        {card.icon ? (
          <span className="dashboard-summary-icon" aria-hidden="true">
            <AppIcon name={card.icon} />
          </span>
        ) : null}
      </div>
      <strong className="dashboard-summary-value">{card.value}</strong>
      <p className="dashboard-summary-description">{card.description}</p>
    </article>
  );
}
