import {
  ArrowRight,
  Building2,
  MapPinned,
  Route,
} from "lucide-react";

export default function LandingScreen({ cityName, onStart }) {
  return (
    <main
      className="landing"
      onClick={onStart}
      aria-label="Enter City Hall Navigator"
    >
      <div className="landing-backdrop" aria-hidden="true">
        <video
          className="landing-video"
          src="/pic/DJI_0147.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      </div>

      <div className="landing-content">
        <div className="landing-copy">
          <span className="landing-kicker">
            <MapPinned size={18} aria-hidden="true" />
            Municipal wayfinding
          </span>

          <div className="landing-title-block">
            <h2>City Hall Navigator</h2>
            <p>{cityName} Hall office finder and 3D route guide</p>
          </div>
        </div>

        <button
          className="start-prompt"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onStart();
          }}
        >
          <span>Touch anywhere to proceed</span>
          <ArrowRight size={20} aria-hidden="true" />
        </button>

        <div className="landing-quick-info" aria-label="Wayfinding highlights">
          <div>
            <Building2 size={19} aria-hidden="true" />
            <span>Office finder</span>
          </div>
          <div>
            <MapPinned size={19} aria-hidden="true" />
            <span>3D building map</span>
          </div>
          <div>
            <Route size={19} aria-hidden="true" />
            <span>Guided route</span>
          </div>
        </div>
      </div>
    </main>
  );
}
