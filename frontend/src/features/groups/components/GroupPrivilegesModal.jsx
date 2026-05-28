import React from "react";
import {
  buildPrivilegeMatrix,
  getPrivilegeAction,
  getPrivilegeDisplayName,
} from "../../privileges/utils/privilegeMatrix";

export default function GroupPrivilegesModal({ group, onClose, copy, catalogCopy }) {
  const privilegeGroups = buildPrivilegeMatrix(group?.privilegeIds || []);

  return (
    <section className="app-panel management-form">
      <div className="management-detail-header">
        <div>
          <h2>{group?.name || copy.titleFallback}</h2>
          <p>{group?.description || copy.descriptionFallback}</p>
        </div>
        <span className="management-badge">{group?.isProtected ? copy.protected : copy.standard}</span>
      </div>

      <div className="management-fields">
        {privilegeGroups.length ? (
          <div className="management-overview-grid">
            {privilegeGroups.map((moduleGroup) => (
              <section key={moduleGroup.key} className="management-overview-card">
                <div className="management-overview-card-header">
                  <strong>{catalogCopy.moduleLabels[moduleGroup.key] || moduleGroup.label}</strong>
                  <span>{catalogCopy.privilegeCount(moduleGroup.privileges.length)}</span>
                </div>

                <div className="management-pill-list">
                  {moduleGroup.privileges.map((privilege) => (
                    <div key={privilege._id} className="management-pill-card">
                      <strong>
                        {privilege.key === "VIEW_REPORTING_ADMIN_REVIEW"
                          ? catalogCopy.specialActionLabels.adminReview
                          : catalogCopy.actionLabels[getPrivilegeAction(privilege)]
                            || catalogCopy.actionLabels.other}
                      </strong>
                      <span>{getPrivilegeDisplayName(privilege)}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="management-empty">{copy.empty}</p>
        )}
      </div>

      <div className="management-actions">
        <button type="button" className="management-button-secondary" onClick={onClose}>
          {copy.close}
        </button>
      </div>
    </section>
  );
}
