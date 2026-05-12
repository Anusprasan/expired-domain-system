import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";

function DomainPage() {
  const { batchId } = useParams();

  const [domains, setDomains] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");

  const fetchDomains = async () => {
    try {
      const response = await axios.get(
        `http://localhost:5000/api/domains/batch/${batchId}`
      );

      setDomains(response.data);
    } catch (error) {
      console.error(error);
      setMessage("Failed to fetch domains");
    }
  };

  useEffect(() => {
    fetchDomains();
  }, [batchId]);

  const filteredDomains = domains.filter((domain) =>
    domain.domainName
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Domains in Batch</h1>
        <p style={styles.subtitle}>
          Search and view all domains uploaded in this batch.
        </p>

        <Link to="/batches">
            <button style={styles.backBtn}>← Back to Batches</button>
        </Link>
      </div>

      {message && <p style={styles.error}>{message}</p>}

      <div style={styles.topBar}>
        <input
          type="text"
          placeholder="Search domains..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />

        <div style={styles.stats}>
          <span style={styles.statBox}>Total: {domains.length}</span>
          <span style={styles.statBox}>Showing: {filteredDomains.length}</span>
        </div>
      </div>

      <div style={styles.card}>
        {filteredDomains.length === 0 ? (
          <p style={styles.empty}>No domains found</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>No</th>
                <th style={styles.th}>Domain Name</th>
                <th style={styles.th}>Added Date</th>
              </tr>
            </thead>

            <tbody>
              {filteredDomains.map((domain, index) => (
                <tr key={domain._id}>
                  <td style={styles.td}>{index + 1}</td>
                  <td style={styles.domainName}>{domain.domainName}</td>
                  <td style={styles.td}>
                    {new Date(domain.createdAt).toLocaleString()}
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
    marginBottom: "25px",
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
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "25px",
    gap: "20px",
  },
  searchInput: {
    width: "350px",
    padding: "14px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    fontSize: "16px",
  },
  stats: {
    display: "flex",
    gap: "12px",
  },
  statBox: {
    background: "#ede9fe",
    color: "#6d28d9",
    padding: "10px 16px",
    borderRadius: "20px",
    fontWeight: "700",
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
  domainName: {
    padding: "16px",
    borderBottom: "1px solid #e5e7eb",
    color: "#6d28d9",
    fontWeight: "700",
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

  backBtn: {
  marginTop: "15px",
  padding: "10px 18px",
  background: "white",
  color: "#6d28d9",
  border: "1px solid #6d28d9",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: "600",
},
};

export default DomainPage;