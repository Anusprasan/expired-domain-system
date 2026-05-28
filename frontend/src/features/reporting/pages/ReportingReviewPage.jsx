import React from "react";
import { Link, useParams } from "react-router-dom";
import ReporterWorkspace from "../components/ReporterWorkspace";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";
import "../../../shared/styles/management.css";
import "../../../shared/styles/reporting.css";

export default function ReportingReviewPage() {
  const { reportId = "" } = useParams();
  const { copy } = useReportingUiCopy();

  return (
    <div className="management-page reporting-page">
      <section className="app-panel management-header reporting-header">
        <div>
          <h1>{copy.page.reviewTitle}</h1>
        </div>
        <div className="reporting-page-header-actions">
          <Link className="management-button-secondary" to="/reporting">
            {copy.page.backToReporting}
          </Link>
        </div>
      </section>

      <ReporterWorkspace mode="review" fixedReportId={reportId} />
    </div>
  );
}
