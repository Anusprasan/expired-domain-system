import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav style={styles.navbar}>
      <div style={styles.logo}>
        🌐 Expired Domain Manager
      </div>

      <div style={styles.links}>
        <Link style={styles.link} to="/">
          Home
        </Link>

        <Link style={styles.link} to="/upload">
          Upload
        </Link>

        <Link style={styles.link} to="/batches">
          Batches
        </Link>
      </div>
    </nav>
  );
}

const styles = {
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 50px",
    background: "white",
    borderBottom: "1px solid #e5e7eb",
    boxShadow: "0 4px 15px rgba(0,0,0,0.04)",
  },

  logo: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#111827",
  },

  links: {
    display: "flex",
    gap: "30px",
  },

  link: {
    color: "#4b5563",
    textDecoration: "none",
    fontSize: "17px",
    fontWeight: "500",
  },
};

export default Navbar;