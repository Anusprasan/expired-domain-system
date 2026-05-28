import React, { useMemo, useState } from "react";
import { FaEye } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { useBrands } from "../../brands/hooks/useBrands";
import DatePicker from "../../../shared/components/DatePicker";
import ToastNotice from "../../../shared/components/ToastNotice";
import { useGlobalDateFilter } from "../../../shared/context/GlobalDateContext";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import "../../../shared/styles/management.css";
import { hasAnyPrivilege, hasPrivilege } from "../../../shared/utils/permissions";
import { exportArticlePoolCsvApi } from "../api/articlePoolApi";
import ContentPoolForm from "../components/ContentPoolForm";
import ContentPoolPreviewModal from "../components/ContentPoolPreviewModal";
import { useArticlePoolUiCopy } from "../hooks/useArticlePoolUiCopy";
import { useArticlePool } from "../hooks/useArticlePool";

function getPlainText(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(.|\n)*?>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function getWordCount(value) {
  const text = getPlainText(value);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function getDateStart(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function getDateEnd(value) {
  const date = getDateStart(value);
  if (!date) {
    return null;
  }

  date.setHours(23, 59, 59, 999);
  return date;
}

function getItemDate(item) {
  const date = new Date(item.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesDate(item, fromDate, toDate) {
  const time = getItemDate(item)?.getTime();
  if (!time) {
    return false;
  }

  const start = getDateStart(fromDate);
  if (start && time < start.getTime()) {
    return false;
  }

  const end = getDateEnd(toDate);
  if (end && time > end.getTime()) {
    return false;
  }

  return true;
}

function matchesSingleDate(item, selectedDate) {
  const time = getItemDate(item)?.getTime();
  const start = getDateStart(selectedDate)?.getTime();
  const end = getDateEnd(selectedDate)?.getTime();

  if (!time || !start || !end) {
    return false;
  }

  return time >= start && time <= end;
}

function getCreatorName(item) {
  return item.addedBy?.fullName || item.addedBy?.email || "-";
}

function getArticleTitle(item) {
  return item.content?.title || item.topic || "-";
}

function formatDate(value, locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString(locale);
}

function matchesSearch(item, query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    item.brandName,
    getArticleTitle(item),
    getCreatorName(item),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function compareValues(left, right, direction = "asc") {
  const leftValue = left ?? "";
  const rightValue = right ?? "";
  const comparison = typeof leftValue === "number" && typeof rightValue === "number"
    ? leftValue - rightValue
    : String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
        sensitivity: "base",
      });

  return direction === "desc" ? comparison * -1 : comparison;
}

function ArticlePoolEmptyState({ actionLabel, onAction, copy }) {
  return (
    <div className="article-pool-empty-state">
      <strong>{copy.emptyState.title}</strong>
      <p>{copy.emptyState.description}</p>
      {actionLabel && onAction ? (
        <button type="button" className="management-button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default function ArticlePoolPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { copy, locale } = useArticlePoolUiCopy();
  const { brands } = useBrands();
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeEditItem, setActiveEditItem] = useState(null);
  const [activePreviewItem, setActivePreviewItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const {
    singleDate: selectedDate,
    useRange: useDateRange,
    fromDate,
    toDate,
    setSingleDate: setSelectedDate,
    setRangeMode: setGlobalRangeMode,
    setRange: setGlobalRange,
  } = useGlobalDateFilter();

  const canCreateArticles = hasPrivilege(user, "CREATE_ARTICLE_POOL");
  const canUpdateArticles = hasPrivilege(user, "EDIT_ARTICLE_POOL");
  const canDeleteArticles = hasPrivilege(user, "DELETE_ARTICLE_POOL");
  const canImportArticles = hasPrivilege(user, "IMPORT_ARTICLE_POOL");
  const canExportArticles = hasPrivilege(user, "EXPORT_ARTICLE_POOL");
  const canAccessArticles = hasAnyPrivilege(user, [
    "READ_ARTICLE_POOL",
    "CREATE_ARTICLE_POOL",
    "EDIT_ARTICLE_POOL",
    "DELETE_ARTICLE_POOL",
    "IMPORT_ARTICLE_POOL",
    "EXPORT_ARTICLE_POOL",
    "ADMIN_ACCESS",
  ]);

  const {
    articles,
    loading,
    error,
    createArticle,
    updateArticle,
    deleteArticle,
  } = useArticlePool({
    loadArticles: canAccessArticles,
  });

  const canUpdateArticle = () => canUpdateArticles;

  const canDeleteArticle = () => canDeleteArticles;

  const filteredArticles = useMemo(() => {
    const rows = articles.filter((item) => {
      const dateMatch = useDateRange
        ? matchesDate(item, fromDate, toDate)
        : matchesSingleDate(item, selectedDate);
      return dateMatch && matchesSearch(item, searchQuery);
    });

    return [...rows].sort((left, right) => {
      switch (sort.key) {
        case "brand":
          return compareValues(left.brandName, right.brandName, sort.direction);
        case "title":
          return compareValues(getArticleTitle(left), getArticleTitle(right), sort.direction);
        case "createdBy":
          return compareValues(getCreatorName(left), getCreatorName(right), sort.direction);
        case "date":
        default:
          return compareValues(
            getItemDate(left)?.getTime() || 0,
            getItemDate(right)?.getTime() || 0,
            sort.direction
          );
      }
    });
  }, [articles, fromDate, searchQuery, selectedDate, sort, toDate, useDateRange]);

  const handleSortChange = (key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleCreateArticle = async (payload) => {
    try {
      setFormError("");
      setBusy(true);
      await createArticle(payload);
      setShowAddModal(false);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.createError);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveArticle = async (payload) => {
    if (!activeEditItem) {
      return;
    }

    try {
      setFormError("");
      setBusyId(activeEditItem._id);
      await updateArticle(activeEditItem._id, payload);
      setActiveEditItem(null);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.updateError);
      throw err;
    } finally {
      setBusyId("");
    }
  };

  const handleDeleteArticle = async () => {
    if (!activeEditItem) {
      return;
    }

    try {
      setFormError("");
      setBusyId(activeEditItem._id);
      await deleteArticle(activeEditItem._id);
      setActiveEditItem(null);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.deleteError);
      throw err;
    } finally {
      setBusyId("");
    }
  };

  const handleDeleteRow = async (item) => {
    const confirmed = window.confirm(copy.page.deleteConfirm);
    if (!confirmed) {
      return;
    }

    try {
      setFormError("");
      setBusyId(item._id);
      await deleteArticle(item._id);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.deleteError);
    } finally {
      setBusyId("");
    }
  };

  const handleExportCsv = async () => {
    try {
      setFormError("");
      setExportBusy(true);
      const blob = await exportArticlePoolCsvApi();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = "content-pool-export.csv";
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

  useEscapeKey(showAddModal, () => setShowAddModal(false));
  useEscapeKey(Boolean(activeEditItem), () => setActiveEditItem(null));
  useEscapeKey(Boolean(activePreviewItem), () => setActivePreviewItem(null));

  const renderSortableHeader = (label, key, className = "") => (
    <th className={className}>
      <button
        type="button"
        className={`development-sort-button${sort.key === key ? " is-active" : ""}`}
        onClick={() => handleSortChange(key)}
      >
        <span>{label}</span>
        <span className="development-sort-arrows" aria-hidden="true">
          <span className={sort.key === key && sort.direction === "asc" ? "is-active" : ""}>{"\u2191"}</span>
          <span className={sort.key === key && sort.direction === "desc" ? "is-active" : ""}>{"\u2193"}</span>
        </span>
      </button>
    </th>
  );

  return (
    <div className="management-page article-pool-page">
      <section className="app-panel management-header">
        <div>
          <h1>{copy.page.title}</h1>
          <p>{copy.page.description}</p>
        </div>
        <div className="management-header-actions">
          <div className="article-pool-header-action-group">
            {canImportArticles ? (
              <button
                type="button"
                className="management-button-secondary"
                onClick={() => navigate("/article-pool/import")}
              >
                {copy.page.importCsv}
              </button>
            ) : null}
            {canExportArticles ? (
              <button
                type="button"
                className="management-button-secondary"
                onClick={() => void handleExportCsv()}
                disabled={exportBusy}
              >
                {exportBusy ? copy.page.exporting : copy.page.exportCsv}
              </button>
            ) : null}
            {canCreateArticles ? (
              <button
                type="button"
                className="management-button management-button-with-icon"
                onClick={() => {
                  setFormError("");
                  setShowAddModal(true);
                }}
              >
                <span className="management-button-icon" aria-hidden="true">+</span>
                <span>{copy.page.addContent}</span>
              </button>
            ) : null}
          </div>
          <div className="management-summary">
            <strong>{articles.length}</strong>
            <span>{copy.page.totalContent}</span>
          </div>
        </div>
      </section>

      <ToastNotice message={formError} onClose={() => setFormError("")} />
      {error ? <p className="management-error">{error}</p> : null}

      {showAddModal ? (
        <div className="management-modal-backdrop">
          <div className="management-modal management-modal-wide" onClick={(event) => event.stopPropagation()}>
            <ContentPoolForm
              brands={brands}
              busy={busy}
              onSubmit={handleCreateArticle}
              onCancel={() => setShowAddModal(false)}
            />
          </div>
        </div>
      ) : null}

      {activeEditItem ? (
        <div className="management-modal-backdrop">
          <div className="management-modal management-modal-wide" onClick={(event) => event.stopPropagation()}>
            <ContentPoolForm
              brands={brands}
              article={activeEditItem}
              busy={busyId === activeEditItem._id}
              canDelete={canDeleteArticle(activeEditItem)}
              onSubmit={handleSaveArticle}
              onDelete={handleDeleteArticle}
              onCancel={() => setActiveEditItem(null)}
            />
          </div>
        </div>
      ) : null}

      {activePreviewItem ? (
        <div className="management-modal-backdrop">
          <div className="management-modal management-modal-wide" onClick={(event) => event.stopPropagation()}>
            <ContentPoolPreviewModal
              item={activePreviewItem}
              onClose={() => setActivePreviewItem(null)}
            />
          </div>
        </div>
      ) : null}

      {loading ? (
        <section className="app-panel management-state">
          <h2>{copy.page.loadingTitle}</h2>
          <p>{copy.page.loadingDescription}</p>
        </section>
      ) : canAccessArticles ? (
        <section className="app-panel management-table article-pool-table-panel">
          <div className="management-section-header">
            <div>
              <h2>{copy.page.tableTitle}</h2>
              <p>{copy.page.tableDescription}</p>
            </div>
            <div className="development-filter-bar article-pool-toolbar">
              <div className="management-search">
                <label htmlFor="article-pool-search">{copy.common.search}</label>
                <input
                  id="article-pool-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={copy.page.searchPlaceholder}
                />
              </div>
              <DatePicker
                id="article-pool-date"
                label={copy.page.date}
                singleDate={selectedDate}
                useRange={useDateRange}
                fromDate={fromDate}
                toDate={toDate}
                onSingleDateChange={setSelectedDate}
                onRangeModeChange={setGlobalRangeMode}
                onRangeChange={setGlobalRange}
              />
            </div>
          </div>

          <div className="management-table-wrap">
            <table className={`development-assign-table article-pool-table article-pool-assign-table${filteredArticles.length ? "" : " is-empty"}`}>
              <colgroup>
                <col className="article-pool-col-created" />
                <col className="article-pool-col-brand" />
                <col className="article-pool-col-title" />
                <col className="article-pool-col-created-by" />
                <col className="article-pool-col-preview" />
                <col className="article-pool-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  {renderSortableHeader(copy.page.createdDate, "date")}
                  {renderSortableHeader(copy.page.brand, "brand", "development-brand-column")}
                  {renderSortableHeader(copy.page.titleColumn, "title", "article-pool-topic-column")}
                  {renderSortableHeader(copy.page.createdBy, "createdBy", "article-pool-created-by-column")}
                  <th className="development-content-column">{copy.page.preview}</th>
                  <th className="development-edit-column">{copy.page.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filteredArticles.length ? filteredArticles.map((item) => {
                  const canUpdate = canUpdateArticle(item);
                  const canDelete = canDeleteArticle(item);

                  return (
                    <tr key={item._id}>
                      <td><strong>{formatDate(item.createdAt, locale)}</strong></td>
                      <td className="development-brand-column"><strong>{item.brandName}</strong></td>
                      <td className="article-pool-topic-column">
                        <div className="article-pool-topic-cell">
                          <strong>{getArticleTitle(item)}</strong>
                          <span>{copy.common.words(getWordCount(item.content?.body))}</span>
                        </div>
                      </td>
                      <td className="article-pool-created-by-column">
                        <div className="article-pool-created-by-cell">
                          <strong>{getCreatorName(item)}</strong>
                          {item.addedBy?.email ? <span>{item.addedBy.email}</span> : null}
                        </div>
                      </td>
                      <td className="development-content-column article-pool-preview-column">
                        <button
                          type="button"
                          className="development-icon-button is-ready"
                          onClick={() => setActivePreviewItem(item)}
                          title={copy.page.previewContent}
                        >
                          <FaEye />
                        </button>
                      </td>
                      <td className="development-edit-column">
                        {canUpdate || canDelete ? (
                          <div className="development-edit-actions">
                            {canUpdate ? (
                              <button
                                type="button"
                                className="management-button-secondary development-edit-action"
                                onClick={() => setActiveEditItem(item)}
                              >
                                {copy.page.update}
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                className="management-button-secondary development-edit-action is-danger"
                                onClick={() => handleDeleteRow(item)}
                                disabled={busyId === item._id}
                              >
                                {copy.page.delete}
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="6">{copy.page.noData}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="article-pool-mobile-list">
            {filteredArticles.length ? filteredArticles.map((item) => {
              const canUpdate = canUpdateArticle(item);
              const canDelete = canDeleteArticle(item);

              return (
                <article key={item._id} className="article-pool-mobile-card">
                  <div className="article-pool-mobile-card-header">
                    <span>{item.brandName}</span>
                    <strong>{formatDate(item.createdAt, locale)}</strong>
                  </div>
                  <div className="article-pool-topic-cell">
                    <strong>{getArticleTitle(item)}</strong>
                    <span>{copy.common.words(getWordCount(item.content?.body))}</span>
                  </div>
                  <dl className="article-pool-mobile-meta">
                    <div>
                      <dt>{copy.page.createdBy}</dt>
                      <dd>{getCreatorName(item)}</dd>
                    </div>
                  </dl>
                  <div className="article-pool-mobile-actions">
                    <button type="button" className="management-button-secondary" onClick={() => setActivePreviewItem(item)}>
                      {copy.page.preview}
                    </button>
                    {canUpdate ? (
                      <button type="button" className="management-button-secondary" onClick={() => setActiveEditItem(item)}>
                        {copy.page.update}
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="management-button-secondary is-danger"
                        onClick={() => handleDeleteRow(item)}
                        disabled={busyId === item._id}
                      >
                        {copy.page.delete}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            }) : (
              <ArticlePoolEmptyState
                actionLabel={canCreateArticles ? copy.page.addContent : ""}
                onAction={canCreateArticles ? () => setShowAddModal(true) : null}
                copy={copy}
              />
            )}
          </div>
        </section>
      ) : (
        <section className="app-panel management-state">
          <h2>{copy.common.noAccess}</h2>
          <p>{copy.page.noPrivileges}</p>
        </section>
      )}
    </div>
  );
}
