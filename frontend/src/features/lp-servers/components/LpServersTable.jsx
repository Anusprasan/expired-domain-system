import React, { useState } from "react";
import { FaExternalLinkAlt, FaEye, FaEyeSlash } from "react-icons/fa";
import axiosClient from "../../../shared/api/axiosClient";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useLpServersUiCopy } from "../hooks/useLpServersUiCopy";

function formatOptionalField(value) {
  return String(value || "").trim() || "-";
}

export default function LpServersTable({
  lpServers,
  searchQuery,
  onSearchChange,
  onEdit,
  onDelete,
  busyId,
  canEdit,
  canDelete,
}) {
  const { copy } = useLpServersUiCopy();
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [loadingPasswords, setLoadingPasswords] = useState({});
  const [copyError, setCopyError] = useState("");
  const [copySuccess, setCopySuccess] = useState("");
  const showActionsColumn = canEdit || canDelete;
  const columnCount = showActionsColumn ? 7 : 6;

  const handleViewPassword = async (id) => {
    try {
      if (id in visiblePasswords) {
        const updated = { ...visiblePasswords };
        delete updated[id];
        setVisiblePasswords(updated);
        return;
      }

      setLoadingPasswords((prev) => ({ ...prev, [id]: true }));

      const res = await axiosClient.get(`/lp-servers/${id}/password`);
      const password = res.data.password || res.data.data?.password;

      if (!password) {
        setCopyError(copy.common.passwordNotReceived);
        return;
      }

      setVisiblePasswords((prev) => ({
        ...prev,
        [id]: password,
      }));
    } catch (err) {
      console.error(err);
      setCopyError(err.response?.data?.message || copy.common.fetchPasswordError);
    } finally {
      setLoadingPasswords((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleCopyText = async (value, label) => {
    try {
      const text = String(value || "").trim();

      if (!text) {
        setCopyError(copy.common.copyEmpty(label));
        return;
      }

      await navigator.clipboard.writeText(text);
      setCopySuccess(copy.common.copied(label));
    } catch (err) {
      console.error(err);
      setCopyError(copy.common.copyFailed(label));
    }
  };

  const handleCopyPassword = async (id) => {
    try {
      let password = visiblePasswords[id];

      if (!password) {
        setLoadingPasswords((prev) => ({ ...prev, [id]: true }));

        const res = await axiosClient.get(`/lp-servers/${id}/password`);
        password = res.data.password || res.data.data?.password;

        if (!password) {
          setCopyError(copy.common.passwordNotReceived);
          return;
        }
      }

      await navigator.clipboard.writeText(password);
      setCopySuccess(copy.common.copied(copy.table.headers.password));
    } catch (err) {
      console.error(err);
      setCopyError(err.response?.data?.message || copy.common.copyFailed(copy.table.headers.password));
    } finally {
      setLoadingPasswords((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <section className="app-panel management-table">
      <div className="management-section-header">
        <div>
          <p className="management-help-text">
            {copy.table.copyHint}
          </p>
        </div>

        <div className="management-search">
          <input
            id="lp-server-search"
            type="search"
            aria-label={copy.common.search}
            placeholder={copy.table.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <ToastNotice message={copyError} onClose={() => setCopyError("")} />
      <ToastNotice message={copySuccess} tone="success" onClose={() => setCopySuccess("")} />

      <div className="management-table-wrap">
        <table className="brands-management-table lp-servers-table">
          <thead>
            <tr>
              <th style={{ width: "12%" }}>{copy.table.headers.brand}</th>
              <th style={{ width: "22%" }}>{copy.table.headers.url}</th>
              <th style={{ width: "14%" }}>{copy.table.headers.serverIp}</th>
              <th style={{ width: "14%" }}>{copy.table.headers.username}</th>
              <th style={{ width: "14%" }}>{copy.table.headers.password}</th>
              <th style={{ width: "16%" }}>{copy.table.headers.note}</th>
              {showActionsColumn ? <th>{copy.table.headers.actions}</th> : null}
            </tr>
          </thead>

          <tbody>
            {lpServers.length ? lpServers.map((item) => {
              const isBusy = busyId === item._id;
              const isVisible = item._id in visiblePasswords;

              return (
                <tr key={item._id}>
                  <td style={{ verticalAlign: "middle" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "120px",
                        height: "50px",
                        borderRadius: "10px",
                        fontSize: "15px",
                        fontWeight: "600",
                        background: item.brandId?.backgroundCss || "#eee",
                        color: item.brandId?.textColor || "#333",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        padding: "0 8px",
                      }}
                    >
                      {item.brandId?.brandName?.toUpperCase()}
                    </div>
                  </td>

                  <td style={{ verticalAlign: "middle" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        width: "100%",
                      }}
                    >
                      <button
                        type="button"
                        className="development-icon-button"
                        onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
                        title={copy.table.openUrlTitle}
                      >
                        <FaExternalLinkAlt />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyText(item.url, "URL")}
                        title={copy.table.copyUrlTitle}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          margin: 0,
                          cursor: "pointer",
                          textAlign: "left",
                          color: "inherit",
                          font: "inherit",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {item.url}
                      </button>
                    </div>
                  </td>

                  <td style={{ verticalAlign: "middle" }}>
                    <button
                      type="button"
                      onClick={() => handleCopyText(item.serverIp, copy.table.headers.serverIp)}
                      title={copy.table.copyServerIpTitle}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        margin: 0,
                        cursor: "pointer",
                        textAlign: "left",
                        color: "inherit",
                        font: "inherit",
                        verticalAlign: "middle",
                      }}
                    >
                      {formatOptionalField(item.serverIp)}
                    </button>
                  </td>

                  <td style={{ verticalAlign: "middle" }}>
                    <button
                      type="button"
                      onClick={() => handleCopyText(item.username, copy.table.headers.username)}
                      title={copy.table.copyUsernameTitle}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        margin: 0,
                        cursor: "pointer",
                        textAlign: "left",
                        color: "inherit",
                        font: "inherit",
                        verticalAlign: "middle",
                      }}
                    >
                      {formatOptionalField(item.username)}
                    </button>
                  </td>

                  <td style={{ verticalAlign: "middle" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        justifyContent: "space-between",
                        width: "100%",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleCopyPassword(item._id)}
                        title={copy.table.copyPasswordTitle}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          margin: 0,
                          cursor: "pointer",
                          textAlign: "left",
                          color: "inherit",
                          font: "inherit",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {loadingPasswords[item._id]
                          ? copy.table.loadingPassword
                          : isVisible
                            ? visiblePasswords[item._id]
                            : copy.common.passwordMask}
                      </button>

                      <button
                        type="button"
                        className="development-icon-button"
                        onClick={() => handleViewPassword(item._id)}
                        title={isVisible ? copy.form.hidePassword : copy.form.showPassword}
                      >
                        {isVisible ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </td>

                  <td style={{ verticalAlign: "middle" }}>{formatOptionalField(item.note)}</td>

                  {showActionsColumn ? (
                    <td className="lp-servers-actions-cell" style={{ verticalAlign: "middle" }}>
                      <div className="management-inline-actions">
                        {canEdit ? (
                          <button
                            className="management-button-secondary"
                            onClick={() => onEdit(item)}
                          >
                            {copy.table.edit}
                          </button>
                        ) : null}

                        {canDelete ? (
                          <button
                            className="management-button-secondary"
                            onClick={() => onDelete(item)}
                            disabled={isBusy}
                          >
                            {copy.table.delete}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={columnCount}>{copy.table.empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
