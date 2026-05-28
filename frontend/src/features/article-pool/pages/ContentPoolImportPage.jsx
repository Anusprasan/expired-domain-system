import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { hasPrivilege } from "../../../shared/utils/permissions";
import {
  importArticlePoolCsvApi,
  previewArticlePoolCsvImportApi,
} from "../api/articlePoolApi";
import ContentPoolBulkImportForm from "../components/ContentPoolBulkImportForm";
import { useArticlePoolUiCopy } from "../hooks/useArticlePoolUiCopy";
import "../../../shared/styles/management.css";

export default function ContentPoolImportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { copy } = useArticlePoolUiCopy();
  const [busy, setBusy] = useState(false);
  const canImportArticles = useMemo(() => hasPrivilege(user, "IMPORT_ARTICLE_POOL"), [user]);
  const canUpdateExisting = useMemo(() => hasPrivilege(user, "EDIT_ARTICLE_POOL"), [user]);

  const handlePreview = useCallback(async (payload) => {
    return previewArticlePoolCsvImportApi(payload);
  }, []);

  const handleSubmit = useCallback(async (payload) => {
    try {
      setBusy(true);
      return await importArticlePoolCsvApi(payload);
    } finally {
      setBusy(false);
    }
  }, []);

  if (!canImportArticles) {
    return (
      <div className="management-page money-site-import-page content-pool-import-page">
        <section className="app-panel management-header money-site-import-header">
          <div>
            <h1>{copy.importPage.title}</h1>
            <p>{copy.importPage.noPermission}</p>
          </div>
          <div className="management-header-actions">
            <button
              type="button"
              className="management-button-secondary"
              onClick={() => navigate("/article-pool")}
            >
              {copy.importPage.backToList}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <ContentPoolBulkImportForm
      busy={busy}
      canUpdateExisting={canUpdateExisting}
      onBack={() => navigate("/article-pool")}
      onPreview={handlePreview}
      onSubmit={handleSubmit}
    />
  );
}
