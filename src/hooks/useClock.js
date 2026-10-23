import { useEffect, useState } from "react";

function getCurrentClock(locale) {
  return {
    time: new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date()),
    date: new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date()),
  };
}

export default function useClock(locale = "en-US") {
  const [clock, setClock] = useState(() => getCurrentClock(locale));

  useEffect(() => {
    setClock(getCurrentClock(locale));
    const intervalId = window.setInterval(() => {
      setClock(getCurrentClock(locale));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [locale]);

  return clock;
}
