import {
  ArrowRight,
  Building2,
  MapPinned,
  Route,
} from "lucide-react";

export default function LandingScreen({
  cityName,
  title = "City Hall Navigator",
  kicker,
  tagline,
  phone,
  email,
  website,
  address,
  onStart,
  t,
}) {
  const contactLabelStyle = { color: "var(--brand-color)" };
  return (
    <main
      className="landing"
      onClick={onStart}
      aria-label={t("enterNavigator")}
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
            {kicker || t("municipalWayfinding")}
          </span>

          <div className="landing-title-block">
            <h2>{title}</h2>
            <p>{tagline || t("landingTagline", { cityName })}</p>
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
          <span>{t("startPrompt")}</span>
          <ArrowRight size={20} aria-hidden="true" />
        </button>

        <div className="landing-quick-info" aria-label={t("wayfindingHighlights")}>
          <div>
            <Building2 size={19} aria-hidden="true" />
            <span>{t("officeFinder")}</span>
          </div>
          <div>
            <MapPinned size={19} aria-hidden="true" />
            <span>{t("buildingMap")}</span>
          </div>
          <div>
            <Route size={19} aria-hidden="true" />
            <span>{t("guidedRoute")}</span>
          </div>
        </div>

        {(phone || email || website || address) && (
          <div className="landing-contact" style={contactLabelStyle}>
            {address && <span>{address}</span>}
            {phone && <span>&#8226; {phone}</span>}
            {email && <span>&#8226; {email}</span>}
            {website && <span>&#8226; {website}</span>}
          </div>
        )}
      </div>
    </main>
  );
}
