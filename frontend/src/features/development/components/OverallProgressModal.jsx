import React, { useMemo, useState } from "react";
import { HiOutlineArrowRightCircle } from "react-icons/hi2";
import DatePicker from "../../../shared/components/DatePicker";
import { useGlobalDateFilter } from "../../../shared/context/GlobalDateContext";
import DevelopmentDomainDetailsPanel from "./DevelopmentDomainDetailsPanel";
import DevelopmentProgressCircle from "./DevelopmentProgressCircle";
import {
  getDevelopmentStatusLabel,
  getGscStatusLabel,
  getHostingStatusLabel,
} from "../constants/developmentLanguage";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

function matchesDate(item, fromDate, toDate) {
  const sourceDate = item.assignedAt || item.createdAt;
  const time = new Date(sourceDate).getTime();
  if (fromDate && time < new Date(fromDate).getTime()) {
    return false;
  }
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    if (time > end.getTime()) {
      return false;
    }
  }
  return true;
}

function compareValues(left, right, direction = "asc") {
  const leftValue = left ?? "";
  const rightValue = right ?? "";

  const comparison = String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });

  return direction === "desc" ? comparison * -1 : comparison;
}

export default function OverallProgressModal({
  domains,
  onClose,
  singleDate,
  useRange: controlledUseRange,
  fromDate: controlledFromDate,
  toDate: controlledToDate,
  onSingleDateChange,
  onRangeModeChange,
  onRangeChange,
}) {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedDeveloper, setSelectedDeveloper] = useState("");
  const [selectedDomainDetails, setSelectedDomainDetails] = useState(null);
  const [sort, setSort] = useState({ key: "brand", direction: "asc" });
  const globalDateFilter = useGlobalDateFilter();
  const { copy, language, locale } = useDevelopmentUiCopy();

  const date = singleDate ?? globalDateFilter.singleDate;
  const useRange = controlledUseRange ?? globalDateFilter.useRange;
  const fromDate = controlledFromDate ?? globalDateFilter.fromDate;
  const toDate = controlledToDate ?? globalDateFilter.toDate;

  const handleSingleDateChange = onSingleDateChange ?? globalDateFilter.setSingleDate;
  const handleRangeModeChange = onRangeModeChange ?? globalDateFilter.setRangeMode;
  const handleRangeChange = onRangeChange ?? globalDateFilter.setRange;

  const brandOptions = useMemo(
    () => [...new Set(domains.map((item) => item.brandName).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [domains]
  );

  const developerOptions = useMemo(
    () =>
      [...new Map(
        domains
          .filter((item) => item.assignedDeveloperId?._id && item.assignedDeveloperId?.fullName)
          .map((item) => [item.assignedDeveloperId._id, item.assignedDeveloperId])
      ).values()].sort((left, right) => left.fullName.localeCompare(right.fullName)),
    [domains]
  );

  const filteredDomains = useMemo(
    () => {
      const filtered = domains.filter((item) => {
        const matchesSelectedDate = useRange
          ? matchesDate(item, fromDate, toDate)
          : matchesDate(item, date, date);
        const matchesBrand = !selectedBrand || item.brandName === selectedBrand;
        const matchesDeveloper = !selectedDeveloper || item.assignedDeveloperId?._id === selectedDeveloper;

        return matchesSelectedDate && matchesBrand && matchesDeveloper;
      });

      return [...filtered].sort((left, right) => {
        switch (sort.key) {
          case "date":
            return compareValues(
              new Date(left.assignedAt || 0).getTime() || 0,
              new Date(right.assignedAt || 0).getTime() || 0,
              sort.direction
            );
          case "domain":
            return compareValues(left.domain || "", right.domain || "", sort.direction);
          case "developer":
            return compareValues(left.assignedDeveloperId?.fullName || "-", right.assignedDeveloperId?.fullName || "-", sort.direction);
          case "status":
            return compareValues(left.developmentStatus || "", right.developmentStatus || "", sort.direction);
          case "hosting":
            return compareValues(left.hostingStatus || "", right.hostingStatus || "", sort.direction);
          case "gsc":
            return compareValues(left.gscStatus || "", right.gscStatus || "", sort.direction);
          case "brand":
          default:
            return compareValues(left.brandName || "", right.brandName || "", sort.direction);
        }
      });
    },
    [domains, date, fromDate, toDate, useRange, selectedBrand, selectedDeveloper, sort]
  );

  const handleSortChange = (key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const renderSortableHeader = (label, sortKey) => (
    <th>
      <button
        type="button"
        className={`development-sort-button${sort.key === sortKey ? " is-active" : ""}`}
        onClick={() => handleSortChange(sortKey)}
      >
        <span>{label}</span>
        <span className="development-sort-arrows" aria-hidden="true">
          <span className={sort.key === sortKey && sort.direction === "asc" ? "is-active" : ""}>↑</span>
          <span className={sort.key === sortKey && sort.direction === "desc" ? "is-active" : ""}>↓</span>
        </span>
      </button>
    </th>
  );

  const completedCount = filteredDomains.filter((item) => item.developmentStatus === "completed").length;
  const hostedCount = filteredDomains.filter((item) => item.hostingStatus === "hosted").length;
  const gscDoneCount = filteredDomains.filter((item) => item.gscStatus === "done").length;

  return (
    <section className="app-panel management-form development-overall-modal">
      <div className="management-section-header">
        <div>
          <h2>{copy.overallProgress.title}</h2>
          <p>{copy.overallProgress.description}</p>
        </div>
        <button type="button" className="management-button-secondary" onClick={onClose}>
          {copy.overallProgress.close}
        </button>
      </div>

      <div className="development-overall-toolbar">
        <DatePicker
          id="progress-date"
          label={copy.common.date}
          singleDate={date}
          useRange={useRange}
          fromDate={fromDate}
          toDate={toDate}
          onSingleDateChange={handleSingleDateChange}
          onRangeModeChange={handleRangeModeChange}
          onRangeChange={handleRangeChange}
        />
        <button
          type="button"
          className={`management-button-secondary development-overall-filter-button${showFilters ? " is-active" : ""}`}
          onClick={() => setShowFilters((current) => !current)}
        >
          {copy.overallProgress.filter}
        </button>
      </div>

      {showFilters ? (
        <div className="development-overall-filters">
          <div className="management-field">
            <label htmlFor="overall-progress-brand">{copy.overallProgress.brand}</label>
            <select id="overall-progress-brand" value={selectedBrand} onChange={(event) => setSelectedBrand(event.target.value)}>
              <option value="">{copy.overallProgress.allBrands}</option>
              {brandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
          <div className="management-field">
            <label htmlFor="overall-progress-developer">{copy.overallProgress.developer}</label>
            <select id="overall-progress-developer" value={selectedDeveloper} onChange={(event) => setSelectedDeveloper(event.target.value)}>
              <option value="">{copy.overallProgress.allDevelopers}</option>
              {developerOptions.map((developer) => (
                <option key={developer._id} value={developer._id}>
                  {developer.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <div className="management-overview-grid development-overall-summary">
        <div className="management-overview-card">
          <div className="management-overview-card-header">
            <strong>{copy.overallProgress.total}</strong>
            <span>{copy.overallProgress.totalDomains(filteredDomains.length)}</span>
          </div>
        </div>
        <div className="management-overview-card">
          <div className="management-overview-card-header">
            <strong>{copy.overallProgress.completed}</strong>
            <span>{completedCount}</span>
          </div>
        </div>
        <div className="management-overview-card">
          <div className="management-overview-card-header">
            <strong>{copy.overallProgress.hosted}</strong>
            <span>{hostedCount}</span>
          </div>
        </div>
        <div className="management-overview-card">
          <div className="management-overview-card-header">
            <strong>{copy.overallProgress.gscDone}</strong>
            <span>{gscDoneCount}</span>
          </div>
        </div>
      </div>

      {selectedDomainDetails ? (
        <DevelopmentDomainDetailsPanel
          item={selectedDomainDetails}
          onClose={() => setSelectedDomainDetails(null)}
        />
      ) : null}

      <div className="management-table-wrap development-overall-table-wrap">
        <table className="development-overall-table">
          <thead>
            <tr>
              {renderSortableHeader(copy.overallProgress.headers.date, "date")}
              {renderSortableHeader(copy.overallProgress.headers.brand, "brand")}
              {renderSortableHeader(copy.overallProgress.headers.domain, "domain")}
              {renderSortableHeader(copy.overallProgress.headers.developer, "developer")}
              <th>{copy.overallProgress.headers.progress}</th>
              {renderSortableHeader(copy.overallProgress.headers.status, "status")}
              {renderSortableHeader(copy.overallProgress.headers.hosting, "hosting")}
              {renderSortableHeader(copy.overallProgress.headers.gsc, "gsc")}
              <th className="development-overall-action-column">{copy.overallProgress.headers.details}</th>
            </tr>
          </thead>
          <tbody>
            {filteredDomains.length ? filteredDomains.map((item) => (
              <tr key={item._id}>
                <td>{item.assignedAt ? new Date(item.assignedAt).toLocaleDateString(locale) : "-"}</td>
                <td>
                  <strong>{item.brandName || "-"}</strong>
                </td>
                <td>
                  <div className="development-overall-domain-cell">
                    <strong>{item.domain || "-"}</strong>
                  </div>
                </td>
                <td>{item.assignedDeveloperId?.fullName || "-"}</td>
                <td className="development-overall-progress-cell">
                  <DevelopmentProgressCircle
                    value={item.progressPercent}
                    completed={item.developmentStatus === "completed"}
                  />
                </td>
                <td>{getDevelopmentStatusLabel(item.developmentStatus, language)}</td>
                <td>{getHostingStatusLabel(item.hostingStatus, language)}</td>
                <td>{getGscStatusLabel(item.gscStatus, language)}</td>
                <td className="development-overall-action-column">
                  <button
                    type="button"
                    className="development-overall-details-button"
                    onClick={() => setSelectedDomainDetails(item)}
                    aria-label={copy.overallProgress.openDetailsAria(item.domain)}
                  >
                    <span>{copy.common.details}</span>
                    <HiOutlineArrowRightCircle aria-hidden="true" />
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="9">{copy.overallProgress.empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
