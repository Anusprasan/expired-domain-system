import React, { useMemo, useState } from "react";
import { HiInformationCircle } from "react-icons/hi";
import {
  buildPrivilegeMatrix,
  getPrivilegeAction,
  getPrivilegeDisplayDescription,
  getPrivilegeDisplayName,
} from "../utils/privilegeMatrix";

export default function PrivilegesTable({ privileges, copy, catalogCopy }) {
  const [query, setQuery] = useState("");

  const privilegeGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const groups = buildPrivilegeMatrix(privileges);

    if (!normalizedQuery) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        privileges: group.privileges.filter((privilege) =>
          `${getPrivilegeDisplayName(privilege)} ${privilege.key} ${getPrivilegeDisplayDescription(privilege)} ${group.label} ${catalogCopy.moduleLabels[group.key] || ""} ${catalogCopy.actionLabels[getPrivilegeAction(privilege)] || ""}`
            .toLowerCase()
            .includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.privileges.length);
  }, [catalogCopy.actionLabels, catalogCopy.moduleLabels, privileges, query]);

  return (
    <section className="app-panel management-table">
      <div className="management-section-header">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <div className="management-search">
          <label htmlFor="privilege-search">{copy.search}</label>
          <input
            id="privilege-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
          />
        </div>
      </div>

      <div className="management-overview-grid">
        {privilegeGroups.map((group) => (
          <section key={group.key} className="management-overview-card">
            <div className="management-overview-card-header">
              <strong>{catalogCopy.moduleLabels[group.key] || group.label}</strong>
              <span>{catalogCopy.privilegeCount(group.privileges.length)}</span>
            </div>

            <div className="management-pill-list">
              {group.privileges.map((privilege) => (
                <article key={privilege._id} className="management-pill-card">
                  <strong>
                    {privilege.key === "VIEW_REPORTING_ADMIN_REVIEW"
                      ? catalogCopy.specialActionLabels.adminReview
                      : catalogCopy.actionLabels[getPrivilegeAction(privilege)]
                        || catalogCopy.actionLabels.other}
                  </strong>
                  <div className="management-pill-title-row">
                    <span>{getPrivilegeDisplayName(privilege)}</span>
                    {getPrivilegeDisplayDescription(privilege) ? (
                      <span className="management-info-wrap">
                        <button
                          type="button"
                          className="management-info-button"
                          aria-label={catalogCopy.moreInfoAria(getPrivilegeDisplayName(privilege))}
                        >
                          <HiInformationCircle className="management-info-icon" aria-hidden="true" />
                        </button>
                        <span className="management-info-tooltip" role="tooltip">
                          {getPrivilegeDisplayDescription(privilege)}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <code>{privilege.key}</code>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {!privilegeGroups.length ? <p className="management-empty">{copy.empty}</p> : null}
    </section>
  );
}
