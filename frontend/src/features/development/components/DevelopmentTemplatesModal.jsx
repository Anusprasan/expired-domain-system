import React, { useMemo, useState } from "react";
import { FaEye } from "react-icons/fa";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

export default function DevelopmentTemplatesModal({
  templates,
  canAddTemplates,
  busy,
  onSubmit,
  onDelete,
  onClose,
}) {
  const { copy, locale } = useDevelopmentUiCopy();
  const [form, setForm] = useState({
    name: "",
    notes: "",
  });
  const [localError, setLocalError] = useState("");
  const [activeInfo, setActiveInfo] = useState(null);

  const sortedTemplates = useMemo(
    () => [...templates].sort((left, right) => left.name.localeCompare(right.name)),
    [templates]
  );

  const handleChange = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLocalError("");
      await onSubmit({
        name: form.name,
        notes: form.notes,
      });
      setForm({
        name: "",
        notes: "",
      });
    } catch (error) {
      setLocalError(error.response?.data?.message || copy.templatesModal.saveError);
    }
  };

  return (
    <section className="app-panel management-form">
      <div className="management-section-header">
        <div>
          <h2>{copy.templatesModal.title}</h2>
          <p>{copy.templatesModal.description}</p>
        </div>
        <button type="button" className="management-button-secondary" onClick={onClose}>
          {copy.templatesModal.close}
        </button>
      </div>

      <ToastNotice message={localError} onClose={() => setLocalError("")} />

      {canAddTemplates ? (
        <form className="management-fields" onSubmit={handleSubmit}>
          <div className="management-field">
            <label htmlFor="development-template-name">{copy.templatesModal.name}</label>
            <input
              id="development-template-name"
              value={form.name}
              onChange={(event) => handleChange("name", event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="management-field">
            <label htmlFor="development-template-notes">{copy.templatesModal.notes}</label>
            <textarea
              id="development-template-notes"
              value={form.notes}
              onChange={(event) => handleChange("notes", event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="management-actions">
            <button type="submit" className="management-button" disabled={busy}>
              {busy ? copy.common.saving : copy.templatesModal.addInfo}
            </button>
          </div>
        </form>
      ) : null}

      <div className="management-fields">
        <div className="management-field">
          <label>{copy.templatesModal.infoRegistry}</label>
          {sortedTemplates.length ? (
            <div className="management-table-wrap">
              <table className="development-info-table">
                <colgroup>
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>{copy.templatesModal.headers.name}</th>
                    <th>{copy.templatesModal.headers.addedBy}</th>
                    <th>{copy.templatesModal.headers.created}</th>
                    <th className="development-content-column">{copy.templatesModal.headers.note}</th>
                    <th className="development-content-column">{copy.templatesModal.headers.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTemplates.map((template) => (
                    <tr key={template._id}>
                      <td className="development-info-name-cell" title={template.name}>
                        {template.name}
                      </td>
                      <td>{template.createdBy?.fullName || template.createdBy?.email || "-"}</td>
                      <td>{template.createdAt ? new Date(template.createdAt).toLocaleString(locale) : "-"}</td>
                      <td className="development-content-column">
                        <button
                          type="button"
                          className="development-icon-button"
                          onClick={() => setActiveInfo(template)}
                          title={template.notes?.trim() ? copy.templatesModal.viewNote : copy.templatesModal.noNoteAdded}
                        >
                          <FaEye />
                        </button>
                      </td>
                      <td className="development-content-column">
                        <button
                          type="button"
                          className="management-button-secondary"
                          onClick={() => onDelete(template._id)}
                          disabled={busy}
                        >
                          {copy.templatesModal.delete}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="management-empty">{copy.templatesModal.empty}</p>
          )}
        </div>
      </div>

      {activeInfo ? (
        <div className="management-modal-backdrop is-centered">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <section className="app-panel management-form">
              <div className="management-section-header">
                <div>
                  <h2>{activeInfo.name}</h2>
                  <p>
                    {activeInfo.createdBy?.fullName || activeInfo.createdBy?.email || "-"} |{" "}
                    {activeInfo.createdAt ? new Date(activeInfo.createdAt).toLocaleString(locale) : "-"}
                  </p>
                </div>
                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => setActiveInfo(null)}
                >
                  {copy.templatesModal.close}
                </button>
              </div>

              <div className="management-field">
                <label>{copy.templatesModal.headers.note}</label>
                <div className="development-preview-text development-preview-text-block">
                  {activeInfo.notes?.trim() || copy.templatesModal.noNoteAdded}
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </section>
  );
}
