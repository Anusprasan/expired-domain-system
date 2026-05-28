import React, { useEffect, useMemo, useState } from "react";
import { uploadExpiredDomains } from "../api/expiredDomainsApi";

function splitDomainInput(value) {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item : item?.domain || item?.name || ""))
        .map((item) => String(item).trim())
        .filter(Boolean);
    }
  } catch (err) {
    // Fall through to plain text parsing.
  }

  return trimmed
    .split(/[\r\n,;\t]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDomain(value) {
  let domain = String(value || "").trim().toLowerCase();

  domain = domain.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  domain = domain.split(/[/?#]/)[0].replace(/\.+$/, "");

  return domain;
}

function isValidDomain(value) {
  const domain = normalizeDomain(value);

  if (!domain || domain.length > 253 || !domain.includes(".")) {
    return false;
  }

  const labels = domain.split(".");
  return labels.every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  )) && /^[a-z]{2,63}$/.test(labels[labels.length - 1]);
}

function buildBatchSummary(text) {
  const rawDomains = splitDomainInput(text);
  const validCounts = new Map();
  const invalidDomains = [];

  rawDomains.forEach((rawDomain) => {
    const normalizedDomain = normalizeDomain(rawDomain);

    if (isValidDomain(normalizedDomain)) {
      validCounts.set(normalizedDomain, (validCounts.get(normalizedDomain) || 0) + 1);
      return;
    }

    invalidDomains.push(rawDomain);
  });

  return {
    total: rawDomains.length,
    validTotal: validCounts.size,
    invalidTotal: invalidDomains.length,
    duplicateTotal: Array.from(validCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    validDomains: Array.from(validCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((left, right) => left.domain.localeCompare(right.domain)),
    invalidDomains,
  };
}

function formatBatchNumber(value) {
  return String(Math.max(1, Number(value) || 1)).padStart(2, "0");
}

function buildSummaryFromSnapshot(snapshot, fallbackSummary) {
  if (!snapshot) {
    return fallbackSummary;
  }

  return {
    total: snapshot.total || 0,
    validTotal: snapshot.valid || 0,
    invalidTotal: snapshot.invalid || 0,
    duplicateTotal: snapshot.duplicate || 0,
    validDomains: (snapshot.validDomains || []).map((domain) => ({ domain, count: 1 })),
    invalidDomains: [],
  };
}

export default function UploadExpiredDomainsForm({
  batchNumber = 1,
  batchSnapshot = null,
  onImportComplete,
  onMoveToProcess,
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [message, setMessage] = useState(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [savedSummary, setSavedSummary] = useState(null);
  const batchSummary = useMemo(() => buildBatchSummary(text), [text]);
  const batchSnapshotSummary = useMemo(
    () => buildSummaryFromSnapshot(batchSnapshot, batchSummary),
    [batchSnapshot, batchSummary]
  );
  const displaySummary = text ? batchSummary : (savedSummary || batchSnapshotSummary);
  const canMoveCurrentBatchToProcess = Number(displaySummary.validTotal || 0) > 0;

  useEffect(() => {
    if (saveStatus !== "Saved") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveStatus("");
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [saveStatus]);

  useEffect(() => {
    setText("");
    setSavedSummary(null);
    setSaveStatus("");
  }, [batchNumber]);

  const importDomains = async (sourceText) => {
    const summary = buildBatchSummary(sourceText);
    const domains = splitDomainInput(sourceText);

    if (!domains.length) {
      setText("");
      setSavedSummary(summary);
      setMessage("No domains found.");
      return null;
    }

    const res = await uploadExpiredDomains(domains);
    const result = res.data?.data || {};
    const snapshotSummary = buildSummaryFromSnapshot(result.batchSnapshot, summary);

    setText("");
    setSavedSummary(snapshotSummary);
    await onImportComplete?.();
    return result;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setSaveStatus("Saving");

    if (!buildBatchSummary(text).total) {
      setMessage("Paste at least one domain before saving.");
      setSaveStatus("");
      return;
    }

    setLoading(true);
    try {
      const result = await importDomains(text);
      setSaveStatus(result ? "Saved" : "");
    } catch (error) {
      setMessage(error?.response?.data?.message || error.message);
      setSaveStatus("");
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async (event) => {
    const pastedText = event.clipboardData?.getData("text") || "";

    if (!pastedText.trim()) {
      return;
    }

    event.preventDefault();
    setMessage(null);
    setSaveStatus("Saving");
    setLoading(true);

    try {
      const result = await importDomains(pastedText);
      setSaveStatus(result ? "Saved" : "");
    } catch (error) {
      setMessage(error?.response?.data?.message || error.message);
      setSaveStatus("");
    } finally {
      setLoading(false);
    }
  };

  const handleMoveToProcess = async () => {
    if (!onMoveToProcess) {
      return;
    }

    setMessage(null);
    setSaveStatus("");

    if (!canMoveCurrentBatchToProcess && !buildBatchSummary(text).validTotal) {
      setMessage("Add at least one valid domain before moving this batch to Process.");
      return;
    }

    setMoving(true);

    try {
      let importedCount = 0;

      if (buildBatchSummary(text).total) {
        const importResult = await importDomains(text);
        importedCount = importResult?.validCount || 0;
      }

      const result = await onMoveToProcess();
      const movedCount = result?.movedCount || 0;
      const movedBatchNumber = result?.batchNumber || batchNumber;
      const subBatchCount = result?.subBatchCount || 0;

      setMessage(
        movedCount
          ? `Batch ${formatBatchNumber(movedBatchNumber)} moved to Process with ${movedCount} domain${movedCount === 1 ? "" : "s"} in ${subBatchCount} sub-batch${subBatchCount === 1 ? "" : "es"}${importedCount ? `, including ${importedCount} just imported` : ""}.`
          : `Batch ${formatBatchNumber(movedBatchNumber)} has no valid uploaded domains to move.`
      );
    } catch (error) {
      setMessage(error?.response?.data?.message || error.message);
    } finally {
      setMoving(false);
    }
  };

  return (
    <form className="management-form app-panel" onSubmit={handleSubmit}>
      <h2>Upload Expired Domains</h2>
      <p>Paste expired domains below. The batch stores valid, invalid, and duplicate entries; only valid domains move to Process.</p>

      <div className="expired-domains-batch-summary" aria-live="polite">
        <div className="management-summary expired-domains-summary-batch">
          <strong>{formatBatchNumber(batchNumber)}</strong>
          <span>Batch</span>
        </div>
        <div className="management-summary">
          <strong>{displaySummary.total}</strong>
          <span>Total domains</span>
        </div>
        <div className="management-summary expired-domains-summary-valid">
          <strong>{displaySummary.validTotal}</strong>
          <span>Valid domains</span>
        </div>
        <div className="management-summary expired-domains-summary-invalid">
          <strong>{displaySummary.invalidTotal}</strong>
          <span>Invalid domains</span>
        </div>
        <div className="management-summary expired-domains-summary-duplicate">
          <strong>{displaySummary.duplicateTotal}</strong>
          <span>Duplicate</span>
        </div>
      </div>

      <div className="management-fields">
        <div className="management-field">
          <label htmlFor="expired-domains-upload">Expired domains</label>
          <div className="expired-domains-textarea-wrap">
            <textarea
              id="expired-domains-upload"
              rows={10}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSaveStatus("");
              }}
              onPaste={handlePaste}
              disabled={loading || moving}
              placeholder={`example.com\nsample.net\nexpired-domain.org`}
            />
            {saveStatus ? (
              <div className={`expired-domains-save-overlay is-${saveStatus.toLowerCase()}`}>
                {saveStatus}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="expired-domains-valid-list">
        <div className="expired-domains-valid-list-header">
          <strong>Valid Domains</strong>
          <span>{displaySummary.validDomains.length} valid domain{displaySummary.validDomains.length === 1 ? "" : "s"}</span>
        </div>

        {displaySummary.validDomains.length ? (
          <ol className="expired-domains-valid-list-items">
            {displaySummary.validDomains.map((item) => (
              <li key={item.domain} className="expired-domains-valid-row">
                {item.domain}
                {item.count > 1 ? <strong>{item.count}</strong> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="management-empty expired-domains-valid-empty">No valid domains yet.</p>
        )}
      </div>

      {batchSummary.invalidDomains.length ? (
        <p className="expired-domains-invalid-note">
          {batchSummary.invalidTotal} invalid domain{batchSummary.invalidTotal === 1 ? "" : "s"} will be saved in this batch and removed when the batch moves to Process.
        </p>
      ) : null}

      <div className="expired-domains-form-actions">
        {onMoveToProcess ? (
          <button
            type="button"
            className="management-button-secondary"
            onClick={handleMoveToProcess}
            disabled={loading || moving || !canMoveCurrentBatchToProcess}
            title={!canMoveCurrentBatchToProcess ? "Add at least one valid domain before moving to Process" : undefined}
          >
            {moving ? "Moving..." : "Move to Process"}
          </button>
        ) : null}
        {message && <div className="management-help-text">{message}</div>}
      </div>
    </form>
  );
}
