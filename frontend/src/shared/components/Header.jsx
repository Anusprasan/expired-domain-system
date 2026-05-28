import React from "react";
import { useLocation } from "react-router-dom";
import { NAV_ITEMS } from "../constants/navigation";
import { useTheme } from "../context/ThemeContext";
import { AppIcon } from "./Icons";

export default function Header() {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const activeItem = NAV_ITEMS.find((item) => item.path === pathname);
  const title = activeItem?.label || "Workspace";
  const description = activeItem?.description || "Manage your work from a single authenticated shell.";

  return (
    <header className="app-header">
      <div className="app-header-copy">
        <span className="app-header-kicker">200M Workspace</span>
        <div>
          <strong className="app-header-title">{title}</strong>
          <p className="app-header-description">{description}</p>
        </div>
      </div>

      <div className="app-header-actions">
        <button
          type="button"
          className="app-theme-icon-button"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          title={theme === "light" ? "Dark mode" : "Light mode"}
        >
          <span className="app-theme-icon">
            <AppIcon name={theme === "light" ? "moon" : "sun"} />
          </span>
        </button>
      </div>
    </header>
  );
}
