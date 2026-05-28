import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./features/auth/context/AuthContext";
import { GlobalDateProvider } from "./shared/context/GlobalDateContext";
import { ThemeProvider } from "./shared/context/ThemeContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <GlobalDateProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </GlobalDateProvider>
    </ThemeProvider>
  </React.StrictMode>
);
