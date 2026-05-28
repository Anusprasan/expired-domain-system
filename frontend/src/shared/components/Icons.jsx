import React from "react";

const iconProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.8,
};

function Svg({ children, viewBox = "0 0 24 24" }) {
  return (
    <svg aria-hidden="true" viewBox={viewBox} {...iconProps}>
      {children}
    </svg>
  );
}

export function AppIcon({ name }) {
  switch (name) {
    case "dashboard":
      return (
        <Svg>
          <path d="M4 13.5h7v6.5H4z" />
          <path d="M13 4h7v9h-7z" />
          <path d="M13 15.5h7V20h-7z" />
          <path d="M4 4h7v7.5H4z" />
        </Svg>
      );
    case "brands":
      return (
        <Svg>
          <path d="m12 3 7 4v10l-7 4-7-4V7z" />
          <path d="m12 12 7-4" />
          <path d="m12 12-7-4" />
          <path d="M12 12v9" />
        </Svg>
      );
    case "users":
      return (
        <Svg>
          <path d="M16 19a4 4 0 0 0-8 0" />
          <circle cx="12" cy="9" r="3.5" />
          <path d="M5 19a3 3 0 0 1 3-3" />
          <path d="M16 16a3 3 0 0 1 3 3" />
        </Svg>
      );
    case "groups":
      return (
        <Svg>
          <circle cx="9" cy="9" r="2.5" />
          <circle cx="16.5" cy="10.5" r="2" />
          <path d="M4.5 19a4.5 4.5 0 0 1 9 0" />
          <path d="M14.5 18.5a3.5 3.5 0 0 1 5 0" />
        </Svg>
      );
    case "shield":
      return (
        <Svg>
          <path d="m12 3 7 3v5c0 4.5-2.7 7.7-7 10-4.3-2.3-7-5.5-7-10V6z" />
          <path d="m9.5 12 1.8 1.8L15 10" />
        </Svg>
      );
    case "tasks":
      return (
        <Svg>
          <path d="M9 6h11" />
          <path d="M9 12h11" />
          <path d="M9 18h11" />
          <path d="m4 6 1.2 1.2L7.5 5" />
          <path d="m4 12 1.2 1.2L7.5 11" />
          <path d="m4 18 1.2 1.2L7.5 17" />
        </Svg>
      );
    case "reporting":
      return (
        <Svg>
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
        </Svg>
      );
    case "chart":
      return (
        <Svg>
          <path d="M4 19h16" />
          <path d="m6 15 4-4 3 2 5-6" />
          <path d="m18 7 .1 0" />
        </Svg>
      );
    case "history":
      return (
        <Svg>
          <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
          <path d="M3.5 4.5v4h4" />
          <path d="M12 7.5V12l3 2" />
        </Svg>
      );
    case "calendar":
      return (
        <Svg>
          <rect x="3" y="5" width="18" height="16" rx="2.5" />
          <path d="M8 3.5v3" />
          <path d="M16 3.5v3" />
          <path d="M3 9.5h18" />
          <path d="M8 13h.01" />
          <path d="M12 13h.01" />
          <path d="M16 13h.01" />
          <path d="M8 17h.01" />
          <path d="M12 17h.01" />
          <path d="M16 17h.01" />
        </Svg>
      );
    case "network":
      return (
        <Svg>
          <circle cx="12" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <path d="M12 8.5V13" />
          <path d="M12 13 7.5 16" />
          <path d="M12 13 16.5 16" />
        </Svg>
      );
    case "server":
      return (
        <Svg>
          <rect x="3" y="4" width="18" height="6" rx="1.5" />
          <rect x="3" y="14" width="18" height="6" rx="1.5" />
          <circle cx="7" cy="7" r="0.8" />
          <circle cx="7" cy="17" r="0.8" />
        </Svg>
      );
    case "tools":
      return (
        <Svg>
          <circle cx="10.5" cy="10.5" r="4.5" />
          <path d="m14 14 5 5" />
          <path d="m8.4 11 1.5-1.6 1.5 1.2 1.7-2" />
        </Svg>
      );
    case "link":
      return (
        <Svg>
          <path d="M10 14 8 16a3 3 0 0 1-4-4l2.5-2.5a3 3 0 0 1 4 0" />
          <path d="M14 10 16 8a3 3 0 1 1 4 4L17.5 14.5a3 3 0 0 1-4 0" />
          <path d="M9 15 15 9" />
        </Svg>
      );
    case "camera":
      return (
        <Svg>
          <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.6h4.6L15.5 6h2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
          <circle cx="12" cy="12.5" r="3.2" />
          <path d="M17 9h.01" />
        </Svg>
      );
    case "mail":
      return (
        <Svg>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </Svg>
      );
    case "wrench":
      return (
        <Svg>
          <path d="m14.5 6.5 3-3a3 3 0 0 1-4 4l-6.8 6.8a2.5 2.5 0 1 1-3.5 3.5l6.8-6.8a3 3 0 0 1 4-4Z" />
        </Svg>
      );
    case "settings":
      return (
        <Svg>
          <circle cx="12" cy="12" r="3.25" />
          <path d="M12 2.75v2.1" />
          <path d="M12 19.15v2.1" />
          <path d="m5.46 5.46 1.48 1.48" />
          <path d="m17.06 17.06 1.48 1.48" />
          <path d="M2.75 12h2.1" />
          <path d="M19.15 12h2.1" />
          <path d="m5.46 18.54 1.48-1.48" />
          <path d="m17.06 6.94 1.48-1.48" />
        </Svg>
      );
    case "power":
      return (
        <Svg>
          <path d="M12 3.25v7" />
          <path d="M7.2 5.7a7 7 0 1 0 9.6 0" />
        </Svg>
      );
    case "bell":
      return (
        <Svg>
          <path d="M6.5 16.5h11" />
          <path d="M8 16.5V10a4 4 0 1 1 8 0v6.5" />
          <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
        </Svg>
      );
    case "sun":
      return (
        <Svg>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2" />
          <path d="M12 19.5v2" />
          <path d="m4.9 4.9 1.4 1.4" />
          <path d="m17.7 17.7 1.4 1.4" />
          <path d="M2.5 12h2" />
          <path d="M19.5 12h2" />
          <path d="m4.9 19.1 1.4-1.4" />
          <path d="m17.7 6.3 1.4-1.4" />
        </Svg>
      );
    case "moon":
      return (
        <Svg>
          <path d="M20 14.2A7.8 7.8 0 1 1 9.8 4 6.2 6.2 0 0 0 20 14.2Z" />
        </Svg>
      );
    case "logout":
      return (
        <Svg>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </Svg>
      );
    case "chevron":
      return (
        <Svg>
          <path d="m8 10 4 4 4-4" />
        </Svg>
      );
    case "chevron-left":
      return (
        <Svg>
          <path d="m14.5 6-5 6 5 6" />
        </Svg>
      );
    case "chevron-right":
      return (
        <Svg>
          <path d="m9.5 6 5 6-5 6" />
        </Svg>
      );
    case "info":
      return (
        <Svg>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 10v5" />
          <path d="m12 7.2.1 0" />
        </Svg>
      );
    default:
      return null;
  }
}
