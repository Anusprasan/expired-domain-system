import React, { useMemo, useState } from "react";

export default function GroupsTable({
  groups,
  onEdit,
  onDelete,
  onViewPrivileges,
  busyGroupId,
  canEditGroups,
  canDeleteGroups,
  copy,
}) {
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return groups;
    }

    return groups.filter((group) =>
      [
        group.name,
        group.description,
        group.isProtected ? copy.badges.protected : copy.badges.standard,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [copy, groups, query]);

  return (
    <section className="app-panel management-table">
      <div className="management-section-header">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <div className="management-search">
          <label htmlFor="group-search">{copy.search}</label>
          <input
            id="group-search"
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
              <th>{copy.headers.group}</th>
              <th>{copy.headers.protection}</th>
              <th>{copy.headers.actions}</th>
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map((group) => {
              const isBusy = busyGroupId === group._id;
              const disableEdit = group.isProtected || !canEditGroups;

              return (
                <tr key={group._id}>
                  <td>
                    <div className="management-stack">
                      <button
                        type="button"
                        className="management-link-button"
                        onClick={() => onViewPrivileges(group)}
                      >
                        {group.name}
                      </button>
                      <span>{group.description || copy.noDescription}</span>
                    </div>
                  </td>
                  <td>
                    <span className="management-badge">
                      {group.isProtected ? copy.badges.protected : copy.badges.standard}
                    </span>
                  </td>
                  <td>
                    <div className="management-inline-actions">
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() => onViewPrivileges(group)}
                      >
                        {copy.actions.privileges}
                      </button>
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() => onEdit(group)}
                        disabled={disableEdit}
                      >
                        {copy.actions.edit}
                      </button>
                      <button
                        type="button"
                        className="management-button-secondary"
                        onClick={() => onDelete(group)}
                        disabled={isBusy || group.isProtected || !canDeleteGroups}
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

      {!groups.length ? <p className="management-empty">{copy.empty}</p> : null}
      {groups.length && !filteredGroups.length ? <p className="management-empty">{copy.noMatches}</p> : null}
    </section>
  );
}
