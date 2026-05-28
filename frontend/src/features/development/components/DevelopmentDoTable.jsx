import React, { useEffect, useRef, useState } from "react";
import { FaEye } from "react-icons/fa";
import {
  getDevelopmentStatusLabel,
  getGscStatusLabel,
  getHostingStatusLabel,
} from "../constants/developmentLanguage";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

function getPageBadges(item) {
  return [
    item.landingPage ? { key: "landingPage", href: item.landingPage } : null,
    item.aboutPage ? { key: "aboutPage", href: item.aboutPage } : null,
    item.contactPage ? { key: "contactPage", href: item.contactPage } : null,
    item.termsAndConditionsPage ? { key: "termsAndConditionsPage", href: item.termsAndConditionsPage } : null,
  ].filter(Boolean);
}

function TaskDropdown({ itemId, columnKey, value, options, disabled, busy, onChange, isTemplate = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const wrapperRef = useRef(null);
  const activeOption = options.find((option) => option.value === value) || options[0];

  const toneClassName = (() => {
    if (columnKey === "status") {
      if (value === "completed") return "is-success";
      if (value === "in-progress") return "is-warning";
      return "is-neutral";
    }

    if (columnKey === "hosting" || columnKey === "gsc") {
      return value === "hosted" || value === "done" ? "is-success" : "is-warning";
    }

    if (columnKey === "template") {
      return value ? "is-success" : "is-warning";
    }

    return "is-neutral";
  })();

  useEffect(() => {
    if (!isOpen) {
      setOpenUpward(false);
      return undefined;
    }

    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedMenuHeight = Math.min(options.length, 6) * 40 + 24;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenUpward(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
    }

    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, options.length]);

  const handleToggle = () => {
    if (disabled || busy) {
      return;
    }

    if (!isOpen) {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) {
        const estimatedMenuHeight = Math.min(options.length, 6) * 40 + 24;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        setOpenUpward(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
      }
    }

    setIsOpen((current) => !current);
  };

  const handleSelect = (nextValue) => {
    setIsOpen(false);

    if (nextValue === value) {
      return;
    }

    onChange(nextValue);
  };

  return (
    <div
      ref={wrapperRef}
      className={`development-task-dropdown ${toneClassName}${isTemplate ? " is-template" : ""}${isOpen ? " is-open" : ""}${openUpward ? " is-open-upward" : ""}`}
    >
      <button
        type="button"
        className="development-task-dropdown-trigger"
        onClick={handleToggle}
        disabled={disabled || busy}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{activeOption?.label || "-"}</span>
      </button>

      {isOpen ? (
        <div className="development-task-dropdown-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`development-task-dropdown-option${option.value === value ? " is-active" : ""}`}
              onClick={() => handleSelect(option.value)}
              role="option"
              aria-selected={option.value === value}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DevelopmentDoTable({
  domains,
  canUpdate,
  onUpdateProgress,
  onOpenContent,
  busyId,
  toolbar,
  sort,
  onSortChange,
}) {
  const { copy, language, locale } = useDevelopmentUiCopy();
  const developmentStatusOptions = [
    { value: "new", label: getDevelopmentStatusLabel("new", language) },
    { value: "in-progress", label: getDevelopmentStatusLabel("in-progress", language) },
    { value: "completed", label: getDevelopmentStatusLabel("completed", language) },
  ];
  const hostingStatusOptions = [
    { value: "not-hosted", label: getHostingStatusLabel("not-hosted", language) },
    { value: "hosted", label: getHostingStatusLabel("hosted", language) },
  ];
  const gscStatusOptions = [
    { value: "not-done", label: getGscStatusLabel("not-done", language) },
    { value: "done", label: getGscStatusLabel("done", language) },
  ];
  const renderPageBadges = (item) => {
    const pageBadges = getPageBadges(item);

    if (!pageBadges.length) {
      return null;
    }

    return (
      <div className="development-domain-badge-list" aria-label={copy.assignTable.availablePages}>
        {pageBadges.map((badge) => (
          <a
            key={badge.key}
            className="management-badge development-domain-badge development-domain-badge-link"
            title={copy.pageBadges[badge.key]?.title}
            href={badge.href}
            target="_blank"
            rel="noreferrer"
          >
            {copy.pageBadges[badge.key]?.label}
          </a>
        ))}
      </div>
    );
  };

  const renderSortableHeader = (label, sortKey, className) => (
    <th className={className}>
      <button
        type="button"
        className={`development-sort-button${sort.key === sortKey ? " is-active" : ""}`}
        onClick={() => onSortChange(sortKey)}
      >
        <span>{label}</span>
        <span className="development-sort-arrows" aria-hidden="true">
          <span className={sort.key === sortKey && sort.direction === "asc" ? "is-active" : ""}>↑</span>
          <span className={sort.key === sortKey && sort.direction === "desc" ? "is-active" : ""}>↓</span>
        </span>
      </button>
    </th>
  );

  const renderContentButton = (item) => (
    <>
      <button
        type="button"
        className={`development-icon-button ${item.content?.title?.trim() && item.content?.description?.trim() && item.content?.article?.trim() ? "is-ready" : "is-missing"}`}
        onClick={() => onOpenContent(item)}
        title={copy.doTable.previewContent}
      >
        <FaEye />
      </button>
      {busyId === item._id ? (
        <span className="management-help-text">{copy.common.saving}</span>
      ) : null}
    </>
  );

  return (
    <section className="app-panel management-table development-do-panel">
      <div className="management-section-header">
        <div>
          <h2>{copy.doTable.title}</h2>
          <p>{copy.doTable.description}</p>
        </div>
        {toolbar}
      </div>

      <div className="management-table-wrap development-do-table-wrap">
        <table className="development-do-table">
          <colgroup>
            <col style={{ width: "7%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <thead>
            <tr>
              {renderSortableHeader(copy.doTable.headers.date, "date")}
              {renderSortableHeader(copy.doTable.headers.developer, "developer")}
              {renderSortableHeader(copy.doTable.headers.brand, "brand")}
              {renderSortableHeader(copy.doTable.headers.domain, "domain")}
              {renderSortableHeader(copy.doTable.headers.status, "status", "development-task-status-column")}
              {renderSortableHeader(copy.doTable.headers.hosting, "hosting", "development-task-hosting-column")}
              {renderSortableHeader(copy.doTable.headers.gsc, "gsc", "development-task-gsc-column")}
              {renderSortableHeader(copy.doTable.headers.content, "content", "development-task-template-column")}
            </tr>
          </thead>
          <tbody>
            {domains.length ? domains.map((item) => (
              <tr key={item._id}>
                <td className="development-do-date-cell">{new Date(item.createdAt).toLocaleDateString(locale)}</td>
                <td className="development-do-developer-cell">{item.assignedDeveloperId?.fullName || "-"}</td>
                <td className="development-do-brand-cell">{item.brandName}</td>
                <td className="development-do-domain-cell">
                  <strong>{item.domain}</strong>
                  {renderPageBadges(item)}
                </td>
                <td className="development-task-status-column">
                  <TaskDropdown
                    itemId={item._id}
                    columnKey="status"
                    value={item.developmentStatus || "new"}
                    options={developmentStatusOptions}
                    disabled={!canUpdate || busyId === item._id}
                    busy={busyId === item._id}
                    onChange={(nextValue) => onUpdateProgress(item, { developmentStatus: nextValue })}
                  />
                </td>
                <td className="development-task-hosting-column">
                  <TaskDropdown
                    itemId={item._id}
                    columnKey="hosting"
                    value={item.hostingStatus || "not-hosted"}
                    options={hostingStatusOptions}
                    disabled={!canUpdate || busyId === item._id}
                    busy={busyId === item._id}
                    onChange={(nextValue) => onUpdateProgress(item, { hostingStatus: nextValue })}
                  />
                </td>
                <td className="development-task-gsc-column">
                  <TaskDropdown
                    itemId={item._id}
                    columnKey="gsc"
                    value={item.gscStatus || "not-done"}
                    options={gscStatusOptions}
                    disabled={!canUpdate || busyId === item._id}
                    busy={busyId === item._id}
                    onChange={(nextValue) => onUpdateProgress(item, { gscStatus: nextValue })}
                  />
                </td>
                <td className="development-task-template-column">
                  {renderContentButton(item)}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="8">{copy.doTable.empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="development-do-mobile-list">
        {domains.length ? domains.map((item) => (
          <article key={item._id} className="development-do-mobile-card">
            <div className="development-do-mobile-header">
              <strong>{item.brandName}</strong>
              <span>{new Date(item.createdAt).toLocaleDateString(locale)}</span>
            </div>

            <div className="development-do-mobile-row">
              <span>{copy.doTable.mobileLabels.developer}</span>
              <strong>{item.assignedDeveloperId?.fullName || "-"}</strong>
            </div>

            <div className="development-do-mobile-row">
              <span>{copy.doTable.mobileLabels.domain}</span>
              <div className="development-do-domain-cell">
                <strong>{item.domain}</strong>
                {renderPageBadges(item)}
              </div>
            </div>

            <div className="development-do-mobile-row">
              <span>{copy.doTable.mobileLabels.status}</span>
              <TaskDropdown
                itemId={item._id}
                columnKey="status"
                value={item.developmentStatus || "new"}
                options={developmentStatusOptions}
                disabled={!canUpdate || busyId === item._id}
                busy={busyId === item._id}
                onChange={(nextValue) => onUpdateProgress(item, { developmentStatus: nextValue })}
              />
            </div>

            <div className="development-do-mobile-row">
              <span>{copy.doTable.mobileLabels.hosting}</span>
              <TaskDropdown
                itemId={item._id}
                columnKey="hosting"
                value={item.hostingStatus || "not-hosted"}
                options={hostingStatusOptions}
                disabled={!canUpdate || busyId === item._id}
                busy={busyId === item._id}
                onChange={(nextValue) => onUpdateProgress(item, { hostingStatus: nextValue })}
              />
            </div>

            <div className="development-do-mobile-row">
              <span>{copy.doTable.mobileLabels.gsc}</span>
              <TaskDropdown
                itemId={item._id}
                columnKey="gsc"
                value={item.gscStatus || "not-done"}
                options={gscStatusOptions}
                disabled={!canUpdate || busyId === item._id}
                busy={busyId === item._id}
                onChange={(nextValue) => onUpdateProgress(item, { gscStatus: nextValue })}
              />
            </div>

            <div className="development-do-mobile-row">
              <span>{copy.doTable.mobileLabels.content}</span>
              <div className="development-do-mobile-content">
                {renderContentButton(item)}
              </div>
            </div>
          </article>
        )) : (
          <p className="management-empty">{copy.doTable.empty}</p>
        )}
      </div>
    </section>
  );
}
