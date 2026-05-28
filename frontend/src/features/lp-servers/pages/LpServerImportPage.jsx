import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { hasPrivilege } from "../../../shared/utils/permissions";
import {
  importLpServersCsvApi,
  previewLpServersCsvImportApi,
} from "../api/lpServersApi";
import LpServerBulkImportForm from "../components/LpServerBulkImportForm";
import { useLpServersUiCopy } from "../hooks/useLpServersUiCopy";
import "../../../shared/styles/management.css";

export default function LpServerImportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { copy } = useLpServersUiCopy();
  const [busy, setBusy] = useState(false);
  const canImportServers = useMemo(() => hasPrivilege(user, "IMPORT_LP_SERVERS_DETAILS"), [user]);
  const canUpdateExisting = useMemo(() => hasPrivilege(user, "EDIT_LP_SERVERS_DETAILS"), [user]);

  const handlePreview = useCallback(async (payload) => {
    return previewLpServersCsvImportApi(payload);
  }, []);

  const handleSubmit = useCallback(async (payload) => {
    try {
      setBusy(true);
      return await importLpServersCsvApi(payload);
    } finally {
      setBusy(false);
    }
  }, []);

  if (!canImportServers) {
    return (
      <div className="management-page money-site-import-page">
        <section className="app-panel management-header money-site-import-header">
          <div>
            <h1>{copy.importPage.title}</h1>
            <p>{copy.importPage.noPermission}</p>
          </div>
          <div className="management-header-actions">
            <button
              type="button"
              className="management-button-secondary"
              onClick={() => navigate("/lp-servers")}
            >
              {copy.importPage.backToList}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <LpServerBulkImportForm
      busy={busy}
      canUpdateExisting={canUpdateExisting}
      onBack={() => navigate("/lp-servers")}
      onPreview={handlePreview}
      onSubmit={handleSubmit}
    />
  );
}
