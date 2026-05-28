import React, { useEffect, useMemo, useRef, useState } from "react";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";

export default function ReportingReviewReportSwitcher({
  reports,
  activeReportId,
  onSelectReport,
  summaryLabel,
  getStatusTone,
  getStatusLabel,
}) {
  const { copy } = useReportingUiCopy();
  const containerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const safeReports = Array.isArray(reports) ? reports : [];
  const activeReport = useMemo(
    () =>
      safeReports.find((report) => String(report?._id || "") === String(activeReportId || "")) ||
      safeReports[0] ||
      null,
    [activeReportId, safeReports]
  );

  useEffect(() => {
    setIsOpen(false);
  }, [activeReportId]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  if (!safeReports.length) {
    return null;
  }

  return (
    <section ref={containerRef} className=" reporting-review-report-picker">
     
         
           
          <span>{summaryLabel || copy.reviewSwitcher.summaryLabelFallback}</span>
       
        <div className="reporting-review-report-picker-side">
          <span className="reporting-review-report-picker-count">
            {copy.reviewSwitcher.reportsCount(safeReports.length)}
          </span>
      
      </div>

      <div className="reporting-review-report-dropdown">
        <button
          type="button"
          className={`reporting-review-report-picker-trigger${isOpen ? " is-open" : ""}`}
          onClick={() => setIsOpen((currentValue) => !currentValue)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="reporting-review-report-picker-trigger-copy">
            <span className="reporting-review-report-picker-trigger-label">
              {copy.reviewSwitcher.currentReport}
            </span>
            <strong>{activeReport?.url || copy.reviewSwitcher.selectReport}</strong>
          </span>

          <span className="reporting-review-report-picker-trigger-side">
            {activeReport ? (
              <span className={`reporter-workspace-badge ${getStatusTone(activeReport.simpleStatus)}`}>
                {getStatusLabel(activeReport.simpleStatus)}
              </span>
            ) : null}
            <span className="reporting-review-report-picker-trigger-icon">{isOpen ? "^" : "v"}</span>
          </span>
        </button>

        {isOpen ? (
          <div
            className="reporting-review-report-picker-menu"
            role="listbox"
            aria-label={copy.reviewSwitcher.otherReports}
          >
            {safeReports.map((report) => {
              const isActive = String(report?._id || "") === String(activeReportId || "");

              return (
                <button
                  key={report._id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`reporting-review-report-card${isActive ? " is-active" : ""}`}
                  onClick={() => {
                    onSelectReport(report._id);
                    setIsOpen(false);
                  }}
                >
                  <span className="reporting-review-report-card-link">{report.url}</span>

                  <div className="reporting-review-report-card-badges">
                    <span className={`reporter-workspace-badge ${getStatusTone(report.simpleStatus)}`}>
                      {getStatusLabel(report.simpleStatus)}
                    </span>
                    {isActive ? (
                      <span className="reporter-workspace-badge is-open">
                        {copy.reviewSwitcher.viewing}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
