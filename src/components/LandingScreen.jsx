import { ArrowRight, Hand } from "lucide-react";

export default function LandingScreen({ municipalName, onStart }) {
  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      onStart();
    }
  }

  return (
    <main
      className="landing"
      role="button"
      tabIndex={0}
      onClick={onStart}
      onKeyDown={handleKeyDown}
      aria-label="Enter MuniciMap"
    >
      <div className="landing-content">
        <span className="landing-kicker">
          <Hand size={18} aria-hidden="true" />
          Public wayfinding system
        </span>
        <h2>Welcome to City Hall</h2>
        <p>{municipalName}</p>
        <div className="start-prompt">
          <span>Touch anywhere to proceed</span>
          <ArrowRight size={20} aria-hidden="true" />
        </div>
      </div>
    </main>
  );
}
