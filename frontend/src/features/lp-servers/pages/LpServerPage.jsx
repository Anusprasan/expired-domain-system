import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { useBrands } from "../../brands/hooks/useBrands";
import ConfirmActionModal from "../../../shared/components/ConfirmActionModal";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import { hasPrivilege } from "../../../shared/utils/permissions";
import { exportLpServersCsvApi } from "../api/lpServersApi";
import LpServerForm from "../components/LpServerForm";
import LpServersTable from "../components/LpServersTable";
import { useLpServers } from "../hooks/useLpServers";
import { useLpServersUiCopy } from "../hooks/useLpServersUiCopy";
import "../../../shared/styles/management.css";

function matchesLpServerSearch(item, searchTerm) {
  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return [
    item.brandId?.brandName,
    item.url,
    item.serverIp,
    item.username,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedSearch));
}

export default function LpServersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { copy } = useLpServersUiCopy();
  const { brands } = useBrands();
  const [searchQuery, setSearchQuery] = useState("");

  const {
    lpServers,
    loading,
    error,
    createLpServer,
    updateLpServer,
    deleteLpServer,
  } = useLpServers();

  const filteredLpServers = useMemo(
    () => lpServers.filter((item) => matchesLpServerSearch(item, searchQuery)),
    [lpServers, searchQuery]
  );

  const [selected, setSelected] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  const canCreate = hasPrivilege(user, "CREATE_LP_SERVERS_DETAILS");
  const canEdit = hasPrivilege(user, "EDIT_LP_SERVERS_DETAILS");
  const canDelete = hasPrivilege(user, "DELETE_LP_SERVERS_DETAILS");
  const canImport = hasPrivilege(user, "IMPORT_LP_SERVERS_DETAILS");
  const canExport = hasPrivilege(user, "EXPORT_LP_SERVERS_DETAILS");

  useEscapeKey(showModal, () => {
    setShowModal(false);
    setSelected(null);
  });

  useEscapeKey(Boolean(pendingDelete), () => setPendingDelete(null));

  const handleSubmit = async (form) => {
    try {
      setFormError("");
      setFormSuccess("");
      setBusy(true);

      if (selected) {
        await updateLpServer(selected._id, form);
        setFormSuccess(copy.page.updateSuccess);
      } else {
        await createLpServer(form);
        setFormSuccess(copy.page.createSuccess);
      }

      setShowModal(false);
      setSelected(null);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.saveError);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (item) => {
    try {
      setFormError("");
      setFormSuccess("");
      setBusyId(item._id);

      await deleteLpServer(item._id);

      if (selected?._id === item._id) {
        setSelected(null);
      }

      setPendingDelete(null);
      setFormSuccess(copy.page.deleteSuccess);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.deleteError);
    } finally {
      setBusyId("");
    }
  };

  const handleExportCsv = async () => {
    try {
      setFormError("");
      setFormSuccess("");
      setExportBusy(true);
      const blob = await exportLpServersCsvApi();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = "lp-servers-export.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.exportError);
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="management-page">
      <section className="app-panel management-header">
        <div>
          <h1>{copy.page.title}</h1>
          <p>{copy.page.description}</p>
        </div>

        <div className="management-header-actions">
          <div className="article-pool-header-action-group">
            {canImport ? (
              <button
                type="button"
                className="management-button-secondary"
                onClick={() => navigate("/lp-servers/import")}
              >
                {copy.page.importCsv}
              </button>
            ) : null}
            {canExport ? (
              <button
                type="button"
                className="management-button-secondary"
                onClick={() => void handleExportCsv()}
                disabled={exportBusy}
              >
                {exportBusy ? copy.page.exporting : copy.page.exportCsv}
              </button>
            ) : null}
            {canCreate ? (
              <button
                type="button"
                className="management-button management-button-with-icon"
                onClick={() => {
                  setFormError("");
                  setFormSuccess("");
                  setSelected(null);
                  setShowModal(true);
                }}
              >
                <span className="management-button-icon">+</span>
                <span>{copy.page.createServer}</span>
              </button>
            ) : null}
          </div>

          <div className="management-summary">
            <strong>{filteredLpServers.length}</strong>
            <span>{copy.page.matchingServers}</span>
          </div>
        </div>
      </section>

      <ToastNotice message={formError} onClose={() => setFormError("")} />
      <ToastNotice message={formSuccess} tone="success" onClose={() => setFormSuccess("")} />

      {error ? <p className="management-error">{error}</p> : null}

      {showModal ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(e) => e.stopPropagation()}>
            <LpServerForm
              brands={brands}
              selected={selected}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowModal(false);
                setSelected(null);
              }}
              busy={busy}
            />
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(e) => e.stopPropagation()}>
            <ConfirmActionModal
              title={copy.page.deleteTitle}
              message={copy.page.deleteConfirm(pendingDelete.url)}
              confirmLabel={copy.common.delete}
              cancelLabel={copy.common.cancel}
              busyLabel={copy.common.working}
              busy={busyId === pendingDelete._id}
              onConfirm={() => handleDelete(pendingDelete)}
              onCancel={() => setPendingDelete(null)}
            />
          </div>
        </div>
      ) : null}

      <div className="management-grid is-single-column">
        {loading ? (
          <section className="app-panel management-state">
            <h2>{copy.page.loadingTitle}</h2>
            <p>{copy.page.loadingDescription}</p>
          </section>
        ) : (
          <LpServersTable
            lpServers={filteredLpServers}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            canEdit={canEdit}
            canDelete={canDelete}
            busyId={busyId}
            onEdit={(item) => {
              if (!canEdit) {
                setFormError(copy.page.editPermissionError);
                return;
              }

              setFormError("");
              setFormSuccess("");
              setSelected(item);
              setShowModal(true);
            }}
            onDelete={(item) => {
              if (!canDelete) {
                setFormError(copy.page.deletePermissionError);
                return;
              }

              setFormSuccess("");
              setPendingDelete(item);
            }}
          />
        )}
      </div>
    </div>
  );
}
