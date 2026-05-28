import React, { useEffect, useMemo, useState } from "react";
import { FaChartLine } from "react-icons/fa";
import { useAuth } from "../../auth/hooks/useAuth";
import { useBrands } from "../../brands/hooks/useBrands";
import ToastNotice from "../../../shared/components/ToastNotice";
import { hasAnyPrivilege, hasPrivilege } from "../../../shared/utils/permissions";
import { useDevelopment } from "../hooks/useDevelopment";
import AddDevelopmentDomainForm from "../components/AddDevelopmentDomainForm";
import AssignDeveloperForm from "../components/AssignDeveloperForm";
import DevelopmentAssignTable from "../components/DevelopmentAssignTable";
import DevelopmentContentModal from "../components/DevelopmentContentModal";
import ContentPoolForm from "../../article-pool/components/ContentPoolForm";
import {
  getArticlePoolArticleApi,
  updateArticlePoolArticleApi,
} from "../../article-pool/api/articlePoolApi";
import DatePicker from "../../../shared/components/DatePicker";
import { useGlobalDateFilter } from "../../../shared/context/GlobalDateContext";
import DevelopmentDoTable from "../components/DevelopmentDoTable";
import EditDevelopmentDomainForm from "../components/EditDevelopmentDomainForm";
import OverallProgressModal from "../components/OverallProgressModal";
import DevelopmentTemplatesModal from "../components/DevelopmentTemplatesModal";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";
import { useEscapeKey } from "../../../shared/hooks/useEscapeKey";
import "../../../shared/styles/management.css";

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

function getItemDate(item, dateField = "createdAt") {
  const date = new Date(item[dateField]);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function matchesDate(item, fromDate, toDate, dateField = "createdAt") {
  const time = getItemDate(item, dateField)?.getTime();
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

function matchesSingleDate(item, selectedDate, dateField = "createdAt") {
  const time = getItemDate(item, dateField)?.getTime();
  const start = getDateStart(selectedDate)?.getTime();
  const end = getDateEnd(selectedDate)?.getTime();

  if (!time || !start || !end) {
    return false;
  }

  return time >= start && time <= end;
}

function matchesAssignDate(item, selectedDate, fromDate, toDate, useRange) {
  if (item.assignedAt) {
    return useRange
      ? matchesDate(item, fromDate, toDate, "assignedAt")
      : matchesSingleDate(item, selectedDate, "assignedAt");
  }

  const createdAt = getItemDate(item, "createdAt");
  if (!createdAt) {
    return false;
  }

  if (useRange) {
    const end = getDateEnd(toDate || fromDate);
    if (!end) {
      return false;
    }

    return createdAt.getTime() <= end.getTime();
  }

  const selectedEnd = getDateEnd(selectedDate);
  if (!selectedEnd) {
    return false;
  }

  return createdAt.getTime() <= selectedEnd.getTime();
}

function matchesSearch(item, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    item.brandName,
    item.domain,
    item.assignedDeveloperId?.fullName,
    item.assignedDeveloperId?.email,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function includesText(value, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return String(value || "").toLowerCase().includes(normalizedQuery);
}

function compareValues(left, right, direction = "asc") {
  const leftValue = left ?? "";
  const rightValue = right ?? "";

  let comparison = 0;

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    comparison = leftValue - rightValue;
  } else {
    comparison = String(leftValue).localeCompare(String(rightValue), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  return direction === "desc" ? comparison * -1 : comparison;
}

function getOverallProgress(domains) {
  if (!domains.length) {
    return 0;
  }

  const total = domains.reduce((sum, item) => sum + (Number(item.progressPercent) || 0), 0);
  return Math.round(total / domains.length);
}

function getOverallProgressTone(progress) {
  if (progress <= 0) {
    return "is-neutral";
  }

  if (progress < 35) {
    return "is-danger";
  }

  if (progress < 75) {
    return "is-warning";
  }

  return "is-success";
}

function hasRequiredContent(item) {
  const content = item?.content || {};
  const resources = item?.resources || {};

  return Boolean(
    content.title?.trim() &&
    content.description?.trim() &&
    content.article?.trim() &&
    Array.isArray(resources.logos) &&
    resources.logos.length > 0 &&
    resources.heroImage?.trim() &&
    resources.favicon?.trim()
  );
}

function hasSelectedArticle(item) {
  return Boolean(item?.articlePoolArticleId?._id || item?.articlePoolArticleId);
}

function getArticlePoolArticleId(item) {
  return item?.articlePoolArticleId?._id || item?.articlePoolArticleId || "";
}

function mapContentPoolArticleToDevelopmentContent(article) {
  return {
    title: String(article?.content?.title || article?.topic || "").trim(),
    description: String(article?.content?.summary || "").trim(),
    article: String(article?.content?.body || "").trim(),
    note: String(article?.content?.note || "").trim(),
  };
}

function mapContentPoolArticleToDevelopmentResources(article) {
  return {
    logos: article?.resources?.logos || [],
    gifs: article?.resources?.gifs || [],
    heroImage: article?.resources?.heroImage || "",
    favicon: article?.resources?.favicon || "",
  };
}

function releaseContentLockOnUnload(id) {
  if (!id || typeof window === "undefined") {
    return;
  }

  const token = window.localStorage.getItem("token");
  const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
  const requestUrl = new URL(
    `${String(baseUrl).replace(/\/$/, "")}/development/domains/${id}/content-lock`,
    window.location.origin
  ).toString();

  fetch(requestUrl, {
    method: "DELETE",
    keepalive: true,
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  }).catch(() => {});
}

export default function DevelopmentPage() {
  const { user } = useAuth();
  const { brands } = useBrands();
  const { copy } = useDevelopmentUiCopy();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOverallProgress, setShowOverallProgress] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [activeContentItem, setActiveContentItem] = useState(null);
  const [activeContentPoolItem, setActiveContentPoolItem] = useState(null);
  const [activeEditItem, setActiveEditItem] = useState(null);
  const [activeAssignItem, setActiveAssignItem] = useState(null);
  const [searchAssign, setSearchAssign] = useState("");
  const [searchDo, setSearchDo] = useState("");
  const [assignSort, setAssignSort] = useState({ key: "brand", direction: "asc" });
  const [doSort, setDoSort] = useState({ key: "date", direction: "desc" });
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
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

  const canAddDomains = hasPrivilege(user, "CREATE_DOMAINS");
  const canEditDomains = hasPrivilege(user, "EDIT_DOMAINS");
  const canDeleteDomains = hasPrivilege(user, "DELETE_DOMAINS");
  const canEditContent = hasAnyPrivilege(user, ["ADD_CONTENT", "EDIT_CONTENT", "ASSIGN_DEVELOPMENT"]);
  const canEditContentPool = hasAnyPrivilege(user, ["EDIT_ARTICLE_POOL", "ADMIN_ACCESS"]);
  const canAssignDevelopment = hasPrivilege(user, "ASSIGN_DEVELOPMENT");
  const canEditSelectedContentPool =
    canEditContentPool && (canEditContent || canEditDomains || canAssignDevelopment);
  const canDoDevelopment = hasPrivilege(user, "DO_DEVELOPMENT");
  const canAddTemplates = hasPrivilege(user, "ADD_TEMPLATES");
  const canViewTemplates = canAddTemplates || canDoDevelopment;
  const canViewAssignTable = canAssignDevelopment || canEditContent || canEditSelectedContentPool;
  const shouldLoadDomains =
    canAddDomains
    || canEditDomains
    || canDeleteDomains
    || canAssignDevelopment
    || canEditContent
    || canDoDevelopment
    || hasPrivilege(user, "VIEW_DEVELOPMENT_PROGRESS");
  const shouldLoadDevelopers = canAssignDevelopment;
  const shouldLoadTemplates = canViewTemplates;
  const {
    domains,
    developers,
    templates,
    loading,
    error,
    createDomain,
    createTemplate,
    deleteTemplate,
    assignDomain,
    updateDomain,
    deleteDomain,
    updateProgress,
    acquireContentLock,
    releaseContentLock,
  } = useDevelopment({
    loadDomains: shouldLoadDomains,
    loadDevelopers: shouldLoadDevelopers,
    loadTemplates: shouldLoadTemplates,
  });
  const canViewProgress = hasAnyPrivilege(user, [
    "ASSIGN_DEVELOPMENT",
    "DO_DEVELOPMENT",
    "VIEW_DEVELOPMENT_PROGRESS",
  ]);
  const overallProgress = useMemo(() => getOverallProgress(domains), [domains]);
  const overallProgressTone = getOverallProgressTone(overallProgress);

  const assignDomains = useMemo(
    () => {
      const filtered = domains.filter(
        (item) =>
          matchesSearch(item, searchAssign)
          && matchesAssignDate(item, selectedDate, fromDate, toDate, useDateRange)
      );

      return [...filtered].sort((left, right) => {
        switch (assignSort.key) {
          case "date":
            return compareValues(
              getItemDate(left, "createdAt")?.getTime() || 0,
              getItemDate(right, "createdAt")?.getTime() || 0,
              assignSort.direction
            );
          case "content":
            return compareValues(
              hasRequiredContent(left) ? 1 : 0,
              hasRequiredContent(right) ? 1 : 0,
              assignSort.direction
            );
          case "contentBy":
            return compareValues(
              left.contentEditorId?.fullName || left.contentUpdatedBy?.fullName || "",
              right.contentEditorId?.fullName || right.contentUpdatedBy?.fullName || "",
              assignSort.direction
            );
          case "assignedTo":
            return compareValues(
              left.assignedDeveloperId?.fullName || "",
              right.assignedDeveloperId?.fullName || "",
              assignSort.direction
            );
          case "domain":
            return compareValues(left.domain, right.domain, assignSort.direction);
          case "brand":
          default:
            return compareValues(left.brandName, right.brandName, assignSort.direction);
        }
      });
    },
    [domains, searchAssign, selectedDate, fromDate, toDate, useDateRange, assignSort]
  );

  const doDomains = useMemo(
    () => {
      const filtered = domains.filter(
        (item) =>
          matchesSearch(item, searchDo)
          && (useDateRange
            ? matchesDate(item, fromDate, toDate, item.assignedAt ? "assignedAt" : "createdAt")
            : matchesSingleDate(item, selectedDate, item.assignedAt ? "assignedAt" : "createdAt"))
      );

      return [...filtered].sort((left, right) => {
        switch (doSort.key) {
          case "developer":
            return compareValues(left.assignedDeveloperId?.fullName || "", right.assignedDeveloperId?.fullName || "", doSort.direction);
          case "brand":
            return compareValues(left.brandName, right.brandName, doSort.direction);
          case "domain":
            return compareValues(left.domain, right.domain, doSort.direction);
          case "status":
            return compareValues(left.developmentStatus || "", right.developmentStatus || "", doSort.direction);
          case "hosting":
            return compareValues(left.hostingStatus || "", right.hostingStatus || "", doSort.direction);
          case "gsc":
            return compareValues(left.gscStatus || "", right.gscStatus || "", doSort.direction);
          case "content":
            return compareValues(
              hasRequiredContent(left) ? 1 : 0,
              hasRequiredContent(right) ? 1 : 0,
              doSort.direction
            );
          case "date":
          default:
            return compareValues(
              getItemDate(left, left.assignedAt ? "assignedAt" : "createdAt")?.getTime() || 0,
              getItemDate(right, right.assignedAt ? "assignedAt" : "createdAt")?.getTime() || 0,
              doSort.direction
            );
        }
      });
    },
    [domains, searchDo, selectedDate, fromDate, toDate, useDateRange, doSort]
  );

  const handleAssignSortChange = (key) => {
    setAssignSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleDoSortChange = (key) => {
    setDoSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleCreateDomain = async (payload) => {
    try {
      setFormError("");
      setBusy(true);
      await createDomain(payload);
      setShowAddModal(false);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.addDomainError);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTemplate = async (payload) => {
    try {
      setFormError("");
      setBusy(true);
      await createTemplate(payload);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.addInfoError);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      setFormError("");
      setBusy(true);
      await deleteTemplate(id);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.deleteInfoError);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async (item) => {
    setActiveAssignItem(item);
  };

  const handleUpdateProgress = async (item, payload) => {
    try {
      setFormError("");
      setBusyId(item._id);
      await updateProgress(item._id, payload);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.updateTaskError);
      throw err;
    } finally {
      setBusyId("");
    }
  };

  const handleSaveContent = async (payload) => {
    if (!activeContentItem) {
      return;
    }

    try {
      setFormError("");
      setBusyId(activeContentItem.item._id);
      await updateDomain(activeContentItem.item._id, payload);
      if (activeContentItem.lockAcquired) {
        await releaseContentLock(activeContentItem.item._id);
      }
      setActiveContentItem(null);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.saveContentError);
      throw err;
    } finally {
      setBusyId("");
    }
  };

  const handleSaveContentPool = async (payload) => {
    if (!activeContentPoolItem) {
      return;
    }

    try {
      setFormError("");
      setBusyId(activeContentPoolItem.domainItem._id);
      const response = await updateArticlePoolArticleApi(activeContentPoolItem.article._id, payload);
      const updatedArticle = response.data;

      await updateDomain(activeContentPoolItem.domainItem._id, {
        content: mapContentPoolArticleToDevelopmentContent(updatedArticle),
        resources: mapContentPoolArticleToDevelopmentResources(updatedArticle),
      });

      setActiveContentPoolItem(null);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.updateContentPoolError);
      throw err;
    } finally {
      setBusyId("");
    }
  };

  const handleCloseContent = async () => {
    if (!activeContentItem) {
      return;
    }

    try {
      if (activeContentItem.lockAcquired) {
        setBusyId(activeContentItem.item._id);
        await releaseContentLock(activeContentItem.item._id);
      }
      setActiveContentItem(null);
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.releaseContentEditorError);
    } finally {
      setBusyId("");
    }
  };

  const handleEditContent = async (item) => {
    const articleId = getArticlePoolArticleId(item);

    if (!articleId) {
      setFormError(copy.page.noContentPoolSelected);
      return;
    }

    try {
      setFormError("");
      setBusyId(item._id);
      const response = await getArticlePoolArticleApi(articleId);
      setActiveContentPoolItem({
        domainItem: item,
        article: response.data,
      });
    } catch (err) {
      setFormError(err.response?.data?.message || copy.page.openContentPoolError);
    } finally {
      setBusyId("");
    }
  };

  const handleOpenContent = async (item) => {
    if (!hasSelectedArticle(item)) {
      setFormError(copy.page.noContentSelected);
      return;
    }

    setActiveContentItem({
      item,
      readOnly: true,
      lockAcquired: false,
    });
  };

  useEscapeKey(showAddModal, () => setShowAddModal(false));
  useEscapeKey(showOverallProgress, () => setShowOverallProgress(false));
  useEscapeKey(showTemplatesModal, () => setShowTemplatesModal(false));
  useEscapeKey(Boolean(activeContentItem), handleCloseContent);
  useEscapeKey(Boolean(activeContentPoolItem), () => setActiveContentPoolItem(null));
  useEscapeKey(Boolean(activeAssignItem), () => setActiveAssignItem(null));
  useEscapeKey(Boolean(activeEditItem), () => setActiveEditItem(null));

  useEffect(() => {
    if (!activeContentItem?.lockAcquired || !activeContentItem?.item?._id) {
      return undefined;
    }

    const contentId = activeContentItem.item._id;
    const handlePageHide = () => {
      releaseContentLockOnUnload(contentId);
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      releaseContentLockOnUnload(contentId);
    };
  }, [activeContentItem]);

  return (
    <div className="management-page">
      <section className="app-panel management-header">
        <div>
          <h1>{copy.page.title}</h1>
          <p>{copy.page.description}</p>
        </div>
        <div className="management-header-actions">
          {canViewProgress ? (
            <button
              type="button"
              className={`management-button-secondary management-button-with-icon development-overall-button ${overallProgressTone}`}
              onClick={() => setShowOverallProgress(true)}
              aria-label={copy.page.overallProgressAria(overallProgress)}
            >
              <FaChartLine />
              <span className="development-overall-button-value">{overallProgress}%</span>
            </button>
          ) : null}
          {canAddDomains ? (
            <button type="button" className="management-button management-button-with-icon" onClick={() => {
              setFormError("");
              setShowAddModal(true);
            }}>
              <span className="management-button-icon" aria-hidden="true">+</span>
              <span>{copy.page.addDomain}</span>
            </button>
          ) : null}
          {canViewTemplates && !canAssignDevelopment && !canDoDevelopment ? (
            <button
              type="button"
              className="management-button-secondary management-button-with-icon"
              onClick={() => {
                setFormError("");
                setShowTemplatesModal(true);
              }}
            >
              <span className="management-button-icon" aria-hidden="true">i</span>
              <span>{copy.page.info}</span>
            </button>
          ) : null}
          <div className="management-summary">
            <strong>{domains.length}</strong>
            <span>{copy.page.totalDevelopmentDomains}</span>
          </div>
        </div>
      </section>

      <ToastNotice message={formError} onClose={() => setFormError("")} />
      {error ? <p className="management-error">{error}</p> : null}

      {showAddModal ? (
        <div className="management-modal-backdrop">
          <div className="management-modal management-modal-wide" onClick={(event) => event.stopPropagation()}>
            <AddDevelopmentDomainForm brands={brands} busy={busy} onSubmit={handleCreateDomain} onCancel={() => setShowAddModal(false)} />
          </div>
        </div>
      ) : null}

      {showOverallProgress ? (
        <div className="management-modal-backdrop">
          <div className="management-modal management-modal-wide" onClick={(event) => event.stopPropagation()}>
            <OverallProgressModal
              domains={domains}
              singleDate={selectedDate}
              useRange={useDateRange}
              fromDate={fromDate}
              toDate={toDate}
              onSingleDateChange={setSelectedDate}
              onRangeModeChange={setGlobalRangeMode}
              onRangeChange={setGlobalRange}
              onClose={() => setShowOverallProgress(false)}
            />
          </div>
        </div>
      ) : null}

      {showTemplatesModal ? (
        <div className="management-modal-backdrop">
          <div className="management-modal management-modal-wide" onClick={(event) => event.stopPropagation()}>
            <DevelopmentTemplatesModal
              templates={templates}
              canAddTemplates={canAddTemplates}
              busy={busy}
              onSubmit={handleCreateTemplate}
              onDelete={handleDeleteTemplate}
              onClose={() => setShowTemplatesModal(false)}
            />
          </div>
        </div>
      ) : null}

      {activeContentItem ? (
        <div className="management-modal-backdrop">
          <div className="management-modal management-modal-wide" onClick={(event) => event.stopPropagation()}>
            <DevelopmentContentModal
              item={activeContentItem.item}
              busy={busyId === activeContentItem.item._id}
              onSubmit={handleSaveContent}
              onClose={handleCloseContent}
              readOnly={activeContentItem.readOnly}
            />
          </div>
        </div>
      ) : null}

      {activeContentPoolItem ? (
        <div className="management-modal-backdrop">
          <div className="management-modal management-modal-wide" onClick={(event) => event.stopPropagation()}>
            <ContentPoolForm
              brands={brands}
              article={activeContentPoolItem.article}
              busy={busyId === activeContentPoolItem.domainItem._id}
              brandDisabled
              heading={copy.page.editContentPool}
              description={`${activeContentPoolItem.domainItem.brandName} | ${activeContentPoolItem.domainItem.domain}`}
              onSubmit={handleSaveContentPool}
              onCancel={() => setActiveContentPoolItem(null)}
            />
          </div>
        </div>
      ) : null}

      {activeAssignItem ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <AssignDeveloperForm
              item={activeAssignItem}
              developers={developers}
              busy={busyId === activeAssignItem._id}
              onSubmit={async (developerId) => {
                try {
                  setFormError("");
                  setBusyId(activeAssignItem._id);
                  await assignDomain(activeAssignItem._id, developerId);
                  setActiveAssignItem(null);
                } catch (err) {
                  setFormError(err.response?.data?.message || copy.page.assignDomainError);
                  throw err;
                } finally {
                  setBusyId("");
                }
              }}
              onCancel={() => setActiveAssignItem(null)}
            />
          </div>
        </div>
      ) : null}

      {activeEditItem ? (
        <div className="management-modal-backdrop">
          <div className="management-modal" onClick={(event) => event.stopPropagation()}>
            <EditDevelopmentDomainForm
              brands={brands}
              domainItem={activeEditItem}
              busy={busyId === activeEditItem._id}
              canDelete={canDeleteDomains}
              onSubmit={async (payload) => {
                try {
                  setFormError("");
                  setBusyId(activeEditItem._id);
                  await updateDomain(activeEditItem._id, payload);
                  setActiveEditItem(null);
                } catch (err) {
                  setFormError(err.response?.data?.message || copy.page.updateDomainError);
                  throw err;
                } finally {
                  setBusyId("");
                }
              }}
              onDelete={async () => {
                try {
                  setFormError("");
                  setBusyId(activeEditItem._id);
                  await deleteDomain(activeEditItem._id);
                  setActiveEditItem(null);
                } catch (err) {
                  setFormError(err.response?.data?.message || copy.page.deleteDomainError);
                  throw err;
                } finally {
                  setBusyId("");
                }
              }}
              onCancel={() => setActiveEditItem(null)}
            />
          </div>
        </div>
      ) : null}

      {loading ? (
        <section className="app-panel management-state">
          <h2>{copy.page.loadingTitle}</h2>
          <p>{copy.page.loadingDescription}</p>
        </section>
      ) : !canViewAssignTable && !canAssignDevelopment && !canDoDevelopment && canViewTemplates ? (
        <section className="app-panel management-state">
          <h2>{copy.page.templatesOnlyTitle}</h2>
          <p>{copy.page.templatesOnlyDescription}</p>
          <div className="management-actions">
            <button
              type="button"
              className="management-button"
              onClick={() => {
                setFormError("");
                setShowTemplatesModal(true);
              }}
            >
              {copy.page.openTemplates}
            </button>
          </div>
        </section>
      ) : (
        <>
          {canViewAssignTable ? (
            <DevelopmentAssignTable
              domains={assignDomains}
              onAssign={handleAssign}
              onOpenContent={handleOpenContent}
              onEditDomain={setActiveEditItem}
              onEditContent={handleEditContent}
              busyId={busyId}
              canEditDomain={canEditDomains}
              canEditContent={canEditSelectedContentPool}
              canAssignDevelopment={canAssignDevelopment}
              currentUserId={user?._id}
              sort={assignSort}
              onSortChange={handleAssignSortChange}
              toolbar={(
                <div className="development-filter-bar">
                  <div className="management-search">
                    <label htmlFor="development-assign-search">{copy.common.search}</label>
                    <input
                      id="development-assign-search"
                      value={searchAssign}
                      onChange={(event) => setSearchAssign(event.target.value)}
                      placeholder={copy.page.searchPlaceholder}
                    />
                  </div>
                  <DatePicker
                    id="development-assign-date"
                    label={copy.common.date}
                    singleDate={selectedDate}
                    useRange={useDateRange}
                    fromDate={fromDate}
                    toDate={toDate}
                    onSingleDateChange={setSelectedDate}
                    onRangeModeChange={setGlobalRangeMode}
                    onRangeChange={setGlobalRange}
                  />
                </div>
              )}
            />
          ) : null}

          {canAssignDevelopment || canDoDevelopment ? (
            <DevelopmentDoTable
              domains={doDomains}
              canUpdate={canAssignDevelopment || canDoDevelopment}
              onUpdateProgress={handleUpdateProgress}
              onOpenContent={handleOpenContent}
              busyId={busyId}
              sort={doSort}
              onSortChange={handleDoSortChange}
              toolbar={(
                <div className="development-filter-bar">
                  {canViewTemplates ? (
                    <button
                      type="button"
                      className="management-button-secondary management-button-with-icon development-template-button"
                      onClick={() => {
                        setFormError("");
                        setShowTemplatesModal(true);
                      }}
                    >
                      <span className="management-button-icon" aria-hidden="true">i</span>
                      <span>{copy.page.info}</span>
                    </button>
                  ) : null}
                  <div className="management-search">
                    <label htmlFor="development-do-search">{copy.common.search}</label>
                    <input
                      id="development-do-search"
                      value={searchDo}
                      onChange={(event) => setSearchDo(event.target.value)}
                      placeholder={copy.page.searchPlaceholder}
                    />
                  </div>
                  <DatePicker
                    id="development-do-date"
                    label={copy.common.date}
                    singleDate={selectedDate}
                    useRange={useDateRange}
                    fromDate={fromDate}
                    toDate={toDate}
                    onSingleDateChange={setSelectedDate}
                    onRangeModeChange={setGlobalRangeMode}
                    onRangeChange={setGlobalRange}
                  />
                </div>
              )}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
