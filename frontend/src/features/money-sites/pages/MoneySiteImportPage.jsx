import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { hasPrivilege } from "../../../shared/utils/permissions";
import {
  deleteAllMoneySitesApi,
  getMoneySiteSummaryApi,
  importMoneySitesCsvApi,
  previewMoneySitesCsvImportApi,
  requestDeleteAllMoneySitesVerificationApi,
  requestMoneySitesCsvImportVerificationApi,
} from "../api/moneySitesApi";
import MoneySiteBulkImportForm from "../components/MoneySiteBulkImportForm";
import { useMoneySiteUiCopy } from "../hooks/useMoneySiteUiCopy";
import "../../../shared/styles/management.css";

const NAWALA_IMPORT_STORAGE_KEY = "expired-domains:nawala-import-csv";

export default function MoneySiteImportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { copy } = useMoneySiteUiCopy();
  const [initialCsvText] = useState(() => {
    const stateText = location.state?.nawalaImportCsvText;

    if (stateText) {
      return String(stateText);
    }

    try {
      return window.sessionStorage.getItem(NAWALA_IMPORT_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [totalMoneySites, setTotalMoneySites] = useState(0);
  const canImportMoneySites = useMemo(() => hasPrivilege(user, "CREATE_MONEY_SITES"), [user]);
  const canUpdateExisting = useMemo(() => hasPrivilege(user, "EDIT_MONEY_SITES"), [user]);
  const canDeleteMoneySites = useMemo(() => hasPrivilege(user, "DELETE_MONEY_SITES"), [user]);
  const canUseTelegramVerification = useMemo(
    () =>
      (user?.telegramBots || []).some(
        (bot) => Boolean(bot?.isActive && String(bot?.chatId || "").trim() && bot?.hasStoredToken)
      ),
    [user]
  );

  const refreshTotalMoneySites = useCallback(async () => {
    try {
      const response = await getMoneySiteSummaryApi();
      setTotalMoneySites(response.data?.total || 0);
    } catch {
      setTotalMoneySites(0);
    }
  }, []);

  useEffect(() => {
    if (!initialCsvText) {
      return;
    }

    try {
      window.sessionStorage.removeItem(NAWALA_IMPORT_STORAGE_KEY);
    } catch {
      // Session storage is best-effort only.
    }
  }, [initialCsvText]);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        const response = await getMoneySiteSummaryApi();
        if (!cancelled) {
          setTotalMoneySites(response.data?.total || 0);
        }
      } catch {
        if (!cancelled) {
          setTotalMoneySites(0);
        }
      }
    };

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePreview = useCallback(async (payload) => {
    return previewMoneySitesCsvImportApi(payload);
  }, []);

  const handleRequestVerification = useCallback(async (payload) => {
    return requestMoneySitesCsvImportVerificationApi(payload);
  }, []);

  const handleSubmit = useCallback(async (payload) => {
    try {
      setBusy(true);
      const response = await importMoneySitesCsvApi(payload);
      await refreshTotalMoneySites();
      return response;
    } finally {
      setBusy(false);
    }
  }, [refreshTotalMoneySites]);

  const handleRequestDeleteVerification = useCallback(async () => {
    return requestDeleteAllMoneySitesVerificationApi();
  }, []);

  const handleDeleteAllMoneySites = useCallback(async (payload) => {
    try {
      setBusy(true);
      const response = await deleteAllMoneySitesApi(payload);
      await refreshTotalMoneySites();
      return response;
    } finally {
      setBusy(false);
    }
  }, [refreshTotalMoneySites]);

  if (!canImportMoneySites) {
    return (
      <div className="management-page money-site-import-page">
        <section className="app-panel management-header money-site-import-header">
          <div>
            <h1>{copy.importPage.title}</h1>
            <p>{copy.importPage.noPermission}</p>
          </div>
          <div className="management-header-actions">
            <button type="button" className="management-button-secondary" onClick={() => navigate("/money-sites")}>
              {copy.importPage.backButton}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <MoneySiteBulkImportForm
      busy={busy}
      canUpdateExisting={canUpdateExisting}
      canDeleteMoneySites={canDeleteMoneySites}
      canUseTelegramVerification={canUseTelegramVerification}
      totalMoneySites={totalMoneySites}
      initialCsvText={initialCsvText}
      onBack={() => navigate("/money-sites")}
      onPreview={handlePreview}
      onRequestVerification={handleRequestVerification}
      onRequestDeleteAllVerification={handleRequestDeleteVerification}
      onDeleteAllMoneySites={handleDeleteAllMoneySites}
      onSubmit={handleSubmit}
    />
  );
}
