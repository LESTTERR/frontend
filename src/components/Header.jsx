import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import useClock from "../hooks/useClock.js";

function isSameDay(firstDate, secondDate) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function getCalendarCells(displayDate) {
  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return [
    ...Array.from({ length: firstDay.getDay() }, (_, index) => ({
      id: `blank-${index}`,
      isBlank: true,
    })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;

      return {
        id: `day-${day}`,
        date: new Date(year, month, day),
        day,
        isBlank: false,
      };
    }),
  ];
}

export default function Header({
  cityName,
  title = "City Hall Navigator",
  logoUrl = "",
  brandColor = "#238b67",
  language,
  t,
}) {
  const locale = language === "fil" ? "fil-PH" : "en-US";
  const { time, date } = useClock(locale);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const calendarRef = useRef(null);
  const today = new Date();

  const calendarCells = useMemo(
    () => getCalendarCells(calendarMonth),
    [calendarMonth],
  );
  const calendarTitle = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(calendarMonth),
    [calendarMonth, locale],
  );
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
          new Date(2024, 0, 7 + index),
        ),
      ),
    [locale],
  );

  useEffect(() => {
    if (!isCalendarOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!calendarRef.current?.contains(event.target)) {
        setIsCalendarOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCalendarOpen]);

  const handleCalendarToggle = () => {
    if (!isCalendarOpen) {
      setCalendarMonth(new Date());
    }

    setIsCalendarOpen((currentValue) => !currentValue);
  };

  const showPreviousMonth = () => {
    setCalendarMonth(
      (currentDate) =>
        new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
    );
  };

  const showNextMonth = () => {
    setCalendarMonth(
      (currentDate) =>
        new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
    );
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <img src={logoUrl || "/pic/GAPO%20SEAL%20copy.png"} alt="" />
        </span>
        <div>
          <p className="brand-label" style={{ color: brandColor }}>
            {cityName}
          </p>
          <h1>{title}</h1>
        </div>
      </div>

      <div className="clock-group" aria-label={t("dateAndTime")}>
        <div className="clock-item">
          <Clock size={18} aria-hidden="true" />
          <span>{time}</span>
        </div>
        <div className="calendar-popover-wrap" ref={calendarRef}>
          <button
            className={`clock-item date calendar-trigger ${
              isCalendarOpen ? "active" : ""
            }`}
            type="button"
            onClick={handleCalendarToggle}
            aria-haspopup="dialog"
            aria-expanded={isCalendarOpen}
          >
            <CalendarDays size={18} aria-hidden="true" />
            <span>{date}</span>
          </button>

          {isCalendarOpen ? (
            <div
              className="calendar-popover"
              role="dialog"
              aria-label={t("calendar")}
            >
              <div className="calendar-popover-header">
                <button
                  className="calendar-nav-button"
                  type="button"
                  onClick={showPreviousMonth}
                  aria-label={t("previousMonth")}
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <strong>{calendarTitle}</strong>
                <button
                  className="calendar-nav-button"
                  type="button"
                  onClick={showNextMonth}
                  aria-label={t("nextMonth")}
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>

              <div className="calendar-weekdays" aria-hidden="true">
                {weekdayLabels.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>

              <div className="calendar-grid">
                {calendarCells.map((cell) =>
                  cell.isBlank ? (
                    <span
                      className="calendar-day blank"
                      key={cell.id}
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className={`calendar-day ${
                        isSameDay(cell.date, today) ? "today" : ""
                      }`}
                      key={cell.id}
                      aria-current={isSameDay(cell.date, today) ? "date" : undefined}
                    >
                      {cell.day}
                    </span>
                  ),
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
