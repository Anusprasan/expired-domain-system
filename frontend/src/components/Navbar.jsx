import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSessionUser } from "../utils/session";

function Navbar() {
  const [user, setUser] = useState(() => getSessionUser());

  useEffect(() => {
    const syncUser = () => {
      setUser(getSessionUser());
    };

    const interval = window.setInterval(syncUser, 1000);

    window.addEventListener("sessionChange", syncUser);
    window.addEventListener("storage", syncUser);
    window.addEventListener("focus", syncUser);

    syncUser();

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("sessionChange", syncUser);
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("focus", syncUser);
    };
  }, []);

  return (
    <nav style={styles.navbar}>
      <div style={styles.logo}>
        🌐 Expired Domain Manager
      </div>

      <div style={styles.links}>
        {user && (
          <span style={styles.userName}>
            Logged in as {user.name}
          </span>
        )}

        <Link style={styles.link} to="/">
          Home
        </Link>

        <Link style={styles.link} to="/upload">
          Upload
        </Link>

        <Link style={styles.link} to="/batches">
          Batches
        </Link>

        <Link to="/uploader" style={styles.link}>
         Uploader
        </Link>

        <Link to="/my-preview" style={styles.link}>
          My Preview
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
    alignItems: "center",
    gap: "30px",
  },

  userName: {
    color: "#111827",
    fontSize: "15px",
    fontWeight: "700",
  },

  link: {
    color: "#4b5563",
    textDecoration: "none",
    fontSize: "17px",
    fontWeight: "500",
  },
};

export default Navbar;
