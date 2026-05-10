import {
  ArrowRight,
  Building2,
  Flame,
  MapPinned,
  PhoneCall,
  ShieldAlert,
  Siren,
} from "lucide-react";

const emergencyHotlines = [
  {
    label: "Police / Fire / Medical",
    number: "911",
    href: "tel:911",
    icon: ShieldAlert,
  },
  {
    label: "Olongapo Rescue",
    number: "0998-593-7446",
    href: "tel:09985937446",
    icon: Siren,
  },
  {
    label: "Fire & Rescue",
    number: "223-1415",
    href: "tel:2231415",
    icon: Flame,
  },
];

export default function LandingScreen({ cityName, onStart }) {
  function stopLandingClick(event) {
    event.stopPropagation();
  }

  return (
    <main
      className="landing"
      onClick={onStart}
      aria-label="Enter City Hall Navigator"
    >
      <div className="landing-backdrop" aria-hidden="true">
        <div className="landing-grid" />
        <div className="landing-building-scene">
          <div className="landing-floor-plate plate-one" />
          <div className="landing-floor-plate plate-two" />
          <div className="landing-floor-plate plate-three" />
          <div className="landing-route-beam beam-one" />
          <div className="landing-route-beam beam-two" />
          <div className="landing-route-beam beam-three" />
          <div className="landing-scene-pin pin-entry" />
          <div className="landing-scene-pin pin-office" />
        </div>
        <div className="landing-map-line line-one" />
        <div className="landing-map-line line-two" />
        <div className="landing-node node-one" />
        <div className="landing-node node-two" />
        <div className="landing-node node-three" />
      </div>

      <div className="landing-content">
        <span className="landing-kicker">
          <MapPinned size={18} aria-hidden="true" />
          Public wayfinding
        </span>

        <div className="landing-title-block">
          <h2>City Hall Navigator</h2>
          <p>{cityName} Hall office finder and 3D route guide</p>
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
            <PhoneCall size={19} aria-hidden="true" />
            <span>Emergency contacts</span>
          </div>
        </div>
      </div>

      <aside
        className="emergency-dock"
        aria-label="Emergency hotlines"
        onClick={stopLandingClick}
      >
        <div className="emergency-heading">
          <PhoneCall size={18} aria-hidden="true" />
          <span>Emergency Hotlines</span>
        </div>

        <div className="hotline-list">
          {emergencyHotlines.map((hotline) => {
            const Icon = hotline.icon;

            return (
              <a className="hotline-item" href={hotline.href} key={hotline.label}>
                <Icon size={18} aria-hidden="true" />
                <span>{hotline.label}</span>
                <strong>{hotline.number}</strong>
              </a>
            );
          })}
        </div>
      </aside>
    </main>
  );
}
