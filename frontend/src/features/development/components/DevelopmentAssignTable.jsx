import React, { useMemo } from "react";
import { FaCheckCircle, FaEye } from "react-icons/fa";
import DevelopmentProgressCircle from "./DevelopmentProgressCircle";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

function hasSelectedArticle(item) {
  return Boolean(item?.articlePoolArticleId?._id || item?.articlePoolArticleId);
}

function getAssignmentDateKey(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPageBadges(item) {
  return [
    item.landingPage ? { key: "landingPage", href: item.landingPage } : null,
    item.termsAndConditionsPage ? { key: "termsAndConditionsPage", href: item.termsAndConditionsPage } : null,
    item.aboutPage ? { key: "aboutPage", href: item.aboutPage } : null,
    item.contactPage ? { key: "contactPage", href: item.contactPage } : null,
  ].filter(Boolean);
}

export default function DevelopmentAssignTable({
  domains,
  onAssign,
  onOpenContent,
  onEditDomain,
  onEditContent,
  busyId,
  toolbar,
  canEditDomain,
  canEditContent,
  canAssignDevelopment,
  currentUserId,
  sort,
  onSortChange,
}) {
  const { copy, locale } = useDevelopmentUiCopy();
  const assignedCounts = useMemo(() => {
    const counts = new Map();

    domains.forEach((item) => {
      const developerId = item.assignedDeveloperId?._id;
      const dateKey = getAssignmentDateKey(item.assignedAt);

      if (!developerId || !dateKey) {
        return;
      }

      const key = `${developerId}-${dateKey}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return counts;
  }, [domains]);

  const showBrandColumn = true;
  const showDomainColumn = true;
  const showDomainEdit = canAssignDevelopment && canEditDomain;
  const showContentEdit = canEditContent;
  const visibleColumnCount =
    1
    + (showBrandColumn ? 1 : 0)
    + (showDomainColumn ? 1 : 0)
    + 1
    + 1
    + 1
    + 1
    + 1;

  const renderSortableHeader = (label, sortKey, className) => (
    <th className={className}>
      <button
        type="button"
        className={`development-sort-button${sort.key === sortKey ? " is-active" : ""}`}
        onClick={() => onSortChange(sortKey)}
      >
        <span>{label}</span>
        <span className="development-sort-arrows" aria-hidden="true">
          <span className={sort.key === sortKey && sort.direction === "asc" ? "is-active" : ""}>↑</span>
          <span className={sort.key === sortKey && sort.direction === "desc" ? "is-active" : ""}>↓</span>
        </span>
      </button>
    </th>
  );

  return (
    <section className="app-panel management-table">
      <div className="management-section-header">
        <div>
          <h2>{copy.assignTable.title}</h2>
          <p>{copy.assignTable.description}</p>
        </div>
        {toolbar}
      </div>

      <div className="management-table-wrap">
        <table className="development-assign-table">
          <colgroup>
            <col style={{ width: "11%" }} />
            {showBrandColumn ? <col style={{ width: "14%" }} /> : null}
            {showDomainColumn ? <col style={{ width: "22%" }} /> : null}
            <col style={{ width: showDomainColumn ? "8%" : "10%" }} />
            <col style={{ width: showDomainColumn ? "13%" : "18%" }} />
            <col style={{ width: showDomainColumn ? "12%" : "18%" }} />
            <col style={{ width: showDomainColumn ? "18%" : "34%" }} />
            <col style={{ width: showDomainColumn ? "8%" : "20%" }} />
          </colgroup>

          <thead>
            <tr>
              {renderSortableHeader(copy.assignTable.headers.date, "date")}
              {showBrandColumn ? renderSortableHeader(copy.assignTable.headers.brand, "brand", "development-brand-column") : null}
              {showDomainColumn ? renderSortableHeader(copy.assignTable.headers.domain, "domain", "development-domain-column") : null}
              {renderSortableHeader(copy.assignTable.headers.content, "content", "development-content-column")}
              {renderSortableHeader(copy.assignTable.headers.contentBy, "contentBy", "development-content-owner-column")}
              {renderSortableHeader(copy.assignTable.headers.assignedTo, "assignedTo", "development-assigned-column")}
              <th className="development-edit-column">{copy.assignTable.headers.edit}</th>
              <th className="development-progress-column">{copy.assignTable.headers.progress}</th>
            </tr>
          </thead>

          <tbody>
            {domains.length ? (
              domains.map((item) => {
                const hasArticlePreview = hasSelectedArticle(item);
                const pageBadges = getPageBadges(item);
                const lockedByOtherUser =
                  item.contentEditorId?._id &&
                  String(item.contentEditorId._id) !== String(currentUserId);

                const contentEditDisabled = lockedByOtherUser || !hasArticlePreview;

                const assignedCountKey = `${
                  item.assignedDeveloperId?._id || ""
                }-${getAssignmentDateKey(item.assignedAt)}`;

                const assignedCount = assignedCounts.get(assignedCountKey) || 0;

                const assignedLabel = item.assignedDeveloperId?.fullName
                /* Number of assignments per day */
                  ? copy.assignTable.assignedDeveloper(item.assignedDeveloperId.fullName, assignedCount)
                  : copy.assignTable.assign;

                const contentOwnerLabel =
                  item.contentEditorId?.fullName ||
                  item.contentUpdatedBy?.fullName ||
                  "-";

                const contentOwnerClassName = item.contentEditorId?._id
                  ? "is-locked"
                  : hasArticlePreview && item.contentUpdatedBy?._id
                    ? "is-ready"
                    : "is-missing";

                return (
                  <tr key={item._id}>
                    <td>
                      <strong>{new Date(item.createdAt).toLocaleDateString(locale)}</strong>
                    </td>
                    {showBrandColumn ? (
                    <td className="development-brand-column">
                      <div className="management-stack">
                        <strong>{item.brandName}</strong>
                      </div>
                    </td>
                    ) : null}

                    {showDomainColumn ? (
                    <td className="development-domain-column development-domain-cell">
                      <strong>{item.domain}</strong>
                      {pageBadges.length ? (
                        <div className="development-domain-badge-list" aria-label={copy.assignTable.availablePages}>
                          {pageBadges.map((badge) => (
                            <a
                              key={badge.key}
                              className="management-badge development-domain-badge development-domain-badge-link"
                              title={copy.pageBadges[badge.key]?.title}
                              href={badge.href}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {copy.pageBadges[badge.key]?.label}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    ) : null}

                    <td className="development-content-column">
                      <button
                        type="button"
                        className={`development-icon-button ${
                          hasArticlePreview ? "is-ready" : "is-missing"
                        }`}
                        onClick={() => onOpenContent(item)}
                        disabled={!hasArticlePreview}
                        title={hasArticlePreview ? copy.assignTable.previewSelectedContent : copy.assignTable.noContentSelected}
                      >
                        <FaEye />
                      </button>
                    </td>

                    <td className="development-content-owner-column">
                      <button
                        type="button"
                        className={`management-button-secondary development-content-owner ${contentOwnerClassName}`}
                        disabled
                        title={
                          item.contentEditorId?.fullName
                            ? copy.assignTable.contentBeingAddedBy(item.contentEditorId.fullName)
                            : item.contentUpdatedBy?.fullName
                              ? copy.assignTable.contentWasAddedBy(item.contentUpdatedBy.fullName)
                              : copy.assignTable.contentNotAddedYet
                        }
                      >
                        {contentOwnerLabel}
                      </button>
                    </td>

                    <td className="development-assigned-column">
                      <div className="development-inline-assign">
                        <button
                          type="button"
                          className={`management-button-secondary development-assign-button${
                            item.assignedDeveloperId ? " is-assigned" : ""
                          }`}
                          onClick={() => {
                            if (canAssignDevelopment) {
                              onAssign(item);
                            }
                          }}
                          disabled={!canAssignDevelopment || busyId === item._id}
                        >
                          {busyId === item._id ? copy.assignTable.assigning : assignedLabel}
                        </button>
                      </div>
                    </td>

                    <td className="development-edit-column">
                      <div className="development-edit-actions">
                        {showDomainEdit ? (
                          <button
                            type="button"
                            className="management-button-secondary development-edit-action"
                            onClick={() => onEditDomain(item)}
                          >
                            {copy.assignTable.editDomain}
                          </button>
                        ) : null}

                        {showContentEdit ? (
                          <button
                            type="button"
                            className={`management-button-secondary development-edit-action${
                              contentEditDisabled
                                ? lockedByOtherUser
                                  ? " is-locked"
                                  : " is-disabled"
                                : ""
                            }`}
                            onClick={() => onEditContent(item)}
                            disabled={contentEditDisabled}
                            title={
                              lockedByOtherUser
                                ? copy.assignTable.contentBeingEditedBy(item.contentEditorId?.fullName)
                                : hasArticlePreview
                                  ? copy.assignTable.editSelectedContentPool
                                  : copy.assignTable.selectContentInAddDomain
                            }
                          >
                            {copy.assignTable.contentPool}
                          </button>
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                    </td>

                    <td className="development-progress-column">
                      <div className="development-progress-cell">
                        <DevelopmentProgressCircle
                          value={item.progressPercent}
                          completed={item.developmentStatus === "completed"}
                        />
                        {item.developmentStatus === "completed" ? (
                          <FaCheckCircle className="development-complete-icon" />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={visibleColumnCount}>{copy.assignTable.empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
