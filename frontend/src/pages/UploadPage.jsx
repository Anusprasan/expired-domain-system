import { useState } from "react";
import axios from "axios";

function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState("");
  const [totalDomains, setTotalDomains] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
    setMessage("");
    setTotalDomains(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage("Please select a file");
      return;
    }

    const allowedExtensions = ["txt", "xlsx", "csv"];
    const fileExtension = selectedFile.name.split(".").pop().toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      setMessage("Only TXT, XLSX and CSV files are allowed");
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await axios.post(
        "http://localhost:5000/api/upload",
        formData
      );

      setMessage(response.data.message);
      setTotalDomains(response.data.totalDomains);
      setSelectedFile(null);
    } catch (error) {
      console.error(error);
      setMessage("File upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setMessage("");
    setTotalDomains(null);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Upload Domain File</h1>

        <p style={styles.subtitle}>
          Upload TXT, CSV, or Excel file to create a new expired domain batch.
        </p>

        <input
          type="file"
          accept=".txt,.xlsx,.csv"
          onChange={handleFileChange}
          key={selectedFile ? "file-selected" : "file-empty"}
          style={styles.fileInput}
        />

        {selectedFile && (
          <p style={styles.fileName}>
            Selected File: {selectedFile.name}
          </p>
        )}

        <div style={styles.buttons}>
          <button
            onClick={handleUpload}
            disabled={loading}
            style={styles.primaryBtn}
          >
            {loading ? "Uploading..." : "Upload File"}
          </button>

          <button onClick={handleClear} style={styles.secondaryBtn}>
            Clear
          </button>
        </div>

        {message && <p style={styles.message}>{message}</p>}

        {totalDomains !== null && (
          <p style={styles.count}>Total Domains: {totalDomains}</p>
        )}
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
    maxWidth: "520px",
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
    marginBottom: "30px",
  },
  fileInput: {
    padding: "14px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    width: "100%",
    boxSizing: "border-box",
    cursor: "pointer",
  },
  fileName: {
    marginTop: "15px",
    color: "#6d28d9",
    fontWeight: "600",
  },
  buttons: {
    marginTop: "25px",
  },
  primaryBtn: {
    padding: "13px 28px",
    background: "#6d28d9",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    marginRight: "12px",
  },
  secondaryBtn: {
    padding: "13px 28px",
    background: "white",
    color: "#6d28d9",
    border: "1px solid #6d28d9",
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
  count: {
    color: "#16a34a",
    fontWeight: "700",
  },
};

export default UploadPage;