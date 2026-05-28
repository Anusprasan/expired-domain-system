import React, { useEffect, useState } from "react";

const EMPTY_FORM = {
  fullName: "",
  email: "",
  password: "",
  groupId: "",
};

export default function UserForm({
  groups,
  selectedUser,
  onSubmit,
  onCancel,
  busy,
  copy,
  showCancel = Boolean(selectedUser),
  allowGroupEdit = !selectedUser,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const isEditing = Boolean(selectedUser);
  const selectableGroups = groups.filter((group) => !group.isProtected);

  useEffect(() => {
    if (!selectedUser) {
      setForm(EMPTY_FORM);
      return;
    }

    setForm({
      fullName: selectedUser.fullName || "",
      email: selectedUser.email || "",
      password: "",
      groupId: selectedUser.groupId?._id || "",
    });
  }, [selectedUser]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <section className="app-panel management-form">
      <h2>{isEditing ? copy.titleEdit : copy.titleCreate}</h2>
      <p>{copy.description}</p>

      <form onSubmit={handleSubmit} className="management-fields">
        <div className="management-field">
          <label htmlFor="user-fullName">{copy.fullName}</label>
          <input id="user-fullName" name="fullName" value={form.fullName} onChange={handleChange} required />
        </div>

        <div className="management-field">
          <label htmlFor="user-email">{copy.email}</label>
          <input id="user-email" type="email" name="email" value={form.email} onChange={handleChange} required />
        </div>

        {!isEditing ? (
          <div className="management-field">
            <label htmlFor="user-password">{copy.password}</label>
            <input
              id="user-password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>
        ) : null}

        {allowGroupEdit ? (
          <div className="management-field">
            <label htmlFor="user-groupId">{copy.group}</label>
            <select id="user-groupId" name="groupId" value={form.groupId} onChange={handleChange} required>
              <option value="">{copy.selectGroup}</option>
              {selectableGroups.map((group) => (
                <option key={group._id} value={group._id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

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
