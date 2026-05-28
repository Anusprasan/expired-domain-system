import React, { useMemo, useState } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import ChangeUserGroupForm from "../components/ChangeUserGroupForm";
import UserForm from "../components/UserForm";
import UsersTable from "../components/UsersTable";
import { useUsers } from "../hooks/useUsers";
import { useGroups } from "../../groups/hooks/useGroups";
import ConfirmActionModal from "../../../shared/components/ConfirmActionModal";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import { hasPrivilege } from "../../../shared/utils/permissions";
import "../../../shared/styles/management.css";

function isAdminUser(user) {
  const groupName = user?.groupId?.name?.toLowerCase();
  const privilegeKeys = user?.groupId?.privilegeIds?.map((privilege) => privilege.key) || [];

  return groupName === "admin" || privilegeKeys.includes("ADMIN_ACCESS");
}

function isProtectedGroupUser(user) {
  return Boolean(user?.groupId?.isProtected);
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { copy } = useUiLanguage();
  const commonCopy = copy.common;
  const usersCopy = copy.users;
  const canCreateUsers = hasPrivilege(currentUser, "CREATE_USERS");
  const canEditUsers = hasPrivilege(currentUser, "EDIT_USERS");
  const canDeleteUsers = hasPrivilege(currentUser, "DELETE_USERS");
  const shouldLoadGroups = canCreateUsers || canEditUsers;
  const { users, loading, error, createUser, updateUser, changeUserGroup, changeUserStatus, deleteUser } = useUsers();
  const { groups, loading: groupsLoading, error: groupsError } = useGroups(shouldLoadGroups);
  const [selectedUser, setSelectedUser] = useState(null);
  const [groupChangeUser, setGroupChangeUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyUserId, setBusyUserId] = useState("");

  const sortedGroups = useMemo(
    () => [...groups].sort((left, right) => left.name.localeCompare(right.name)),
    [groups]
  );
  const activeAdminCount = useMemo(
    () => users.filter((user) => user.status === "active" && isAdminUser(user)).length,
    [users]
  );
  const usersLoadError = error === "Failed to load users" ? usersCopy.page.loadErrorFallback : error;
  const groupsLoadError =
    groupsError === "Failed to load groups" ? usersCopy.page.loadGroupsErrorFallback : groupsError;

  useEscapeKey(showUserModal, () => {
    setShowUserModal(false);
    setSelectedUser(null);
  });

  useEscapeKey(showGroupModal, () => {
    setShowGroupModal(false);
    setGroupChangeUser(null);
  });

  useEscapeKey(Boolean(pendingAction), () => setPendingAction(null));

  const handleSubmit = async (form) => {
    try {
      setFormError("");
      setBusy(true);

      if (selectedUser) {
        await updateUser(selectedUser._id, {
          fullName: form.fullName,
          email: form.email,
        });

        if (form.groupId !== selectedUser.groupId?._id) {
          await changeUserGroup(selectedUser._id, form.groupId);
        }
      } else {
        await createUser(form);
      }

      setShowUserModal(false);
      setSelectedUser(null);
    } catch (err) {
      setFormError(err.response?.data?.message || usersCopy.page.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleGroupChange = async (user, groupId) => {
    try {
      setFormError("");
      setBusyUserId(user._id);
      await changeUserGroup(user._id, groupId);
      setShowGroupModal(false);
      setGroupChangeUser(null);
    } catch (err) {
      setFormError(err.response?.data?.message || usersCopy.page.changeGroupError);
    } finally {
      setBusyUserId("");
    }
  };

  const handleStatusChange = async (user, status) => {
    if (status === "inactive" && user._id === currentUser?._id) {
      setFormError(usersCopy.errors.selfDeactivate);
      return;
    }

    try {
      setFormError("");
      setBusyUserId(user._id);
      await changeUserStatus(user._id, status);
      setPendingAction(null);
    } catch (err) {
      setFormError(err.response?.data?.message || usersCopy.page.statusError);
    } finally {
      setBusyUserId("");
    }
  };

  const handleDelete = async (user) => {
    try {
      setFormError("");
      setBusyUserId(user._id);
      await deleteUser(user._id);
      if (selectedUser?._id === user._id) {
        setSelectedUser(null);
      }
      setPendingAction(null);
    } catch (err) {
      setFormError(err.response?.data?.message || usersCopy.page.deleteError);
    } finally {
      setBusyUserId("");
    }
  };

  return (
    <div className="management-page">
      <section className="app-panel management-header">
        <div>
          <h1>{usersCopy.page.title}</h1>
          <p>{usersCopy.page.description}</p>
        </div>
        <div className="management-header-actions">
          {canCreateUsers ? (
            <button
              type="button"
              className="management-button management-button-with-icon"
              onClick={() => {
                setFormError("");
                setSelectedUser(null);
                setShowUserModal(true);
              }}
            >
              <span className="management-button-icon" aria-hidden="true">+</span>
              <span>{usersCopy.page.createUser}</span>
            </button>
          ) : null}
          <div className="management-summary">
            <strong>{users.length}</strong>
            <span>{usersCopy.page.totalUsers}</span>
          </div>
        </div>
      </section>

      <ToastNotice message={formError} onClose={() => setFormError("")} />

      {usersLoadError || (shouldLoadGroups ? groupsLoadError : "") ? (
        <p className="management-error">{usersLoadError || groupsLoadError}</p>
      ) : null}

      {showUserModal ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <UserForm
              copy={usersCopy.form}
              groups={sortedGroups}
              selectedUser={selectedUser}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowUserModal(false);
                setSelectedUser(null);
              }}
              busy={busy}
              showCancel
              allowGroupEdit={!selectedUser}
            />
          </div>
        </div>
      ) : null}

      {showGroupModal && groupChangeUser ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <ChangeUserGroupForm
              copy={usersCopy.changeGroupForm}
              user={groupChangeUser}
              groups={sortedGroups}
              busy={busyUserId === groupChangeUser._id}
              onSubmit={(groupId) => handleGroupChange(groupChangeUser, groupId)}
              onCancel={() => {
                setShowGroupModal(false);
                setGroupChangeUser(null);
              }}
            />
          </div>
        </div>
      ) : null}

      {pendingAction ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <ConfirmActionModal
              title={pendingAction.title}
              message={pendingAction.message}
              confirmLabel={pendingAction.confirmLabel}
              cancelLabel={commonCopy.cancel}
              busyLabel={commonCopy.working}
              busy={busyUserId === pendingAction.user._id}
              onConfirm={() => pendingAction.onConfirm(pendingAction.user)}
              onCancel={() => setPendingAction(null)}
            />
          </div>
        </div>
      ) : null}

      <div className="management-grid is-single-column">
        {loading || (shouldLoadGroups && groupsLoading) ? (
          <section className="app-panel management-state">
            <h2>{commonCopy.loading}</h2>
            <p>{usersCopy.page.loadingDescription}</p>
          </section>
        ) : (
          <UsersTable
            copy={usersCopy.table}
            users={users}
            currentUserId={currentUser?._id}
            canEditUsers={canEditUsers}
            canDeleteUsers={canDeleteUsers}
            onEdit={(user) => {
              if (!canEditUsers) {
                setFormError(usersCopy.errors.editPermission);
                return;
              }

              if (isProtectedGroupUser(user)) {
                setFormError(usersCopy.errors.protectedEdit);
                return;
              }

              setFormError("");
              setSelectedUser(user);
              setShowUserModal(true);
            }}
            onChangeGroup={(user) => {
              if (!canEditUsers) {
                setFormError(usersCopy.errors.editPermission);
                return;
              }

              if (isProtectedGroupUser(user)) {
                setFormError(usersCopy.errors.protectedMove);
                return;
              }

              if (user.status === "active" && isAdminUser(user) && activeAdminCount <= 1) {
                return;
              }

              setFormError("");
              setGroupChangeUser(user);
              setShowGroupModal(true);
            }}
            onRequestStatusChange={(targetUser, status) =>
              canEditUsers
                ? isProtectedGroupUser(targetUser)
                  ? setFormError(usersCopy.errors.protectedStatus)
                  : setPendingAction({
                    user: targetUser,
                    title:
                      status === "inactive"
                        ? usersCopy.dialogs.deactivateTitle
                        : usersCopy.dialogs.activateTitle,
                    message:
                      status === "inactive"
                        ? usersCopy.dialogs.deactivateMessage(targetUser.fullName)
                        : usersCopy.dialogs.activateMessage(targetUser.fullName),
                    confirmLabel:
                      status === "inactive"
                        ? usersCopy.dialogs.deactivateConfirm
                        : usersCopy.dialogs.activateConfirm,
                    onConfirm: (userToUpdate) => handleStatusChange(userToUpdate, status),
                  })
                : setFormError(usersCopy.errors.editPermission)
            }
            onRequestDelete={(targetUser) =>
              canDeleteUsers
                ? isProtectedGroupUser(targetUser)
                  ? setFormError(usersCopy.errors.protectedDelete)
                  : setPendingAction({
                    user: targetUser,
                    title: usersCopy.dialogs.deleteTitle,
                    message: usersCopy.dialogs.deleteMessage(targetUser.fullName),
                    confirmLabel: usersCopy.dialogs.deleteConfirm,
                    onConfirm: handleDelete,
                  })
                : setFormError(usersCopy.errors.deletePermission)
            }
            busyUserId={busyUserId}
          />
        )}
      </div>
    </div>
  );
}
