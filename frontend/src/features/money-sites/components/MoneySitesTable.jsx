import React from "react";
import { useMoneySiteUiCopy } from "../hooks/useMoneySiteUiCopy";

function getDateTimeLocale(language) {
  return language === "indonesian" ? "id-ID" : undefined;
}

function formatStatus(status) {
  return status;
}

function formatCheckedAt(value, language) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(getDateTimeLocale(language), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusTone(status) {
  if (status === "ada") {
    return "management-badge is-inactive";
  }

  if (status === "tidak ada") {
    return "management-badge is-active";
  }

  return "management-badge";
}

function getWebsiteUrl(domain) {
  const value = String(domain || "").trim();

  if (!value) {
    return "";
  }

  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function formatOptionalField(value) {
  return String(value || "").trim() || "-";
}

export default function MoneySitesTable({
  moneySites,
  canEditMoneySites,
  canDeleteMoneySites,
  canManageScreenshots,
  canCaptureScreenshots,
  assignedScreenshotMoneySiteIds = [],
  busyMoneySiteId,
  blockedSelectableCount,
  selectedBlockedIds,
  selectedBlockedCount,
  allBlockedSelected,
  blockedSelectionBusy,
  onEdit,
  onDelete,
  onAssignScreenshot,
  onPreviewScreenshot,
  onUnassignScreenshot,
  onToggleBlockedSelection,
  onToggleSelectAllBlocked,
  onBulkDeleteBlocked,
}) {
  const { copy, language } = useMoneySiteUiCopy();
  const statusLabels = copy.common.statusLabels;
  const assignedScreenshotIds = new Set(assignedScreenshotMoneySiteIds);

  return (
    <section className="app-panel management-table">
      <div className="management-section-header">
        <div>
          <h2>{copy.table.title}</h2>
        </div>
        {canDeleteMoneySites ? (
          <div className="management-inline-actions">
            <span className={`management-badge${selectedBlockedCount ? " is-inactive" : ""}`}>
              {copy.table.selectedBlocked(selectedBlockedCount)}
            </span>
            {blockedSelectableCount ? (
              <button
                type="button"
                className="management-button-secondary"
                onClick={onToggleSelectAllBlocked}
                disabled={blockedSelectionBusy}
              >
                {blockedSelectionBusy
                  ? copy.table.selectingBlocked
                  : allBlockedSelected
                    ? copy.table.clearBlockedSelection
                    : copy.table.selectBlocked}
              </button>
            ) : null}
            <button
              type="button"
              className="management-button-secondary"
              onClick={onBulkDeleteBlocked}
              disabled={!selectedBlockedCount}
            >
              {copy.table.deleteSelectedBlocked}
            </button>
          </div>
        ) : null}
      </div>

      <div className="management-table-wrap">
        <table className="brands-management-table money-sites-table">
          <thead>
            <tr>
              {canDeleteMoneySites ? (
                <th className="money-sites-select-column">
                  {blockedSelectableCount ? (
                    <input
                      type="checkbox"
                      checked={allBlockedSelected}
                      onChange={onToggleSelectAllBlocked}
                      disabled={blockedSelectionBusy}
                      aria-label={copy.table.selectAllAria}
                    />
                  ) : (
                    copy.table.selectLabel
                  )}
                </th>
              ) : null}
              <th className="money-sites-brand-column">{copy.common.brand}</th>
              <th className="money-sites-domain-column">{copy.common.domain}</th>
              <th className="money-sites-note-column">{copy.common.note}</th>
              <th className="money-sites-text-status-column">{copy.common.statusText}</th>
              <th className="money-sites-status-column">{copy.common.nawala}</th>
              <th className="money-sites-updated-column">{copy.common.updated}</th>
              <th className="money-sites-action-column">{copy.common.action}</th>
            </tr>
          </thead>
          <tbody>
            {moneySites.map((item) => {
              const isBusy = busyMoneySiteId === item._id;
              const isBlocked = item.nawala?.status === "ada";
              const isSelected = selectedBlockedIds.includes(item._id);
              const isScreenshotAssigned = assignedScreenshotIds.has(item._id);

              return (
                <tr
                  key={item._id}
                  className={`${isBlocked ? "money-sites-row is-blocked" : "money-sites-row"}${isScreenshotAssigned ? " is-screenshot-assigned" : ""}`}
                  onDoubleClick={() => {
                    if (canCaptureScreenshots) {
                      onPreviewScreenshot(item);
                    }
                  }}
                  title={canCaptureScreenshots ? copy.table.doubleClickPreview : undefined}
                >
                  {canDeleteMoneySites ? (
                    <td className="money-sites-select-column">
                      {isBlocked ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleBlockedSelection(item._id)}
                          aria-label={copy.table.selectBlockedAria(item.domain)}
                        />
                      ) : (
                        <span className="money-sites-select-placeholder">-</span>
                      )}
                    </td>
                  ) : null}
                  <td className="money-sites-brand-column">
                    <span
                      className="management-brand-chip"
                      style={{
                        background: item.brandId?.backgroundCss || "#38476d",
                        color: item.brandId?.textColor || "#ffffff",
                      }}
                    >
                      {item.brandId?.brandName || "-"}
                    </span>
                  </td>
                  <td className="money-sites-domain-column">
                    <strong>
                      <span className="money-sites-domain-text" title={item.domain}>
                        {item.domain}
                      </span>
                      <button
                        type="button"
                        className=" "
                        onClick={(event) => {
                          event.stopPropagation();
                          window.open(getWebsiteUrl(item.domain), "_blank", "noopener,noreferrer");
                        }}
                        onDoubleClick={(event) => event.stopPropagation()}
                        title={copy.table.openDomainAria(item.domain)}
                        aria-label={copy.table.openDomainAria(item.domain)}
                      >
                     <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 3h7v7" />
                        <path d="M10 14 21 3" />
                        <path d="M21 14v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h4" />
                      </svg>
                      </button>
                    </strong>
                  </td>
                  <td className="money-sites-note-column" title={item.note || ""}>
                    <span>{formatOptionalField(item.note)}</span>
                  </td>
                  <td className="money-sites-text-status-column" title={item.statusText || ""}>
                    <span>{formatOptionalField(item.statusText)}</span>
                  </td>
                  <td className="money-sites-status-column">
                    <span className={getStatusTone(item.nawala?.status)}>
                      {statusLabels[formatStatus(item.nawala?.status)] || statusLabels.unknown}
                    </span>
                  </td>
                  <td className="money-sites-updated-column">
                    {formatCheckedAt(item.nawala?.lastChecked, language)}
                  </td>
                  <td className="money-sites-action-column">
                    <div
                      className="management-inline-actions"
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() => onEdit(item)}
                        disabled={!canEditMoneySites}
                      >
                        {copy.common.edit}
                      </button>
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() => onDelete(item)}
                        disabled={!canDeleteMoneySites || isBusy}
                      >
                        {copy.common.delete}
                      </button>
                      {canManageScreenshots ? (
                        <button
                          type="button"
                          className={`management-button-secondary money-sites-assign-toggle-button${
                            isScreenshotAssigned ? " is-assigned" : ""
                          }`}
                          onClick={() =>
                            isScreenshotAssigned ? onUnassignScreenshot(item) : onAssignScreenshot(item)
                          }
                          disabled={isBusy}
                          title={
                            isScreenshotAssigned
                              ? copy.table.screenshotUnassignTitle(item.domain)
                              : copy.table.screenshotAssignTitle(item.domain)
                          }
                        >
                          {isScreenshotAssigned
                            ? copy.table.screenshotUnassignButton
                            : copy.table.screenshotAssignButton}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!moneySites.length ? (
        <p className="management-empty">{copy.table.noResults}</p>
      ) : null}
    </section>
  );
}
