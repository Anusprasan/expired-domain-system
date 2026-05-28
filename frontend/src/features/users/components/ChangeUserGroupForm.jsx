import React, { useEffect, useState } from "react";

export default function ChangeUserGroupForm({ user, groups, onSubmit, onCancel, busy, copy }) {
  const [groupId, setGroupId] = useState("");
  const selectableGroups = groups.filter((group) => !group.isProtected);

  useEffect(() => {
    setGroupId(user?.groupId?._id || "");
  }, [user]);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(groupId);
  };

  return (
    <section className="app-panel management-form">
      <h2>{copy.title}</h2>
      <p>{copy.description(user?.fullName)}</p>

      <form onSubmit={handleSubmit} className="management-fields">
        <div className="management-field">
          <label htmlFor="change-user-groupId">{copy.group}</label>
          <select
            id="change-user-groupId"
            name="groupId"
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            required
          >
            <option value="">{copy.selectGroup}</option>
            {selectableGroups.map((group) => (
              <option key={group._id} value={group._id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        <div className="management-actions">
          <button type="submit" className="management-button" disabled={busy}>
            {busy ? copy.saving : copy.submit}
          </button>
          <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
            {copy.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
