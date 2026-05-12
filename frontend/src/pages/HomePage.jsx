import { Link } from "react-router-dom";

function HomePage() {
  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.badge}>⭐ Smart Domain Management</div>

        <h1 style={styles.title}>
          Expired Domain <span style={styles.highlight}>Manager</span>
        </h1>

        <p style={styles.subtitle}>
          Upload TXT, CSV, or Excel files and manage expired domain batches
          efficiently and easily.
        </p>

        <div style={styles.buttons}>
          <Link to="/upload">
            <button style={styles.primaryBtn}>☁ Upload Domains</button>
          </Link>

          <Link to="/batches">
            <button style={styles.secondaryBtn}>☷ View Batches</button>
          </Link>
        </div>
      </section>

      <section style={styles.featuresSection}>
        <div style={styles.icon}>⚙</div>

        <h2 style={styles.sectionTitle}>System Features</h2>
        <p style={styles.sectionText}>
          Everything you need to manage expired domains
        </p>

        <div style={styles.cards}>
          {features.map((item, index) => (
            <div key={index} style={styles.card}>
              <div style={styles.cardIcon}>{item.icon}</div>
              <h3>{item.title}</h3>
              <p style={styles.cardText}>{item.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const features = [
  {
    icon: "↥",
    title: "Upload Files",
    text: "Upload daily expired domain files in TXT, CSV, or Excel format.",
  },
  {
    icon: "▰",
    title: "Auto Batching",
    text: "Create separate batches automatically for each upload.",
  },
  {
    icon: "📁",
    title: "View Batches",
    text: "Browse and view domains batch by batch with details.",
  },
  {
    icon: "🔍",
    title: "Search Domains",
    text: "Search through domains quickly and efficiently.",
  },
  {
    icon: "🗑",
    title: "Delete Batches",
    text: "Delete unwanted batches with a single click.",
  },
];

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #faf7ff, #ffffff)",
    color: "#111827",
  },
  hero: {
    textAlign: "center",
    padding: "90px 20px 70px",
  },
  badge: {
    display: "inline-block",
    padding: "10px 20px",
    borderRadius: "30px",
    background: "#f0e7ff",
    color: "#6d28d9",
    fontWeight: "600",
    marginBottom: "25px",
  },
  title: {
    fontSize: "60px",
    margin: "0",
    fontWeight: "800",
  },
  highlight: {
    color: "#6d28d9",
  },
  subtitle: {
    fontSize: "22px",
    color: "#64748b",
    maxWidth: "720px",
    margin: "20px auto",
    lineHeight: "1.5",
  },
  buttons: {
    marginTop: "35px",
  },
  primaryBtn: {
    padding: "16px 36px",
    marginRight: "20px",
    background: "#6d28d9",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontSize: "18px",
    fontWeight: "600",
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "16px 36px",
    background: "white",
    color: "#6d28d9",
    border: "2px solid #6d28d9",
    borderRadius: "12px",
    fontSize: "18px",
    fontWeight: "600",
    cursor: "pointer",
  },
  featuresSection: {
    textAlign: "center",
    padding: "50px 60px 80px",
    background: "white",
  },
  icon: {
    fontSize: "35px",
    color: "#6d28d9",
  },
  sectionTitle: {
    fontSize: "36px",
    margin: "10px 0",
  },
  sectionText: {
    color: "#64748b",
    fontSize: "18px",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "25px",
    marginTop: "40px",
  },
  card: {
    padding: "35px 25px",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    background: "white",
    boxShadow: "0 8px 20px rgba(0,0,0,0.04)",
  },
  cardIcon: {
    fontSize: "35px",
    color: "#6d28d9",
    marginBottom: "20px",
  },
  cardText: {
    color: "#64748b",
    lineHeight: "1.6",
  },
};

export default HomePage;