import React, { useMemo, useState } from "react";
import ToastNotice from "../../../shared/components/ToastNotice";
import {
  getDevelopmentStatusLabel,
  getGscStatusLabel,
  getHostingStatusLabel,
} from "../constants/developmentLanguage";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

export default function DevelopmentProgressForm({ item, templates, busy, onSubmit, onCancel }) {
  const { copy, language } = useDevelopmentUiCopy();
  const [form, setForm] = useState({
    templateId: item?.templateId?._id || "",
    progressPercent: item?.progressPercent ?? 0,
    developmentStatus: item?.developmentStatus || "new",
    hostingStatus: item?.hostingStatus || "not-hosted",
    gscStatus: item?.gscStatus || "not-done",
  });
  const [localError, setLocalError] = useState("");

  const templateOptions = useMemo(
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
        templateId: form.templateId || null,
        progressPercent: Number(form.progressPercent),
        developmentStatus: form.developmentStatus,
        hostingStatus: form.hostingStatus,
        gscStatus: form.gscStatus,
      });
    } catch (error) {
      setLocalError(error.response?.data?.message || copy.progressForm.updateError);
    }
  };

  return (
    <form className="app-panel management-form" onSubmit={handleSubmit}>
      <div className="management-section-header">
        <div>
          <h2>{copy.progressForm.title}</h2>
          <p>{item?.brandName} | {item?.domain}</p>
        </div>
      </div>

      <ToastNotice message={localError} onClose={() => setLocalError("")} />

      <div className="management-fields">
        <div className="management-field">
          <label htmlFor="development-templateId">{copy.progressForm.template}</label>
          <select
            id="development-templateId"
            value={form.templateId}
            onChange={(event) => handleChange("templateId", event.target.value)}
            disabled={busy}
          >
            <option value="">{copy.progressForm.noInfoSelected}</option>
            {templateOptions.map((template) => (
              <option key={template._id} value={template._id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        <div className="management-field">
          <label htmlFor="development-progressPercent">{copy.progressForm.progress}</label>
          <input
            id="development-progressPercent"
            type="range"
            min="0"
            max="100"
            step="5"
            value={form.progressPercent}
            onChange={(event) => handleChange("progressPercent", event.target.value)}
            disabled={busy}
          />
          <span className="development-range-value">{form.progressPercent}%</span>
        </div>

        <div className="management-field-grid">
          <div className="management-field">
            <label htmlFor="development-status">{copy.progressForm.development}</label>
            <select
              id="development-status"
              value={form.developmentStatus}
              onChange={(event) => handleChange("developmentStatus", event.target.value)}
              disabled={busy}
            >
              <option value="new">{getDevelopmentStatusLabel("new", language)}</option>
              <option value="in-progress">{getDevelopmentStatusLabel("in-progress", language)}</option>
              <option value="completed">{getDevelopmentStatusLabel("completed", language)}</option>
            </select>
          </div>
          <div className="management-field">
            <label htmlFor="development-hosting">{copy.progressForm.hosting}</label>
            <select
              id="development-hosting"
              value={form.hostingStatus}
              onChange={(event) => handleChange("hostingStatus", event.target.value)}
              disabled={busy}
            >
              <option value="not-hosted">{getHostingStatusLabel("not-hosted", language)}</option>
              <option value="hosted">{getHostingStatusLabel("hosted", language)}</option>
            </select>
          </div>
          <div className="management-field">
            <label htmlFor="development-gsc">{copy.progressForm.gsc}</label>
            <select
              id="development-gsc"
              value={form.gscStatus}
              onChange={(event) => handleChange("gscStatus", event.target.value)}
              disabled={busy}
            >
              <option value="not-done">{getGscStatusLabel("not-done", language)}</option>
              <option value="done">{getGscStatusLabel("done", language)}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="management-actions">
        <button type="submit" className="management-button" disabled={busy}>
          {busy ? copy.common.saving : copy.progressForm.saveProgress}
        </button>
        <button type="button" className="management-button-secondary" onClick={onCancel} disabled={busy}>
          {copy.progressForm.cancel}
        </button>
      </div>
    </form>
  );
}
