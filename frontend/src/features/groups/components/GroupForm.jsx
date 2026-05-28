import React, { useEffect, useMemo, useState } from "react";
import { HiInformationCircle } from "react-icons/hi";
import {
  buildPrivilegeMatrix,
  getPrivilegeAction,
  getPrivilegeDisplayDescription,
  getPrivilegeDisplayName,
} from "../../privileges/utils/privilegeMatrix";
import ToastNotice from "../../../shared/components/ToastNotice";

const EMPTY_FORM = {
  name: "",
  description: "",
  privilegeIds: [],
};
const RANK_CHECKER_SHOW_KEY = "SHOW_RANK_CHECKER";
const RANK_CHECKER_ADMIN_KEY = "RANK_CHECKER_ADMIN_PRIVS";
const RANK_CHECKER_DEPENDENT_KEYS = new Set([
  "RANK_CHECKER_ADD_DOMAINS",
  "RANK_CHECKER_MANUAL_CHECKER",
  "RANK_CHECKER_BULK_CHECKER",
  RANK_CHECKER_ADMIN_KEY,
  "RANK_CHECKER_LOGS",
]);
const REPORTING_VIEW_KEY = "VIEW_REPORTING_PROGRESS";
const REPORTING_DEPENDENT_KEYS = new Set([
  "EDIT_REPORTING_TASKS",
  "DELETE_REPORTING_TASKS",
  "VIEW_REPORTING_ADMIN_REVIEW",
  "EDIT_REPORTING_WORKFLOWS",
  "MANAGE_REPORTING_SMTP_PROFILES",
]);

const formatGroupName = (name) => name.trim().replace(/\s+/g, " ");
const normalizeGroupName = (name) => formatGroupName(name).toLowerCase().replace(/[^a-z0-9]/g, "");

export default function GroupForm({
  groups = [],
  privileges,
  selectedGroup,
  onSubmit,
  onCancel,
  busy,
  copy,
  catalogCopy,
  privilegesDisabled,
  showCancel = Boolean(selectedGroup),
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [localError, setLocalError] = useState("");
  const isEditing = Boolean(selectedGroup);
  const privilegeGroups = buildPrivilegeMatrix(privileges);
  const allPrivilegeIds = privileges.map((privilege) => privilege._id);
  const adminPrivilegeId =
    privileges.find((privilege) => privilege.key === "ADMIN_ACCESS")?._id || "";
  const rankCheckerShowPrivilegeId = useMemo(
    () => privileges.find((privilege) => privilege.key === RANK_CHECKER_SHOW_KEY)?._id || "",
    [privileges]
  );
  const reportingViewPrivilegeId = useMemo(
    () => privileges.find((privilege) => privilege.key === REPORTING_VIEW_KEY)?._id || "",
    [privileges]
  );
  const rankCheckerAdminPrivilegeId = useMemo(
    () => privileges.find((privilege) => privilege.key === RANK_CHECKER_ADMIN_KEY)?._id || "",
    [privileges]
  );
  const rankCheckerDependentPrivilegeIds = useMemo(
    () =>
      privileges
        .filter((privilege) => RANK_CHECKER_DEPENDENT_KEYS.has(privilege.key))
        .map((privilege) => privilege._id),
    [privileges]
  );
  const reportingDependentPrivilegeIds = useMemo(
    () =>
      privileges
        .filter((privilege) => REPORTING_DEPENDENT_KEYS.has(privilege.key))
        .map((privilege) => privilege._id),
    [privileges]
  );
  const allRankCheckerPrivilegeIds = useMemo(
    () =>
      privileges
        .filter((privilege) => privilege.module === "rank-checker")
        .map((privilege) => privilege._id),
    [privileges]
  );
  const adminSelected = Boolean(adminPrivilegeId) && form.privilegeIds.includes(adminPrivilegeId);
  const rankCheckerAdminSelected =
    Boolean(rankCheckerAdminPrivilegeId) && form.privilegeIds.includes(rankCheckerAdminPrivilegeId);
  const hasRankCheckerDependentPrivileges = rankCheckerDependentPrivilegeIds.some((id) =>
    form.privilegeIds.includes(id)
  );
  const hasReportingDependentPrivileges = reportingDependentPrivilegeIds.some((id) =>
    form.privilegeIds.includes(id)
  );

  const normalizePrivilegeIds = (privilegeIds) => {
    const uniquePrivilegeIds = [...new Set(privilegeIds)];

    if (
      rankCheckerAdminPrivilegeId &&
      uniquePrivilegeIds.includes(rankCheckerAdminPrivilegeId)
    ) {
      allRankCheckerPrivilegeIds.forEach((id) => {
        if (!uniquePrivilegeIds.includes(id)) {
          uniquePrivilegeIds.push(id);
        }
      });
    }

    if (
      rankCheckerShowPrivilegeId &&
      uniquePrivilegeIds.some((id) => rankCheckerDependentPrivilegeIds.includes(id)) &&
      !uniquePrivilegeIds.includes(rankCheckerShowPrivilegeId)
    ) {
      uniquePrivilegeIds.push(rankCheckerShowPrivilegeId);
    }

    if (
      reportingViewPrivilegeId &&
      uniquePrivilegeIds.some((id) => reportingDependentPrivilegeIds.includes(id)) &&
      !uniquePrivilegeIds.includes(reportingViewPrivilegeId)
    ) {
      uniquePrivilegeIds.push(reportingViewPrivilegeId);
    }

    return uniquePrivilegeIds;
  };

  useEffect(() => {
    if (!selectedGroup) {
      setForm(EMPTY_FORM);
      setLocalError("");
      return;
    }

    setForm({
      name: selectedGroup.name || "",
      description: selectedGroup.description || "",
      privilegeIds: normalizePrivilegeIds(
        (selectedGroup.privilegeIds || []).map((privilege) => privilege._id)
      ),
    });
    setLocalError("");
  }, [
    allRankCheckerPrivilegeIds,
    rankCheckerAdminPrivilegeId,
    rankCheckerDependentPrivilegeIds,
    rankCheckerShowPrivilegeId,
    reportingDependentPrivilegeIds,
    reportingViewPrivilegeId,
    selectedGroup,
  ]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setLocalError("");
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handlePrivilegeToggle = (privilegeId) => {
    setLocalError("");
    setForm((current) => {
      const nextPrivilegeIds = current.privilegeIds.includes(privilegeId)
        ? current.privilegeIds.filter((id) => id !== privilegeId)
        : [...current.privilegeIds, privilegeId];

      if (privilegeId === adminPrivilegeId && !current.privilegeIds.includes(privilegeId)) {
        return {
          ...current,
          privilegeIds: allPrivilegeIds,
        };
      }

      if (privilegeId === adminPrivilegeId) {
        return {
          ...current,
          privilegeIds: nextPrivilegeIds,
        };
      }

      if (nextPrivilegeIds.includes(adminPrivilegeId)) {
        return current;
      }

      return {
        ...current,
        privilegeIds: normalizePrivilegeIds(nextPrivilegeIds),
      };
    });
  };

  const handleModuleToggle = (modulePrivilegeIds) => {
    setLocalError("");
    if (adminSelected && !modulePrivilegeIds.includes(adminPrivilegeId)) {
      return;
    }

    setForm((current) => {
      const hasAllSelected = modulePrivilegeIds.every((id) => current.privilegeIds.includes(id));

      if (modulePrivilegeIds.includes(adminPrivilegeId)) {
        return {
          ...current,
          privilegeIds: hasAllSelected ? [] : allPrivilegeIds,
        };
      }

      return {
        ...current,
        privilegeIds: normalizePrivilegeIds(
          hasAllSelected
            ? current.privilegeIds.filter((id) => !modulePrivilegeIds.includes(id))
            : [...current.privilegeIds, ...modulePrivilegeIds]
        ),
      };
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const formattedName = formatGroupName(form.name);

    if (!formattedName) {
      setLocalError(copy.nameRequired);
      return;
    }

    const conflictingGroup = groups.find((group) => {
      if (selectedGroup?._id === group._id) {
        return false;
      }

      return normalizeGroupName(group.name) === normalizeGroupName(formattedName);
    });

    if (conflictingGroup) {
      setLocalError(copy.nameExists);
      return;
    }

    if (!form.privilegeIds.length) {
      setLocalError(copy.privilegeRequired);
      return;
    }

    onSubmit({
      ...form,
      name: formattedName,
      privilegeIds: normalizePrivilegeIds(form.privilegeIds),
    });
  };

  return (
    <section className="app-panel management-form">
      <ToastNotice message={localError} onClose={() => setLocalError("")} />
      <h2>{isEditing ? copy.titleEdit : copy.titleCreate}</h2>
      <p>{copy.description}</p>

      <form onSubmit={handleSubmit} className="management-fields">
        <div className="management-field">
          <label htmlFor="group-name">{copy.name}</label>
          <input id="group-name" name="name" value={form.name} onChange={handleChange} required />
        </div>

        <div className="management-field">
          <label htmlFor="group-description">{copy.descriptionLabel}</label>
          <textarea
            id="group-description"
            name="description"
            value={form.description}
            onChange={handleChange}
          />
        </div>

        <div className="management-field">
          <label>{copy.privileges}</label>
          {adminSelected ? (
            <p className="management-empty">{copy.adminHint}</p>
          ) : rankCheckerAdminSelected ? (
            <p className="management-empty">{copy.rankCheckerAdminHint}</p>
          ) : hasReportingDependentPrivileges ? (
            <p className="management-empty">{copy.reportingDependencyHint}</p>
          ) : null}
          {privilegesDisabled ? (
            <p className="management-empty">{copy.unavailablePrivileges}</p>
          ) : (
            <>
              <div className="management-permission-grid">
                {privilegeGroups.map((group) => {
                  const modulePrivilegeIds = group.privileges.map((privilege) => privilege._id);
                  const selectedCount = modulePrivilegeIds.filter((id) => form.privilegeIds.includes(id)).length;
                  const hasAllSelected = Boolean(modulePrivilegeIds.length) && selectedCount === modulePrivilegeIds.length;

                  return (
                    <section key={group.key} className="management-permission-card">
                      <label className="management-permission-header">
                        <span className="management-permission-title">
                          <input
                            type="checkbox"
                            checked={hasAllSelected}
                            disabled={adminSelected}
                            onChange={() => handleModuleToggle(modulePrivilegeIds)}
                          />
                          <strong>{catalogCopy.moduleLabels[group.key] || group.label}</strong>
                        </span>
                        <span className="management-permission-count">
                          {selectedCount}/{modulePrivilegeIds.length}
                        </span>
                      </label>

                      <div className="management-permission-list">
                        {group.privileges.map((privilege) => {
                          const privilegeName = getPrivilegeDisplayName(privilege);
                          const privilegeDescription = getPrivilegeDisplayDescription(privilege);
                          const privilegeActionLabel =
                            privilege.key === "VIEW_REPORTING_ADMIN_REVIEW"
                              ? catalogCopy.specialActionLabels.adminReview
                              : catalogCopy.actionLabels[getPrivilegeAction(privilege)]
                                || catalogCopy.actionLabels.other;
                          const showLockedByRankCheckerDependency =
                            privilege.key === RANK_CHECKER_SHOW_KEY && hasRankCheckerDependentPrivileges;
                          const showLockedByReportingDependency =
                            privilege.key === REPORTING_VIEW_KEY && hasReportingDependentPrivileges;
                          const rankCheckerChildLockedByAdmin =
                            rankCheckerAdminSelected &&
                            privilege.module === "rank-checker" &&
                            privilege.key !== RANK_CHECKER_ADMIN_KEY;
                          const isDisabled =
                            (adminSelected && privilege._id !== adminPrivilegeId) ||
                            showLockedByRankCheckerDependency ||
                            showLockedByReportingDependency ||
                            rankCheckerChildLockedByAdmin;

                          return (
                            <label
                              key={privilege._id}
                              className={`management-checkbox${showLockedByRankCheckerDependency || showLockedByReportingDependency || rankCheckerChildLockedByAdmin ? " is-disabled" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={form.privilegeIds.includes(privilege._id)}
                                disabled={isDisabled}
                                onChange={() => handlePrivilegeToggle(privilege._id)}
                              />
                              <span className="management-checkbox-copy">
                                <span className="management-pill-title-row">
                                  <strong>{privilegeActionLabel}</strong>
                                  {privilegeDescription ? (
                                    <span className="management-info-wrap">
                                      <button
                                        type="button"
                                        className="management-info-button"
                                        aria-label={catalogCopy.moreInfoAria(privilegeName)}
                                      >
                                        <HiInformationCircle className="management-info-icon" aria-hidden="true" />
                                      </button>
                                      <span className="management-info-tooltip" role="tooltip">
                                        {privilegeDescription}
                                      </span>
                                    </span>
                                  ) : null}
                                </span>
                                <span className="management-checkbox-meta">
                                  {rankCheckerChildLockedByAdmin
                                    ? copy.includedWithRankCheckerAdmin(privilegeName)
                                    : showLockedByRankCheckerDependency
                                      ? copy.rankCheckerDependency(privilegeName)
                                      : showLockedByReportingDependency
                                        ? copy.reportingDependency(privilegeName)
                                      : privilegeName}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="management-actions">
          <button type="submit" className="management-button" disabled={busy}>
            {busy ? copy.saving : isEditing ? copy.saveEdit : copy.saveCreate}
          </button>
          {showCancel ? (
            <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
              {copy.cancel}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
