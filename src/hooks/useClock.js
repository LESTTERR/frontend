import { useEffect, useState } from "react";

function getCurrentClock() {
  return {
    time: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date()),
    date: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date()),
  };
}

export default function useClock() {
  const [clock, setClock] = useState(getCurrentClock);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClock(getCurrentClock());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  return clock;
}
