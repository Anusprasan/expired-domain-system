import React, { useMemo, useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

export default function AssignDeveloperForm({ item, developers, busy, onSubmit, onCancel }) {
  const { copy } = useDevelopmentUiCopy();
  const [developerId, setDeveloperId] = useState(item?.assignedDeveloperId?._id || "");
  const [localError, setLocalError] = useState("");

  const sortedDevelopers = useMemo(
    () => [...developers].sort((left, right) => left.fullName.localeCompare(right.fullName)),
    [developers]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!developerId) {
      setLocalError(copy.assignForm.selectDeveloperError);
      return;
    }

    try {
      setLocalError("");
      await onSubmit(developerId);
    } catch (error) {
      setLocalError(error.response?.data?.message || copy.assignForm.saveError);
    }
  };

  return (
    <form className="app-panel management-form" onSubmit={handleSubmit}>
      <div className="management-section-header">
        <div>
          <h2>{copy.assignForm.title}</h2>
          <p>{item?.brandName} | {item?.domain}</p>
        </div>
      </div>

      <ToastNotice message={localError} onClose={() => setLocalError("")} />

      <div className="management-fields">
        <div className="management-field">
          <label htmlFor="assign-development-developer">{copy.assignForm.developer}</label>
          <select
            id="assign-development-developer"
            value={developerId}
            onChange={(event) => setDeveloperId(event.target.value)}
            disabled={busy}
          >
            <option value="">{copy.assignForm.selectDeveloper}</option>
            {sortedDevelopers.map((developer) => (
              <option key={developer._id} value={developer._id}>
                {developer.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="management-actions">
        <button type="submit" className="management-button" disabled={busy}>
          {busy ? copy.assignForm.assigning : copy.assignForm.assign}
        </button>
        <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
          {copy.assignForm.cancel}
        </button>
      </div>
    </form>
  );
}
