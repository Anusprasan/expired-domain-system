import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { hasAdminAccess, hasPrivilege } from "../../../shared/utils/permissions";
import { getBrandsApi } from "../../brands/api/brandsApi";
import {
  acceptReportingTaskApi,
  createReportingTaskApi,
  deleteReportingTaskItemApi,
  getReportingTaskEvidenceImageUrl,
  getReportingTaskStaffApi,
  getReportingTasksApi,
  submitReportingTaskDdosEvidenceApi,
  submitReportingTaskEvidenceApi,
  updateReportingTaskApi,
} from "../api/reportingTasksApi";
import { getReportingWorkflowsApi } from "../../reporting/api/reportingApi";
import { useReportingUiCopy } from "../../reporting/hooks/useReportingUiCopy";
import "../../../shared/styles/management.css";

const ISSUE_TYPES = [
  { value: "cloaking",        label: "Cloaking" },
  { value: "brand_phishing",  label: "Brand Phishing" },
  { value: "death_phishing",  label: "Death Phishing" },
  { value: "stray_domain",    label: "Stray Domain" },
];
const ISSUE_LABEL = Object.fromEntries(ISSUE_TYPES.map((t) => [t.value, t.label]));
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"];
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ONE_HOUR_MS       = 60 * 60 * 1000;
const TWENTY_FOUR_HR_MS = 24 * 60 * 60 * 1000;

function getEditMinsLeft(submittedAt) {
  if (!submittedAt) return 0;
  const remaining = ONE_HOUR_MS - (Date.now() - new Date(submittedAt).getTime());
  return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
}

function getExpiryMinsLeft(createdAt) {
  if (!createdAt) return 0;
  const remaining = TWENTY_FOUR_HR_MS - (Date.now() - new Date(createdAt).getTime());
  return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
}

function toLocalDateStr(d = new Date()) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local timezone
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

function formatDateLabel(dateStr) {
  const today     = toLocalDateStr();
  const yesterday = shiftDate(today, -1);
  if (dateStr === today)     return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTimeLeft(mins) {
  if (mins <= 0) return null;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getEvidenceImageSrc(image) {
  if (image?.key) return getReportingTaskEvidenceImageUrl(image);
  if (image?.url) return image.url;
  if (image?.contentBase64) return `data:${image.contentType};base64,${image.contentBase64}`;
  return "";
}

function getEvidenceImageDownloadSrc(image) {
  if (image?.key) return getReportingTaskEvidenceImageUrl(image, { download: true });
  return getEvidenceImageSrc(image);
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M9.5 1.5L11.5 3.5L4 11H2V9L9.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);
const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M6.5 2.5V10.5M2.5 6.5H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const IconLock = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <rect x="2" y="5.5" width="8" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <path d="M4 5.5V4a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M2 3.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M4.5 3.5V2.5A.5.5 0 015 2h3a.5.5 0 01.5.5v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M3 3.5l.6 7a.5.5 0 00.5.5h5a.5.5 0 00.5-.5l.6-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.5 6v3M7.5 6v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <rect x="4.25" y="3.25" width="6.25" height="6.25" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2.5 7.75V2.5h5.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function ImgCountChip({ count }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "8px", fontSize: "0.68rem", fontWeight: 600, background: "#f1f5f9", color: "#64748b", whiteSpace: "nowrap" }}>
      🖼 {count}
    </span>
  );
}

// Tooltip uses position:fixed + getBoundingClientRect so it escapes any overflow:hidden parent
function TooltipBtn({ icon, tooltip, onClick, color = "#374151", bg = "#f1f5f9", border = "#e2e8f0", disabled = false }) {
  const [tipPos, setTipPos] = React.useState(null);
  const btnRef = React.useRef(null);

  const showTip = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setTipPos({ top: r.top, left: r.left + r.width / 2 });
  };
  const hideTip = () => setTipPos(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "28px", height: "28px", borderRadius: "7px",
          border: `1.5px solid ${border}`, background: bg, color,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1, padding: 0, fontFamily: "inherit", flexShrink: 0,
        }}
      >
        {icon}
      </button>
      {tipPos && tooltip ? (
        <span style={{
          position: "fixed",
          top: tipPos.top - 6,
          left: tipPos.left,
          transform: "translate(-50%, -100%)",
          background: "#1e293b", color: "#fff",
          padding: "5px 10px", borderRadius: "7px", fontSize: "0.7rem",
          fontWeight: 600, whiteSpace: "nowrap", zIndex: 99999,
          pointerEvents: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.22)",
          letterSpacing: "0.01em",
        }}>
          {tooltip}
          <span style={{
            position: "absolute", top: "100%", left: "50%",
            transform: "translateX(-50%)", width: 0, height: 0,
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: "5px solid #1e293b",
          }} />
        </span>
      ) : null}
    </>
  );
}

function CopyUrlButton({ url }) {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (_) {
      setCopied(false);
    }
  };

  return (
    <TooltipBtn
      icon={<IconCopy />}
      tooltip={copied ? "Copied" : "Copy URL"}
      color={copied ? "#15803d" : "#2563eb"}
      bg={copied ? "#dcfce7" : "#eff6ff"}
      border={copied ? "#86efac" : "#bfdbfe"}
      onClick={copyUrl}
    />
  );
}

// ── micro components ──────────────────────────────────────────────────────────
function IssueBadge({ issueType }) {
  const colors = {
    cloaking:       { bg: "#dbeafe", color: "#1e40af" },
    brand_phishing: { bg: "#fee2e2", color: "#991b1b" },
    death_phishing: { bg: "#fce7f3", color: "#9d174d" },
    stray_domain:   { bg: "#fef9c3", color: "#854d0e" },
  };
  const s = colors[issueType] || { bg: "#f1f5f9", color: "#334155" };
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {ISSUE_LABEL[issueType] || issueType}
    </span>
  );
}

function BrandPill({ brand }) {
  if (!brand) return <span style={{ color: "#94a3b8" }}>—</span>;
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600, background: brand.backgroundCss || "#e2e8f0", color: brand.textColor || "#1e293b" }}>
      {brand.brandName}
    </span>
  );
}

function AcceptedByDropdown({ acceptedBy, onUserClick }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const [hovered, setHovered] = useState(-1);

  const open = Boolean(pos);

  const openDropdown = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left });
  };

  const close = () => { setPos(null); setHovered(-1); };

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      close();
    };
    const onScroll = () => close();
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  if (!acceptedBy?.length) {
    return <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>None yet</span>;
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : openDropdown())}
        style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "12px", fontSize: "0.78rem", fontWeight: 600, background: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0", cursor: "pointer", whiteSpace: "nowrap" }}
      >
        {acceptedBy.length} accepted
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07)", minWidth: "240px", overflow: "hidden" }}
        >
          <div style={{ padding: "8px 14px", fontSize: "0.71rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
            Accepted By — click to view details
          </div>
          {acceptedBy.map((entry, i) => {
            const done = entry.evidenceSubmitted;
            return (
              <div
                key={i}
                title={entry.userId?.email}
                onClick={() => { close(); onUserClick?.(entry); }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(-1)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", gap: "12px", borderBottom: i < acceptedBy.length - 1 ? "1px solid #f1f5f9" : "none", cursor: onUserClick ? "pointer" : "default", background: hovered === i ? "#f0f9ff" : "transparent", transition: "background 0.12s" }}
              >
                <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                  {entry.userId?.fullName || "—"}
                </span>
                <span style={{ flexShrink: 0, padding: "3px 9px", borderRadius: "10px", fontSize: "0.72rem", fontWeight: 600, background: done ? "#dcfce7" : "#fef9c3", color: done ? "#166534" : "#854d0e" }}>
                  {done ? "✓ Done" : "Pending"}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

// ── shared modal shell styles ─────────────────────────────────────────────────
const modalCard = {
  background: "#fff",
  borderRadius: "16px",
  boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
  overflow: "hidden",
  width: "100%",
  maxWidth: "520px",
};
const modalHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "20px 24px",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
};
const modalTitle = { margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0f172a" };
const modalBody  = { padding: "24px", display: "grid", gap: "16px" };
const modalFooter = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  padding: "16px 24px",
  borderTop: "1px solid #e2e8f0",
  background: "#f8fafc",
};
const fieldWrap  = { display: "grid", gap: "6px" };
const fieldGrid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
const labelStyle = { fontSize: "0.82rem", fontWeight: 600, color: "#374151" };
const inputStyle = {
  width: "100%", padding: "10px 13px", border: "1.5px solid #d1d5db",
  borderRadius: "9px", fontSize: "0.9rem", color: "#111827",
  background: "#fff", outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};
const closeBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: "32px", height: "32px", borderRadius: "8px", border: "none",
  background: "rgba(0,0,0,0.06)", color: "#64748b", cursor: "pointer",
  fontSize: "1rem", lineHeight: 1, flexShrink: 0,
};
const errStyle = { margin: 0, fontSize: "0.82rem", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "8px 12px" };
const btnPrimary = {
  padding: "10px 20px", borderRadius: "9px", border: "none",
  background: "linear-gradient(90deg,#1e40af,#2563eb)", color: "#fff",
  fontWeight: 600, fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit",
};
const btnSecondary = {
  padding: "10px 20px", borderRadius: "9px", border: "1.5px solid #d1d5db",
  background: "#fff", color: "#374151",
  fontWeight: 600, fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit",
};
const btnDanger = { ...btnPrimary, background: "linear-gradient(90deg,#b91c1c,#ef4444)" };

// ── Add Task Modal ────────────────────────────────────────────────────────────
function AddTaskModal({ brands, onClose, onSave, busy }) {
  const [form, setForm] = useState({ brandId: "", url: "", rank: "", issueType: "", ddosRequired: false });
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try { await onSave({ ...form, rank: Number(form.rank) }); }
    catch (err) { setError(err.response?.data?.message || "Failed to create task."); }
  };

  return (
    <div className="management-modal-backdrop is-centered" onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div style={modalHeader}>
          <div>
            <h3 style={modalTitle}>Add Reporting Task</h3>
            <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#64748b" }}>Fill in the details below to create a new task.</p>
          </div>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit}>
          <div style={modalBody}>
            {/* Brand */}
            <div style={fieldWrap}>
              <label htmlFor="rt-brand" style={labelStyle}>Brand <span style={{ color: "#ef4444" }}>*</span></label>
              <select id="rt-brand" style={inputStyle} value={form.brandId} onChange={(e) => set("brandId", e.target.value)} required>
                <option value="">Select a brand</option>
                {brands.map((b) => <option key={b._id} value={b._id}>{b.brandName}</option>)}
              </select>
            </div>

            {/* URL */}
            <div style={fieldWrap}>
              <label htmlFor="rt-url" style={labelStyle}>URL <span style={{ color: "#ef4444" }}>*</span></label>
              <input id="rt-url" style={inputStyle} type="url" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com" required />
            </div>

            {/* Rank + Issue Type */}
            <div style={fieldGrid2}>
              <div style={fieldWrap}>
                <label htmlFor="rt-rank" style={labelStyle}>Rank <span style={{ color: "#ef4444" }}>*</span></label>
                <input id="rt-rank" style={inputStyle} type="number" min="1" value={form.rank} onChange={(e) => set("rank", e.target.value)} placeholder="e.g. 1" required />
              </div>
              <div style={fieldWrap}>
                <label htmlFor="rt-issue" style={labelStyle}>Issue Type <span style={{ color: "#ef4444" }}>*</span></label>
                <select id="rt-issue" style={inputStyle} value={form.issueType} onChange={(e) => set("issueType", e.target.value)} required>
                  <option value="">Select issue type</option>
                  {ISSUE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* DDoS toggle */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid", borderColor: form.ddosRequired ? "#bfdbfe" : "#e5e7eb", background: form.ddosRequired ? "#eff6ff" : "#f9fafb", transition: "all 0.15s" }}>
              <input
                type="checkbox"
                checked={form.ddosRequired}
                onChange={(e) => set("ddosRequired", e.target.checked)}
                style={{ marginTop: "2px", accentColor: "#2563eb", width: "16px", height: "16px", flexShrink: 0, cursor: "pointer" }}
              />
              <div>
                <span style={{ display: "block", fontSize: "0.88rem", fontWeight: 700, color: "#1e293b" }}>DDoS Required</span>
                <span style={{ display: "block", fontSize: "0.78rem", color: "#64748b", marginTop: "2px" }}>Staff must also submit DDoS screenshots as separate evidence for this task.</span>
              </div>
            </label>

            {error ? <p style={errStyle}>{error}</p> : null}
          </div>

          {/* footer */}
          <div style={modalFooter}>
            <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" style={{ ...btnPrimary, opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer" }} disabled={busy}>
              {busy ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Task Modal ───────────────────────────────────────────────────────────
function EditTaskModal({ task, brands, onClose, onSave, busy }) {
  const [form, setForm] = useState({
    brandId:     String(task.brandId?._id || task.brandId || ""),
    url:         task.url || "",
    rank:        String(task.rank || ""),
    issueType:   task.issueType || "",
    ddosRequired: Boolean(task.ddosRequired),
  });
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try { await onSave(String(task._id), { ...form, rank: Number(form.rank) }); }
    catch (err) { setError(err.response?.data?.message || "Failed to update task."); }
  };

  return (
    <div className="management-modal-backdrop is-centered" onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div style={{ ...modalHeader, background: "#f0f9ff" }}>
          <div>
            <h3 style={modalTitle}>Edit Reporting Task</h3>
            <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#64748b" }}>Update the details for this task.</p>
          </div>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit}>
          <div style={modalBody}>
            {/* Brand */}
            <div style={fieldWrap}>
              <label htmlFor="et-brand" style={labelStyle}>Brand <span style={{ color: "#ef4444" }}>*</span></label>
              <select id="et-brand" style={inputStyle} value={form.brandId} onChange={(e) => set("brandId", e.target.value)} required>
                <option value="">Select a brand</option>
                {brands.map((b) => <option key={b._id} value={b._id}>{b.brandName}</option>)}
              </select>
            </div>

            {/* URL */}
            <div style={fieldWrap}>
              <label htmlFor="et-url" style={labelStyle}>URL <span style={{ color: "#ef4444" }}>*</span></label>
              <input id="et-url" style={inputStyle} type="url" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com" required />
            </div>

            {/* Rank + Issue Type */}
            <div style={fieldGrid2}>
              <div style={fieldWrap}>
                <label htmlFor="et-rank" style={labelStyle}>Rank <span style={{ color: "#ef4444" }}>*</span></label>
                <input id="et-rank" style={inputStyle} type="number" min="1" value={form.rank} onChange={(e) => set("rank", e.target.value)} placeholder="e.g. 1" required />
              </div>
              <div style={fieldWrap}>
                <label htmlFor="et-issue" style={labelStyle}>Issue Type <span style={{ color: "#ef4444" }}>*</span></label>
                <select id="et-issue" style={inputStyle} value={form.issueType} onChange={(e) => set("issueType", e.target.value)} required>
                  <option value="">Select issue type</option>
                  {ISSUE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* DDoS toggle */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid", borderColor: form.ddosRequired ? "#bfdbfe" : "#e5e7eb", background: form.ddosRequired ? "#eff6ff" : "#f9fafb", transition: "all 0.15s" }}>
              <input
                type="checkbox"
                checked={form.ddosRequired}
                onChange={(e) => set("ddosRequired", e.target.checked)}
                style={{ marginTop: "2px", accentColor: "#2563eb", width: "16px", height: "16px", flexShrink: 0, cursor: "pointer" }}
              />
              <div>
                <span style={{ display: "block", fontSize: "0.88rem", fontWeight: 700, color: "#1e293b" }}>DDoS Required</span>
                <span style={{ display: "block", fontSize: "0.78rem", color: "#64748b", marginTop: "2px" }}>Staff must also submit DDoS screenshots as separate evidence for this task.</span>
              </div>
            </label>

            {error ? <p style={errStyle}>{error}</p> : null}
          </div>

          {/* footer */}
          <div style={modalFooter}>
            <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" style={{ ...btnPrimary, background: "linear-gradient(90deg,#0369a1,#0ea5e9)", opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer" }} disabled={busy}>
              {busy ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Evidence Modal (drag-and-drop) ────────────────────────────────────────────
function EvidenceModal({ task, onClose, onSubmit, busy, mode = "evidence", initialImages = [], initialNote = "" }) {
  const isDdos    = mode === "ddos";
  const isEditing = initialImages.length > 0;

  const [images, setImages] = useState(() =>
    initialImages.map((img) => ({
      ...img,
      previewUrl: getEvidenceImageSrc(img),
      isExisting: true,
    }))
  );
  const [note, setNote]         = useState(initialNote);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [formError, setFormError] = useState("");
  const fileInputRef = useRef(null);
  const previewUrls  = useRef({});

  useEffect(() => {
    return () => {
      Object.values(previewUrls.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const processFiles = useCallback(async (fileList) => {
    setFileError("");
    const incoming = Array.from(fileList).filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type));
    const rejected = Array.from(fileList).filter((f) => !ACCEPTED_IMAGE_TYPES.includes(f.type));
    if (rejected.length) setFileError(`Only PNG, JPG and JPEG files are accepted. ${rejected.length} file(s) skipped.`);
    const remaining = MAX_IMAGES - images.length;
    const toProcess = incoming.slice(0, remaining);
    if (incoming.length > remaining) setFileError(`Maximum ${MAX_IMAGES} images allowed. Some files were skipped.`);
    const newImages = [];
    for (const file of toProcess) {
      if (file.size > MAX_IMAGE_BYTES) { setFileError(`"${file.name}" exceeds the 5 MB limit and was skipped.`); continue; }
      const id = `${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current[id] = previewUrl;
      newImages.push({ id, name: file.name, contentType: file.type, size: file.size, file, previewUrl });
    }
    setImages((prev) => [...prev, ...newImages]);
  }, [images.length]);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files);
  }, [processFiles]);
  const handleDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  const removeImage = (id) => {
    if (previewUrls.current[id]) {
      URL.revokeObjectURL(previewUrls.current[id]);
      delete previewUrls.current[id];
    }
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (images.length === 0) { setFormError("Please add at least one image as evidence."); return; }
    try {
      const formData = new FormData();
      formData.append(isDdos ? "ddosNote" : "evidenceNote", note);
      formData.append(
        "existingImages",
        JSON.stringify(
          images
            .filter((image) => image.isExisting)
            .map(({ id, name, contentType, size, contentBase64, url, key, bucket, storageProvider, uploadedAt }) => ({
              id,
              name,
              contentType,
              size,
              contentBase64,
              url,
              key,
              bucket,
              storageProvider,
              uploadedAt,
            }))
        )
      );
      images
        .filter((image) => image.file)
        .forEach((image) => formData.append("images", image.file, image.name));

      await onSubmit(task._id, formData);
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to submit evidence.");
    }
  };

  return (
    <div className="management-modal-backdrop is-centered" onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: "580px" }} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div style={{ ...modalHeader, background: isDdos ? "#fdf2f8" : "#f8fafc", borderBottomColor: isDdos ? "#f9a8d4" : "#e2e8f0" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ ...modalTitle, color: isDdos ? "#9d174d" : "#0f172a" }}>
              {isDdos
                ? (isEditing ? "Edit DDoS Evidence" : "Submit DDoS Evidence")
                : (isEditing ? "Edit Evidence" : "Submit Evidence")}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px", flexWrap: "wrap" }}>
              <BrandPill brand={task.brandId} />
              <div style={{ ...urlCellStyle, flex: "1 1 220px", maxWidth: "320px" }}>
                <a href={task.url} target="_blank" rel="noreferrer"
                  style={{ ...urlLinkStyle, fontSize: "0.78rem" }}
                  title={task.url}>{task.url}</a>
                <CopyUrlButton url={task.url} />
              </div>
            </div>
          </div>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={modalBody}>
            {/* Drop zone */}
            <div
              onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? "#2563eb" : "#cbd5e1"}`,
                borderRadius: "12px", padding: "28px 20px", textAlign: "center",
                cursor: "pointer", background: dragging ? "#eff6ff" : "#f8fafc",
                transition: "border-color 0.15s, background 0.15s", userSelect: "none",
              }}
            >
              <div style={{ fontSize: "2.2rem", marginBottom: "8px" }}>🖼️</div>
              <p style={{ margin: 0, fontWeight: 700, color: "#1e293b", fontSize: "0.92rem" }}>
                {dragging ? "Drop images here" : "Drag & drop images here"}
              </p>
              <p style={{ margin: "5px 0 0", color: "#94a3b8", fontSize: "0.78rem" }}>
                or click to browse · PNG, JPG, JPEG · max 5 MB each · up to {MAX_IMAGES} images
              </p>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" multiple style={{ display: "none" }}
                onChange={(e) => { processFiles(e.target.files); e.target.value = ""; }} />
            </div>

            {fileError ? <p style={{ ...errStyle, background: "#fff7ed", borderColor: "#fed7aa", color: "#c2410c" }}>{fileError}</p> : null}

            {/* Previews */}
            {images.length > 0 ? (
              <div>
                <p style={{ margin: "0 0 10px", fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>
                  {images.length} image{images.length > 1 ? "s" : ""} selected
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "10px" }}>
                  {images.map((img) => (
                    <div key={img.id} style={{ position: "relative", borderRadius: "10px", overflow: "hidden", border: "1.5px solid #e2e8f0", background: "#f8fafc", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                      <img src={img.previewUrl} alt={img.name} style={{ width: "100%", height: "80px", objectFit: "cover", display: "block" }} />
                      <div style={{ padding: "5px 7px 2px", fontSize: "0.68rem", color: "#475569", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{img.name}</div>
                      <div style={{ padding: "0 7px 5px", fontSize: "0.65rem", color: "#94a3b8" }}>{formatBytes(img.size)}</div>
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                        style={{ position: "absolute", top: "5px", right: "5px", width: "22px", height: "22px", borderRadius: "50%", background: "#ef4444", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.72rem", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                        aria-label={`Remove ${img.name}`}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Notes */}
            <div style={fieldWrap}>
              <label htmlFor="ev-note" style={labelStyle}>{isDdos ? "DDoS Notes" : "Evidence Notes"} <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span></label>
              <textarea id="ev-note" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Describe the evidence you are submitting..." rows={3}
                style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }} />
            </div>

            {formError ? <p style={errStyle}>{formError}</p> : null}
          </div>

          <div style={modalFooter}>
            <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit"
              style={{ ...btnPrimary, opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer", background: isDdos ? "linear-gradient(90deg,#9d174d,#db2777)" : btnPrimary.background }}
              disabled={busy}>
              {busy ? "Submitting…" : `${isEditing ? "Save" : isDdos ? "Submit DDoS Evidence" : "Submit Evidence"}${images.length ? ` (${images.length})` : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Track Modal ───────────────────────────────────────────────────────────────
// ── Mini donut chart (SVG) ────────────────────────────────────────────────────
function MiniDonut({ done, total, color = "#22c55e", size = 44 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = total === 0 ? 0 : Math.min(done / total, 1);
  const dash  = pct * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
      {pct > 0 && (
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      )}
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fontSize={size < 44 ? "8" : "9"} fontWeight="700" fill="#374151">
        {`${Math.round(pct * 100)}%`}
      </text>
    </svg>
  );
}

// ── Stat card strip ───────────────────────────────────────────────────────────
function StatStrip({ stats }) {
  return (
    <div style={{ display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap" }}>
      {stats.map((s) => (
        <div key={s.label} style={{ flex: "1 1 0", minWidth: "90px", padding: "12px 16px", borderRadius: "10px", background: s.bg || "#f8fafc", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: s.color || "#0f172a", lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px", fontWeight: 500 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Tools & Guide Drawer ──────────────────────────────────────────────────────
function ToolsGuideDrawer({ open, onClose }) {
  const { copy } = useReportingUiCopy();
  const [workflows,   setWorkflows]   = useState([]);
  const [activeTab,   setActiveTab]   = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getReportingWorkflowsApi()
      .then((res) => {
        const list = res.data || [];
        setWorkflows(list);
        if (list.length && !activeTab) setActiveTab(list[0].issueType);
      })
      .catch(() => setWorkflows([]))
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = workflows.find((w) => w.issueType === activeTab) || workflows[0] || null;

  return (
    <>
      {/* backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.18)", zIndex: 1100 }}
        />
      )}

      {/* drawer panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100vh", width: "520px", maxWidth: "95vw",
        background: "#fff", boxShadow: "-8px 0 40px rgba(0,0,0,0.14)",
        display: "flex", flexDirection: "column", zIndex: 1101,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
      }}>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "8px", background: "#dbeafe" }}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 1.5a6 6 0 100 12 6 6 0 000-12zm0 2.5v3.5l2.5 1.5" stroke="#1e40af" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="7.5" cy="5.5" r="0.75" fill="#1e40af"/>
                <path d="M7.5 7.5v3" stroke="#1e40af" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>Tools &amp; Guide</h3>
            </div>
          </div>
          <button type="button" onClick={onClose}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "8px", border: "none", background: "rgba(0,0,0,0.06)", color: "#64748b", cursor: "pointer", fontSize: "1rem" }}>
            ✕
          </button>
        </div>

        {/* workflow tabs */}
        {!loading && workflows.length > 0 && (
          <div style={{ display: "flex", gap: "4px", padding: "10px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", flexWrap: "wrap", flexShrink: 0 }}>
            {workflows.map((w) => (
              <button key={w.issueType} type="button"
                onClick={() => setActiveTab(w.issueType)}
                style={{ padding: "6px 14px", borderRadius: "8px", border: "none", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", transition: "background 0.15s, color 0.15s", background: activeTab === w.issueType ? "#1e40af" : "#e2e8f0", color: activeTab === w.issueType ? "#fff" : "#475569" }}>
                {w.title}
              </button>
            ))}
          </div>
        )}

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {loading ? (
            <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", margin: "40px 0" }}>Loading guide…</p>
          ) : !active ? (
            <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", margin: "40px 0" }}>No workflows configured.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* SOP card */}
              <div style={{ borderRadius: "12px", border: "2px solid #dbeafe", background: "#fff", overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #e0f2fe", background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>{active.title}</h4>
                  {active.badge && (
                    <span style={{ padding: "2px 10px", borderRadius: "10px", fontSize: "0.72rem", fontWeight: 700, background: "#dbeafe", color: "#1e40af" }}>{active.badge}</span>
                  )}
                </div>
                <div style={{ padding: "14px 16px" }}>
                  {active.note && (
                    <div style={{ marginBottom: "10px", padding: "8px 12px", borderRadius: "8px", background: "#fef9c3", border: "1px solid #fde68a", fontSize: "0.8rem", color: "#854d0e" }}>{active.note}</div>
                  )}
                  {active.summary && (
                    <p style={{ margin: "0 0 12px", fontSize: "0.83rem", color: "#475569" }}>{active.summary}</p>
                  )}
                  {active.steps?.length > 0 && (
                    <>
                      <div style={{ marginBottom: "10px", fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        {active.label || "Standard Operating Procedure"}
                      </div>
                      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                        {active.steps.map((step, i) => (
                          <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                            <span style={{ flexShrink: 0, width: "22px", height: "22px", borderRadius: "50%", background: "#1e293b", color: "#fff", fontSize: "0.68rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                            <span style={{ fontSize: "0.84rem", color: "#1e293b", paddingTop: "2px" }}>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                  {active.links?.length > 0 && (
                    <div style={{ marginTop: "14px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {active.links.map((link) => (
                        <a key={link.label} href={link.href} target="_blank" rel="noreferrer"
                          style={{ padding: "6px 14px", borderRadius: "8px", border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontSize: "0.8rem", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                          {link.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Investigation Toolkit */}
              {copy?.page?.toolkitLinks?.length > 0 && (
                <div style={{ borderRadius: "12px", border: "1.5px solid #e2e8f0", background: "#fff", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                    <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}>{copy.page.toolkitTitle || "Investigation Toolkit"}</h4>
                    {copy.page.toolkitDescription && (
                      <p style={{ margin: "3px 0 0", fontSize: "0.75rem", color: "#64748b" }}>{copy.page.toolkitDescription}</p>
                    )}
                  </div>
                  <div style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {copy.page.toolkitLinks.map((link) => (
                      <a key={link.label} href={link.href} target="_blank" rel="noreferrer"
                        style={{ padding: "8px 16px", borderRadius: "10px", border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#1d4ed8", fontSize: "0.82rem", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", transition: "background 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#bfdbfe"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#e2e8f0"; }}>
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── DDoS Modal ────────────────────────────────────────────────────────────────
function DdosModal({ onClose, canReceive, canDdos, userId, onOpenEvidence, onOpenDdos }) {
  const [allTasks,             setAllTasks]             = useState([]);
  const [loading,              setLoading]              = useState(true);
  const [expandedDdosUrl,      setExpandedDdosUrl]      = useState(null);
  const [expandedDdosEvidence, setExpandedDdosEvidence] = useState(null); // { taskId, userId, type }
  const [lightbox,             setLightbox]             = useState(null);

  useEffect(() => {
    setLoading(true);
    getReportingTasksApi() // no date param → fetch all tasks across all time
      .then((res) => setAllTasks(res.data || []))
      .catch(() => setAllTasks([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight" && lightbox.idx < lightbox.images.length - 1)
        setLightbox((lb) => ({ ...lb, idx: lb.idx + 1 }));
      if (e.key === "ArrowLeft" && lightbox.idx > 0)
        setLightbox((lb) => ({ ...lb, idx: lb.idx - 1 }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  // Compute: first occurrence of each URL → regular; every duplicate → DDoS section
  const urlFirstId = {};
  [...allTasks]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach((t) => { if (!urlFirstId[t.url]) urlFirstId[t.url] = String(t._id); });

  const DDOS_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

  const ddosTasksByUrl = {};
  allTasks
    .filter((t) => String(t._id) !== urlFirstId[t.url])
    .forEach((task) => {
      if (!ddosTasksByUrl[task.url]) ddosTasksByUrl[task.url] = [];
      ddosTasksByUrl[task.url].push(task);
    });

  // Only show URL groups where the latest duplicate was added within the last 48 hours
  const ddosRows = Object.entries(ddosTasksByUrl).filter(([, urlTasks]) => {
    const latestCreated = new Date(urlTasks[0].createdAt).getTime();
    return Date.now() - latestCreated < DDOS_WINDOW_MS;
  });

  const getDdosMinsLeft = (createdAt) => {
    const remaining = DDOS_WINDOW_MS - (Date.now() - new Date(createdAt).getTime());
    return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
  };

  const formatDdosTimeLeft = (mins) => {
    if (mins <= 0) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  };

  const getMyEntry = (task) =>
    task.acceptedBy?.find((e) => String(e.userId?._id || e.userId) === userId);

  return (
    <div className="management-modal-backdrop is-centered" onClick={onClose}>

      {/* Lightbox — outside modal card so overflow:hidden + border-radius cannot clip it */}
      {lightbox && (() => {
        const { images, idx } = lightbox;
        const img = images[idx];
        return (
          <div onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 99999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", top: "18px", right: "22px", display: "flex", gap: "8px" }}>
              <a href={getEvidenceImageDownloadSrc(img)} download={img.name}
                onClick={(e) => e.stopPropagation()} title="Download"
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff", width: "38px", height: "38px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v8M5 7l3 3 3-3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 13h10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </a>
              <button type="button" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: "38px", height: "38px", borderRadius: "50%", fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {idx > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); setLightbox((lb) => ({ ...lb, idx: lb.idx - 1 })); }}
                style={{ position: "absolute", left: "16px", background: "rgba(255,255,255,0.22)", border: "none", color: "#fff", borderRadius: "50%", width: "44px", height: "44px", fontSize: "1.5rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>}
              <img src={getEvidenceImageSrc(img)} alt={img.name}
                style={{ maxWidth: "80vw", maxHeight: "78vh", objectFit: "contain", borderRadius: "10px", boxShadow: "0 12px 48px rgba(0,0,0,0.5)" }} />
              {idx < images.length - 1 && <button type="button" onClick={(e) => { e.stopPropagation(); setLightbox((lb) => ({ ...lb, idx: lb.idx + 1 })); }}
                style={{ position: "absolute", right: "16px", background: "rgba(255,255,255,0.22)", border: "none", color: "#fff", borderRadius: "50%", width: "44px", height: "44px", fontSize: "1.5rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>}
            </div>
            <div style={{ marginTop: "14px", textAlign: "center" }}>
              <span style={{ color: "#e2e8f0", fontSize: "0.82rem", fontWeight: 600 }}>{img.name}</span>
              <span style={{ color: "#94a3b8", fontSize: "0.78rem", marginLeft: "10px" }}>{idx + 1} / {images.length}</span>
            </div>
          </div>
        );
      })()}

      <div style={{ ...modalCard, maxWidth: "960px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ ...modalHeader, flexShrink: 0 }}>
          <div>
            <h3 style={modalTitle}>DDoS URLs</h3>
          </div>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {loading ? (
            <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", margin: "32px 0" }}>Loading...</p>
          ) : ddosRows.length === 0 ? (
            <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", margin: "32px 0" }}>No duplicate URLs found.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ ...tableStyle, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "auto" }} />
                  <col style={{ width: "72px" }} />
                  <col style={{ width: "60px" }} />
                  <col style={{ width: "96px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "110px" }} />
                  {canDdos ? <col style={{ width: "120px" }} /> : null}
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                    <th style={thStyle}>URL</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Times</th>
                    <th style={thStyle}>Rank</th>
                    <th style={thStyle}>Expires In</th>
                    <th style={thStyle}>Evidence</th>
                    <th style={thStyle}>Report Again</th>
                    {canDdos ? <th style={thStyle}>DDoS Evidence</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {ddosRows.map(([url, urlTasks]) => {
                    const latest     = urlTasks[0];
                    const timesReq    = urlTasks.length;
                    const isExpanded  = expandedDdosUrl === url;
                    const allAccepted = urlTasks.flatMap((t) => t.acceptedBy || []);
                    const totalEvDone = allAccepted.filter((e) => e.evidenceSubmitted).length;
                    const totalAcc    = allAccepted.length;
                    const totalImgs   = allAccepted.reduce((s, e) => s + (e.images || []).length, 0);
                    const ddosDone    = allAccepted.filter((e) => e.ddosEvidenceSubmitted).length;

                    // Unique users across all task instances for this URL
                    const uniqueUserIds = new Set(
                      allAccepted.map((e) => String(e.userId?._id || e.userId || "")).filter(Boolean)
                    );
                    const uniqueUsers  = uniqueUserIds.size;
                    // Each unique user must submit DDoS evidence once per request (timesReq times)
                    const ddosRequired = timesReq * uniqueUsers;
                    const ddosAllDone  = ddosRequired > 0 && ddosDone >= ddosRequired;

                    return (
                      <React.Fragment key={url}>
                        <tr style={{ borderBottom: isExpanded ? "none" : "1px solid #f1f5f9", background: isExpanded ? "#fff7f7" : "transparent" }}>
                          <td style={{ ...tdStyle, overflow: "hidden" }}>
                            <div style={urlCellStyle}>
                              <a href={url} target="_blank" rel="noreferrer"
                                style={urlLinkStyle}
                                title={url}>{url}</a>
                              <CopyUrlButton url={url} />
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "50%", fontSize: "0.78rem", fontWeight: 800, background: timesReq > 1 ? "#fff1f2" : "#f8fafc", color: timesReq > 1 ? "#be123c" : "#64748b", border: `1.5px solid ${timesReq > 1 ? "#fecdd3" : "#e2e8f0"}` }}>
                              {timesReq}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>#{latest.rank}</td>

                          {/* Expires In */}
                          {(() => {
                            const minsLeft = getDdosMinsLeft(latest.createdAt);
                            const timeStr  = formatDdosTimeLeft(minsLeft);
                            const urgent   = minsLeft > 0 && minsLeft <= 120; // ≤ 2h left
                            return (
                              <td style={tdStyle}>
                                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: urgent ? "#b45309" : "#64748b", background: urgent ? "#fef3c7" : "#f8fafc", padding: "2px 8px", borderRadius: "8px", whiteSpace: "nowrap" }}>
                                  {timeStr ? `⏳ ${timeStr}` : "Expired"}
                                </span>
                              </td>
                            );
                          })()}

                          <td style={tdStyle}>
                            <button type="button"
                              onClick={() => { setExpandedDdosUrl((p) => p === url ? null : url); setExpandedDdosEvidence(null); }}
                              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "12px", fontSize: "0.78rem", fontWeight: 600, background: isExpanded ? "#fce7f3" : "#f1f5f9", color: isExpanded ? "#9d174d" : totalAcc === 0 ? "#94a3b8" : "#334155", border: `1px solid ${isExpanded ? "#f9a8d4" : "#e2e8f0"}`, cursor: "pointer", whiteSpace: "nowrap" }}>
                              {totalAcc === 0 ? "View requests" : `${totalAcc} evidence`}
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </td>
                          <td style={tdStyle}>
                            {totalEvDone > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#16a34a", background: "#dcfce7", padding: "2px 8px", borderRadius: "8px", display: "inline-block" }}>
                                  ✓ {totalEvDone} reported
                                </span>
                                {totalImgs > 0 && <span style={{ fontSize: "0.68rem", color: "#64748b" }}>{totalImgs} img{totalImgs !== 1 ? "s" : ""} uploaded</span>}
                              </div>
                            ) : <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>No reports yet</span>}
                          </td>
                          {canDdos ? (
                            <td style={tdStyle}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <span style={{ fontWeight: 700, fontSize: "0.82rem", color: ddosAllDone ? "#be123c" : ddosDone > 0 ? "#9d174d" : "#94a3b8" }}>
                                  {ddosDone}<span style={{ color: "#cbd5e1", fontWeight: 400 }}>/{ddosRequired}</span>
                                </span>
                                {uniqueUsers > 0 && (
                                  <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>
                                    {uniqueUsers} user{uniqueUsers !== 1 ? "s" : ""} × {timesReq}
                                  </span>
                                )}
                              </div>
                            </td>
                          ) : null}
                        </tr>

                        {isExpanded && (
                          <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td colSpan={canDdos ? 7 : 6} style={{ padding: 0 }}>
                              <div style={{ background: "#fff7f7", borderLeft: "3px solid #f43f5e", padding: "12px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                                {urlTasks.map((task, reqIdx) => {
                                  const taskId   = String(task._id);
                                  const reqLabel = `Request ${timesReq - reqIdx}`;
                                  const reqDate  = new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                                  const reqTime  = new Date(task.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
                                  const myEnt    = getMyEntry(task);

                                  return (
                                    <div key={taskId} style={{ borderRadius: "8px", border: "1px solid #fecdd3", background: "#fff", overflow: "hidden" }}>
                                      {/* Request header */}
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "#fff1f2", borderBottom: "1px solid #fecdd3", flexWrap: "wrap", gap: "8px" }}>
                                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#9f1239" }}>
                                          {reqLabel} — {reqDate}
                                          <span style={{ fontWeight: 500, color: "#be123c", marginLeft: "6px" }}>{reqTime}</span>
                                          <span style={{ fontWeight: 600, color: "#9f1239", marginLeft: "8px", opacity: 0.7 }}>· #{task.rank}</span>
                                        </span>
                                        {(canReceive || canDdos) && (
                                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                            {canReceive && (() => {
                                              const submitted = myEnt?.evidenceSubmitted;
                                              const mins = getEditMinsLeft(myEnt?.submittedAt);
                                              if (submitted && mins > 0) return (
                                                <button type="button" style={{ ...evBtn("blue"), fontSize: "0.71rem" }}
                                                  onClick={() => onOpenEvidence(task, { images: myEnt?.images || [], note: myEnt?.evidenceNote || "" })}>
                                                  Edit Evidence
                                                </button>
                                              );
                                              if (submitted) return <span style={{ fontSize: "0.71rem", color: "#16a34a", fontWeight: 600 }}>✓ Evidence done</span>;
                                              return (
                                                <button type="button" style={{ ...evBtn("blue"), fontSize: "0.71rem" }}
                                                  onClick={() => onOpenEvidence(task, null)}>
                                                  + Submit Evidence
                                                </button>
                                              );
                                            })()}
                                            {canDdos && (() => {
                                              const submitted = myEnt?.ddosEvidenceSubmitted;
                                              const mins = getEditMinsLeft(myEnt?.ddosSubmittedAt);
                                              if (submitted && mins > 0) return (
                                                <button type="button" style={{ ...evBtn("pink"), fontSize: "0.71rem" }}
                                                  onClick={() => onOpenDdos(task, { images: myEnt?.ddosImages || [], note: myEnt?.ddosNote || "" })}>
                                                  Edit DDoS
                                                </button>
                                              );
                                              if (submitted) return <span style={{ fontSize: "0.71rem", color: "#be123c", fontWeight: 600 }}>✓ DDoS done</span>;
                                              return (
                                                <button type="button" style={{ ...evBtn("pink"), fontSize: "0.71rem" }}
                                                  onClick={() => onOpenDdos(task, null)}>
                                                  + Submit DDoS
                                                </button>
                                              );
                                            })()}
                                          </div>
                                        )}
                                      </div>

                                      {/* User list */}
                                      {(task.acceptedBy || []).length === 0 ? (
                                        <p style={{ margin: 0, padding: "10px 14px", fontSize: "0.78rem", color: "#94a3b8" }}>No one has accepted this request yet.</p>
                                      ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 14px" }}>
                                          {task.acceptedBy.map((entry, i) => {
                                            const uid        = String(entry.userId?._id || entry.userId);
                                            const isEvOpen   = expandedDdosEvidence?.taskId === taskId && expandedDdosEvidence?.userId === uid && expandedDdosEvidence?.type === "evidence";
                                            const isDdosOpen = expandedDdosEvidence?.taskId === taskId && expandedDdosEvidence?.userId === uid && expandedDdosEvidence?.type === "ddos";

                                            const chipBtn = (type) => {
                                              const submitted = type === "evidence" ? entry.evidenceSubmitted : entry.ddosEvidenceSubmitted;
                                              const imgs      = type === "evidence" ? (entry.images || []) : (entry.ddosImages || []);
                                              const isActive  = type === "evidence" ? isEvOpen : isDdosOpen;
                                              return (
                                                <button type="button" disabled={!submitted}
                                                  onClick={() => setExpandedDdosEvidence((p) =>
                                                    (p?.taskId === taskId && p?.userId === uid && p?.type === type) ? null : { taskId, userId: uid, type }
                                                  )}
                                                  style={{ padding: "3px 10px", borderRadius: "10px", fontSize: "0.73rem", fontWeight: 700, border: isActive ? "2px solid #f43f5e" : "1.5px solid transparent", background: submitted ? (isActive ? "#fce7f3" : "#dcfce7") : "#f1f5f9", color: submitted ? (isActive ? "#9d174d" : "#166534") : "#94a3b8", cursor: submitted ? "pointer" : "default" }}>
                                                  {submitted ? `✓ Submitted${imgs.length ? ` (${imgs.length} img)` : ""}` : "Not submitted"}
                                                  {submitted && <span style={{ marginLeft: "4px", fontSize: "0.62rem" }}>{isActive ? "▲" : "▼"}</span>}
                                                </button>
                                              );
                                            };

                                            const openType    = isEvOpen ? "evidence" : isDdosOpen ? "ddos" : null;
                                            const galleryImgs = openType === "evidence" ? (entry.images || []) : (entry.ddosImages || []);
                                            const galleryNote = openType === "evidence" ? entry.evidenceNote : entry.ddosNote;

                                            return (
                                              <div key={uid || i} style={{ borderRadius: "8px", border: `1px solid ${openType ? "#f9a8d4" : "#e2e8f0"}`, overflow: "hidden", background: "#fff" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 14px", flexWrap: "wrap" }}>
                                                  <span style={{ fontWeight: 700, fontSize: "0.84rem", color: "#1e293b", minWidth: "110px" }}>{entry.userId?.fullName || "—"}</span>
                                                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                                      <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>Evidence:</span>
                                                      {chipBtn("evidence")}
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                                      <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>DDoS:</span>
                                                      {chipBtn("ddos")}
                                                    </div>
                                                  </div>
                                                </div>
                                                {openType && (
                                                  <div style={{ borderTop: "1px solid #fce7f3", background: "#fff7f7", padding: "12px 16px" }}>
                                                    {galleryNote && (
                                                      <p style={{ margin: "0 0 10px", fontSize: "0.78rem", color: "#475569", background: "#fff", padding: "7px 11px", borderRadius: "7px", border: "1px solid #e2e8f0" }}>
                                                        <strong style={{ color: "#334155" }}>Note: </strong>{galleryNote}
                                                      </p>
                                                    )}
                                                    {galleryImgs.length === 0 ? (
                                                      <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem" }}>No images uploaded.</p>
                                                    ) : (
                                                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                                        {galleryImgs.map((img, imgIdx) => (
                                                          <div key={imgIdx} onClick={() => setLightbox({ images: galleryImgs, idx: imgIdx })} title={img.name}
                                                            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", cursor: "zoom-in" }}>
                                                            <img src={getEvidenceImageSrc(img)} alt={img.name}
                                                              style={{ width: "100px", height: "80px", objectFit: "cover", borderRadius: "8px", border: "1.5px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", transition: "transform 0.15s, box-shadow 0.15s" }}
                                                              onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.18)"; }}
                                                              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
                                                            />
                                                            <span style={{ fontSize: "0.63rem", color: "#64748b", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name}</span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ ...modalFooter, flexShrink: 0 }}>
          <button type="button" style={btnSecondary} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Track Modal ───────────────────────────────────────────────────────────────
function TrackModal({ onClose }) {
  const [activeTab,    setActiveTab]    = useState("reporting-urls");
  const [staffList,    setStaffList]    = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateStr());
  const [modalTasks,   setModalTasks]   = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [lastRefresh,  setLastRefresh]  = useState(null);

  const fetchTasks = useCallback(async (date, silent = false) => {
    if (!silent) setLoadingTasks(true);
    else setRefreshing(true);
    try {
      const res = await getReportingTasksApi(date);
      setModalTasks(res.data || []);
      setLastRefresh(new Date());
    } catch (_) {
      // keep previous data on silent refresh failure
    } finally {
      setLoadingTasks(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchTasks(selectedDate);
  }, [fetchTasks, selectedDate]);

  // Auto-refresh every 30 seconds while modal is open
  useEffect(() => {
    const timer = setInterval(() => void fetchTasks(selectedDate, true), 30000);
    return () => clearInterval(timer);
  }, [fetchTasks, selectedDate]);

  useEffect(() => {
    getReportingTaskStaffApi()
      .then((res) => setStaffList(res.data || []))
      .catch(() => setStaffList([]));
  }, []);

  const today = toLocalDateStr();

  const tabBtn = (id, label) => (
    <button type="button" onClick={() => setActiveTab(id)}
      style={{ padding: "8px 20px", borderRadius: "8px", border: "none", fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", transition: "background 0.15s, color 0.15s", background: activeTab === id ? "#1e40af" : "transparent", color: activeTab === id ? "#fff" : "#64748b" }}>
      {label}
    </button>
  );

  return (
    <div className="management-modal-backdrop is-centered" onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: "900px", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div style={{ ...modalHeader, flexShrink: 0 }}>
          <div>
            <h3 style={modalTitle}>Track — Reporting Tasks</h3>
            <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#64748b" }}>Overview of URLs and IT team task completion.</p>
          </div>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* tab bar + date navigator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", flexShrink: 0, gap: "12px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {tabBtn("reporting-urls", "Reporting URLs")}
            {tabBtn("it-team", "IT Team")}
          </div>

          {/* date navigator — same split-card style as main page */}
          <div style={{ display: "flex", borderRadius: "8px", border: "1.5px solid #e2e8f0", overflow: "hidden", background: "#fff", flexShrink: 0 }}>
            {/* task count */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "0 12px", background: "#f8fafc", borderRight: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: "0.95rem", fontWeight: 800, color: "#1e293b" }}>
                {loadingTasks ? "—" : modalTasks.length}
              </strong>
              <span style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: 500 }}>
                {modalTasks.length === 1 ? "task" : "tasks"}
              </span>
            </div>
            {/* prev button */}
            <button type="button"
              onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
              style={{ padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", fontSize: "1rem", color: "#475569", lineHeight: 1 }}>
              ‹
            </button>
            {/* date label */}
            <span style={{ padding: "0 6px", fontSize: "0.8rem", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
              {formatDateLabel(selectedDate)}
            </span>
            {/* next button */}
            <button type="button"
              disabled={selectedDate >= today}
              onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
              style={{ padding: "6px 10px", border: "none", background: "transparent", cursor: selectedDate >= today ? "default" : "pointer", fontSize: "1rem", color: selectedDate >= today ? "#cbd5e1" : "#475569", lineHeight: 1 }}>
              ›
            </button>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {activeTab === "reporting-urls" ? (
            <ReportingUrlsTable tasks={modalTasks} staffList={staffList} />
          ) : (
            <ItTeamTable tasks={modalTasks} staffList={staffList} />
          )}
        </div>

        {/* footer */}
        <div style={{ ...modalFooter, flexShrink: 0, justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              onClick={() => void fetchTasks(selectedDate, true)}
              disabled={refreshing || loadingTasks}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "8px", border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#374151", fontSize: "0.8rem", fontWeight: 600, cursor: refreshing || loadingTasks ? "default" : "pointer", opacity: refreshing || loadingTasks ? 0.6 : 1, fontFamily: "inherit" }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ animation: refreshing ? "money-sites-screenshot-spin 0.8s linear infinite" : "none" }}>
                <path d="M11 6.5A4.5 4.5 0 112.5 4" stroke="#374151" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M2.5 1.5v2.5H5" stroke="#374151" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            {lastRefresh && (
              <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                Updated {lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
              </span>
            )}
          </div>
          <button type="button" style={btnSecondary} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ReportingUrlsTable({ tasks, staffList = null }) {
  const totalStaff = staffList?.length || new Set(
    tasks.flatMap((task) =>
      (task.acceptedBy || [])
        .map((entry) => String(entry.userId?._id || entry.userId || ""))
        .filter(Boolean)
      )
  ).size;
  const totalRequired = tasks.length * totalStaff;
  const totalEvDone = tasks.reduce(
    (sum, task) => sum + (task.acceptedBy?.filter((entry) => entry.evidenceSubmitted).length || 0),
    0
  );
  const fullyDone   = tasks.filter((t) => {
    const done = t.acceptedBy?.filter((e) => e.evidenceSubmitted).length || 0;
    return totalStaff > 0 && done >= totalStaff;
  }).length;

  return (
    <div>
      <StatStrip stats={[
        { label: "Total URLs",      value: tasks.length,  bg: "#f0f9ff", color: "#0369a1" },
        { label: "Total Staff",     value: totalStaff,    bg: "#f5f3ff", color: "#6d28d9" },
        { label: "Evidence Done",   value: `${totalEvDone}/${totalRequired}`, bg: "#fef9c3", color: "#854d0e" },
        { label: "Fully Complete",  value: fullyDone,     bg: "#f0fdf4", color: "#15803d" },
      ]} />

      {tasks.length === 0 ? (
        <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", margin: "32px 0" }}>No reporting tasks yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ ...tableStyle, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "36px" }} />
              <col style={{ width: "auto" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "60px" }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                <th style={thStyle}>#</th>
                <th style={thStyle}>URL</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Staff</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Done</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, idx) => {
                const done = task.acceptedBy?.filter((e) => e.evidenceSubmitted).length || 0;
                const allDone = totalStaff > 0 && done >= totalStaff;
                return (
                  <tr key={String(task._id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ ...tdStyle, color: "#94a3b8", fontSize: "0.78rem" }}>{idx + 1}</td>
                    <td style={{ ...tdStyle, overflow: "hidden" }}>
                      <div style={urlCellStyle}>
                        <a href={task.url} target="_blank" rel="noreferrer"
                          style={urlLinkStyle}
                          title={task.url}>{task.url}</a>
                        <CopyUrlButton url={task.url} />
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: "#6d28d9" }}>{totalStaff}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span style={{ fontWeight: 700, color: allDone ? "#16a34a" : done > 0 ? "#ca8a04" : "#94a3b8" }}>{done}</span>
                      <span style={{ color: "#cbd5e1", fontSize: "0.75rem" }}> / {totalStaff}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <MiniDonut done={done} total={totalStaff} color={allDone ? "#22c55e" : "#f59e0b"} size={40} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ItTeamTable({ tasks, staffList = null }) {
  const totalTasks = tasks.length;

  // Build per-member counts from every accepted evidence entry.
  const staffMap = {};
  tasks.forEach((task) => {
    (task.acceptedBy || []).forEach((entry) => {
      const uid = String(entry.userId?._id || entry.userId || "");
      if (!uid) return;
      if (!staffMap[uid]) {
        staffMap[uid] = { name: entry.userId?.fullName || "Unknown", tasksAccepted: 0, evidenceDone: 0 };
      }
      staffMap[uid].tasksAccepted++;
      if (entry.evidenceSubmitted)     staffMap[uid].evidenceDone++;
    });
  });

  // Merge with full staff list so members who haven't accepted any task still appear
  if (staffList) {
    staffList.forEach((s) => {
      const uid = String(s._id);
      if (!staffMap[uid]) {
        staffMap[uid] = { name: s.fullName || "Unknown", tasksAccepted: 0, evidenceDone: 0 };
      }
    });
  }

  const staff = Object.values(staffMap).sort((a, b) => b.evidenceDone - a.evidenceDone);

  const totalDone = staff.reduce((s, m) => s + m.evidenceDone, 0);
  const totalRequired = staff.length * totalTasks;

  return (
    <div>
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <StatStrip stats={[
            { label: "Team Members",  value: staff.length,  bg: "#f0f9ff", color: "#0369a1" },
            { label: "Total Tasks",   value: totalTasks,    bg: "#f8fafc", color: "#334155" },
            { label: "Evidence Done", value: `${totalDone}/${totalRequired}`, bg: "#f0fdf4", color: "#166534" },
          ]} />
        </div>
        {/* overall donut: total done vs max possible */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "12px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc", flexShrink: 0 }}>
          <MiniDonut done={totalDone} total={totalRequired || 1} color="#22c55e" size={64} />
          <span style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 600 }}>Overall</span>
        </div>
      </div>

      {staff.length === 0 ? (
        <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", margin: "32px 0" }}>No staff have submitted evidence yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ ...tableStyle, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "36px" }} />
              <col style={{ width: "auto" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "60px" }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Name</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Tasks</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Ev. Done</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member, idx) => {
                const allDone = totalTasks > 0 && member.evidenceDone >= totalTasks;
                const notStarted = member.evidenceDone === 0;
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9", opacity: notStarted ? 0.6 : 1 }}>
                    <td style={{ ...tdStyle, color: "#94a3b8", fontSize: "0.78rem" }}>{idx + 1}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: notStarted ? "#e2e8f0" : "linear-gradient(135deg,#1e40af,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: notStarted ? "#94a3b8" : "#fff" }}>
                            {member.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                          </span>
                        </div>
                        <span style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.name}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {totalTasks === 0 ? (
                        <span style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>—</span>
                      ) : (
                        <span style={{ fontWeight: 700, color: "#334155" }}>{totalTasks}</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {totalTasks === 0 ? (
                        <span style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>—</span>
                      ) : (
                        <>
                          <span style={{ fontWeight: 700, color: allDone ? "#16a34a" : member.evidenceDone > 0 ? "#ca8a04" : "#94a3b8" }}>
                            {member.evidenceDone}
                          </span>
                          <span style={{ color: "#cbd5e1", fontSize: "0.75rem" }}> / {totalTasks}</span>
                        </>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {totalTasks === 0 ? (
                        <span style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>—</span>
                      ) : (
                        <MiniDonut done={member.evidenceDone} total={totalTasks}
                          color={allDone ? "#22c55e" : "#f59e0b"} size={40} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Confirm Delete Modal ──────────────────────────────────────────────────────
function ConfirmDeleteModal({ task, onClose, onConfirm, busy }) {
  return (
    <div className="management-modal-backdrop is-centered" onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: "440px" }} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div style={{ ...modalHeader, background: "#fff5f5", borderBottomColor: "#fecaca" }}>
          <div>
            <h3 style={{ ...modalTitle, color: "#b91c1c" }}>Delete Task</h3>
            <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#ef4444" }}>This action cannot be undone.</p>
          </div>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* body */}
        <div style={{ padding: "24px" }}>
          <p style={{ margin: 0, color: "#374151", fontSize: "0.9rem", lineHeight: 1.55 }}>
            Are you sure you want to delete the task for{" "}
            <strong style={{ color: "#0f172a", wordBreak: "break-all" }}>{task.url}</strong>?
          </p>
        </div>

        {/* footer */}
        <div style={modalFooter}>
          <button type="button" style={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="button" style={{ ...btnDanger, opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer" }} onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete Task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ReportingTasksPage() {
  const { user } = useAuth();

  const canAdd     = hasPrivilege(user, "ADD_REPORTING_TASKS");
  const canRead    = hasPrivilege(user, "READ_REPORTING_TASKS") || canAdd || hasPrivilege(user, "RECEIVE_REPORTING_TASKS");
  const canReceive = hasPrivilege(user, "RECEIVE_REPORTING_TASKS");
  const canDdos    = hasPrivilege(user, "DO_DDOS_REPORTING_TASKS") || canAdd;
  const canTrack   = hasPrivilege(user, "TRACK_REPORTING_TASKS");

  const isAdmin = hasAdminAccess(user);

  const hasAccess = canAdd || canRead || canReceive || canDdos || canTrack || isAdmin;

  const [tasks,      setTasks]      = useState([]);
  const [brands,     setBrands]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [showAddModal,     setShowAddModal]     = useState(false);
  const [showTrackModal,   setShowTrackModal]   = useState(false);
  const [deletingTask,     setDeletingTask]     = useState(null);
  const [editingTask,      setEditingTask]      = useState(null);
  const [evidenceTask,     setEvidenceTask]     = useState(null);
  const [evidenceInitData, setEvidenceInitData] = useState(null);
  const [ddosEvidenceTask, setDdosEvidenceTask] = useState(null);
  const [ddosInitData,     setDdosInitData]     = useState(null);
  const [busyTaskId,       setBusyTaskId]       = useState("");
  const [expandedRow,      setExpandedRow]      = useState(null);
  const [expandedEvidence, setExpandedEvidence] = useState(null); // { userId, type }
  const [lightbox,         setLightbox]         = useState(null); // { images, idx }
  const [selectedDate,     setSelectedDate]     = useState(() => toLocalDateStr());
  const [showDdosModal,    setShowDdosModal]    = useState(false);
  const [ddosBadgeCount,   setDdosBadgeCount]   = useState(0);
  const [showGuideDrawer,  setShowGuideDrawer]  = useState(false);
  const [allDdosTasks,     setAllDdosTasks]     = useState([]); // all tasks (no date filter) for DdosModal section

  const DDOS_WINDOW_MS = 48 * 60 * 60 * 1000;

  const fetchDdosBadge = useCallback(async () => {
    try {
      const res = await getReportingTasksApi();
      const allTasks = res.data || [];

      setAllDdosTasks(allTasks);

      const urlFirstId = {};
      [...allTasks].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .forEach((t) => { if (!urlFirstId[t.url]) urlFirstId[t.url] = String(t._id); });

      const ddosTasksByUrl = {};
      allTasks.filter((t) => String(t._id) !== urlFirstId[t.url]).forEach((t) => {
        if (!ddosTasksByUrl[t.url]) ddosTasksByUrl[t.url] = [];
        ddosTasksByUrl[t.url].push(t);
      });

      const lastOpened = Number(localStorage.getItem("ddosLastOpenedAt") || 0);

      const newCount = Object.values(ddosTasksByUrl).filter((urlTasks) => {
        const latest = Math.max(...urlTasks.map((t) => new Date(t.createdAt).getTime()));
        return Date.now() - latest < DDOS_WINDOW_MS && latest > lastOpened;
      }).length;

      setDdosBadgeCount(newCount);
    } catch (_) {
      // badge is non-critical
    }
  }, [DDOS_WINDOW_MS]);

  useEffect(() => { void fetchDdosBadge(); }, [fetchDdosBadge]);

  const handleOpenDdosModal = () => {
    localStorage.setItem("ddosLastOpenedAt", String(Date.now()));
    setDdosBadgeCount(0);
    setShowDdosModal(true);
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight" && lightbox.idx < lightbox.images.length - 1)
        setLightbox((lb) => ({ ...lb, idx: lb.idx + 1 }));
      if (e.key === "ArrowLeft" && lightbox.idx > 0)
        setLightbox((lb) => ({ ...lb, idx: lb.idx - 1 }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const userId = String(user?.id || user?._id || "");
  const visibleTasksByUrl = {};
  [...tasks]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach((task) => {
      if (!visibleTasksByUrl[task.url]) {
        visibleTasksByUrl[task.url] = String(task._id);
      }
    });
  const visibleTasks = tasks.filter((task) => String(task._id) === visibleTasksByUrl[task.url]);

  // All tasks accepted by anyone — used by admins/read-only viewers
  const allAcceptedTasks = visibleTasks.filter((t) => t.acceptedBy?.length > 0);

  // My Tasks: every task this user accepted for the selected date.
  // Duplicate URL tasks still appear here; the DDoS modal is an additional tracking view.
  const myAcceptedTasks = visibleTasks.filter((t) =>
    t.acceptedBy?.some((e) => String(e.userId?._id || e.userId) === userId)
  );

  // Users with RECEIVE see only their own regular accepted tasks
  // Admins/read-only see all accepted tasks for the current date
  const evidenceSectionTasks = canReceive ? myAcceptedTasks : allAcceptedTasks;

  const loadData = useCallback(async (date) => {
    try {
      setLoading(true);
      setError("");
      const [taskRes, brandRes] = await Promise.all([getReportingTasksApi(date), getBrandsApi()]);
      setTasks(taskRes.data || []);
      setBrands(brandRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(selectedDate); }, [loadData, selectedDate]);

  if (!hasAccess) return <Navigate to="/dashboard" replace />;

  const flash = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3500);
  };

  const handleEdit = async (taskId, form) => {
    const task = tasks.find((item) => String(item._id) === String(taskId));
    const isCreator = String(task?.createdBy?._id || task?.createdBy || "") === userId;
    const noOneAccepted = !task?.acceptedBy?.length;
    if (!isAdmin && (!isCreator || !noOneAccepted)) {
      setError("You can only edit your own task before anyone accepts it.");
      return;
    }

    setBusyTaskId(`edit-${taskId}`);
    try {
      const res = await updateReportingTaskApi(taskId, form);
      setTasks((prev) => prev.map((t) => (String(t._id) === taskId ? res.data : t)));
      setEditingTask(null);
      flash("Task updated successfully.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update task.");
    } finally {
      setBusyTaskId("");
    }
  };

  const handleCreate = async (form) => {
    setBusyTaskId("create");
    try {
      const created = await createReportingTaskApi(form);
      setTasks((prev) => [created.data, ...prev]);
      setShowAddModal(false);
      flash("Task created successfully.");
      void fetchDdosBadge();
    } finally {
      setBusyTaskId("");
    }
  };

  const handleDelete = async () => {
    if (!deletingTask) return;
    const isCreator = String(deletingTask.createdBy?._id || deletingTask.createdBy || "") === userId;
    const noOneAccepted = !deletingTask.acceptedBy?.length;
    if (!isAdmin && (!isCreator || !noOneAccepted)) {
      setError("You can only delete your own task before anyone accepts it.");
      setDeletingTask(null);
      return;
    }

    setBusyTaskId(String(deletingTask._id));
    try {
      await deleteReportingTaskItemApi(deletingTask._id);
      setTasks((prev) => prev.filter((t) => String(t._id) !== String(deletingTask._id)));
      setDeletingTask(null);
      flash("Task deleted.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete.");
    } finally {
      setBusyTaskId("");
    }
  };

  const handleAccept = async (taskId) => {
    setBusyTaskId(taskId);
    try {
      const res = await acceptReportingTaskApi(taskId);
      setTasks((prev) => prev.map((t) => (String(t._id) === taskId ? res.data : t)));
      flash("Task accepted.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to accept task.");
    } finally {
      setBusyTaskId("");
    }
  };

  const handleEvidenceSubmit = async (taskId, payload) => {
    setBusyTaskId(taskId);
    try {
      const res = await submitReportingTaskEvidenceApi(taskId, payload);
      setTasks((prev) => prev.map((t) => (String(t._id) === taskId ? res.data : t)));
      setAllDdosTasks((prev) => prev.map((t) => (String(t._id) === taskId ? res.data : t)));
      setEvidenceTask(null);
      flash("Evidence submitted successfully.");
    } finally {
      setBusyTaskId("");
    }
  };

  const handleDdosEvidenceSubmit = async (taskId, payload) => {
    setBusyTaskId(`ddos-${taskId}`);
    try {
      const res = await submitReportingTaskDdosEvidenceApi(taskId, payload);
      setTasks((prev) => prev.map((t) => (String(t._id) === taskId ? res.data : t)));
      setAllDdosTasks((prev) => prev.map((t) => (String(t._id) === taskId ? res.data : t)));
      setDdosEvidenceTask(null);
      flash("DDoS evidence submitted successfully.");
    } finally {
      setBusyTaskId("");
    }
  };

  const getMyEntry = (task) =>
    task.acceptedBy?.find((e) => String(e.userId?._id || e.userId) === userId);

  return (
    <div className="management-page">
      {/* ── Header ── */}
      <section className="app-panel management-header">
        <div>
          <h1>Reporting Tasks</h1>
          <p>Manage and track reporting work items for staff.</p>
        </div>
        <div className="management-header-actions">
          {canTrack ? <button
            type="button"
            className="management-button-secondary management-button-with-icon"
            onClick={() => setShowTrackModal(true)}
          >
            <span className="management-button-icon" aria-hidden="true" style={{ background: "rgba(56,71,109,0.12)" }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ display: "block" }}>
                <rect x="1" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
                <rect x="8" y="1" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
                <rect x="1" y="8" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
                <rect x="8" y="8" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </span>
            <span>Track</span>
          </button> : null}

          <div style={{ position: "relative", display: "inline-flex" }}>
            <button
              type="button"
              className="management-button-secondary management-button-with-icon"
              onClick={handleOpenDdosModal}
            >
              <span className="management-button-icon" aria-hidden="true" style={{ background: "rgba(190,18,60,0.10)" }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ display: "block" }}>
                  <circle cx="6.5" cy="6.5" r="5" stroke="#be123c" strokeWidth="1.4" />
                  <path d="M6.5 4v3M6.5 9v.5" stroke="#be123c" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
              <span style={{ color: "#be123c" }}>DDoS URLs</span>
            </button>
            {ddosBadgeCount > 0 && (
              <span style={{
                position: "absolute", top: "-7px", right: "-7px",
                minWidth: "18px", height: "18px", borderRadius: "9px",
                background: "#be123c", color: "#fff",
                fontSize: "0.62rem", fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 4px", border: "2px solid #fff",
                boxShadow: "0 1px 6px rgba(190,18,60,0.45)",
                lineHeight: 1, zIndex: 1, pointerEvents: "none",
              }}>
                {ddosBadgeCount > 99 ? "99+" : ddosBadgeCount}
              </span>
            )}
          </div>

          <button
            type="button"
            className="management-button-secondary management-button-with-icon"
            onClick={() => setShowGuideDrawer((v) => !v)}
            style={showGuideDrawer ? { background: "#dbeafe", borderColor: "#93c5fd" } : {}}
          >
            <span className="management-button-icon" aria-hidden="true" style={{ background: "rgba(30,64,175,0.10)" }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ display: "block" }}>
                <circle cx="6.5" cy="6.5" r="5" stroke="#1e40af" strokeWidth="1.4"/>
                <path d="M6.5 5.5v4" stroke="#1e40af" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="6.5" cy="3.5" r="0.7" fill="#1e40af"/>
              </svg>
            </span>
            <span style={{ color: "#1e40af" }}>Tools &amp; Guide</span>
          </button>

          {canAdd && selectedDate === toLocalDateStr() ? (
            <button
              type="button"
              className="management-button management-button-with-icon"
              onClick={() => { setError(""); setSuccessMsg(""); setShowAddModal(true); }}
            >
              <span className="management-button-icon" aria-hidden="true">+</span>
              <span>Add Task</span>
            </button>
          ) : null}

          {/* ── Task count + date navigator — two halves ── */}
          <div style={{ display: "flex", flexDirection: "column", alignSelf: "stretch", borderRadius: "10px", border: "1.5px solid #e2e8f0", overflow: "hidden", minWidth: "100px" }}>
            {/* Upper half — task count */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", background: "#f8fafc", padding: "0 14px" }}>
              <strong style={{ fontSize: "1.05rem", fontWeight: 800, color: "#1e293b" }}>{loading ? "—" : visibleTasks.length}</strong>
              <span style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 500 }}>{visibleTasks.length === 1 ? "task" : "tasks"}</span>
            </div>
            {/* Divider */}
            <div style={{ height: "1px", background: "#e2e8f0" }} />
            {/* Lower half — date nav */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
              <button
                type="button"
                onClick={() => { setSelectedDate((d) => shiftDate(d, -1)); setExpandedRow(null); setExpandedEvidence(null); }}
                style={{ flex: 1, height: "100%", border: "none", background: "transparent", cursor: "pointer", color: "#64748b", fontSize: "0.9rem", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #e2e8f0" }}
                title="Previous day"
              >‹</button>
              <span style={{ padding: "0 8px", fontSize: "0.71rem", fontWeight: 700, color: selectedDate === toLocalDateStr() ? "#1d4ed8" : "#374151", whiteSpace: "nowrap" }}>
                {formatDateLabel(selectedDate)}
              </span>
              <button
                type="button"
                disabled={selectedDate >= toLocalDateStr()}
                onClick={() => { setSelectedDate((d) => shiftDate(d, 1)); setExpandedRow(null); setExpandedEvidence(null); }}
                style={{ flex: 1, height: "100%", border: "none", background: "transparent", cursor: selectedDate >= toLocalDateStr() ? "default" : "pointer", color: selectedDate >= toLocalDateStr() ? "#d1d5db" : "#64748b", fontSize: "0.9rem", display: "flex", alignItems: "center", justifyContent: "center", borderLeft: "1px solid #e2e8f0" }}
                title="Next day"
              >›</button>
            </div>
          </div>
        </div>
      </section>

      {error      ? <p className="management-error">{error}</p> : null}
      {successMsg ? <p className="reporting-success-banner">{successMsg}</p> : null}

      {/* ── Tools & Guide Drawer ── */}
      <ToolsGuideDrawer open={showGuideDrawer} onClose={() => setShowGuideDrawer(false)} />

      {/* ── Modals ── */}
      {showTrackModal ? (
        <TrackModal onClose={() => setShowTrackModal(false)} />
      ) : null}

      {showDdosModal ? (
        <DdosModal
          onClose={() => setShowDdosModal(false)}
          canReceive={canReceive}
          canDdos={canDdos}
          userId={userId}
          onOpenEvidence={(task, initData) => { setError(""); setEvidenceInitData(initData); setEvidenceTask(task); }}
          onOpenDdos={(task, initData) => { setError(""); setDdosInitData(initData); setDdosEvidenceTask(task); }}
        />
      ) : null}

      {showAddModal ? (
        <AddTaskModal brands={brands} onClose={() => setShowAddModal(false)} onSave={handleCreate} busy={busyTaskId === "create"} />
      ) : null}

      {editingTask ? (
        <EditTaskModal task={editingTask} brands={brands} onClose={() => setEditingTask(null)} onSave={handleEdit} busy={busyTaskId === `edit-${String(editingTask._id)}`} />
      ) : null}

      {deletingTask ? (
        <ConfirmDeleteModal task={deletingTask} onClose={() => setDeletingTask(null)} onConfirm={handleDelete} busy={busyTaskId === String(deletingTask._id)} />
      ) : null}

      {evidenceTask ? (
        <EvidenceModal
          task={evidenceTask}
          onClose={() => { setEvidenceTask(null); setEvidenceInitData(null); }}
          onSubmit={handleEvidenceSubmit}
          busy={busyTaskId === String(evidenceTask._id)}
          initialImages={evidenceInitData?.images || []}
          initialNote={evidenceInitData?.note || ""}
        />
      ) : null}

      {ddosEvidenceTask ? (
        <EvidenceModal
          task={ddosEvidenceTask}
          mode="ddos"
          onClose={() => { setDdosEvidenceTask(null); setDdosInitData(null); }}
          onSubmit={handleDdosEvidenceSubmit}
          busy={busyTaskId === `ddos-${String(ddosEvidenceTask._id)}`}
          initialImages={ddosInitData?.images || []}
          initialNote={ddosInitData?.note || ""}
        />
      ) : null}

      {/* ── Lightbox ── */}
      {lightbox && (() => {
        const { images, idx } = lightbox;
        const img = images[idx];
        const hasPrev = idx > 0;
        const hasNext = idx < images.length - 1;
        const go = (newIdx) => setLightbox({ images, idx: newIdx });
        const close = () => setLightbox(null);
        const navBtn = (label, disabled, onClick) => (
          <button type="button" onClick={onClick} disabled={disabled}
            style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [label === "‹" ? "left" : "right"]: "16px", background: disabled ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.22)", color: "#fff", border: "none", borderRadius: "50%", width: "44px", height: "44px", fontSize: "1.5rem", cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", opacity: disabled ? 0.3 : 1 }}>
            {label}
          </button>
        );
        return (
          <div
            onClick={close}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 99999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
          >
            {/* Top-right controls: Download + Close */}
            <div style={{ position: "absolute", top: "18px", right: "22px", display: "flex", gap: "8px", alignItems: "center" }}>
              <a
                href={getEvidenceImageDownloadSrc(img)}
                download={img.name}
                onClick={(e) => e.stopPropagation()}
                title="Download image"
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: "38px", height: "38px", borderRadius: "50%", fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v8M5 7l3 3 3-3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 13h10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </a>
              <button type="button" onClick={close}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: "38px", height: "38px", borderRadius: "50%", fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                ✕
              </button>
            </div>

            {/* Image */}
            <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", maxWidth: "90vw", maxHeight: "80vh" }}>
              {navBtn("‹", !hasPrev, () => go(idx - 1))}
              <img
                src={getEvidenceImageSrc(img)}
                alt={img.name}
                style={{ maxWidth: "80vw", maxHeight: "78vh", objectFit: "contain", borderRadius: "10px", boxShadow: "0 12px 48px rgba(0,0,0,0.5)" }}
              />
              {navBtn("›", !hasNext, () => go(idx + 1))}
            </div>

            {/* Caption */}
            <div style={{ marginTop: "14px", textAlign: "center" }}>
              <span style={{ color: "#e2e8f0", fontSize: "0.82rem", fontWeight: 600 }}>{img.name}</span>
              <span style={{ color: "#94a3b8", fontSize: "0.78rem", marginLeft: "10px" }}>{idx + 1} / {images.length}</span>
            </div>
          </div>
        );
      })()}

      {/* ── Reporting Tasks Table ── */}
      <div className="management-grid is-single-column">
        {loading ? (
          <section className="app-panel management-state">
            <h2>Loading tasks...</h2>
            <p>Fetching reporting tasks, please wait.</p>
          </section>
        ) : visibleTasks.length === 0 ? (
          <section className="app-panel management-state">
            <h2>No tasks</h2>
            <p>{selectedDate === toLocalDateStr()
              ? (canAdd ? "Create a task to get started." : "No reporting tasks are available.")
              : `No tasks were added on ${formatDateLabel(selectedDate)}.`}
            </p>
          </section>
        ) : (
          <section className="app-panel" style={taskPanelStyle}>
            <h2 style={sectionTitleStyle}>Reporting Tasks</h2>
            <div style={{ overflowX: "auto", overflowY: "visible" }}>
              <table style={{ ...tableStyle, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "auto" }} />
                  <col style={{ width: "56px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "76px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "72px" }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                    <th style={thStyle}>Brand</th>
                    <th style={thStyle}>URL</th>
                    <th style={thStyle}>Rank</th>
                    <th style={thStyle}>Issue Type</th>
                    <th style={thStyle}>DDoS</th>
                    <th style={thStyle}>Evidence</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map((task) => {
                    const myEntry        = getMyEntry(task);
                    const iAccepted      = Boolean(myEntry);
                    const isBusy         = busyTaskId === String(task._id);
                    const expiryMins     = getExpiryMinsLeft(task.createdAt);
                    const isExpired      = expiryMins <= 0;
                    const expiringSoon   = !isExpired && expiryMins <= 120;
                    const isCreator      = String(task.createdBy?._id || task.createdBy) === userId;
                    const noOneAccepted  = !task.acceptedBy?.length;
                    const canEditThis    = !isExpired && (isAdmin || (isCreator && noOneAccepted));
                    const canDeleteThis  = !isExpired && (isAdmin || (isCreator && noOneAccepted));
                    const taskId        = String(task._id);
                    const isRowExpanded = expandedRow === taskId;

                    return (
                      <React.Fragment key={taskId}>
                        <tr style={{ borderBottom: isRowExpanded ? "none" : "1px solid #f1f5f9", background: isExpired ? "#fafafa" : expiringSoon ? "#fffbeb" : "transparent", opacity: isExpired ? 0.82 : 1 }}>
                          <td style={tdStyle}><BrandPill brand={task.brandId} /></td>
                          <td style={{ ...tdStyle, overflow: "hidden" }}>
                            <div style={urlCellStyle}>
                              <a href={task.url} target="_blank" rel="noreferrer"
                                style={urlLinkStyle}
                                title={task.url}>
                                {task.url}
                              </a>
                              <CopyUrlButton url={task.url} />
                            </div>
                            {isExpired && (
                              <span style={{ display: "inline-block", marginTop: "2px", fontSize: "0.68rem", fontWeight: 600, color: "#6b7280", background: "#f3f4f6", padding: "1px 7px", borderRadius: "6px" }}>
                                Task Expired
                              </span>
                            )}
                            {expiringSoon && (
                              <span style={{ display: "inline-block", marginTop: "2px", fontSize: "0.68rem", fontWeight: 600, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: "6px" }}>
                                ⏳ Expires in {formatTimeLeft(expiryMins)}
                              </span>
                            )}
                            {task.createdSource === "telegram" && (
                              <span style={{ display: "inline-block", marginTop: "2px", marginLeft: isExpired || expiringSoon ? "6px" : 0, fontSize: "0.68rem", fontWeight: 700, color: "#0369a1", background: "#e0f2fe", padding: "1px 7px", borderRadius: "6px" }}>
                                Telegram
                              </span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>#{task.rank}</td>
                          <td style={{ ...tdStyle, whiteSpace: "nowrap" }}><IssueBadge issueType={task.issueType} /></td>
                          <td style={tdStyle}>
                            {task.ddosRequired ? (
                              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "10px", fontSize: "0.7rem", fontWeight: 700, background: "#fce7f3", color: "#9d174d", whiteSpace: "nowrap" }}>Required</span>
                            ) : (
                              <span style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>—</span>
                            )}
                          </td>

                          {/* Evidence column — inline toggle button */}
                          <td style={tdStyle}>
                            {!task.acceptedBy?.length ? (
                              <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>None yet</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setExpandedRow((p) => p === taskId ? null : taskId); setExpandedEvidence(null); }}
                                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "12px", fontSize: "0.78rem", fontWeight: 600, background: isRowExpanded ? "#dbeafe" : "#f1f5f9", color: isRowExpanded ? "#1d4ed8" : "#334155", border: `1px solid ${isRowExpanded ? "#93c5fd" : "#e2e8f0"}`, cursor: "pointer", whiteSpace: "nowrap" }}
                              >
                                {task.acceptedBy.length} evidence
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: isRowExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
                                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            )}
                          </td>

                          {/* Status column */}
                          <td style={{ ...tdStyle, textAlign: "center", padding: "10px 8px" }}>
                            {isExpired ? (
                              <span style={{ color: "#9ca3af", fontSize: "0.75rem", fontWeight: 600 }}>Expired</span>
                            ) : canReceive && !iAccepted ? (
                              <button
                                type="button"
                                className="management-button"
                                style={{ padding: "5px 12px", fontSize: "0.76rem", whiteSpace: "nowrap", width: "100%" }}
                                disabled={isBusy}
                                onClick={() => handleAccept(taskId)}
                              >
                                {isBusy ? "…" : "Accept Task"}
                              </button>
                            ) : canReceive && iAccepted ? (
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "5px 10px", fontSize: "0.76rem", fontWeight: 700, borderRadius: "8px", background: "#dcfce7", color: "#15803d", whiteSpace: "nowrap" }}>
                                ✓ Accepted
                              </span>
                            ) : (
                              <span style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>—</span>
                            )}
                          </td>

                          {/* Actions column */}
                          <td style={{ ...tdStyle, textAlign: "center", padding: "10px 8px" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                              {canEditThis ? (
                                <TooltipBtn icon={<IconEdit />} tooltip="Edit Task" color="#374151" bg="#f1f5f9" border="#d1d5db" onClick={() => { setError(""); setEditingTask(task); }} />
                              ) : null}
                              {canDeleteThis ? (
                                <TooltipBtn icon={<IconTrash />} tooltip="Delete Task" color="#dc2626" bg="#fff5f5" border="#fecaca" onClick={() => { setError(""); setDeletingTask(task); }} />
                              ) : null}
                            </div>
                          </td>
                        </tr>

                        {/* ── Expansion: all users list ── */}
                        {isRowExpanded && (
                          <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td colSpan={8} style={{ padding: 0 }}>
                              <div style={{ background: "#f0f9ff", borderLeft: "3px solid #3b82f6", padding: "12px 20px" }}>
                                {/* user cards — gallery renders inline below each card */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                  {task.acceptedBy.map((entry, i) => {
                                    const uid         = String(entry.userId?._id || entry.userId);
                                    const isThisOpen  = (type) => expandedEvidence?.userId === uid && expandedEvidence?.type === type;

                                    const chipBtn = (type) => {
                                      const submitted = type === "evidence" ? entry.evidenceSubmitted : entry.ddosEvidenceSubmitted;
                                      const imgs      = type === "evidence" ? (entry.images || []) : (entry.ddosImages || []);
                                      const isActive  = isThisOpen(type);
                                      return (
                                        <button
                                          type="button"
                                          disabled={!submitted}
                                          onClick={() => setExpandedEvidence((p) => (p?.userId === uid && p?.type === type) ? null : { userId: uid, type })}
                                          style={{ padding: "3px 10px", borderRadius: "10px", fontSize: "0.73rem", fontWeight: 700, border: isActive ? "2px solid #3b82f6" : "1.5px solid transparent", background: submitted ? (isActive ? "#dbeafe" : "#dcfce7") : "#f1f5f9", color: submitted ? (isActive ? "#1d4ed8" : "#166534") : "#94a3b8", cursor: submitted ? "pointer" : "default" }}
                                        >
                                          {submitted ? `✓ Submitted${imgs.length ? ` (${imgs.length} img)` : ""}` : "Not submitted"}
                                          {submitted && <span style={{ marginLeft: "4px", fontSize: "0.62rem" }}>{isActive ? "▲" : "▼"}</span>}
                                        </button>
                                      );
                                    };

                                    const openType    = isThisOpen("evidence") ? "evidence" : isThisOpen("ddos") ? "ddos" : null;
                                    const galleryImgs = openType === "evidence" ? (entry.images || []) : openType === "ddos" ? (entry.ddosImages || []) : [];
                                    const galleryNote = openType === "evidence" ? entry.evidenceNote : entry.ddosNote;

                                    return (
                                      <div key={uid || i} style={{ borderRadius: "8px", border: `1px solid ${openType ? "#93c5fd" : "#e2e8f0"}`, overflow: "hidden", background: "#fff" }}>
                                        {/* user row */}
                                        <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 14px", flexWrap: "wrap" }}>
                                          <span style={{ fontWeight: 700, fontSize: "0.84rem", color: "#1e293b", minWidth: "110px" }}>
                                            {entry.userId?.fullName || "—"}
                                          </span>
                                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                              <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>Evidence:</span>
                                              {chipBtn("evidence")}
                                            </div>
                                            {task.ddosRequired && (
                                              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                                <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>DDoS:</span>
                                                {chipBtn("ddos")}
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* inline gallery — only for this user */}
                                        {openType && (
                                          <div style={{ borderTop: "1px solid #dbeafe", background: "#f8fafc", padding: "12px 16px" }}>
                                            {galleryNote && (
                                              <p style={{ margin: "0 0 10px", fontSize: "0.78rem", color: "#475569", background: "#fff", padding: "7px 11px", borderRadius: "7px", border: "1px solid #e2e8f0" }}>
                                                <strong style={{ color: "#334155" }}>Note: </strong>{galleryNote}
                                              </p>
                                            )}
                                            {galleryImgs.length === 0 ? (
                                              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem" }}>No images uploaded.</p>
                                            ) : (
                                              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                                {galleryImgs.map((img, imgIdx) => (
                                                  <div
                                                    key={imgIdx}
                                                    onClick={() => setLightbox({ images: galleryImgs, idx: imgIdx })}
                                                    title={img.name}
                                                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", cursor: "zoom-in" }}
                                                  >
                                                    <img
                                                      src={getEvidenceImageSrc(img)}
                                                      alt={img.name}
                                                      style={{ width: "100px", height: "80px", objectFit: "cover", borderRadius: "8px", border: "1.5px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", transition: "transform 0.15s, box-shadow 0.15s" }}
                                                      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.18)"; }}
                                                      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
                                                    />
                                                    <span style={{ fontSize: "0.63rem", color: "#64748b", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                      {img.name}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {/* ── Evidence Tasks Table ── */}
      {!loading && evidenceSectionTasks.length > 0 ? (
        <div className="management-grid is-single-column" style={{ marginTop: "1.5rem" }}>
          <section className="app-panel" style={taskPanelStyle}>
            <h2 style={sectionTitleStyle}>
              {canReceive ? "My Tasks" : "Accepted Tasks"}
              <span style={{ marginLeft: "10px", fontSize: "0.75rem", fontWeight: 500, color: "#94a3b8" }}>
                {evidenceSectionTasks.length} task{evidenceSectionTasks.length !== 1 ? "s" : ""}
              </span>
            </h2>
            <div style={{ overflowX: "auto", overflowY: "visible" }}>
              <table style={{ ...tableStyle, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "auto" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: canDdos ? "155px" : "175px" }} />
                  {canDdos ? <col style={{ width: "155px" }} /> : null}
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                    <th style={thStyle}>Brand</th>
                    <th style={thStyle}>URL</th>
                    <th style={thStyle}>Issue Type</th>
                    <th style={thStyle}>Evidence</th>
                    {canDdos ? <th style={thStyle}>DDoS Evidence</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {evidenceSectionTasks.map((task) => {
                    const myEntry           = getMyEntry(task);
                    const iAcceptedThisTask = Boolean(myEntry);
                    const mySubmitted       = myEntry?.evidenceSubmitted === true;
                    const myImgCount        = myEntry?.images?.length || 0;
                    const myDdosSubmitted   = myEntry?.ddosEvidenceSubmitted === true;
                    const myDdosImgCount    = myEntry?.ddosImages?.length || 0;

                    const anySubmitted  = task.acceptedBy.some((e) => e.evidenceSubmitted);
                    const allSubmitted  = task.acceptedBy.length > 0 && task.acceptedBy.every((e) => e.evidenceSubmitted);
                    const anyDdos       = task.acceptedBy.some((e) => e.ddosEvidenceSubmitted);
                    const allDdos       = task.acceptedBy.length > 0 && task.acceptedBy.every((e) => e.ddosEvidenceSubmitted);

                    return (
                      <tr key={String(task._id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        {/* Brand */}
                        <td style={tdStyle}><BrandPill brand={task.brandId} /></td>

                        {/* URL */}
                        <td style={{ ...tdStyle, overflow: "hidden" }}>
                          <div style={urlCellStyle}>
                            <a href={task.url} target="_blank" rel="noreferrer"
                              style={urlLinkStyle}
                              title={task.url}>
                              {task.url}
                            </a>
                            <CopyUrlButton url={task.url} />
                          </div>
                        </td>

                        {/* Issue Type */}
                        <td style={tdStyle}><IssueBadge issueType={task.issueType} /></td>

                        {/* Evidence */}
                        <td style={{ ...tdStyle, padding: "10px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap" }}>
                            {mySubmitted ? (
                              (() => {
                                const evMins = getEditMinsLeft(myEntry?.submittedAt);
                                const evImgs = myEntry?.images || [];
                                return (
                                  <>
                                    <span style={evBadge("green")}>✓ Done</span>
                                    {evImgs.length > 0 && (
                                      <button type="button"
                                        onClick={() => setLightbox({ images: evImgs, idx: 0 })}
                                        style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "8px", fontSize: "0.68rem", fontWeight: 600, background: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe", cursor: "pointer", whiteSpace: "nowrap" }}
                                        title="View submitted evidence">
                                        🖼 {evImgs.length}
                                      </button>
                                    )}
                                    {evMins > 0 ? (
                                      <TooltipBtn
                                        icon={<IconEdit />}
                                        tooltip={`Edit Evidence (${formatTimeLeft(evMins)} left)`}
                                        color="#1e40af" bg="#dbeafe" border="#bfdbfe"
                                        onClick={() => { setError(""); setEvidenceInitData({ images: myEntry?.images || [], note: myEntry?.evidenceNote || "" }); setEvidenceTask(task); }}
                                      />
                                    ) : (
                                      <TooltipBtn icon={<IconLock />} tooltip="Edit window closed" color="#94a3b8" bg="#f8fafc" border="#e2e8f0" disabled />
                                    )}
                                  </>
                                );
                              })()
                            ) : canReceive ? (
                              <>
                                <span style={evBadge("yellow")}>Pending</span>
                                <TooltipBtn
                                  icon={<IconPlus />}
                                  tooltip="Submit Evidence"
                                  color="#1e40af" bg="#dbeafe" border="#bfdbfe"
                                  onClick={() => { setError(""); setEvidenceInitData(null); setEvidenceTask(task); }}
                                />
                              </>
                            ) : (
                              <span style={evBadge(allSubmitted ? "green" : anySubmitted ? "blue" : "yellow")}>
                                {allSubmitted ? "All Done" : anySubmitted ? "Partial" : "Pending"}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* DDoS Evidence — only visible to users with DO_DDOS_REPORTING_TASKS */}
                        {canDdos ? (
                          <td style={{ ...tdStyle, padding: "10px 10px" }}>
                            {!task.ddosRequired ? (
                              <span style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>N/A</span>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap" }}>
                                {myDdosSubmitted ? (
                                  (() => {
                                    const ddosMins = getEditMinsLeft(myEntry?.ddosSubmittedAt);
                                    const ddosImgs = myEntry?.ddosImages || [];
                                    return (
                                      <>
                                        <span style={evBadge("pink")}>✓ Done</span>
                                        {ddosImgs.length > 0 && (
                                          <button type="button"
                                            onClick={() => setLightbox({ images: ddosImgs, idx: 0 })}
                                            style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 7px", borderRadius: "8px", fontSize: "0.68rem", fontWeight: 600, background: "#fce7f3", color: "#9d174d", border: "1px solid #f9a8d4", cursor: "pointer", whiteSpace: "nowrap" }}
                                            title="View submitted DDoS evidence">
                                            🖼 {ddosImgs.length}
                                          </button>
                                        )}
                                        {ddosMins > 0 ? (
                                          <TooltipBtn
                                            icon={<IconEdit />}
                                            tooltip={`Edit DDoS Evidence (${formatTimeLeft(ddosMins)} left)`}
                                            color="#9d174d" bg="#fce7f3" border="#f9a8d4"
                                            onClick={() => { setError(""); setDdosInitData({ images: myEntry?.ddosImages || [], note: myEntry?.ddosNote || "" }); setDdosEvidenceTask(task); }}
                                          />
                                        ) : (
                                          <TooltipBtn icon={<IconLock />} tooltip="Edit window closed" color="#94a3b8" bg="#f8fafc" border="#e2e8f0" disabled />
                                        )}
                                      </>
                                    );
                                  })()
                                ) : canReceive ? (
                                  <>
                                    <span style={evBadge("yellow")}>Pending</span>
                                    <TooltipBtn
                                      icon={<IconPlus />}
                                      tooltip="Submit DDoS Evidence"
                                      color="#9d174d" bg="#fce7f3" border="#f9a8d4"
                                      onClick={() => { setError(""); setDdosInitData(null); setDdosEvidenceTask(task); }}
                                    />
                                  </>
                                ) : (
                                  <span style={evBadge(allDdos ? "pink" : anyDdos ? "blue" : "yellow")}>
                                    {allDdos ? "All Done" : anyDdos ? "Partial" : "Pending"}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {/* DDoS URLs modal is opened via the header button — see DdosModal component */}
      {false && (
        <div className="management-grid is-single-column" style={{ marginTop: "1.5rem" }}>
          <section className="app-panel" style={taskPanelStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>DDoS URLs</h2>
              <span style={{ padding: "2px 10px", borderRadius: "20px", fontSize: "0.72rem", fontWeight: 700, background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }}>
                {ddosRows.length} unique URL{ddosRows.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div style={{ overflowX: "auto", overflowY: "visible" }}>
              <table style={{ ...tableStyle, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "auto" }} />
                  <col style={{ width: "80px" }} />
                  <col style={{ width: "60px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "120px" }} />
                  {canDdos ? <col style={{ width: "130px" }} /> : null}
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                    <th style={thStyle}>Brand</th>
                    <th style={thStyle}>URL</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Times</th>
                    <th style={thStyle}>Rank</th>
                    <th style={thStyle}>Evidence</th>
                    <th style={thStyle}>Report Again</th>
                    {canDdos ? <th style={thStyle}>DDoS Evidence</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {ddosRows.map(([url, urlTasks]) => {
                    const latest       = urlTasks[0]; // newest first (API sorts by createdAt -1)
                    const timesReq     = urlTasks.length;
                    const isExpanded   = expandedDdosUrl === url;

                    // aggregate across all task instances for this URL
                    const allAccepted  = urlTasks.flatMap((t) => t.acceptedBy || []);
                    const totalEvDone  = allAccepted.filter((e) => e.evidenceSubmitted).length;
                    const totalAcc     = allAccepted.length;
                    const totalImgs    = allAccepted.reduce((s, e) => s + (e.images || []).length, 0);

                    return (
                      <React.Fragment key={url}>
                        <tr style={{ borderBottom: isExpanded ? "none" : "1px solid #f1f5f9", background: isExpanded ? "#fff7f7" : "transparent" }}>
                          {/* Brand */}
                          <td style={tdStyle}><BrandPill brand={latest.brandId} /></td>

                          {/* URL + expand toggle */}
                        <td style={{ ...tdStyle, overflow: "hidden" }}>
                          <div style={urlCellStyle}>
                            <a href={url} target="_blank" rel="noreferrer"
                              style={urlLinkStyle}
                              title={url}>{url}</a>
                            <CopyUrlButton url={url} />
                          </div>
                        </td>

                          {/* Times requested */}
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "50%", fontSize: "0.78rem", fontWeight: 800, background: timesReq > 1 ? "#fff1f2" : "#f8fafc", color: timesReq > 1 ? "#be123c" : "#64748b", border: `1.5px solid ${timesReq > 1 ? "#fecdd3" : "#e2e8f0"}` }}>
                              {timesReq}
                            </span>
                          </td>

                          {/* Rank */}
                          <td style={{ ...tdStyle, fontWeight: 600 }}>#{latest.rank}</td>

                          {/* Evidence toggle */}
                          <td style={tdStyle}>
                            {totalAcc === 0 ? (
                              <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>None yet</span>
                            ) : (
                              <button type="button"
                                onClick={() => { setExpandedDdosUrl((p) => p === url ? null : url); setExpandedDdosEvidence(null); }}
                                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "12px", fontSize: "0.78rem", fontWeight: 600, background: isExpanded ? "#fce7f3" : "#f1f5f9", color: isExpanded ? "#9d174d" : "#334155", border: `1px solid ${isExpanded ? "#f9a8d4" : "#e2e8f0"}`, cursor: "pointer", whiteSpace: "nowrap" }}>
                                {totalAcc} evidence
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
                                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            )}
                          </td>

                          {/* Report Again — aggregate submitted count + image count */}
                          <td style={tdStyle}>
                            {totalEvDone > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#16a34a", background: "#dcfce7", padding: "2px 8px", borderRadius: "8px", display: "inline-block" }}>
                                  ✓ {totalEvDone} reported
                                </span>
                                {totalImgs > 0 && (
                                  <span style={{ fontSize: "0.68rem", color: "#64748b" }}>
                                    {totalImgs} img{totalImgs !== 1 ? "s" : ""} uploaded
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>No reports yet</span>
                            )}
                          </td>

                          {/* DDoS Evidence — aggregate count */}
                          {canDdos ? (
                            <td style={tdStyle}>
                              {(() => {
                                const ddosDone = allAccepted.filter((e) => e.ddosEvidenceSubmitted).length;
                                return (
                                  <span style={{ fontWeight: 700, color: ddosDone > 0 ? "#be123c" : "#94a3b8", fontSize: "0.82rem" }}>
                                    {ddosDone}/{totalAcc}
                                  </span>
                                );
                              })()}
                            </td>
                          ) : null}
                        </tr>

                        {/* ── Expansion: per-request user evidence ── */}
                        {isExpanded && (
                          <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td colSpan={canDdos ? 7 : 6} style={{ padding: 0 }}>
                              <div style={{ background: "#fff7f7", borderLeft: "3px solid #f43f5e", padding: "12px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                                {urlTasks.map((task, reqIdx) => {
                                  const taskId   = String(task._id);
                                  const reqLabel = `Request ${timesReq - reqIdx}`;
                                  const reqDate  = new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

                                  return (
                                    <div key={taskId} style={{ borderRadius: "8px", border: "1px solid #fecdd3", background: "#fff", overflow: "hidden" }}>
                                      {/* Request header with submit buttons */}
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "#fff1f2", borderBottom: "1px solid #fecdd3", flexWrap: "wrap", gap: "8px" }}>
                                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#9f1239" }}>
                                          {reqLabel} — {reqDate}
                                        </span>
                                        {/* Submit buttons for this specific request */}
                                        {(canReceive || canDdos) && (
                                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                            {canReceive && (() => {
                                              const myEnt = getMyEntry(task);
                                              const submitted = myEnt?.evidenceSubmitted;
                                              const mins = getEditMinsLeft(myEnt?.submittedAt);
                                              if (submitted && mins > 0) return (
                                                <button type="button" style={{ ...evBtn("blue"), fontSize: "0.71rem" }}
                                                  onClick={() => { setError(""); setEvidenceInitData({ images: myEnt?.images || [], note: myEnt?.evidenceNote || "" }); setEvidenceTask(task); }}>
                                                  Edit Evidence
                                                </button>
                                              );
                                              if (submitted) return (
                                                <span style={{ fontSize: "0.71rem", color: "#16a34a", fontWeight: 600 }}>✓ Evidence done</span>
                                              );
                                              return (
                                                <button type="button" style={{ ...evBtn("blue"), fontSize: "0.71rem" }}
                                                  onClick={() => { setError(""); setEvidenceInitData(null); setEvidenceTask(task); }}>
                                                  + Submit Evidence
                                                </button>
                                              );
                                            })()}
                                            {canDdos && (() => {
                                              const myEnt = getMyEntry(task);
                                              const submitted = myEnt?.ddosEvidenceSubmitted;
                                              const mins = getEditMinsLeft(myEnt?.ddosSubmittedAt);
                                              if (submitted && mins > 0) return (
                                                <button type="button" style={{ ...evBtn("pink"), fontSize: "0.71rem" }}
                                                  onClick={() => { setError(""); setDdosInitData({ images: myEnt?.ddosImages || [], note: myEnt?.ddosNote || "" }); setDdosEvidenceTask(task); }}>
                                                  Edit DDoS
                                                </button>
                                              );
                                              if (submitted) return (
                                                <span style={{ fontSize: "0.71rem", color: "#be123c", fontWeight: 600 }}>✓ DDoS done</span>
                                              );
                                              return (
                                                <button type="button" style={{ ...evBtn("pink"), fontSize: "0.71rem" }}
                                                  onClick={() => { setError(""); setDdosInitData(null); setDdosEvidenceTask(task); }}>
                                                  + Submit DDoS
                                                </button>
                                              );
                                            })()}
                                          </div>
                                        )}
                                      </div>

                                      {/* User list for this request */}
                                      {(task.acceptedBy || []).length === 0 ? (
                                        <p style={{ margin: 0, padding: "10px 14px", fontSize: "0.78rem", color: "#94a3b8" }}>No one has accepted this request yet.</p>
                                      ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 14px" }}>
                                          {task.acceptedBy.map((entry, i) => {
                                            const uid        = String(entry.userId?._id || entry.userId);
                                            const evKey      = { taskId, userId: uid, type: "evidence" };
                                            const ddosKey    = { taskId, userId: uid, type: "ddos" };
                                            const isEvOpen   = expandedDdosEvidence?.taskId === taskId && expandedDdosEvidence?.userId === uid && expandedDdosEvidence?.type === "evidence";
                                            const isDdosOpen = expandedDdosEvidence?.taskId === taskId && expandedDdosEvidence?.userId === uid && expandedDdosEvidence?.type === "ddos";

                                            const chipBtn = (type) => {
                                              const submitted = type === "evidence" ? entry.evidenceSubmitted : entry.ddosEvidenceSubmitted;
                                              const imgs      = type === "evidence" ? (entry.images || []) : (entry.ddosImages || []);
                                              const isActive  = type === "evidence" ? isEvOpen : isDdosOpen;
                                              const key       = type === "evidence" ? evKey : ddosKey;
                                              return (
                                                <button type="button" disabled={!submitted}
                                                  onClick={() => setExpandedDdosEvidence((p) =>
                                                    (p?.taskId === taskId && p?.userId === uid && p?.type === type) ? null : key
                                                  )}
                                                  style={{ padding: "3px 10px", borderRadius: "10px", fontSize: "0.73rem", fontWeight: 700, border: isActive ? "2px solid #f43f5e" : "1.5px solid transparent", background: submitted ? (isActive ? "#fce7f3" : "#dcfce7") : "#f1f5f9", color: submitted ? (isActive ? "#9d174d" : "#166534") : "#94a3b8", cursor: submitted ? "pointer" : "default" }}>
                                                  {submitted ? `✓ Submitted${imgs.length ? ` (${imgs.length} img)` : ""}` : "Not submitted"}
                                                  {submitted && <span style={{ marginLeft: "4px", fontSize: "0.62rem" }}>{isActive ? "▲" : "▼"}</span>}
                                                </button>
                                              );
                                            };

                                            const openType    = isEvOpen ? "evidence" : isDdosOpen ? "ddos" : null;
                                            const galleryImgs = openType === "evidence" ? (entry.images || []) : (entry.ddosImages || []);
                                            const galleryNote = openType === "evidence" ? entry.evidenceNote : entry.ddosNote;

                                            return (
                                              <div key={uid || i} style={{ borderRadius: "8px", border: `1px solid ${openType ? "#f9a8d4" : "#e2e8f0"}`, overflow: "hidden", background: "#fff" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 14px", flexWrap: "wrap" }}>
                                                  <span style={{ fontWeight: 700, fontSize: "0.84rem", color: "#1e293b", minWidth: "110px" }}>
                                                    {entry.userId?.fullName || "—"}
                                                  </span>
                                                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                                      <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>Evidence:</span>
                                                      {chipBtn("evidence")}
                                                    </div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                                      <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>DDoS:</span>
                                                      {chipBtn("ddos")}
                                                    </div>
                                                  </div>
                                                </div>
                                                {openType && (
                                                  <div style={{ borderTop: "1px solid #fce7f3", background: "#fff7f7", padding: "12px 16px" }}>
                                                    {galleryNote && (
                                                      <p style={{ margin: "0 0 10px", fontSize: "0.78rem", color: "#475569", background: "#fff", padding: "7px 11px", borderRadius: "7px", border: "1px solid #e2e8f0" }}>
                                                        <strong style={{ color: "#334155" }}>Note: </strong>{galleryNote}
                                                      </p>
                                                    )}
                                                    {galleryImgs.length === 0 ? (
                                                      <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem" }}>No images uploaded.</p>
                                                    ) : (
                                                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                                        {galleryImgs.map((img, imgIdx) => (
                                                          <div key={imgIdx}
                                                            onClick={() => setLightbox({ images: galleryImgs, idx: imgIdx })}
                                                            title={img.name}
                                                            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", cursor: "zoom-in" }}>
                                                            <img
                                                              src={getEvidenceImageSrc(img)}
                                                              alt={img.name}
                                                              style={{ width: "100px", height: "80px", objectFit: "cover", borderRadius: "8px", border: "1.5px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", transition: "transform 0.15s, box-shadow 0.15s" }}
                                                              onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.18)"; }}
                                                              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
                                                            />
                                                            <span style={{ fontSize: "0.63rem", color: "#64748b", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                              {img.name}
                                                            </span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const taskPanelStyle = { padding: "18px 20px 20px", overflow: "hidden" };
const sectionTitleStyle = { margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 700, color: "#1e293b", lineHeight: 1.25 };
const tableStyle        = { width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" };
const thStyle = { padding: "8px 12px", fontWeight: 600, color: "#475569", fontSize: "0.78rem", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 12px", verticalAlign: "middle" };
const urlCellStyle = { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 };
const urlLinkStyle = { color: "#2563eb", textDecoration: "none", display: "block", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" };

const EV_BADGE_COLORS = {
  green:  { bg: "#dcfce7", color: "#166534" },
  yellow: { bg: "#fef9c3", color: "#854d0e" },
  blue:   { bg: "#dbeafe", color: "#1e40af" },
  pink:   { bg: "#fce7f3", color: "#9d174d" },
};
function evBadge(variant) {
  const c = EV_BADGE_COLORS[variant] || EV_BADGE_COLORS.yellow;
  return { display: "inline-block", padding: "3px 10px", borderRadius: "10px", fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap", background: c.bg, color: c.color };
}
function evBtn(variant) {
  const c = EV_BADGE_COLORS[variant] || EV_BADGE_COLORS.blue;
  return { padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700, borderRadius: "7px", border: `1.5px solid ${c.color}33`, background: c.bg, color: c.color, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" };
}
