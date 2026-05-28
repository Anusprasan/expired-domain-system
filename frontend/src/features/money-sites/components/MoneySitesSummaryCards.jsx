import React from "react";
import { AppIcon } from "../../../shared/components/Icons";
import { useMoneySiteUiCopy } from "../hooks/useMoneySiteUiCopy";

function getNumberLocale(language) {
  return language === "indonesian" ? "id-ID" : undefined;
}

function formatSummaryValue(value, language) {
  return Number(value || 0).toLocaleString(getNumberLocale(language));
}

export default function MoneySitesSummaryCards({ summary }) {
  const { copy, language } = useMoneySiteUiCopy();
  const cards = [
    {
      key: "total",
      label: copy.summary.total,
      icon: "link",
      tone: "is-primary",
      value: summary?.total || 0,
    },
    {
      key: "blocked",
      label: copy.summary.blocked,
      icon: "shield",
      tone: "is-warning",
      value: summary?.blocked || 0,
    },
    {
      key: "notBlocked",
      label: copy.summary.clear,
      icon: "network",
      tone: "is-success",
      value: summary?.notBlocked || 0,
    },
    {
      key: "unknown",
      label: copy.summary.waiting,
      icon: "history",
      tone: "is-muted",
      value: summary?.unknown || 0,
    },
  ];

  return (
    <section className="management-overview-grid money-sites-overview-grid">
      {cards.map((card) => (
        <article key={card.key} className={`management-overview-card money-sites-overview-card ${card.tone}`}>
          <div className="money-sites-overview-card-inner">
            <div className="money-sites-overview-card-top">
              <div className="money-sites-overview-card-copy">
                <span className="money-sites-overview-card-label">{card.label}</span>
                <strong className="money-sites-overview-card-value">
                  {formatSummaryValue(card.value, language)}
                </strong>
              </div>
              <span className="money-sites-overview-card-icon" aria-hidden="true">
                <AppIcon name={card.icon} />
              </span>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
