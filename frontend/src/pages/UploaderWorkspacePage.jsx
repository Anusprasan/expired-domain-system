import { useState } from "react";
import axios from "axios";
import { useEffect } from "react";
import { getSessionToken } from "../utils/session";

function UploaderWorkspacePage() {
  const [domains, setDomains] = useState("");
  const [message, setMessage] = useState("");
  const [batchInfo, setBatchInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [summary, setSummary] = useState(null);
 const [validDomains, setValidDomains] = useState([]);

  const token = getSessionToken();

  useEffect(() => {
  fetchCurrentBatch();
   }, []);

    const fetchCurrentBatch = async () => {
        try {
            const response = await axios.get(
            "http://localhost:5000/api/uploader/current-batch",
            {
                headers: {
                Authorization: `Bearer ${token}`,
                },
            }
            );

            setBatchInfo(response.data.batch);
            setSummary(response.data.summary);
            setValidDomains(response.data.validDomainsList);
        } catch (error) {
            console.error(error);
        }
    };

    const saveDomains = async (text) => {
  if (!text.trim()) {
    return;
  }

  setDomains("");
  setSaveStatus("Saving...");

  try {
    await axios.post(
      "http://localhost:5000/api/uploader/paste",
      { domains: text },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    setSaveStatus("Saved");
    await fetchCurrentBatch();

    setTimeout(() => {
      setSaveStatus("");
    }, 1500);
  } catch (error) {
    console.error(error);
    setSaveStatus("Paste Failed");

    setTimeout(() => {
      setSaveStatus("");
    }, 1500);
  }
};

  const handleAutoPaste = async (e) => {
  e.preventDefault();

  const pastedText = e.clipboardData.getData("text");

  await saveDomains(pastedText);
  };

  const handleKeyDown = async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();

    await saveDomains(domains);
  }
};

  const handleMoveToProcess = async () => {
  try {
    setLoading(true);

    await axios.post(
      "http://localhost:5000/api/uploader/move-to-process",
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    // success
    setMessage("Batch Moved");

    // refresh next batch
    await fetchCurrentBatch();

    // auto hide success
    setTimeout(() => {
      setMessage("");
    }, 1500);

  } catch (error) {
    console.error(error);

    // backend/database error
    setMessage(
      error.response?.data?.message ||
      "Failed to move batch"
    );

    // auto hide error
    setTimeout(() => {
      setMessage("");
    }, 2000);

  } finally {
    setLoading(false);
  }
};
  

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Uploader Workspace</h1>

        <p style={styles.subtitle}>
          Paste expired domains into the current open batch.
        </p>

        {batchInfo && summary && (
        <div style={styles.summaryBar}>
            <span>Batch: #{batchInfo.batchName.split("#")[1]}</span>
            <span>Total: {summary.totalDomains}</span>
            <span>Valid: {summary.validDomains}</span>
            <span>Duplicate: {summary.duplicateDomains}</span>
            <span>Invalid: {summary.invalidDomains}</span>
        </div>
        )}

        <div style={styles.textareaWrapper}>

            <textarea
            rows="2"
            value={domains}
            onChange={(e) =>
                setDomains(e.target.value)
            }
            onPaste={handleAutoPaste}
            onKeyDown={handleKeyDown}
            placeholder="Paste domains here..."
            style={styles.textarea}
            />

            {saveStatus && (
            <div style={styles.overlay}>
                {saveStatus}
            </div>
            )}

                </div>


        <div style={styles.tableBox}>
            <div style={styles.tableHeader}>
                <span>Valid Domains</span>
                <span>{validDomains.length} shown</span>
            </div>

            <div style={styles.tableScroll}>
                <table style={styles.table}>
                <thead>
                    <tr>

                        <th
                        style={{
                            ...styles.th,
                            width: "80px",
                            textAlign: "center",
                        }}
                        >
                        No
                        </th>

                        <th
                        style={{
                            ...styles.th,
                            textAlign: "left",
                        }}
                        >
                        Domain
                        </th>

                    </tr>
                </thead>

                <tbody>
                 {validDomains.length > 0 ? (

                    validDomains.map((item, index) => (

                        <tr key={item._id}>

                        <td
                            style={{
                                ...styles.td,
                                width: "80px",
                                textAlign: "center",
                            }}
                            >
                            {index + 1}
                        </td>

                        <td
                            style={{
                                ...styles.td,
                                textAlign: "left",
                            }}
                            >
                            {item.domain}
                        </td>

                        </tr>

                    ))

                    ) : (

                    <tr>

                        <td
                        colSpan="2"
                        style={{
                            ...styles.td,
                            textAlign: "center",
                            padding: "40px",
                            color: "#94a3b8",
                            fontWeight: "600",
                        }}
                        >
                        No valid domains yet
                        </td>

                    </tr>

                    )}
                </tbody>
                </table>
            </div>
        </div>

       <div style={styles.buttons}>

           

            <button
                onClick={handleMoveToProcess}
                disabled={loading}
                style={styles.darkBtn}
            >
                Move To Process
            </button>

</div>

        

        {message && <p style={styles.message}>{message}</p>}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "80vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(180deg, #faf7ff, #ffffff)",
    padding: "30px",
  },
  card: {
    width: "100%",
    maxWidth: "720px",
    background: "white",
    padding: "40px",
    borderRadius: "20px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    textAlign: "center",
  },
  title: {
    fontSize: "34px",
    marginBottom: "10px",
    color: "#111827",
  },
  subtitle: {
    color: "#64748b",
    fontSize: "16px",
    lineHeight: "1.6",
    marginBottom: "25px",
  },
    textarea: {
    width: "100%",
    height: "54px",
    padding: "14px 16px",
    border: "1px solid #ddd6fe",
    borderRadius: "12px",
    fontSize: "15px",
    resize: "none",
    boxSizing: "border-box",
    outline: "none",
    background: "#ffffff",
    },
  buttons: {
    marginTop: "25px",
    display: "flex",
    gap: "12px",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  primaryBtn: {
    padding: "13px 24px",
    background: "#6d28d9",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "13px 24px",
    background: "white",
    color: "#6d28d9",
    border: "1px solid #6d28d9",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  darkBtn: {
    padding: "13px 24px",
    background: "#111827",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },

  message: {
    marginTop: "25px",
    fontWeight: "600",
    color: "#111827",
  },
  batchBox: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#faf5ff",
    border: "1px solid #e9d5ff",
    padding: "10px 16px",
    borderRadius: "12px",
    marginBottom: "16px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#4c1d95",
    },

    textareaWrapper: {
        position: "relative",
        },

        overlay: {
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#6d28d9",
            fontSize: "14px",
            fontWeight: "700",
            letterSpacing: "0.3px",
            background: "rgba(255,255,255,0.92)",
            padding: "4px 10px",
        },

            summaryBar: {
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        background: "#faf5ff",
        border: "1px solid #e9d5ff",
        padding: "10px 16px",
        borderRadius: "12px",
        marginBottom: "16px",
        fontSize: "14px",
        fontWeight: "700",
        color: "#4c1d95",
        },

            tableBox: {
        marginTop: "22px",
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        overflow: "hidden",
        background: "white",
        boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
        },

        tableHeader: {
        padding: "14px 18px",
        background: "#faf5ff",
        borderBottom: "1px solid #e9d5ff",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        color: "#4c1d95",
        fontWeight: "700",
        },

        tableScroll: {
        height: "360px",
        overflowY: "auto",
        },

        table: {
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            tableLayout: "fixed",
            fontSize: "14px",
        },

        th: {
        background: "#f8fafc",
        color: "#475569",
        padding: "12px 16px",
        textAlign: "left",
        borderBottom: "1px solid #e5e7eb",
        fontSize: "13px",
        fontWeight: "700",
        position: "sticky",
        top: 0,
        zIndex: 1,
        },

        td: {
        padding: "12px 16px",
        borderBottom: "1px solid #f1f5f9",
        color: "#111827",
        },
};

export default UploaderWorkspacePage;
