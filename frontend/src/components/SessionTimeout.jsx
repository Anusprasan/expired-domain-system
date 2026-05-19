import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearSession, hasSessionExpired } from "../utils/session";

function SessionTimeout() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkSession = () => {
      if (!hasSessionExpired()) {
        return;
      }

      clearSession();

      if (location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }
    };

    const interval = window.setInterval(checkSession, 1000);

    window.addEventListener("focus", checkSession);
    window.addEventListener("sessionChange", checkSession);

    checkSession();

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkSession);
      window.removeEventListener("sessionChange", checkSession);
    };
  }, [location.pathname, navigate]);

  return null;
}

export default SessionTimeout;
