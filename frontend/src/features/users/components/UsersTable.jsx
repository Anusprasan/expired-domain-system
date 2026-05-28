import React, { useMemo, useState } from "react";

export default function UsersTable({
  users,
  currentUserId,
  canEditUsers,
  canDeleteUsers,
  copy,
  onEdit,
  onChangeGroup,
  onRequestStatusChange,
  onRequestDelete,
  busyUserId,
}) {
  const [query, setQuery] = useState("");

  const activeAdminCount = useMemo(
    () =>
      users.filter((user) => {
        const groupName = user.groupId?.name?.toLowerCase();
        const privilegeKeys = user.groupId?.privilegeIds?.map((privilege) => privilege.key) || [];

        return user.status === "active" && (groupName === "admin" || privilegeKeys.includes("ADMIN_ACCESS"));
      }).length,
    [users]
  );

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) =>
      [
        user.fullName,
        user.email,
        user.groupId?.name,
        user.groupId?.isProtected ? copy.badges.protectedGroup : copy.badges.standardGroup,
        user.status,
        copy.statusLabels[user.status] || user.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [copy, query, users]);

  return (
    <section className="app-panel management-table">
      <div className="management-section-header">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <div className="management-search">
          <label htmlFor="user-search">{copy.search}</label>
          <input
            id="user-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
          />
        </div>
      </div>

      <div className="management-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{copy.headers.user}</th>
              <th>{copy.headers.group}</th>
              <th>{copy.headers.status}</th>
              <th>{copy.headers.actions}</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const isBusy = busyUserId === user._id;
              const isSelf = currentUserId === user._id;
              const groupName = user.groupId?.name?.toLowerCase();
              const privilegeKeys = user.groupId?.privilegeIds?.map((privilege) => privilege.key) || [];
              const isAdmin = groupName === "admin" || privilegeKeys.includes("ADMIN_ACCESS");
              const isOnlyActiveAdmin = isAdmin && user.status === "active" && activeAdminCount <= 1;
              const isProtectedGroupUser = Boolean(user.groupId?.isProtected);
              const disableEdit = isBusy || !canEditUsers || isProtectedGroupUser;
              const disableChangeGroup = isBusy || !canEditUsers || isSelf || isOnlyActiveAdmin || isProtectedGroupUser;
              const disableDeactivate =
                isBusy || !canEditUsers || isProtectedGroupUser || (user.status === "active" && (isSelf || isOnlyActiveAdmin));
              const disableDelete = isBusy || !canDeleteUsers || isSelf || isOnlyActiveAdmin || isProtectedGroupUser;

              return (
                <tr key={user._id}>
                  <td>
                    <div className="management-stack">
                      <strong>{user.fullName}</strong>
                      <span>{user.email}</span>
                    </div>
                  </td>
                  <td>
                    <div className="management-stack">
                      <span className="management-badge">{user.groupId?.name || copy.badges.noGroup}</span>
                      {user.groupId?.isProtected ? (
                        <span className="management-badge">{copy.badges.protectedGroup}</span>
                      ) : (
                        <span className="management-badge">{copy.badges.standardGroup}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`management-badge ${
                        user.status === "active" ? "is-active" : "is-inactive"
                      }`}
                    >
                      {copy.statusLabels[user.status] || user.status}
                    </span>
                  </td>
                  <td>
                    <div className="management-inline-actions">
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() => onEdit(user)}
                        disabled={disableEdit}
                      >
                        {copy.actions.edit}
                      </button>
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() => onChangeGroup(user)}
                        disabled={disableChangeGroup}
                      >
                        {copy.actions.changeGroup}
                      </button>
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() =>
                          onRequestStatusChange(
                            user,
                            user.status === "active" ? "inactive" : "active"
                          )
                        }
                        disabled={disableDeactivate}
                      >
                        {user.status === "active" ? copy.actions.deactivate : copy.actions.activate}
                      </button>
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() => onRequestDelete(user)}
                        disabled={disableDelete}
                      >
                        {copy.actions.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!users.length ? <p className="management-empty">{copy.empty}</p> : null}
      {users.length && !filteredUsers.length ? <p className="management-empty">{copy.noMatches}</p> : null}
    </section>
  );
}
