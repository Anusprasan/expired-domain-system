import React, { useEffect, useRef } from "react";

export default function ToastNotice({ message, onClose, tone = "error", duration = 5000 }) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!message || !duration) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onCloseRef.current?.();
    }, duration);

    return () => window.clearTimeout(timeoutId);
  }, [duration, message]);

  if (!message) {
    return null;
  }

  return (
    <div className={`management-toast is-${tone}`} role="alert" aria-live="assertive">
      <div className="management-toast-copy">
        <strong>{tone === "error" ? "Action blocked" : tone === "success" ? "Success" : "Notice"}</strong>
        <span>{message}</span>
      </div>
      <button type="button" className="management-toast-close" onClick={onClose} aria-label="Dismiss notification">
        X
      </button>
    </div>
  );
}
