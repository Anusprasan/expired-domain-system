import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { HotTable } from "@handsontable/react";
import { registerAllModules } from "handsontable/registry";
import { getSessionToken } from "../utils/session";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";

registerAllModules();

const seoTableHeaders = [
  "URL",
  "Title",
  "DA",
  "PA",
  "TBL",
  "QBL",
  "Q/T",
  "OS",
  "MT",
  "SS",
];

const createEmptyRows = (count = 100) =>
  Array.from({ length: count }, () => Array(10).fill(""));

const domainPattern = /([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/;

const normalizeSeoRow = (row) => {
  const normalized = row.slice(0, 10);

  while (normalized.length < 10) {
    normalized.push("");
  }

  return normalized;
};

const expandClipboardRows = (data) =>
  data.flatMap((row) => {
    const rowText = row.map((cell) => String(cell || "")).join("\t");

    return rowText
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((cell) => cell.trim()))
      .filter((lineCells) => lineCells.some(Boolean));
  });

const parseSeoPasteRows = (data) => {
  const tableRows = expandClipboardRows(data);

  if (tableRows.length === 0) {
    return [];
  }

  if (tableRows.some((row) => row.length > 1)) {
    return tableRows.map(normalizeSeoRow);
  }

  const lines = tableRows
    .map((row) => row.join(" ").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  if (lines.length % 3 === 0) {
  const threeLineRows = [];

  for (let i = 0; i < lines.length; i += 3) {
    const domain = lines[i]?.match(domainPattern)?.[0] || "";
    const title = lines[i + 1] || "";
    const metrics = lines[i + 2] ? lines[i + 2].split(/\s+/) : [];

    if (!domain || !title || metrics.length < 2) {
      threeLineRows.length = 0;
      break;
    }

    threeLineRows.push(
      normalizeSeoRow([
        domain,
        title,
        metrics[0],
        metrics[1],
        metrics[2],
        metrics[3],
        metrics[4],
        metrics[5],
        metrics[6],
        metrics[7],
      ])
    );
  }

  if (threeLineRows.length > 0) {
    return threeLineRows;
  }
  }

  if (lines.length % 10 === 0) {
  const tenLineRows = [];

  for (let i = 0; i < lines.length; i += 10) {
    const group = lines.slice(i, i + 10);
    const domain = group[0]?.match(domainPattern)?.[0] || "";

    if (group.length < 10 || !domain) {
      tenLineRows.length = 0;
      break;
    }

    tenLineRows.push(normalizeSeoRow([domain, ...group.slice(1)]));
  }

  if (tenLineRows.length > 0) {
    return tenLineRows;
  }
  }

  return lines.map((line) => normalizeSeoRow([line]));
};

const parseMetricNumber = (value) => {
  const text = String(value || "")
    .trim()
    .replace(/,/g, "");
  const match = text.match(/\d+(\.\d+)?/);

  if (!match) {
    return null;
  }

  const suffixText = text.slice(
    match.index + match[0].length
  );
  let number = Number(match[0]);

  if (/k/i.test(suffixText)) {
    number *= 1000;
  } else if (/m/i.test(suffixText)) {
    number *= 1000000;
  }

  return number;
};

const isRowInFilterRange = (row) => {
  const tbl = parseMetricNumber(row[4]);
  const qbl = parseMetricNumber(row[5]);
  const qt = parseMetricNumber(row[6]);
  const ss = parseMetricNumber(row[9]);

  return (
    tbl !== null &&
    qbl !== null &&
    qt !== null &&
    ss !== null &&
    tbl >= 0 &&
    tbl <= 1000 &&
    qbl >= 10 &&
    qbl <= 1000 &&
    qt >= 5 &&
    qt <= 100 &&
    ss >= 1 &&
    ss <= 11
  );
};

const getFilteredSeoRows = (rows) =>
  rows
    .filter((row) => String(row[0] || "").trim())
    .filter(isRowInFilterRange);

const getSubBatchResultDomains = (item) =>
  item?.mergedDomains?.length > 0
    ? item.mergedDomains
    : item?.domains || [];

const getSubBatchDisplayCount = (item, activeTab) =>
  activeTab === "processed"
    ? getSubBatchResultDomains(item).length
    : item.totalDomains;

const getProcessedBatchDomains = (group) =>
  group?.batch?.processedDomains?.length > 0
    ? group.batch.processedDomains
    : group?.subBatches?.flatMap(getSubBatchResultDomains) || [];

const downloadDomainsAsCsv = (fileName, domains) => {
  const csvRows = [
    "Domain",
    ...domains.map((domain) =>
      `"${String(domain).replace(/"/g, '""')}"`
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

function ProcessorWorkspacePage() {
  const [activeTab, setActiveTab] = useState("pending");
  const [subBatches, setSubBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [viewDomains, setViewDomains] = useState([]);
  const [viewTitle, setViewTitle] = useState("");
  const [selectedCopiedSubBatch, setSelectedCopiedSubBatch] = useState(null);
  const [seoTableData, setSeoTableData] = useState(createEmptyRows());
  const [mergeStatus, setMergeStatus] = useState(null);
  const [filteredRows, setFilteredRows] = useState([]);
  const [showFilteredPopup, setShowFilteredPopup] = useState(false);

  const hotRef = useRef(null);
  const token = getSessionToken();

  const fetchSubBatches = async () => {
    try {
      setLoading(true);

      const response = await axios.get(
        `http://localhost:5000/api/processor/${activeTab}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setSubBatches(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubBatches();
  }, [activeTab]);

  const batchGroups = useMemo(() => {
    const groupedBatches = subBatches.reduce((acc, item) => {
      const batchId = item.batchId?._id || item.batchId;

      if (!acc[batchId]) {
        acc[batchId] = {
          batch: item.batchId,
          subBatches: [],
          totalDomains: 0,
        };
      }

      acc[batchId].subBatches.push(item);
      acc[batchId].totalDomains += item.totalDomains;

      return acc;
    }, {});

    return Object.values(groupedBatches);
  }, [subBatches]);

  const visibleBatchGroup = batchGroups.find((group) => {
    const batchKey = group.batch?._id || group.batch;
    return batchKey === selectedBatch;
  });

  useEffect(() => {
    if (batchGroups.length === 0) {
      setSelectedBatch(null);
      setSelectedCopiedSubBatch(null);
      setSeoTableData(createEmptyRows());
      setMergeStatus(null);
      setFilteredRows([]);
      setShowFilteredPopup(false);
      return;
    }

    const currentBatchExists = batchGroups.some((group) => {
      const batchKey = group.batch?._id || group.batch;
      return batchKey === selectedBatch;
    });

    if (!currentBatchExists) {
      const firstBatch = batchGroups[0];
      setSelectedBatch(firstBatch.batch?._id || firstBatch.batch);
    }
  }, [batchGroups, selectedBatch]);

  useEffect(() => {
    if (activeTab !== "copied" || !visibleBatchGroup) {
      setSelectedCopiedSubBatch(null);
      setSeoTableData(createEmptyRows());
      setMergeStatus(null);
      setFilteredRows([]);
      setShowFilteredPopup(false);
      return;
    }

    const currentExists = visibleBatchGroup.subBatches.some(
      (item) => item._id === selectedCopiedSubBatch?._id
    );

    if (!currentExists) {
      const firstCopied = visibleBatchGroup.subBatches[0] || null;
      setSelectedCopiedSubBatch(firstCopied);
      setSeoTableData(createEmptyRows());
      setMergeStatus(null);
      setFilteredRows([]);
      setShowFilteredPopup(false);
    }
  }, [activeTab, visibleBatchGroup, selectedCopiedSubBatch]);

  const handleCopy = async (id) => {
    try {
      const response = await axios.post(
        `http://localhost:5000/api/processor/copy/${id}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      await navigator.clipboard.writeText(response.data.domains.join("\n"));
      setActiveTab("copied");
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || "Copy failed");
    }
  };

  const handleMoveToProcessed = async (id) => {
    const canMoveToProcessed =
      mergeStatus?.type === "success" &&
      selectedCopiedSubBatch?._id === id;

    if (!canMoveToProcessed) {
      alert("Merge SEO results successfully before moving to processed.");
      return;
    }

    const filteredDomainNames = getFilteredSeoRows(seoTableData).map(
      (row) => row[0]
    );

    if (filteredDomainNames.length === 0) {
      alert("No filtered domains found to move.");
      return;
    }

    const confirmMove = window.confirm("Move to processed?");

    if (!confirmMove) {
      return;
    }

    try {
      await axios.post(
        `http://localhost:5000/api/processor/processed/${id}`,
        {
          domains: filteredDomainNames,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      fetchSubBatches();
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || "Process failed");
    }
  };

  const handleViewDomains = async (id) => {
    try {
      const response = await axios.get(
        `http://localhost:5000/api/processor/view/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setViewTitle(
        `${response.data.batchName} - Sub Batch ${response.data.subBatchNumber}`
      );
      setViewDomains(response.data.domains || []);
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || "View failed");
    }
  };

  const handleViewProcessedDomains = (item) => {
    setViewTitle(
      `${item.batchId?.batchName || "Processed"} - Sub Batch ${
        item.subBatchNumber
      }`
    );
    setViewDomains(getSubBatchResultDomains(item));
  };

  const handleCopyProcessedDomains = async (item) => {
    const domains = getSubBatchResultDomains(item);

    await navigator.clipboard.writeText(domains.join("\n"));
  };

  const handleDownloadProcessedDomains = (item) => {
    const batchName =
      item.batchId?.batchName?.replace(/[^a-z0-9-]+/gi, "-") ||
      "processed";
    const fileName = `${batchName}-sub-batch-${item.subBatchNumber}.csv`;

    downloadDomainsAsCsv(fileName, getSubBatchResultDomains(item));
  };

  const handleViewProcessedBatchDomains = (group) => {
    setViewTitle(group.batch?.batchName || "Processed Batch");
    setViewDomains(getProcessedBatchDomains(group));
  };

  const handleCopyProcessedBatchDomains = async (group) => {
    await navigator.clipboard.writeText(
      getProcessedBatchDomains(group).join("\n")
    );
  };

  const handleDownloadProcessedBatchDomains = (group) => {
    const batchName =
      group.batch?.batchName?.replace(/[^a-z0-9-]+/gi, "-") ||
      "processed-batch";

    downloadDomainsAsCsv(
      `${batchName}-processed.csv`,
      getProcessedBatchDomains(group)
    );
  };

  const selectCopiedSubBatch = (item) => {
    setSelectedCopiedSubBatch(item);
    setSeoTableData(createEmptyRows());
    setMergeStatus(null);
    setFilteredRows([]);
    setShowFilteredPopup(false);
  };

  const handleSeoPaste = (data) => {
    if (!selectedCopiedSubBatch) {
      return false;
    }

    const formattedRows = parseSeoPasteRows(data);
    const copiedDomains = selectedCopiedSubBatch.domains || [];
    const domainMergedRows = formattedRows.map((row, index) => [
      copiedDomains[index] || row[0],
      ...row.slice(1),
    ]);

    const mergedRows = [
      ...domainMergedRows,
      ...createEmptyRows(
        Math.max(0, 100 - domainMergedRows.length)
      ),
    ];

    setSeoTableData(mergedRows);
    setFilteredRows([]);
    setShowFilteredPopup(false);

    if (formattedRows.length !== copiedDomains.length) {
      setMergeStatus({
        type: "error",
        message: `Merge failed. Expected ${copiedDomains.length} rows, but found ${formattedRows.length}. Showing pasted results with copied domains where available.`,
      });
    } else {
      setMergeStatus({
        type: "success",
        message: `Successfully merged ${formattedRows.length} SEO rows with copied domains.`,
      });
    }

    return false;
  };

  const handleShowFilteredTable = () => {
    setFilteredRows(getFilteredSeoRows(seoTableData));
    setShowFilteredPopup(true);
  };

  const closeViewPopup = () => {
    setViewDomains([]);
    setViewTitle("");
  };

  const closeFilteredPopup = () => {
    setShowFilteredPopup(false);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Processor Workspace</h1>

        <div style={styles.tabs}>
          {["pending", "copied", "processed"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...styles.tabBtn,
                ...(activeTab === tab ? styles.activeTab : {}),
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={styles.centerBox}>Loading sub batches...</div>
        ) : (
          <div style={styles.list}>
            {batchGroups.length > 0 ? (
              <>
                {activeTab === "processed" ? (
                  <div style={styles.processedBatchList}>
                    {batchGroups.map((group) => {
                      const batchKey = group.batch?._id || group.batch;
                      const processedDomains =
                        getProcessedBatchDomains(group);

                      return (
                        <div key={batchKey} style={styles.processedBatchRow}>
                          <span>
                            <strong>{group.batch?.batchName}</strong>
                            <span style={styles.batchMeta}>
                              {processedDomains.length} filtered domains -
                              processed
                            </span>
                          </span>

                          <div style={styles.actionGroup}>
                            <button
                              onClick={() =>
                                handleViewProcessedBatchDomains(group)
                              }
                              style={styles.eyeIconBtn}
                              title="View processed domains"
                              aria-label="View processed domains"
                            >
                              {"\u{1F441}\uFE0F"}
                            </button>

                            <button
                              onClick={() =>
                                handleCopyProcessedBatchDomains(group)
                              }
                              style={styles.copySmallBtn}
                              title="Copy processed domains"
                            >
                              Copy
                            </button>

                            <button
                              onClick={() =>
                                handleDownloadProcessedBatchDomains(group)
                              }
                              style={styles.downloadIconBtn}
                              title="Download CSV"
                              aria-label="Download CSV"
                            >
                              {"\u2193"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={styles.batchTabs}>
                    {batchGroups.map((group, index) => {
                      const batchKey = group.batch?._id || group.batch;
                      const isActive = selectedBatch === batchKey;
                      const canOpenBatch = index === 0;

                      return (
                        <button
                          key={batchKey}
                          onClick={() => {
                            if (canOpenBatch) {
                              setSelectedBatch(batchKey);
                            }
                          }}
                          style={{
                            ...styles.batchTabBtn,
                            cursor: canOpenBatch ? "pointer" : "not-allowed",
                            opacity: canOpenBatch ? 1 : 0.5,
                            background: isActive ? "#1f2937" : "transparent",
                            color: isActive ? "white" : "#d1d5db",
                            borderBottom: isActive
                              ? "3px solid #9425c0"
                              : "3px solid transparent",
                            borderRight: "1px solid #374151",
                          }}
                        >
                          {group.batch?.batchName}
                        </button>
                      );
                    })}
                  </div>
                )}

                {activeTab !== "processed" && (
                  <div style={styles.subBatchContainer}>
                    {visibleBatchGroup && (
                    <div style={styles.subBatchList}>
                      {visibleBatchGroup.subBatches.map((item) => {
                        const isSelected =
                          selectedCopiedSubBatch?._id === item._id;
                        const canMoveToProcessed =
                          mergeStatus?.type === "success" && isSelected;

                        return (
                          <div
                            key={item._id}
                            style={{
                              ...styles.subBatchRow,
                              ...(isSelected ? styles.selectedSubBatchRow : {}),
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                activeTab === "copied"
                                  ? selectCopiedSubBatch(item)
                                  : undefined
                              }
                              style={styles.subBatchInfoButton}
                            >
                              <span>
                                <strong>Sub Batch {item.subBatchNumber}</strong>
                                <span style={styles.batchMeta}>
                                  {getSubBatchDisplayCount(item, activeTab)}{" "}
                                  domains - {item.status}
                                </span>
                              </span>
                            </button>

                            {activeTab === "pending" && (
                              <button
                                onClick={() => handleCopy(item._id)}
                                style={styles.copyBtn}
                              >
                                Copy
                              </button>
                            )}

                            {activeTab === "copied" && (
                              <div style={styles.actionGroup}>
                                <button
                                  onClick={() => handleViewDomains(item._id)}
                                  style={styles.eyeIconBtn}
                                  title="View domains"
                                  aria-label="View domains"
                                >
                                  {"\u{1F441}\uFE0F"}
                                </button>

                                <button
                                  onClick={() =>
                                    handleMoveToProcessed(item._id)
                                  }
                                  disabled={!canMoveToProcessed}
                                  style={{
                                    ...styles.processBtn,
                                    ...(canMoveToProcessed
                                      ? styles.processBtnReady
                                      : styles.processBtnBlocked),
                                  }}
                                >
                                  Move To Processed
                                </button>
                              </div>
                            )}

                            {activeTab === "processed" && (
                              <div style={styles.actionGroup}>
                                <button
                                  onClick={() =>
                                    handleViewProcessedDomains(item)
                                  }
                                  style={styles.eyeIconBtn}
                                  title="View processed domains"
                                  aria-label="View processed domains"
                                >
                                  {"\u{1F441}\uFE0F"}
                                </button>

                                <button
                                  onClick={() =>
                                    handleCopyProcessedDomains(item)
                                  }
                                  style={styles.copySmallBtn}
                                  title="Copy processed domains"
                                >
                                  Copy
                                </button>

                                <button
                                  onClick={() =>
                                    handleDownloadProcessedDomains(item)
                                  }
                                  style={styles.downloadIconBtn}
                                  title="Download CSV"
                                  aria-label="Download CSV"
                                >
                                  {"\u2193"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </div>
                )}

                {activeTab === "copied" && selectedCopiedSubBatch && (
                  <div style={styles.hotBox}>
                    <div style={styles.hotHeader}>
                      <h3 style={styles.hotTitle}>Paste SEO Checker Results</h3>

                      <button
                        onClick={handleShowFilteredTable}
                        style={styles.filterBtn}
                      >
                        Filtered Table
                      </button>
                    </div>

                    <HotTable
                      ref={hotRef}
                      data={seoTableData}
                      colHeaders={seoTableHeaders}
                      rowHeaders={true}
                      height="360"
                      width="100%"
                      minRows={100}
                      minCols={10}
                      readOnly={false}
                      copyPaste={true}
                      licenseKey="non-commercial-and-evaluation"
                      beforePaste={handleSeoPaste}
                      settings={{
                        stretchH: "all",
                        contextMenu: true,
                        manualColumnResize: true,
                        copyPaste: true,
                      }}
                    />

                    {mergeStatus && (
                      <div
                        style={{
                          ...styles.mergeMessage,
                          ...(mergeStatus.type === "success"
                            ? styles.mergeSuccess
                            : styles.mergeError),
                        }}
                      >
                        {mergeStatus.message}
                      </div>
                    )}
                  </div>
                )}

                {viewDomains.length > 0 && (
                  <div style={styles.modalOverlay}>
                    <div style={styles.modalBox}>
                      <div style={styles.viewHeader}>
                        <strong>{viewTitle}</strong>

                        <button
                          onClick={closeViewPopup}
                          style={styles.closeBtn}
                        >
                          x
                        </button>
                      </div>

                      <div style={styles.domainTableWrap}>
                        <table style={styles.domainTable}>
                          <thead>
                            <tr>
                              <th style={styles.domainNoTh}>No</th>
                              <th style={styles.domainTh}>Domain</th>
                            </tr>
                          </thead>

                          <tbody>
                            {viewDomains.map((domain, index) => (
                              <tr key={`${domain}-${index}`}>
                                <td style={styles.domainNoTd}>
                                  {index + 1}
                                </td>
                                <td style={styles.domainTd}>{domain}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div style={styles.modalActions}>
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(
                              viewDomains.join("\n")
                            )
                          }
                          style={styles.viewBtn}
                        >
                          Copy Again
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {showFilteredPopup && (
                  <div style={styles.modalOverlay}>
                    <div style={styles.filteredModalBox}>
                      <div style={styles.viewHeader}>
                        <strong>Filtered SEO Results</strong>

                        <button
                          onClick={closeFilteredPopup}
                          style={styles.closeBtn}
                        >
                          x
                        </button>
                      </div>

                      <div style={styles.filterSummary}>
                        Count: {filteredRows.length} | TBL 0-1000 | QBL
                        10-1000 | Q/T 5%-100% | SS 1%-11%
                      </div>

                      <div style={styles.filteredTableWrap}>
                        <table style={styles.filteredTable}>
                          <thead>
                            <tr>
                              <th style={styles.filteredNoTh}>No</th>
                              {seoTableHeaders.map((header) => (
                                <th key={header} style={styles.filteredTh}>
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>

                          <tbody>
                            {filteredRows.length > 0 ? (
                              filteredRows.map((row, rowIndex) => (
                                <tr key={`${row[0]}-${rowIndex}`}>
                                  <td style={styles.filteredNoTd}>
                                    {rowIndex + 1}
                                  </td>

                                  {seoTableHeaders.map((header, cellIndex) => (
                                    <td
                                      key={`${header}-${cellIndex}`}
                                      style={styles.filteredTd}
                                    >
                                      {row[cellIndex]}
                                    </td>
                                  ))}
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td
                                  colSpan={seoTableHeaders.length + 1}
                                  style={styles.filteredEmpty}
                                >
                                  No rows match the filters
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={styles.centerBox}>No batches found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    padding: "30px",
  },

  card: {
    maxWidth: "1100px",
    margin: "0 auto",
    background: "white",
    borderRadius: "20px",
    padding: "30px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  },

  title: {
    fontSize: "32px",
    fontWeight: "700",
    marginBottom: "25px",
    color: "#111827",
  },

  tabs: {
    display: "flex",
    gap: "12px",
    marginBottom: "24px",
  },

  tabBtn: {
    padding: "10px 18px",
    border: "none",
    borderRadius: "10px",
    background: "#f1f5f9",
    cursor: "pointer",
    fontWeight: "600",
  },

  activeTab: {
    background: "#111827",
    color: "white",
  },

  list: {
    display: "grid",
    gap: "10px",
  },

  copyBtn: {
    padding: "10px 16px",
    background: "#111827",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "600",
  },

  copySmallBtn: {
    padding: "10px 14px",
    background: "#111827",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "600",
  },

  processBtn: {
    padding: "10px 16px",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontWeight: "600",
  },

  processBtnReady: {
    background: "#22c55e",
    cursor: "pointer",
  },

  processBtnBlocked: {
    background: "#14532d",
    cursor: "not-allowed",
    opacity: 0.75,
  },

  centerBox: {
    height: "250px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px dashed #cbd5e1",
    borderRadius: "16px",
    color: "#64748b",
    fontWeight: "600",
    background: "#f8fafc",
  },

  batchMeta: {
    display: "block",
    margin: "5px 0 0",
    color: "#64748b",
    fontSize: "14px",
  },

  subBatchList: {
    padding: "8px",
    display: "grid",
    gap: "8px",
  },

  subBatchRow: {
    padding: "9px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "14px",
  },

  selectedSubBatchRow: {
    borderColor: "#8b5cf6",
    background: "#faf5ff",
  },

  batchTabs: {
    display: "flex",
    overflowX: "auto",
    background: "#111827",
    borderRadius: "10px 10px 0 0",
    border: "1px solid #000",
  },

  processedBatchList: {
    display: "grid",
    gap: "8px",
  },

  processedBatchRow: {
    padding: "12px 14px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "14px",
    background: "#ffffff",
  },

  batchTabBtn: {
    minWidth: "160px",
    padding: "14px 20px",
    border: "none",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "14px",
    textAlign: "left",
  },

  subBatchContainer: {
    minHeight: 0,
  },

  subBatchInfoButton: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: 0,
    border: "none",
    background: "transparent",
    color: "#111827",
    cursor: "pointer",
    textAlign: "left",
  },

  eyeBtn: {
    width: "44px",
    minWidth: "44px",
    padding: "7px 0",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#334155",
    fontSize: "12px",
    fontWeight: "700",
    textAlign: "center",
  },

  eyeIconBtn: {
    width: "38px",
    height: "38px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#334155",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "700",
  },

  downloadIconBtn: {
    width: "38px",
    height: "38px",
    borderRadius: "10px",
    border: "1px solid #16a34a",
    background: "#dcfce7",
    color: "#166534",
    cursor: "pointer",
    fontSize: "20px",
    fontWeight: "900",
    lineHeight: 1,
  },

  actionGroup: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    padding: "24px",
  },

  modalBox: {
    width: "100%",
    maxWidth: "760px",
    background: "#ffffff",
    borderRadius: "18px",
    overflow: "hidden",
    boxShadow: "0 24px 70px rgba(15,23,42,0.35)",
    border: "1px solid #e5e7eb",
  },

  filteredModalBox: {
    width: "100%",
    maxWidth: "1040px",
    maxHeight: "86vh",
    background: "#ffffff",
    borderRadius: "18px",
    overflow: "hidden",
    boxShadow: "0 24px 70px rgba(15,23,42,0.35)",
    border: "1px solid #e5e7eb",
  },

  viewHeader: {
    padding: "16px 20px",
    background: "#111827",
    color: "white",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  closeBtn: {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    border: "none",
    background: "rgba(255,255,255,0.12)",
    color: "white",
    fontSize: "22px",
    cursor: "pointer",
    fontWeight: "700",
  },

  viewTextarea: {
    width: "100%",
    height: "340px",
    padding: "18px",
    border: "none",
    resize: "none",
    outline: "none",
    fontSize: "14px",
    lineHeight: "1.7",
    fontFamily: "Consolas, monospace",
    boxSizing: "border-box",
    background: "#f8fafc",
    color: "#111827",
  },

  domainTableWrap: {
    maxHeight: "420px",
    overflow: "auto",
    background: "#f8fafc",
  },

  domainTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
  },

  domainNoTh: {
    position: "sticky",
    top: 0,
    width: "70px",
    padding: "12px",
    background: "#f1f5f9",
    borderBottom: "1px solid #cbd5e1",
    textAlign: "center",
    color: "#111827",
  },

  domainTh: {
    position: "sticky",
    top: 0,
    padding: "12px",
    background: "#f1f5f9",
    borderBottom: "1px solid #cbd5e1",
    textAlign: "left",
    color: "#111827",
  },

  domainNoTd: {
    padding: "10px 12px",
    borderBottom: "1px solid #e5e7eb",
    textAlign: "center",
    fontWeight: "700",
    color: "#334155",
  },

  domainTd: {
    padding: "10px 12px",
    borderBottom: "1px solid #e5e7eb",
    color: "#111827",
    fontFamily: "Consolas, monospace",
  },

  modalActions: {
    padding: "14px 20px",
    display: "flex",
    justifyContent: "flex-end",
    borderTop: "1px solid #e5e7eb",
    background: "white",
  },

  viewBtn: {
    padding: "10px 16px",
    background: "white",
    color: "#111827",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "600",
  },

  hotBox: {
    marginTop: "4px",
    background: "white",
    borderRadius: "16px",
    padding: "12px",
    border: "1px solid #e5e7eb",
    maxWidth: "100%",
    overflowX: "auto",
  },

  hotHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "14px",
    marginBottom: "8px",
  },

  hotTitle: {
    fontSize: "16px",
    fontWeight: "700",
    margin: 0,
  },

  filterBtn: {
    padding: "9px 14px",
    background: "#111827",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "700",
    whiteSpace: "nowrap",
  },

  filterSummary: {
    padding: "10px 16px",
    background: "#f8fafc",
    borderBottom: "1px solid #e5e7eb",
    color: "#475569",
    fontSize: "13px",
    fontWeight: "700",
  },

  filteredTableWrap: {
    maxHeight: "68vh",
    overflow: "auto",
  },

  filteredTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
  },

  filteredTh: {
    position: "sticky",
    top: 0,
    background: "#f1f5f9",
    borderBottom: "1px solid #cbd5e1",
    padding: "10px",
    textAlign: "left",
    color: "#111827",
    whiteSpace: "nowrap",
  },

  filteredNoTh: {
    position: "sticky",
    top: 0,
    background: "#f1f5f9",
    borderBottom: "1px solid #cbd5e1",
    padding: "10px",
    textAlign: "center",
    color: "#111827",
    width: "60px",
    whiteSpace: "nowrap",
  },

  filteredTd: {
    borderBottom: "1px solid #e5e7eb",
    padding: "9px 10px",
    color: "#334155",
    whiteSpace: "nowrap",
  },

  filteredNoTd: {
    borderBottom: "1px solid #e5e7eb",
    padding: "9px 10px",
    color: "#334155",
    textAlign: "center",
    fontWeight: "700",
    whiteSpace: "nowrap",
  },

  filteredEmpty: {
    padding: "38px",
    textAlign: "center",
    color: "#64748b",
    fontWeight: "700",
  },

  mergeMessage: {
    marginTop: "10px",
    padding: "10px 12px",
    borderRadius: "10px",
    fontWeight: "600",
    fontSize: "13px",
  },

  mergeSuccess: {
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #86efac",
  },

  mergeError: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fca5a5",
  },
};

export default ProcessorWorkspacePage;
