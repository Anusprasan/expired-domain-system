import React, { useEffect, useRef, useState } from "react";
import { getReportingTaskTrackingApi } from "../api/reportingApi";

const ISSUE_TYPE_LABELS = {
  cloaking: "Cloaking",
  brand_phishing: "Brand Phishing",
  death_phishing: "Death Phishing",
  stray_domain: "Stray Domain",
};

const STATUS_LABELS = {
  open: "Open",
  in_progress: "In Progress",
  reported: "Reported",
  submitted: "Submitted",
  resolved: "Resolved",
};

function StatusBadge({ value, trueLabel = "Yes", falseLabel = "No" }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "12px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: value ? "#dcfce7" : "#fee2e2",
        color: value ? "#166534" : "#991b1b",
      }}
    >
      {value ? trueLabel : falseLabel}
    </span>
  );
}

function ReportStatusBadge({ status }) {
  const colors = {
    open: { bg: "#dbeafe", color: "#1e40af" },
    in_progress: { bg: "#fef9c3", color: "#854d0e" },
    reported: { bg: "#ede9fe", color: "#5b21b6" },
    submitted: { bg: "#ffedd5", color: "#9a3412" },
    resolved: { bg: "#dcfce7", color: "#166534" },
  };
  const style = colors[status] || { bg: "#f1f5f9", color: "#334155" };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "12px",
        fontSize: "0.75rem",
        fontWeight: 600,
        background: style.bg,
        color: style.color,
      }}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function StaffDropdown({ staff }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!staff?.length) {
    return <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>Unassigned</span>;
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderRadius: "12px",
          fontSize: "0.78rem",
          fontWeight: 600,
          background: "#f1f5f9",
          color: "#334155",
          border: "1px solid #e2e8f0",
          cursor: "pointer",
        }}
      >
        {staff.length} assigned
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
        >
          <path d="M2 4l4 4 4-4" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
            minWidth: "240px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "6px 12px",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              borderBottom: "1px solid #f1f5f9",
            }}
          >
            Assigned Staff
          </div>
          {staff.map((member) => (
            <div
              key={String(member._id)}
              title={member.email}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                gap: "12px",
                borderBottom: "1px solid #f8fafc",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {member.fullName}
                </span>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {member.email}
                </span>
              </div>
              <StatusBadge value={member.evidenceUploaded} trueLabel="Uploaded" falseLabel="Pending" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportingTaskTracker() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const res = await getReportingTaskTrackingApi();
        if (!cancelled) setRows(res.data || []);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Failed to load task tracking.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="app-panel" style={{ marginTop: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Task Tracking</h2>
        <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
          {loading ? "" : `${rows.length} task${rows.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {error ? (
        <p className="management-error">{error}</p>
      ) : loading ? (
        <p style={{ color: "#64748b", fontSize: "0.875rem" }}>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.875rem" }}>No reporting tasks found.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={thStyle}>Brand</th>
                <th style={thStyle}>URL</th>
                <th style={thStyle}>Issue Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Assigned Staff</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Evidence Uploaded</th>
                <th style={{ ...thStyle, textAlign: "center" }}>DDoS Done</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row._id)} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={tdStyle}>
                    {row.brand ? (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: "12px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background: row.brand.backgroundCss || "#e2e8f0",
                          color: row.brand.textColor || "#1e293b",
                        }}
                      >
                        {row.brand.brandName}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: "240px", wordBreak: "break-all" }}>
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#2563eb", textDecoration: "none" }}
                      title={row.url}
                    >
                      {row.url}
                    </a>
                  </td>
                  <td style={tdStyle}>
                    {ISSUE_TYPE_LABELS[row.issueType] || row.issueType}
                  </td>
                  <td style={tdStyle}>
                    <ReportStatusBadge status={row.status} />
                  </td>
                  <td style={tdStyle}>
                    <StaffDropdown staff={row.assignedStaff} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <StatusBadge value={row.evidenceUploaded} trueLabel="Yes" falseLabel="No" />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <StatusBadge value={row.didDdos} trueLabel="Done" falseLabel="No" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const thStyle = {
  padding: "8px 12px",
  fontWeight: 600,
  color: "#475569",
  fontSize: "0.78rem",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "10px 12px",
  verticalAlign: "middle",
};
