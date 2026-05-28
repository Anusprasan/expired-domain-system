import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";

function stripHtml(value) {
  return String(value || "")
    .replace(/<(.|\n)*?>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEditorValue(value) {
  const html = String(value || "").trim();
  const text = stripHtml(html);
  return text ? html : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToHtml(value) {
  const paragraphs = String(value || "")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return "";
  }

  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function formatBytes(value, locale, zeroLabel) {
  const size = Number(value || 0);

  if (!size) {
    return zeroLabel;
  }

  if (size < 1024) {
    return `${size.toLocaleString(locale)} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} KB`;
  }

  return `${(size / (1024 * 1024)).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} MB`;
}

function readFileAsDataUrl(file, copy) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error(copy.workspace.evidenceDraft.failedToReadFile(file.name)));
    reader.readAsDataURL(file);
  });
}

function parseDataUrl(dataUrl, copy) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,([\s\S]+)$/i);

  if (!match) {
    throw new Error(copy.workspace.evidenceDraft.unsupportedImageFormat);
  }

  return {
    contentType: match[1],
    contentBase64: match[2],
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function parseRecipientList(value) {
  return String(value || "")
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function RecipientChipInput({
  id,
  label,
  value,
  disabled,
  onValueChange,
  onComposerError,
  inputRef,
  helperText = "",
  emptyPlaceholder = "",
  filledPlaceholder = "",
  actions = null,
  invalidEmailMessage,
  removeRecipientLabel,
}) {
  const fallbackInputRef = useRef(null);
  const activeInputRef = inputRef || fallbackInputRef;
  const recipients = useMemo(() => parseRecipientList(value), [value]);
  const [draftValue, setDraftValue] = useState("");

  useEffect(() => {
    setDraftValue("");
  }, [value]);

  const commitRecipientInput = (rawValue) => {
    const nextCandidates = parseRecipientList(rawValue);

    if (!nextCandidates.length) {
      return false;
    }

    const invalidRecipient = nextCandidates.find((item) => !isValidEmail(item));
    if (invalidRecipient) {
      onComposerError(invalidEmailMessage(invalidRecipient));
      return false;
    }

    const nextRecipients = [];
    const seen = new Set();

    [...recipients, ...nextCandidates].forEach((item) => {
      const normalizedItem = item.toLowerCase();
      if (!seen.has(normalizedItem)) {
        seen.add(normalizedItem);
        nextRecipients.push(item);
      }
    });

    onValueChange(nextRecipients.join(", "));
    setDraftValue("");
    return true;
  };

  const handleRecipientKeyDown = (event) => {
    if (["Enter", "Tab", ",", " ", ";"].includes(event.key)) {
      if (draftValue.trim()) {
        event.preventDefault();
        commitRecipientInput(draftValue);
      }
      return;
    }

    if (event.key === "Backspace" && !draftValue.trim() && recipients.length) {
      event.preventDefault();
      onValueChange(recipients.slice(0, -1).join(", "));
    }
  };

  const handleRecipientPaste = (event) => {
    const pastedText = event.clipboardData?.getData("text") || "";

    if (!/[\s,;]/.test(pastedText)) {
      return;
    }

    event.preventDefault();
    commitRecipientInput(pastedText);
  };

  const handleRecipientRemove = (recipientToRemove) => {
    const nextRecipients = recipients.filter((item) => item !== recipientToRemove);
    onValueChange(nextRecipients.join(", "));
    activeInputRef.current?.focus();
  };

  return (
    <div className="management-field">
      <div className="reporting-ai-recipient-header">
        <label htmlFor={id}>{label}</label>
        {actions ? <div className="reporting-ai-recipient-actions">{actions}</div> : null}
      </div>
      <div
        className="reporting-ai-recipient-shell"
        onClick={() => activeInputRef.current?.focus()}
        role="presentation"
      >
        {recipients.map((recipient) => (
          <button
            key={recipient}
            type="button"
            className="reporting-ai-recipient-chip"
            onClick={() => handleRecipientRemove(recipient)}
            disabled={disabled}
            aria-label={removeRecipientLabel(recipient)}
          >
            <span>{recipient}</span>
            <strong>x</strong>
          </button>
        ))}

        <input
          id={id}
          ref={activeInputRef}
          type="text"
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={handleRecipientKeyDown}
          onPaste={handleRecipientPaste}
          onBlur={() => {
            if (draftValue.trim()) {
              commitRecipientInput(draftValue);
            }
          }}
          placeholder={recipients.length ? filledPlaceholder : emptyPlaceholder}
          disabled={disabled}
        />
      </div>
      {helperText ? <small className="reporting-ai-helper">{helperText}</small> : null}
    </div>
  );
}

export default function ReportingAiEmailModal({
  report,
  form,
  busyAction,
  error,
  success,
  canGenerateAiContent = false,
  canSendEmail = false,
  onChange,
  onComposerError,
  onGenerate,
  onSaveDraft,
  onSend,
  onClose,
  getIssueLabel,
}) {
  const { copy, locale } = useReportingUiCopy();
  const quillRef = useRef(null);
  const inlineImageInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const recipientInputRef = useRef(null);
  const ccInputRef = useRef(null);
  const bccInputRef = useRef(null);
  const issueLabel = getIssueLabel(report.issueType);
  const isGenerating = busyAction === "ai-generate";
  const isSavingDraft = busyAction === "ai-draft";
  const isSending = busyAction === "ai-send";
  const isBusy = isGenerating || isSavingDraft || isSending;
  const canSaveDraft = canGenerateAiContent || canSendEmail;
  const [showCcField, setShowCcField] = useState(Boolean(parseRecipientList(form.ccEmail).length));
  const [showBccField, setShowBccField] = useState(Boolean(parseRecipientList(form.bccEmail).length));
  const mailSourceOptions = report.mailSources?.options || [];
  const selectedMailSource =
    mailSourceOptions.find((option) => option.key === form.mailSourceKey) || null;
  const recipients = useMemo(() => parseRecipientList(form.recipientEmail), [form.recipientEmail]);
  const ccRecipients = useMemo(() => parseRecipientList(form.ccEmail), [form.ccEmail]);
  const bccRecipients = useMemo(() => parseRecipientList(form.bccEmail), [form.bccEmail]);
  const bodyText = form.bodyText || stripHtml(form.bodyHtml);
  const generatedDraftHtml = form.generatedBodyHtml || plainTextToHtml(form.generatedBody || "");
  const previewHtml = form.bodyHtml || generatedDraftHtml;
  const hasPreview = Boolean(stripHtml(previewHtml));
  const senderEmail = selectedMailSource?.from || selectedMailSource?.user || "";
  const hasGeneratedDraft = Boolean(stripHtml(generatedDraftHtml) || form.generatedSubject?.trim());

  const editorModules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image"],
          ["clean"],
        ],
        handlers: {
          image: () => {
            inlineImageInputRef.current?.click();
          },
        },
      },
    }),
    []
  );

  const editorFormats = useMemo(
    () => [
      "header",
      "bold",
      "italic",
      "underline",
      "list",
      "bullet",
      "link",
      "image",
    ],
    []
  );

  const handleEditorChange = (value) => {
    const normalizedHtml = normalizeEditorValue(value);
    onChange("bodyHtml", normalizedHtml);
    onChange("bodyText", stripHtml(normalizedHtml));
  };

  const handleInlineImageSelection = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      onComposerError(copy.aiModal.onlyImageFiles);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      onComposerError(copy.aiModal.inlineImageTooLarge(file.name));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file, copy);
      const editor = quillRef.current?.getEditor();

      if (!editor) {
        return;
      }

      const range = editor.getSelection(true);
      const insertIndex = typeof range?.index === "number" ? range.index : editor.getLength();
      editor.insertEmbed(insertIndex, "image", dataUrl, "user");
      editor.setSelection(insertIndex + 1, 0);

      const html = editor.root.innerHTML;
      onChange("bodyHtml", normalizeEditorValue(html));
      onChange("bodyText", stripHtml(html));
    } catch (readError) {
      onComposerError(readError.message || copy.aiModal.inlineImageInsertError);
    }
  };

  const handleAttachmentSelection = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    try {
      const nextAttachments = [...(form.attachments || [])];

      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(copy.aiModal.attachmentTooLarge(file.name));
        }

        const dataUrl = await readFileAsDataUrl(file, copy);
        const { contentType, contentBase64 } = parseDataUrl(dataUrl, copy);

        nextAttachments.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          size: file.size,
          contentType,
          contentBase64,
        });
      }

      onChange("attachments", nextAttachments);
    } catch (attachmentError) {
      onComposerError(attachmentError.message || copy.aiModal.addAttachmentError);
    }
  };

  const handleRemoveAttachment = (attachmentId) => {
    const nextAttachments = (form.attachments || []).filter((attachment) => attachment.id !== attachmentId);
    onChange("attachments", nextAttachments);
  };

  const handleApplyGeneratedBody = () => {
    const generatedHtml = generatedDraftHtml;
    onChange("bodyHtml", generatedHtml);
    onChange("bodyText", stripHtml(generatedHtml));
  };

  const handleToggleRecipientField = (field) => {
    if (field === "cc") {
      setShowCcField((currentValue) => {
        const nextValue = !currentValue;
        requestAnimationFrame(() => {
          if (nextValue) {
            ccInputRef.current?.focus();
            return;
          }

          recipientInputRef.current?.focus();
        });
        return nextValue;
      });
      return;
    }

    setShowBccField((currentValue) => {
      const nextValue = !currentValue;
      requestAnimationFrame(() => {
        if (nextValue) {
          bccInputRef.current?.focus();
          return;
        }

        recipientInputRef.current?.focus();
      });
      return nextValue;
    });
  };

  return (
    <div className="workflow-modal-backdrop" role="presentation">
      <div
        className="workflow-modal-shell reporting-ai-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reporting-ai-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="workflow-modal-header reporting-ai-modal-header">
          <div className="workflow-modal-titleblock">
            <h3 id="reporting-ai-modal-title">
              {canGenerateAiContent ? copy.aiModal.aiComposerTitle : copy.aiModal.composerTitle}
            </h3>
            <p>
              {canGenerateAiContent
                ? copy.aiModal.aiComposerDescription
                : copy.aiModal.composerDescription}
            </p>
          </div>
          <button
            type="button"
            className="management-button-secondary workflow-modal-close"
            onClick={onClose}
            disabled={isBusy}
          >
            {copy.common.close}
          </button>
        </div>

        <div className="reporting-ai-modal-body">
          <div className="reporting-ai-summary-grid">
            <div className="reporter-detail-card">
              <span>{copy.aiModal.brand}</span>
              <strong>{report.brandId?.brandName || copy.common.unknownBrand}</strong>
            </div>
            <div className="reporter-detail-card">
              <span>{copy.aiModal.issueType}</span>
              <strong>{issueLabel}</strong>
            </div>
            <div className="reporter-detail-card">
              <span>{copy.aiModal.url}</span>
              <strong>{report.url}</strong>
            </div>
            <div className="reporter-detail-card">
              <span>{copy.aiModal.rank}</span>
              <strong>#{report.googleRank}</strong>
            </div>
          </div>

          {error ? <p className="management-error reporting-ai-inline-message">{error}</p> : null}
          {success ? <p className="reporting-success-banner reporting-ai-inline-message">{success}</p> : null}

          <div className="reporting-ai-composer-grid">
            <section className="reporting-ai-compose-panel">
              <div className="management-fields">
                {canSendEmail ? (
                  <>
                    <div className="management-field">
                      <label htmlFor="ai-email-source">{copy.aiModal.sendWith}</label>
                      <select
                        id="ai-email-source"
                        value={form.mailSourceKey}
                        onChange={(event) => onChange("mailSourceKey", event.target.value)}
                      >
                        {mailSourceOptions.length ? (
                          mailSourceOptions.map((option) => (
                            <option key={option.key} value={option.key} disabled={!option.isAvailable}>
                              {option.label}{option.isAvailable ? "" : " - unavailable"}
                            </option>
                          ))
                        ) : (
                          <option value="">{copy.aiModal.noSharedProfile}</option>
                        )}
                      </select>
                      <small className="reporting-ai-helper">
                        {selectedMailSource?.helper ||
                          copy.aiModal.sendWithHelp}
                      </small>
                    </div>

                    <div className="management-field">
                      <label>{copy.aiModal.fromEmail}</label>
                      <div className="reporting-ai-sender-card">
                        <strong>{senderEmail || copy.aiModal.selectSmtpProfile}</strong>
                        <span>{selectedMailSource?.label || copy.aiModal.noSmtpProfileSelected}</span>
                      </div>
                      <small className="reporting-ai-helper">
                        {selectedMailSource?.user
                          ? copy.aiModal.mailSource(selectedMailSource.user)
                          : copy.aiModal.senderAppearsHere}
                      </small>
                    </div>
                  </>
                ) : (
                  <div className="reporter-detail-card">
                    <span>{copy.aiModal.emailSending}</span>
                    <strong>{copy.aiModal.sendPermissionDisabled}</strong>
                    <p>{copy.aiModal.sendPermissionDescription}</p>
                  </div>
                )}

                <RecipientChipInput
                  id="ai-email-to"
                  label={copy.aiModal.sendTo}
                  value={form.recipientEmail}
                  disabled={isBusy}
                  onValueChange={(value) => onChange("recipientEmail", value)}
                  onComposerError={onComposerError}
                  inputRef={recipientInputRef}
                  helperText={copy.aiModal.recipientHelp}
                  emptyPlaceholder={copy.aiModal.typeEmailAndPressSpace}
                  filledPlaceholder={copy.aiModal.addAnotherEmail}
                  invalidEmailMessage={copy.aiModal.invalidEmail}
                  removeRecipientLabel={copy.aiModal.removeRecipient}
                  actions={
                    <>
                      <button
                        type="button"
                        className={`reporting-ai-recipient-toggle${showCcField ? " is-active" : ""}`}
                        onClick={() => handleToggleRecipientField("cc")}
                        disabled={isBusy}
                        aria-pressed={showCcField}
                      >
                        {ccRecipients.length ? `Cc (${ccRecipients.length})` : "Cc"}
                      </button>
                      <button
                        type="button"
                        className={`reporting-ai-recipient-toggle${showBccField ? " is-active" : ""}`}
                        onClick={() => handleToggleRecipientField("bcc")}
                        disabled={isBusy}
                        aria-pressed={showBccField}
                      >
                        {bccRecipients.length ? `Bcc (${bccRecipients.length})` : "Bcc"}
                      </button>
                    </>
                  }
                />

                <div className="management-field">
                  <label htmlFor="ai-email-subject">{copy.aiModal.emailSubject}</label>
                  <input
                    id="ai-email-subject"
                    type="text"
                    value={form.subject}
                    onChange={(event) => onChange("subject", event.target.value)}
                    placeholder={copy.aiModal.emailSubjectPlaceholder}
                  />
                </div>

                {showCcField ? (
                  <RecipientChipInput
                    id="ai-email-cc"
                    label="CC"
                    value={form.ccEmail || ""}
                    disabled={isBusy}
                    onValueChange={(value) => onChange("ccEmail", value)}
                    onComposerError={onComposerError}
                    inputRef={ccInputRef}
                    emptyPlaceholder={copy.aiModal.ccPlaceholder}
                    filledPlaceholder={copy.aiModal.addAnotherEmail}
                    helperText={copy.aiModal.ccHelp}
                    invalidEmailMessage={copy.aiModal.invalidEmail}
                    removeRecipientLabel={copy.aiModal.removeRecipient}
                  />
                ) : null}

                {showBccField ? (
                  <RecipientChipInput
                    id="ai-email-bcc"
                    label="BCC"
                    value={form.bccEmail || ""}
                    disabled={isBusy}
                    onValueChange={(value) => onChange("bccEmail", value)}
                    onComposerError={onComposerError}
                    inputRef={bccInputRef}
                    emptyPlaceholder={copy.aiModal.bccPlaceholder}
                    filledPlaceholder={copy.aiModal.addAnotherEmail}
                    helperText={copy.aiModal.bccHelp}
                    invalidEmailMessage={copy.aiModal.invalidEmail}
                    removeRecipientLabel={copy.aiModal.removeRecipient}
                  />
                ) : null}

                <div className="management-field">
                  <label htmlFor="ai-email-notes">
                    {canGenerateAiContent
                      ? copy.aiModal.additionalNotesForAi
                      : copy.aiModal.additionalNotes}
                  </label>
                  <textarea
                    id="ai-email-notes"
                    value={form.additionalNotes}
                    onChange={(event) => onChange("additionalNotes", event.target.value)}
                    placeholder={
                      canGenerateAiContent
                        ? copy.aiModal.aiNotesPlaceholder
                        : copy.aiModal.notesPlaceholder
                    }
                  />
                </div>
              </div>

              <div className="reporting-ai-toolbar-row">
                {canGenerateAiContent ? (
                  <button
                    type="button"
                    className="management-button reporter-task-action reporter-task-action-ai"
                    onClick={onGenerate}
                    disabled={isBusy}
                  >
                    {isGenerating ? copy.aiModal.generating : copy.aiModal.generateContent}
                  </button>
                ) : (
                  <div className="reporting-ai-helper">
                    {copy.aiModal.aiDisabled}
                  </div>
                )}

                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={isBusy}
                >
                  {copy.aiModal.addAttachment}
                </button>

                <button
                  type="button"
                  className="management-button-secondary"
                  onClick={() => inlineImageInputRef.current?.click()}
                  disabled={isBusy}
                >
                  {copy.aiModal.insertInlineImage}
                </button>
              </div>

              <div className="management-field">
                <label>{copy.aiModal.emailBody}</label>
                <div className="reporting-ai-editor-shell">
                  <ReactQuill
                    ref={quillRef}
                    theme="snow"
                    value={form.bodyHtml || ""}
                    onChange={handleEditorChange}
                    modules={editorModules}
                    formats={editorFormats}
                    readOnly={isBusy}
                    placeholder={copy.aiModal.emailBodyPlaceholder}
                  />
                </div>
                <small className="reporting-ai-helper">
                  {copy.aiModal.emailBodyHelp}
                </small>
              </div>

              {(form.attachments || []).length ? (
                <div className="reporting-ai-attachments">
                  <span className="reporting-ai-attachments-title">{copy.aiModal.attachments}</span>
                  <div className="reporting-ai-attachment-list">
                    {(form.attachments || []).map((attachment) => (
                      <div key={attachment.id} className="reporting-ai-attachment-chip">
                        <div>
                          <strong>{attachment.name}</strong>
                          <small>{formatBytes(attachment.size, locale, copy.common.bytesZero)}</small>
                        </div>
                        <button
                          type="button"
                          className="management-button-secondary reporting-ai-attachment-remove"
                          onClick={() => handleRemoveAttachment(attachment.id)}
                          disabled={isBusy}
                        >
                          {copy.aiModal.remove}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <aside className="reporting-ai-side-panel">
              <div className="reporting-ai-generated-card">
                <div className="reporting-ai-generated-header">
                  <h4>{copy.aiModal.aiDraft}</h4>
                  {canGenerateAiContent && hasGeneratedDraft ? (
                    <button
                      type="button"
                      className="management-button-secondary"
                      onClick={handleApplyGeneratedBody}
                      disabled={isBusy}
                    >
                      {copy.aiModal.applyToEditor}
                    </button>
                  ) : null}
                </div>

                {canGenerateAiContent ? (
                  <>
                    {form.generatedSubject ? (
                      <div className="reporter-detail-card">
                        <span>{copy.aiModal.generatedSubject}</span>
                        <strong>{form.generatedSubject}</strong>
                      </div>
                    ) : null}

                    {hasGeneratedDraft ? (
                      <div className="reporting-ai-generated-body">
                        <div dangerouslySetInnerHTML={{ __html: generatedDraftHtml }} />
                      </div>
                    ) : (
                      <div className="reporting-workspace-empty">
                        {copy.aiModal.generateToSeeDraft}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="reporting-workspace-empty">
                    {copy.aiModal.aiDraftDisabled}
                  </div>
                )}
              </div>

              <div className="reporting-ai-preview-card">
                <div className="reporting-ai-generated-header">
                  <h4>{copy.aiModal.emailPreview}</h4>
                  <span className="reporting-ai-preview-badge">
                    {hasPreview ? copy.aiModal.livePreview : copy.aiModal.waitingForContent}
                  </span>
                </div>

                <div className="reporting-ai-preview-meta">
                  {canSendEmail ? (
                    <>
                      <div>
                        <span>{copy.aiModal.smtpProfile}</span>
                        <strong>{selectedMailSource?.label || copy.aiModal.selectSmtpProfile}</strong>
                      </div>
                      <div>
                        <span>{copy.aiModal.from}</span>
                        <strong>{senderEmail || copy.aiModal.selectSmtpProfile}</strong>
                      </div>
                    </>
                  ) : null}
                  <div>
                    <span>{copy.aiModal.to}</span>
                    <strong>
                      {recipients.length
                        ? recipients.join(", ")
                        : copy.aiModal.addRecipientEmails}
                    </strong>
                  </div>
                  <div>
                    <span>{copy.emailActivity.cc}</span>
                    <strong>{form.ccEmail?.trim() || copy.aiModal.noCcRecipients}</strong>
                  </div>
                  <div>
                    <span>{copy.aiModal.subject}</span>
                    <strong>{form.subject?.trim() || copy.aiModal.addSubjectLine}</strong>
                  </div>
                </div>

                {hasPreview ? (
                  <div
                    className="reporting-ai-preview-shell"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : (
                  <div className="reporting-workspace-empty">
                    {copy.aiModal.previewEmpty}
                  </div>
                )}
              </div>

              <div className="reporting-ai-send-card">
                <div className="reporter-detail-card">
                  <span>{copy.aiModal.composerStatus}</span>
                  <strong>{bodyText ? copy.aiModal.draftReady : copy.aiModal.bodyEmpty}</strong>
                  <p>
                    {bodyText
                      ? copy.aiModal.draftReadyDescription
                      : copy.aiModal.bodyEmptyDescription}
                  </p>
                  {canSendEmail ? (
                    <>
                      <p>{selectedMailSource?.label || copy.aiModal.noSmtpSelectedYet}</p>
                      <p>
                        {senderEmail
                          ? copy.aiModal.fromAddress(senderEmail)
                          : copy.aiModal.pickSmtpProfile}
                      </p>
                    </>
                  ) : (
                    <p>{copy.aiModal.sendingDisabled}</p>
                  )}
                  <p>{copy.aiModal.attachmentsReady((form.attachments || []).length)}</p>
                </div>

                <div className="management-actions reporting-ai-actions-row">
                  {canSaveDraft ? (
                    <button
                      type="button"
                      className="management-button-secondary"
                      onClick={onSaveDraft}
                      disabled={isBusy}
                    >
                      {isSavingDraft
                        ? copy.aiModal.savingDraft
                        : form.draftId
                          ? copy.aiModal.updateDraft
                          : copy.aiModal.saveDraft}
                    </button>
                  ) : null}
                  {canSendEmail ? (
                    <button
                      type="button"
                      className="management-button-secondary reporting-settings-trigger"
                      onClick={onSend}
                      disabled={
                        isBusy ||
                        !selectedMailSource?.isAvailable ||
                        !form.smtpSourceType ||
                        !recipients.length ||
                        !form.subject.trim() ||
                        !bodyText.trim()
                      }
                    >
                      {isSending ? copy.aiModal.sending : copy.aiModal.sendEmail}
                    </button>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>

          <input
            ref={inlineImageInputRef}
            type="file"
            accept="image/*"
            className="reporting-ai-hidden-input"
            onChange={handleInlineImageSelection}
          />
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            className="reporting-ai-hidden-input"
            onChange={handleAttachmentSelection}
          />
        </div>
      </div>
    </div>
  );
}
