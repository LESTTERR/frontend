import { CalendarDays, Clock } from "lucide-react";
import useClock from "../hooks/useClock.js";

export default function Header({ cityName }) {
  const { time, date } = useClock();

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <img src="/pic/GAPO%20SEAL%20copy.png" alt="" />
        </span>
        <div>
          <p className="brand-label">{cityName}</p>
          <h1>City Hall Navigator</h1>
        </div>
      </div>

      <div className="clock-group" aria-label="Current date and time">
        <div className="clock-item">
          <Clock size={18} aria-hidden="true" />
          <span>{time}</span>
        </div>
        <div className="clock-item date">
          <CalendarDays size={18} aria-hidden="true" />
          <span>{date}</span>
        </div>
      </div>
    </header>
  );
}
