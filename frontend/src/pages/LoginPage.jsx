import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { saveSession } from "../utils/session";

function LoginPage() {
  const [name, setName] = useState("Uploader");
  const [email, setEmail] = useState("uploader@gmail.com");
  const [password, setPassword] = useState("123456");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      setLoading(true);
      setMessage("");

      const response = await axios.post(
        "http://localhost:5000/api/auth/login",
        {
          name: name.trim(),
          email: email.trim(),
          password,
        }
      );

      saveSession({
        token: response.data.token,
        user: {
          ...response.data.user,
          name: name.trim() || response.data.user.name,
        },
      });

      if (response.data.user.role === "uploader") {
        navigate("/uploader");
      } else if (response.data.user.role === "processor") {
        navigate("/processor");
      } else if (response.data.user.role === "admin") {
        navigate("/uploader");
      } else {
        setMessage("Invalid user role");
      }
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Login</h1>

        <p style={styles.subtitle}>
          Sign in to continue to the domain workspace.
        </p>

        <input
          type="text"
          placeholder="User Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={styles.input}
        />

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          style={styles.primaryBtn}
        >
          {loading ? "Logging in..." : "Login"}
        </button>

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
    maxWidth: "420px",
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
    marginBottom: "25px",
  },
  input: {
    width: "100%",
    padding: "14px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    marginBottom: "14px",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  primaryBtn: {
    width: "100%",
    padding: "13px",
    background: "#6d28d9",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  message: {
    marginTop: "20px",
    fontWeight: "600",
    color: "#111827",
  },
};

export default LoginPage;
