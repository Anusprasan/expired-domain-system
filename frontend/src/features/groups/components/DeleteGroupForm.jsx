import React, { useEffect, useMemo, useState } from "react";

export default function DeleteGroupForm({ group, groups, busy, onSubmit, onCancel, copy }) {
  const availableGroups = useMemo(
    () => groups.filter((item) => item._id !== group?._id && !item.isProtected),
    [group, groups]
  );
  const [targetGroupId, setTargetGroupId] = useState(availableGroups[0]?._id || "");

  useEffect(() => {
    setTargetGroupId(availableGroups[0]?._id || "");
  }, [availableGroups]);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(targetGroupId);
  };

  return (
    <section className="app-panel management-form">
      <h2>{copy.title}</h2>
      <p>{copy.description(group?.name)}</p>

      {availableGroups.length ? (
        <form onSubmit={handleSubmit} className="management-fields">
          <div className="management-field">
            <label htmlFor="delete-group-transfer">{copy.transferTo}</label>
            <select
              id="delete-group-transfer"
              value={targetGroupId}
              onChange={(event) => setTargetGroupId(event.target.value)}
              required
            >
              <option value="">{copy.selectGroup}</option>
              {availableGroups.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="management-actions">
            <button type="submit" className="management-button" disabled={busy || !targetGroupId}>
              {busy ? copy.deleting : copy.submit}
            </button>
            <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
              {copy.cancel}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="management-error">{copy.noAvailableGroups}</p>
          <div className="management-actions">
            <button type="button" className="management-button-secondary" onClick={onCancel}>
              {copy.close}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
