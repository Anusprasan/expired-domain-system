import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

function BatchPage() {
  const [batches, setBatches] = useState([]);
  const [message, setMessage] = useState("");

  const fetchBatches = async () => {
    try {
      const response = await axios.get(
        "http://localhost:5000/api/batches/getBatches"
      );

      setBatches(response.data);
    } catch (error) {
      console.error(error);
      setMessage("Failed to fetch batches");
    }
  };

  const handleDelete = async (batchId) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this batch?"
    );

    if (!confirmDelete) return;

    try {
      await axios.delete(
        `http://localhost:5000/api/batches/deleteBatch/${batchId}`
      );

      fetchBatches();
    } catch (error) {
      console.error(error);
      alert("Delete failed");
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Uploaded Batches</h1>
        <p style={styles.subtitle}>
          View, open, and manage all uploaded domain batches.
        </p>
      </div>

      {message && <p style={styles.error}>{message}</p>}

      <div style={styles.card}>
        {batches.length === 0 ? (
          <p style={styles.empty}>No batches found</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Batch Name</th>
                <th style={styles.th}>File Name</th>
                <th style={styles.th}>Total Domains</th>
                <th style={styles.th}>Uploaded Date</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>

            <tbody>
              {batches.map((batch) => (
                <tr key={batch._id}>
                  <td style={styles.td}>
                    <Link
                      to={`/batches/${batch._id}`}
                      style={styles.batchLink}
                    >
                      {batch.batchName}
                    </Link>
                  </td>

                  <td style={styles.td}>{batch.originalFileName}</td>

                  <td style={styles.td}>
                    <span style={styles.countBadge}>
                      {batch.totalDomains}
                    </span>
                  </td>

                  <td style={styles.td}>
                    {new Date(batch.createdAt).toLocaleString()}
                  </td>

                  <td style={styles.td}>
                    <button
                      onClick={() => handleDelete(batch._id)}
                      style={styles.deleteBtn}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "80vh",
    background: "linear-gradient(180deg, #faf7ff, #ffffff)",
    padding: "50px",
  },
  header: {
    marginBottom: "30px",
  },
  title: {
    fontSize: "38px",
    marginBottom: "8px",
    color: "#111827",
  },
  subtitle: {
    color: "#64748b",
    fontSize: "17px",
  },
  card: {
    background: "white",
    borderRadius: "18px",
    padding: "25px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "16px",
    background: "#f3f0ff",
    color: "#4c1d95",
    fontSize: "15px",
  },
  td: {
    padding: "16px",
    borderBottom: "1px solid #e5e7eb",
    color: "#374151",
  },
  batchLink: {
    color: "#6d28d9",
    fontWeight: "700",
    textDecoration: "none",
  },
  countBadge: {
    background: "#ede9fe",
    color: "#6d28d9",
    padding: "6px 12px",
    borderRadius: "20px",
    fontWeight: "700",
  },
  deleteBtn: {
    background: "#ef4444",
    color: "white",
    border: "none",
    padding: "9px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600",
  },
  empty: {
    textAlign: "center",
    color: "#64748b",
    fontSize: "18px",
  },
  error: {
    color: "#ef4444",
    fontWeight: "600",
  },
};

export default BatchPage;