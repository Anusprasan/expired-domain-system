import { useEffect, useRef } from "react";

const escapeStack = [];

export function useEscapeKey(enabled, onEscape) {
  const idRef = useRef(null);

  if (!idRef.current) {
    idRef.current = Symbol("escape-key-handler");
  }

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handlerId = idRef.current;
    escapeStack.push(handlerId);

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (escapeStack[escapeStack.length - 1] !== handlerId) {
        return;
      }

      event.preventDefault();
      onEscape();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      const index = escapeStack.lastIndexOf(handlerId);
      if (index >= 0) {
        escapeStack.splice(index, 1);
      }
    };
  }, [enabled, onEscape]);
}
