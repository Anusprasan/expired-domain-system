import React, { useMemo, useState } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import DeleteGroupForm from "../components/DeleteGroupForm";
import GroupForm from "../components/GroupForm";
import GroupPrivilegesModal from "../components/GroupPrivilegesModal";
import GroupsTable from "../components/GroupsTable";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import { useGroups } from "../hooks/useGroups";
import { usePrivileges } from "../../privileges/hooks/usePrivileges";
import { hasPrivilege } from "../../../shared/utils/permissions";
import "../../../shared/styles/management.css";

export default function GroupsPage() {
  const { user } = useAuth();
  const { copy } = useUiLanguage();
  const commonCopy = copy.common;
  const groupsCopy = copy.groups;
  const catalogCopy = copy.privilegeCatalog;
  const { groups, loading, error, createGroup, updateGroup, deleteGroup } = useGroups();
  const { privileges, loading: privilegesLoading, error: privilegesError } = usePrivileges();
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);
  const [showPrivilegesModal, setShowPrivilegesModal] = useState(false);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyGroupId, setBusyGroupId] = useState("");

  const sortedPrivileges = useMemo(
    () => [...privileges].sort((left, right) => left.name.localeCompare(right.name)),
    [privileges]
  );
  const canCreateGroups = hasPrivilege(user, "CREATE_GROUPS");
  const canEditGroups = hasPrivilege(user, "EDIT_GROUPS");
  const canDeleteGroups = hasPrivilege(user, "DELETE_GROUPS");
  const groupsLoadError = error === "Failed to load groups" ? groupsCopy.page.loadErrorFallback : error;
  const privilegesLoadError =
    privilegesError === "Failed to load privileges"
      ? groupsCopy.page.loadPrivilegesErrorFallback
      : privilegesError;

  useEscapeKey(showGroupModal, () => {
    setShowGroupModal(false);
    setSelectedGroup(null);
  });

  useEscapeKey(Boolean(pendingDeleteGroup), () => setPendingDeleteGroup(null));

  useEscapeKey(showPrivilegesModal, () => {
    setShowPrivilegesModal(false);
    setActiveGroup(null);
  });

  const handleSubmit = async (form) => {
    try {
      setFormError("");
      setBusy(true);

      if (selectedGroup) {
        await updateGroup(selectedGroup._id, form);
      } else {
        await createGroup(form);
      }

      setShowGroupModal(false);
      setSelectedGroup(null);
    } catch (err) {
      setFormError(err.response?.data?.message || groupsCopy.page.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (group, targetGroupId) => {
    try {
      setFormError("");
      setBusyGroupId(group._id);
      await deleteGroup(group._id, targetGroupId);
      if (selectedGroup?._id === group._id) {
        setSelectedGroup(null);
      }
      setPendingDeleteGroup(null);
    } catch (err) {
      setFormError(err.response?.data?.message || groupsCopy.page.deleteError);
    } finally {
      setBusyGroupId("");
    }
  };

  return (
    <div className="management-page">
      <section className="app-panel management-header">
        <div>
          <h1>{groupsCopy.page.title}</h1>
          <p>{groupsCopy.page.description}</p>
        </div>
        <div className="management-header-actions">
          {canCreateGroups ? (
            <button
              type="button"
              className="management-button management-button-with-icon"
              onClick={() => {
                setFormError("");
                setSelectedGroup(null);
                setShowGroupModal(true);
              }}
            >
              <span className="management-button-icon" aria-hidden="true">+</span>
              <span>{groupsCopy.page.createGroup}</span>
            </button>
          ) : null}
          <div className="management-summary">
            <strong>{groups.length}</strong>
            <span>{groupsCopy.page.totalGroups}</span>
          </div>
        </div>
      </section>

      <ToastNotice message={formError} onClose={() => setFormError("")} />

      {groupsLoadError ? <p className="management-error">{groupsLoadError}</p> : null}
      {privilegesLoadError ? <p className="management-error">{privilegesLoadError}</p> : null}

      {showGroupModal ? (
        <div className="management-modal-backdrop">
          <div className="management-modal management-modal-wide" onClick={(event) => event.stopPropagation()}>
            <GroupForm
              copy={groupsCopy.form}
              catalogCopy={catalogCopy}
              groups={groups}
              privileges={sortedPrivileges}
              selectedGroup={selectedGroup}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowGroupModal(false);
                setSelectedGroup(null);
              }}
              busy={busy}
              privilegesDisabled={Boolean(privilegesLoadError) || privilegesLoading}
              showCancel
            />
          </div>
        </div>
      ) : null}

      {pendingDeleteGroup ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <DeleteGroupForm
              copy={groupsCopy.deleteForm}
              group={pendingDeleteGroup}
              groups={groups}
              busy={busyGroupId === pendingDeleteGroup._id}
              onSubmit={(targetGroupId) => handleDelete(pendingDeleteGroup, targetGroupId)}
              onCancel={() => setPendingDeleteGroup(null)}
            />
          </div>
        </div>
      ) : null}

      <div className="management-grid is-single-column">
        {loading ? (
          <section className="app-panel management-state">
            <h2>{commonCopy.loading}</h2>
            <p>{groupsCopy.page.loadingDescription}</p>
          </section>
        ) : (
          <GroupsTable
            copy={groupsCopy.table}
            groups={groups}
            canEditGroups={canEditGroups}
            canDeleteGroups={canDeleteGroups}
            onEdit={(group) => {
              if (!canEditGroups) {
                setFormError(groupsCopy.errors.editPermission);
                return;
              }

              if (group.isProtected) {
                setFormError(groupsCopy.errors.protectedEdit);
                return;
              }

              setFormError("");
              setSelectedGroup(group);
              setShowGroupModal(true);
            }}
            onViewPrivileges={(group) => {
              setActiveGroup(group);
              setShowPrivilegesModal(true);
            }}
            onDelete={(group) => {
              if (!canDeleteGroups) {
                setFormError(groupsCopy.errors.deletePermission);
                return;
              }

              setPendingDeleteGroup(group);
            }}
            busyGroupId={busyGroupId}
          />
        )}
      </div>

      {showPrivilegesModal && activeGroup ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <GroupPrivilegesModal
              copy={groupsCopy.privilegesModal}
              catalogCopy={catalogCopy}
              group={activeGroup}
              onClose={() => {
                setShowPrivilegesModal(false);
                setActiveGroup(null);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
