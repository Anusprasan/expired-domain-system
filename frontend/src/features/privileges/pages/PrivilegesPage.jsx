import React from "react";
import PrivilegesTable from "../components/PrivilegesTable";
import { usePrivileges } from "../hooks/usePrivileges";
import { useUiLanguage } from "../../../shared/hooks/useUiLanguage";
import "../../../shared/styles/management.css";

export default function PrivilegesPage() {
  const { copy } = useUiLanguage();
  const commonCopy = copy.common;
  const privilegesCopy = copy.privileges;
  const catalogCopy = copy.privilegeCatalog;
  const { privileges, loading, error } = usePrivileges();
  const loadError =
    error === "Failed to load privileges" ? privilegesCopy.page.loadErrorFallback : error;

  return (
    <div className="management-page">
      <section className="app-panel management-header">
        <div>
          <h1>{privilegesCopy.page.title}</h1>
          <p>{privilegesCopy.page.description}</p>
        </div>
        <div className="management-summary">
          <strong>{privileges.length}</strong>
          <span>{privilegesCopy.page.totalPrivileges}</span>
        </div>
      </section>

      {loadError ? <p className="management-error">{loadError}</p> : null}

      {loading ? (
        <section className="app-panel management-state">
          <h2>{commonCopy.loading}</h2>
          <p>{privilegesCopy.page.loadingDescription}</p>
        </section>
      ) : (
        <PrivilegesTable
          privileges={privileges}
          copy={privilegesCopy.table}
          catalogCopy={catalogCopy}
        />
      )}
    </div>
  );
}
