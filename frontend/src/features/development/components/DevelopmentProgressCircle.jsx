import React from "react";
import { useDevelopmentUiCopy } from "../hooks/useDevelopmentUiCopy";

export default function DevelopmentProgressCircle({ value = 0, completed = false, size = 42 }) {
  const { copy } = useDevelopmentUiCopy();
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (safeValue / 100) * circumference;

  return (
    <div className={`development-progress-circle${completed ? " is-complete" : ""}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="development-progress-track" cx="20" cy="20" r={radius} />
        <circle
          className="development-progress-value"
          cx="20"
          cy="20"
          r={radius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: dashOffset,
          }}
        />
      </svg>
      <span>{completed ? copy.progressCircle.complete : `${safeValue}%`}</span>
    </div>
  );
}
