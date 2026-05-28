import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUiLanguage } from "../hooks/useUiLanguage";
import "./date-picker.css";

const DATE_PICKER_COPY = {
  english: {
    singleDate: "Single Date",
    dateRange: "Date Range",
    today: "Today",
    selectDate: "Select date",
    selectRange: "Select range",
    selectEnd: "Select end",
    selectEndDate: "Select end date",
    from: "From",
    to: "To",
    previous: "Prev",
    next: "Next",
    date: "Date",
    pickerAria: (label) => `${label} picker`,
  },
  indonesian: {
    singleDate: "Tanggal Tunggal",
    dateRange: "Rentang Tanggal",
    today: "Hari Ini",
    selectDate: "Pilih tanggal",
    selectRange: "Pilih rentang",
    selectEnd: "Pilih akhir",
    selectEndDate: "Pilih tanggal akhir",
    from: "Dari",
    to: "Sampai",
    previous: "Sebelumnya",
    next: "Berikutnya",
    date: "Tanggal",
    pickerAria: (label) => `Pemilih ${label}`,
  },
};

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLabel(value, locale) {
  const date = parseDateValue(value);
  if (!date) {
    return "";
  }

  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isSameDay(left, right) {
  return Boolean(left && right)
    && left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function isWithinRange(date, start, end) {
  if (!start || !end) {
    return false;
  }

  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function buildCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const startDate = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
}

export default function DatePicker({
  id,
  label,
  singleDate,
  useRange,
  fromDate,
  toDate,
  onSingleDateChange,
  onRangeModeChange,
  onRangeChange,
  renderInPortal = false,
  preferredPlacement = "bottom",
}) {
  const { language } = useUiLanguage();
  const locale = language === "indonesian" ? "id-ID" : "en-US";
  const copy = DATE_PICKER_COPY[language] || DATE_PICKER_COPY.english;
  const wrapperRef = useRef(null);
  const popoverRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [rangeAnchorDate, setRangeAnchorDate] = useState(null);
  const [alignRight, setAlignRight] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [portalStyle, setPortalStyle] = useState(null);
  const [visibleMonth, setVisibleMonth] = useState(() => parseDateValue(singleDate || fromDate || toDate) || new Date());

  const singleDateObject = parseDateValue(singleDate);
  const fromDateObject = parseDateValue(fromDate);
  const toDateObject = parseDateValue(toDate);
  const today = useMemo(() => parseDateValue(formatDateValue(new Date())), []);
  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const firstSunday = new Date(Date.UTC(2024, 0, 7));

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(firstSunday);
      date.setUTCDate(firstSunday.getUTCDate() + index);
      return formatter.format(date);
    });
  }, [locale]);
  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat(locale, {
      month: "long",
    }).format(visibleMonth);
  }, [locale, visibleMonth]);

  const updatePopoverLayout = () => {
    const rect = wrapperRef.current?.getBoundingClientRect();

    if (!rect) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const measuredPopoverWidth = popoverRef.current?.offsetWidth || 288;
    const measuredPopoverHeight = popoverRef.current?.offsetHeight || (useRange ? 430 : 388);
    const horizontalPadding = 16;
    const verticalPadding = 16;
    const gap = 12;
    const availableWidth = Math.max(220, viewportWidth - horizontalPadding * 2);
    const availableHeight = Math.max(260, viewportHeight - verticalPadding * 2);
    const popoverWidth = Math.min(measuredPopoverWidth, availableWidth);
    const popoverHeight = Math.min(measuredPopoverHeight, availableHeight);

    setAlignRight(rect.left + popoverWidth > viewportWidth - horizontalPadding);
    setOpenUpward(rect.bottom + popoverHeight > viewportHeight - verticalPadding && rect.top > popoverHeight / 2);

    if (!renderInPortal) {
      setPortalStyle(null);
      return;
    }

    const availableRight = viewportWidth - rect.right - horizontalPadding;
    const canOpenRight = preferredPlacement === "right" && availableRight >= popoverWidth + gap;
    const maxLeft = Math.max(horizontalPadding, viewportWidth - popoverWidth - horizontalPadding);

    const nextLeft = canOpenRight
      ? Math.min(rect.right + gap, maxLeft)
      : Math.min(Math.max(rect.left, horizontalPadding), maxLeft);

    const downTop = rect.bottom + gap;
    const upTop = rect.top - popoverHeight - gap;
    const canOpenUpward = downTop + popoverHeight > viewportHeight - verticalPadding && upTop >= verticalPadding;
    const nextTop = canOpenRight
      ? Math.min(Math.max(rect.top, verticalPadding), Math.max(verticalPadding, viewportHeight - popoverHeight - verticalPadding))
      : canOpenUpward
        ? upTop
        : Math.min(downTop, Math.max(verticalPadding, viewportHeight - popoverHeight - verticalPadding));

    setPortalStyle({
      top: `${nextTop}px`,
      left: `${nextLeft}px`,
      width: `${popoverWidth}px`,
      maxHeight: `${availableHeight}px`,
    });
  };

  useEffect(() => {
    if (!isOpen) {
      setAlignRight(false);
      setOpenUpward(false);
      setPortalStyle(null);
      return undefined;
    }

    updatePopoverLayout();
    const frameId = window.requestAnimationFrame(() => {
      updatePopoverLayout();
    });

    const handlePointerDown = (event) => {
      const clickedInsideWrapper = wrapperRef.current?.contains(event.target);
      const clickedInsidePopover = popoverRef.current?.contains(event.target);

      if (!clickedInsideWrapper && !clickedInsidePopover) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleViewportChange = () => {
      updatePopoverLayout();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [isOpen, useRange, renderInPortal, preferredPlacement]);

  useEffect(() => {
    const nextVisibleDate = parseDateValue(singleDate || fromDate || toDate);
    if (nextVisibleDate) {
      setVisibleMonth(nextVisibleDate);
    }
  }, [singleDate, fromDate, toDate]);

  useEffect(() => {
    if (!useRange) {
      setRangeAnchorDate(null);
    }
  }, [useRange]);

  const triggerLabel = useMemo(() => {
    if (useRange) {
      if (fromDate && toDate) {
        return `${formatLabel(fromDate, locale)} - ${formatLabel(toDate, locale)}`;
      }
      if (fromDate) {
        return `${formatLabel(fromDate, locale)} - ${copy.selectEnd}`;
      }
      return copy.selectRange;
    }

    return formatLabel(singleDate, locale) || copy.selectDate;
  }, [copy.selectDate, copy.selectEnd, copy.selectRange, fromDate, locale, singleDate, toDate, useRange]);

  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  const handleSelectDate = (date) => {
    const value = formatDateValue(date);

    if (!useRange) {
      onSingleDateChange(value);
      setIsOpen(false);
      return;
    }

    if (!rangeAnchorDate) {
      setRangeAnchorDate(date);
      onRangeChange(value, "");
      return;
    }

    if (date.getTime() < rangeAnchorDate.getTime()) {
      onRangeChange(value, formatDateValue(rangeAnchorDate));
    } else {
      onRangeChange(formatDateValue(rangeAnchorDate), value);
    }

    setRangeAnchorDate(null);
  };

  const handleToggleRangeMode = () => {
    if (useRange) {
      setRangeAnchorDate(null);
      const fallbackDate = toDate || fromDate || singleDate || formatDateValue(new Date());
      onRangeModeChange(false, fallbackDate, fallbackDate);
      return;
    }

    setRangeAnchorDate(null);
    const seedDate = singleDate || formatDateValue(new Date());
    onRangeModeChange(true, seedDate, "");
  };

  const handleToday = () => {
    const todayValue = formatDateValue(new Date());
    setVisibleMonth(parseDateValue(todayValue) || new Date());

    if (useRange) {
      setRangeAnchorDate(parseDateValue(todayValue));
      onRangeChange(todayValue, "");
      return;
    }

    onSingleDateChange(todayValue);
    setIsOpen(false);
  };

  const handleTogglePopover = () => {
    if (!isOpen) {
      updatePopoverLayout();
    }

    setIsOpen((current) => !current);
  };

  const popover = isOpen ? (
    <div
      ref={popoverRef}
      className={`app-date-picker-popover${renderInPortal ? " is-portal" : ""}`}
      style={renderInPortal ? portalStyle || undefined : undefined}
      role="dialog"
      aria-label={copy.pickerAria(label || copy.date)}
    >
      <div className="app-date-picker-toolbar">
        <button
          type="button"
          className={`app-date-picker-button${useRange ? " is-active" : ""}`}
          onClick={handleToggleRangeMode}
        >
          {useRange ? copy.singleDate : copy.dateRange}
        </button>
        <button
          type="button"
          className="app-date-picker-button"
          onClick={handleToday}
        >
          {copy.today}
        </button>
      </div>

      <div className="app-date-picker-current" aria-live="polite">
        {triggerLabel}
      </div>

      {useRange ? (
        <div className="app-date-picker-range-summary">
          <span>{copy.from}: {formatLabel(fromDate, locale) || "-"}</span>
          <span>{copy.to}: {formatLabel(toDate, locale) || (rangeAnchorDate ? copy.selectEndDate : "-")}</span>
        </div>
      ) : null}

      <div className="app-date-picker-month">
        <button
          type="button"
          className="app-date-picker-button"
          onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
        >
          {copy.previous}
        </button>
        <strong>{monthLabel} {visibleMonth.getFullYear()}</strong>
        <button
          type="button"
          className="app-date-picker-button"
          onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
        >
          {copy.next}
        </button>
      </div>

      <div className="app-date-picker-grid">
        {weekdayLabels.map((day) => (
          <span key={day} className="app-date-picker-weekday">{day}</span>
        ))}

        {calendarDays.map((date) => {
          const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
          const isSelected = useRange
            ? isSameDay(date, fromDateObject) || isSameDay(date, toDateObject)
            : isSameDay(date, singleDateObject);
          const isInRange = useRange && isWithinRange(date, fromDateObject, toDateObject);
          const isToday = isSameDay(date, today);

          return (
            <button
              key={date.toISOString()}
              type="button"
              className={`app-date-picker-day${
                isCurrentMonth ? "" : " is-muted"
              }${
                isSelected ? " is-selected" : ""
              }${
                isInRange ? " is-in-range" : ""
              }${
                isToday ? " is-today" : ""
              }`}
              onClick={() => handleSelectDate(date)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={wrapperRef}
      className={`app-date-picker${isOpen ? " is-open" : ""}${alignRight ? " is-align-right" : ""}${openUpward ? " is-open-upward" : ""}`}
    >
      {label ? <label htmlFor={id}>{label}</label> : null}
      <button
        id={id}
        type="button"
        className="app-date-picker-trigger"
        onClick={handleTogglePopover}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span>{triggerLabel}</span>
      </button>

      {renderInPortal && typeof document !== "undefined"
        ? popover
          ? createPortal(popover, document.body)
          : null
        : popover}
    </div>
  );
}
