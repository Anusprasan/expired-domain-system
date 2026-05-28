import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import { hasPrivilege } from "../../../shared/utils/permissions";
import {
  getReportingWorkflowsApi,
  updateReportingWorkflowApi,
} from "../api/reportingApi";
import { getReportingToneLabel } from "../constants/reportingLanguage";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";
import "../../../shared/styles/management.css";
import "../../../shared/styles/reporting.css";
import ReportingMailProfileManager from "../components/ReportingMailProfileManager";
import ReportingSettingsControl from "../components/ReportingSettingsControl";
import ReporterWorkspace from "../components/ReporterWorkspace";
import ReportingTaskTracker from "../components/ReportingTaskTracker";

function toStepsText(steps = []) {
  return steps.join("\n");
}

function toLinksText(links = []) {
  return links.map((link) => `${link.label} | ${link.href}`).join("\n");
}

function parseSteps(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((step) => step.trim())
    .filter(Boolean);
}

function parseLinks(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, href] = line.split("|").map((part) => part?.trim());
      return { label: label || "", href: href || "" };
    })
    .filter((link) => link.label && link.href);
}

function ReportingLinkButton({ label, href }) {
  const isPlaceholder = href === "#";

  return (
    <a
      className={`reporting-link-button${isPlaceholder ? " is-placeholder" : ""}`}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {label}
    </a>
  );
}

function ReportingSection({ section, canEdit, onEdit, copy }) {
  return (
    <>
      <section
        className={`app-panel reporting-section reporting-section-${section.tone || "blue"}`}
      >
        <div className="reporting-section-header">
          <div className="reporting-section-title-row">
            <h2>{section.title}</h2>
            {section.badge ? <span className="reporting-badge">{section.badge}</span> : null}
          </div>
          {canEdit ? (
            <button
              type="button"
              className="management-button-secondary reporting-edit-button"
              onClick={() => onEdit(section)}
            >
              {copy.page.section.editWorkflow}
            </button>
          ) : null}
        </div>

        {section.note ? <div className="reporting-note">{section.note}</div> : null}
        {section.summary ? <p className="reporting-summary">{section.summary}</p> : null}

        {section.steps?.length ? (
          <div className="reporting-steps-card">
            <span className="reporting-steps-label">
              {section.label || copy.page.section.workflowFallback}
            </span>
            <ol className="reporting-steps-list">
              {section.steps.map((step, index) => (
                <li key={`${section.issueType}-${index + 1}`}>
                  <span className="reporting-step-number">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {section.links?.length ? (
          <div className="reporting-links-grid">
            {section.links.map((link) => (
              <ReportingLinkButton key={`${section.issueType}-${link.label}`} {...link} />
            ))}
          </div>
        ) : null}
      </section>
      <section className="app-panel reporting-toolkit">
        <div className="reporting-toolkit-copy">
          <h2>{copy.page.toolkitTitle}</h2>
          <p>{copy.page.toolkitDescription}</p>
        </div>
        <div className="reporting-links-grid reporting-links-grid-toolkit">
          {copy.page.toolkitLinks.map((link) => (
            <ReportingLinkButton key={link.label} {...link} />
          ))}
        </div>
      </section>
    </>
  );
}

function WorkflowEditorModal({ workflow, busy, onClose, onSave }) {
  const { language, copy } = useReportingUiCopy();
  const [form, setForm] = useState({
    title: workflow.title || "",
    guideTitle: workflow.guideTitle || "",
    tone: workflow.tone || "blue",
    label: workflow.label || "",
    badge: workflow.badge || "",
    note: workflow.note || "",
    summary: workflow.summary || "",
    stepsText: toStepsText(workflow.steps),
    linksText: toLinksText(workflow.links),
  });

  useEffect(() => {
    setForm({
      title: workflow.title || "",
      guideTitle: workflow.guideTitle || "",
      tone: workflow.tone || "blue",
      label: workflow.label || "",
      badge: workflow.badge || "",
      note: workflow.note || "",
      summary: workflow.summary || "",
      stepsText: toStepsText(workflow.steps),
      linksText: toLinksText(workflow.links),
    });
  }, [workflow]);

  const handleChange = (field, value) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSave(workflow.issueType, {
      title: form.title,
      guideTitle: form.guideTitle,
      tone: form.tone,
      label: form.label,
      badge: form.badge,
      note: form.note,
      summary: form.summary,
      steps: parseSteps(form.stepsText),
      links: parseLinks(form.linksText),
    });
  };

  const toneOptions = useMemo(
    () => [
      { value: "blue", label: getReportingToneLabel("blue", language) },
      { value: "amber", label: getReportingToneLabel("amber", language) },
      { value: "red", label: getReportingToneLabel("red", language) },
      { value: "slate", label: getReportingToneLabel("slate", language) },
    ],
    [language]
  );

  return (
    <div className="workflow-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="workflow-modal-shell" role="dialog" aria-modal="true" aria-labelledby={`workflow-modal-${workflow.issueType}`} onClick={(event) => event.stopPropagation()}>
        <form className="reporter-form-card workflow-editor-card" onSubmit={handleSubmit}>
          <div className="reporter-form-card-header workflow-modal-header">
            <div className="workflow-modal-titleblock">
              <h3 id={`workflow-modal-${workflow.issueType}`}>
                {copy.page.workflowEditor.title(workflow.title)}
              </h3>
              <p>{copy.page.workflowEditor.description}</p>
            </div>
            <button
              type="button"
              className="management-button-secondary workflow-modal-close"
              onClick={onClose}
            >
              {copy.common.close}
            </button>
          </div>

          <div className="management-fields">
            <div className="management-field-grid">
              <div className="management-field">
                <label htmlFor={`${workflow.issueType}-title`}>
                  {copy.page.workflowEditor.sectionTitle}
                </label>
                <input
                  id={`${workflow.issueType}-title`}
                  type="text"
                  value={form.title}
                  onChange={(event) => handleChange("title", event.target.value)}
                  required
                />
              </div>

              <div className="management-field">
                <label htmlFor={`${workflow.issueType}-guide-title`}>
                  {copy.page.workflowEditor.guideTitle}
                </label>
                <input
                  id={`${workflow.issueType}-guide-title`}
                  type="text"
                  value={form.guideTitle}
                  onChange={(event) => handleChange("guideTitle", event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="management-field-grid">
              <div className="management-field">
                <label htmlFor={`${workflow.issueType}-tone`}>
                  {copy.page.workflowEditor.colorTone}
                </label>
                <select
                  id={`${workflow.issueType}-tone`}
                  value={form.tone}
                  onChange={(event) => handleChange("tone", event.target.value)}
                >
                  {toneOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="management-field">
                <label htmlFor={`${workflow.issueType}-label`}>
                  {copy.page.workflowEditor.workflowLabel}
                </label>
                <input
                  id={`${workflow.issueType}-label`}
                  type="text"
                  value={form.label}
                  onChange={(event) => handleChange("label", event.target.value)}
                />
              </div>
            </div>

            <div className="management-field-grid">
              <div className="management-field">
                <label htmlFor={`${workflow.issueType}-badge`}>
                  {copy.page.workflowEditor.badge}
                </label>
                <input
                  id={`${workflow.issueType}-badge`}
                  type="text"
                  value={form.badge}
                  onChange={(event) => handleChange("badge", event.target.value)}
                />
              </div>

              <div className="management-field">
                <label htmlFor={`${workflow.issueType}-summary`}>
                  {copy.page.workflowEditor.summary}
                </label>
                <input
                  id={`${workflow.issueType}-summary`}
                  type="text"
                  value={form.summary}
                  onChange={(event) => handleChange("summary", event.target.value)}
                />
              </div>
            </div>

            <div className="management-field">
              <label htmlFor={`${workflow.issueType}-note`}>
                {copy.page.workflowEditor.note}
              </label>
              <textarea
                id={`${workflow.issueType}-note`}
                value={form.note}
                onChange={(event) => handleChange("note", event.target.value)}
              />
            </div>

            <div className="management-field">
              <label htmlFor={`${workflow.issueType}-steps`}>
                {copy.page.workflowEditor.steps}
              </label>
              <textarea
                id={`${workflow.issueType}-steps`}
                value={form.stepsText}
                onChange={(event) => handleChange("stepsText", event.target.value)}
                placeholder={copy.page.workflowEditor.stepsPlaceholder}
              />
            </div>

            <div className="management-field">
              <label htmlFor={`${workflow.issueType}-links`}>
                {copy.page.workflowEditor.links}
              </label>
              <textarea
                id={`${workflow.issueType}-links`}
                value={form.linksText}
                onChange={(event) => handleChange("linksText", event.target.value)}
                placeholder={copy.page.workflowEditor.linksPlaceholder}
              />
            </div>
          </div>

          <div className="management-actions workflow-modal-actions">
            <button type="button" className="management-button-secondary" onClick={onClose}>
              {copy.common.cancel}
            </button>
            <button type="submit" className="management-button" disabled={busy}>
              {busy ? copy.common.saving : copy.page.workflowEditor.saveWorkflow}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ReportingPage() {
  const { user } = useAuth();
  const { copy } = useReportingUiCopy();
  const canEditWorkflows = hasPrivilege(user, "EDIT_REPORTING_WORKFLOWS");
  const canDoReporting = hasPrivilege(user, "DO_REPORTING");
  const canGenerateReportingAiEmail = hasPrivilege(user, "GENERATE_REPORTING_AI_EMAIL");
  const canSendReportingEmail = hasPrivilege(user, "SEND_REPORTING_EMAIL");
  const canManageReportingMailProfiles = hasPrivilege(user, "MANAGE_REPORTING_SMTP_PROFILES");
  const canManageReportingImageCleanup = hasPrivilege(user, "VIEW_REPORTING_ADMIN_REVIEW");
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savingIssueType, setSavingIssueType] = useState("");
  const [editingWorkflow, setEditingWorkflow] = useState(null);
  const [activeWorkflowIssueType, setActiveWorkflowIssueType] = useState("");

  const loadWorkflows = async () => {
    try {
      setError("");
      setLoading(true);
      const response = await getReportingWorkflowsApi();
      setWorkflows(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || copy.page.loadErrorFallback);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkflows();
  }, []);

  useEffect(() => {
    if (!activeWorkflowIssueType && workflows[0]?.issueType) {
      setActiveWorkflowIssueType(workflows[0].issueType);
    }
  }, [activeWorkflowIssueType, workflows]);

  const handleSaveWorkflow = async (issueType, payload) => {
    try {
      setError("");
      setSuccessMessage("");
      setSavingIssueType(issueType);
      await updateReportingWorkflowApi(issueType, payload);
      await loadWorkflows();
      setEditingWorkflow(null);
      setSuccessMessage(copy.page.saveSuccess);
    } catch (err) {
      setError(err.response?.data?.message || copy.page.saveError);
    } finally {
      setSavingIssueType("");
    }
  };

  const workflowSections = useMemo(() => workflows || [], [workflows]);
  const activeWorkflow =
    workflowSections.find((workflow) => workflow.issueType === activeWorkflowIssueType) || workflowSections[0] || null;

  return (
    <div className="management-page reporting-page">
      <section className="app-panel management-header reporting-header">
        <div>
          <h1>{copy.page.title}</h1>
        </div>
        <div className="reporting-page-header-actions">
          <ReportingSettingsControl
            enabled={canGenerateReportingAiEmail || canManageReportingImageCleanup}
            canEditPersonalSettings={canGenerateReportingAiEmail}
            canManageCleanup={canManageReportingImageCleanup}
          />
          <ReportingMailProfileManager
            enabled={canSendReportingEmail || canManageReportingMailProfiles}
            canManagePersonal={canSendReportingEmail}
            canManageShared={canManageReportingMailProfiles}
          />
        </div>
      </section>
   
      {error ? <p className="management-error">{error}</p> : null}
      {successMessage ? <p className="reporting-success-banner">{successMessage}</p> : null}

   

      {canManageReportingImageCleanup ? <ReportingTaskTracker /> : null}

      <ReporterWorkspace />
      {loading ? (
        <div className="app-panel reporting-workspace-empty">
          {copy.page.loadingWorkflows}
        </div>
      ) : (
        <>
          {workflowSections.length ? (
            <div
              className="reporting-workflow-tabs"
              role="tablist"
              aria-label={copy.page.workflowsTabLabel}
            >
              {workflowSections.map((workflow) => (
                <button
                  key={workflow.issueType}
                  type="button"
                  className={`reporting-workflow-tab${activeWorkflow?.issueType === workflow.issueType ? " is-active" : ""}`}
                  onClick={() => setActiveWorkflowIssueType(workflow.issueType)}
                >
                  {workflow.title}
                </button>
              ))}
            </div>
          ) : null}

          {activeWorkflow ? (
            <ReportingSection
              section={activeWorkflow}
              canEdit={canEditWorkflows}
              onEdit={setEditingWorkflow}
              copy={copy}
            />
          ) : null}
        </>
      )}

      {editingWorkflow ? (
        <WorkflowEditorModal
          workflow={editingWorkflow}
          busy={savingIssueType === editingWorkflow.issueType}
          onClose={() => setEditingWorkflow(null)}
          onSave={handleSaveWorkflow}
        />
      ) : null}
    </div>
  );
}
