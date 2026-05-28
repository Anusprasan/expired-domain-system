import React from "react";
import {
  getMoneySiteBrandName,
  getMoneySiteId,
  getMoneySiteLabel,
  getMoneySitesByDomain,
  getSelectedMoneySite,
} from "../utils/shortLinkCheckerUi";

const CSV_TEMPLATE_TEXT = [
  "shortUrl,moneySiteDomain,title,note,active",
  "https://cutt.ly/example1,example.com,Campaign A,Homepage testing,TRUE",
  "https://bit.ly/example2,example.org,Campaign B,Landing page review,FALSE",
].join("\n");

export default function ShortLinkImportModal({
  copy,
  importForm,
  importResult,
  moneySites = [],
  importing,
  onClose,
  onCsvText,
  onImportRowChange,
  onImportRowRemove,
  onSubmit,
}) {
  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file || typeof onCsvText !== "function") {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      onCsvText(String(reader.result || ""), file.name);
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const file = new Blob([CSV_TEMPLATE_TEXT], { type: "text/csv;charset=utf-8" });
    const objectUrl = window.URL.createObjectURL(file);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = "short-link-import-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(objectUrl);
  };

  const getImportMoneySiteLabel = (site, index, totalMatches) => {
    const label = getMoneySiteLabel(site, copy);
    const id = getMoneySiteId(site);
    const idSuffix = id ? ` #${id.slice(-6)}` : "";

    return totalMatches > 1 ? `${index + 1}. ${label}${idSuffix}` : label;
  };

  const handleMoneySiteDomainChange = (row, moneySiteDomain) => {
    const matches = getMoneySitesByDomain(moneySites, moneySiteDomain);

    onImportRowChange(row.importId, {
      moneySiteDomain,
      moneySiteId: matches.length === 1 ? getMoneySiteId(matches[0]) : "",
      brandName: matches.length === 1 ? getMoneySiteBrandName(matches[0]) : "",
    });
  };

  const handleMoneySiteSelect = (row, moneySiteId) => {
    const site = getSelectedMoneySite(moneySites, moneySiteId);

    onImportRowChange(row.importId, {
      moneySiteId,
      moneySiteDomain: site?.domain || row.moneySiteDomain,
      brandName: site ? getMoneySiteBrandName(site) : "",
    });
  };

  const duplicateMatchRows = importForm.rows.filter(
    (row) => getMoneySitesByDomain(moneySites, row.moneySiteDomain).length > 1
  ).length;
  const skippedRows = Array.isArray(importResult?.skipped) ? importResult.skipped : [];

  return (
    <div className="management-modal-backdrop is-centered" role="presentation" onMouseDown={handleBackdropMouseDown}>
      <div
        className="app-panel management-modal short-link-checker-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="short-link-import-title"
      >
        <div className="short-link-checker-modal-header">
          <div>
            <span className="management-badge">{copy.importModal.badge}</span>
            <h2 id="short-link-import-title">{copy.importModal.title}</h2>
            <p>{copy.importModal.description}</p>
          </div>
          <button type="button" className="management-button-secondary" onClick={onClose}>
            {copy.common.close}
          </button>
        </div>

        <form className="short-link-checker-modal-form" onSubmit={onSubmit}>
          <div className="short-link-checker-import-guide">
            <strong>{copy.importModal.columnsTitle}</strong>
            <span>shortUrl,moneySiteDomain,title,note,active</span>
            <span>{copy.importModal.columnsHelp}</span>
            <div className="short-link-checker-import-tools">
              <button type="button" className="management-button-secondary" onClick={handleDownloadTemplate}>
                {copy.importModal.downloadTemplate}
              </button>
            </div>
          </div>

          <label className="management-field" htmlFor="short-link-import-file">
            <span>{copy.importModal.fileLabel}</span>
            <input id="short-link-import-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
          </label>

          <label className="management-field" htmlFor="short-link-import-text">
            <span>{copy.importModal.textLabel}</span>
            <textarea
              id="short-link-import-text"
              className="short-link-checker-import-textarea"
              value={importForm.text}
              onChange={(event) => {
                if (typeof onCsvText === "function") {
                  onCsvText(event.target.value, importForm.fileName);
                }
              }}
              placeholder={copy.importModal.textPlaceholder}
            />
          </label>

          <div className="short-link-checker-import-summary">
            <span>{importForm.fileName || copy.importModal.noFileSelected}</span>
            <strong>{copy.importModal.rowsReady(importForm.rows.length)}</strong>
            {duplicateMatchRows ? (
              <small>{copy.importModal.duplicateMatches(duplicateMatchRows)}</small>
            ) : null}
          </div>

          {importResult ? (
            <div className={skippedRows.length ? "short-link-checker-import-result is-warning" : "short-link-checker-import-result"}>
              <div>
                <span>{copy.importModal.resultTitle}</span>
                <strong>
                  {copy.importModal.resultSummary(importResult.createdCount, importResult.skippedCount)}
                </strong>
              </div>
              {skippedRows.length ? (
                <div className="short-link-checker-skipped-list">
                  {skippedRows.map((item, index) => (
                    <div key={`${item.row || index}-${item.shortUrl || item.rawLine || index}`}>
                      <strong>{copy.importModal.rowLabel(item.row || index + 1)}: {item.reason || copy.importModal.skipped}</strong>
                      <span>{item.shortUrl || item.rawLine || copy.importModal.noShortUrl}</span>
                      <small>
                        {copy.importModal.domain}: {item.moneySiteDomain || copy.common.noDomain}
                        {item.title ? ` - ${copy.importModal.name}: ${item.title}` : ""}
                      </small>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {importForm.rows.length ? (
            <div className="short-link-checker-import-table-wrap">
              <table className="short-link-checker-import-table">
                <thead>
                  <tr>
                    <th>{copy.importModal.headers.shortUrl}</th>
                    <th>{copy.importModal.headers.moneySiteDomain}</th>
                    <th>{copy.importModal.headers.moneySiteMatch}</th>
                    <th>{copy.importModal.headers.name}</th>
                    <th>{copy.importModal.headers.note}</th>
                    <th>{copy.importModal.headers.active}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {importForm.rows.map((row) => {
                    const matches = getMoneySitesByDomain(moneySites, row.moneySiteDomain);
                    const selectedSite = getSelectedMoneySite(moneySites, row.moneySiteId);
                    const selectedStillMatches = matches.some((site) => getMoneySiteId(site) === getMoneySiteId(selectedSite));

                    return (
                      <tr key={row.importId}>
                        <td>
                          <input
                            value={row.shortUrl || ""}
                            onChange={(event) => onImportRowChange(row.importId, { shortUrl: event.target.value })}
                            placeholder="https://cutt.ly/example"
                          />
                        </td>
                        <td>
                          <input
                            value={row.moneySiteDomain || ""}
                            onChange={(event) => handleMoneySiteDomainChange(row, event.target.value)}
                            placeholder="example.com"
                          />
                        </td>
                        <td>
                          <select
                            value={selectedStillMatches ? row.moneySiteId || "" : ""}
                            onChange={(event) => handleMoneySiteSelect(row, event.target.value)}
                          >
                            <option value="">
                              {matches.length > 1
                                ? copy.importModal.selectOne(matches.length)
                                : matches.length === 1
                                  ? copy.importModal.useMatchedMoneySite
                                  : copy.importModal.noExactMatch}
                            </option>
                            {matches.map((site, index) => (
                              <option key={getMoneySiteId(site)} value={getMoneySiteId(site)}>
                                {getImportMoneySiteLabel(site, index, matches.length)}
                              </option>
                            ))}
                          </select>
                          {matches.length > 1 ? (
                            <small className="short-link-checker-import-match-note">
                              {copy.importModal.duplicateHelp(matches.length)}
                            </small>
                          ) : null}
                        </td>
                        <td>
                          <input
                            value={row.title || ""}
                            onChange={(event) => onImportRowChange(row.importId, { title: event.target.value })}
                            placeholder={copy.importModal.campaignPlaceholder}
                          />
                        </td>
                        <td>
                          <input
                            value={row.note || ""}
                            onChange={(event) => onImportRowChange(row.importId, { note: event.target.value })}
                            placeholder={copy.importModal.optionalPlaceholder}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={row.active !== false}
                            onChange={(event) => onImportRowChange(row.importId, { active: event.target.checked })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="management-button-secondary is-danger"
                            onClick={() => onImportRowRemove(row.importId)}
                          >
                            {copy.importModal.remove}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="management-empty">{copy.importModal.empty}</p>
          )}

          <div className="short-link-checker-modal-actions">
            <button type="submit" className="management-button" disabled={importing || !importForm.rows.length}>
              {importing ? copy.importModal.importing : copy.importModal.importRows}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
