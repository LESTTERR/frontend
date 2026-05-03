import { CalendarDays, Clock, Landmark } from "lucide-react";
import useClock from "../hooks/useClock.js";

export default function Header({ municipalName }) {
  const { time, date } = useClock();

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <Landmark size={22} />
        </span>
        <div>
          <p className="brand-label">MuniciMap</p>
          <h1>{municipalName}</h1>
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
