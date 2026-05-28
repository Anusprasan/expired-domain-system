import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "app-global-date-filter";
const GlobalDateContext = createContext(null);

function getDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return getDateInputValue(date);
}

function formatDateLabel(value) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getDefaultGlobalDateState() {
  const today = getDateInputValue();

  return {
    singleDate: today,
    useRange: false,
    fromDate: today,
    toDate: today,
  };
}

function getInitialGlobalDateState() {
  const defaultState = getDefaultGlobalDateState();

  if (typeof window === "undefined") {
    return defaultState;
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return defaultState;
    }

    const parsedValue = JSON.parse(rawValue);
    const singleDate = normalizeDateValue(parsedValue?.singleDate) || defaultState.singleDate;
    const useRange = Boolean(parsedValue?.useRange);
    const fromDate = normalizeDateValue(parsedValue?.fromDate) || singleDate;
    const toDate = normalizeDateValue(parsedValue?.toDate) || (useRange ? "" : fromDate);

    return {
      singleDate,
      useRange,
      fromDate,
      toDate: useRange ? toDate : fromDate,
    };
  } catch {
    return defaultState;
  }
}

export function GlobalDateProvider({ children }) {
  const [state, setState] = useState(getInitialGlobalDateState);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo(() => {
    const setSingleDate = (nextSingleDate) => {
      const normalizedDate = normalizeDateValue(nextSingleDate) || getDateInputValue();

      setState({
        singleDate: normalizedDate,
        useRange: false,
        fromDate: normalizedDate,
        toDate: normalizedDate,
      });
    };

    const setRangeMode = (nextUseRange, nextFromDate, nextToDate) => {
      setState((currentState) => {
        const fallbackDate =
          normalizeDateValue(nextFromDate)
          || normalizeDateValue(nextToDate)
          || currentState.singleDate
          || getDateInputValue();

        if (!nextUseRange) {
          return {
            singleDate: fallbackDate,
            useRange: false,
            fromDate: fallbackDate,
            toDate: fallbackDate,
          };
        }

        return {
          singleDate: currentState.singleDate || fallbackDate,
          useRange: true,
          fromDate: normalizeDateValue(nextFromDate) || fallbackDate,
          toDate: normalizeDateValue(nextToDate),
        };
      });
    };

    const setRange = (nextFromDate, nextToDate) => {
      setState((currentState) => {
        const fallbackDate =
          normalizeDateValue(nextFromDate)
          || currentState.fromDate
          || currentState.singleDate
          || getDateInputValue();

        return {
          ...currentState,
          useRange: true,
          fromDate: fallbackDate,
          toDate: normalizeDateValue(nextToDate),
        };
      });
    };

    const resetDateFilter = () => {
      setState(getDefaultGlobalDateState());
    };

    const summaryLabel = state.useRange
      ? state.fromDate && state.toDate
        ? `${formatDateLabel(state.fromDate)} - ${formatDateLabel(state.toDate)}`
        : state.fromDate
          ? `${formatDateLabel(state.fromDate)} - Select end`
          : "Select range"
      : formatDateLabel(state.singleDate);

    return {
      ...state,
      summaryLabel,
      setSingleDate,
      setRangeMode,
      setRange,
      resetDateFilter,
    };
  }, [state]);

  return <GlobalDateContext.Provider value={value}>{children}</GlobalDateContext.Provider>;
}

export function useGlobalDateFilter() {
  const context = useContext(GlobalDateContext);

  if (!context) {
    throw new Error("useGlobalDateFilter must be used within a GlobalDateProvider");
  }

  return context;
}
