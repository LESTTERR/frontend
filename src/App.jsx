import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleHelp,
  Compass,
  House,
  Layers,
  MapPinned,
  Maximize2,
  Minus,
  PanelLeftOpen,
  Plus,
  Search,
  TimerReset,
  X,
} from "lucide-react";
import Header from "./components/Header.jsx";
import LandingScreen from "./components/LandingScreen.jsx";
import OfficeSidebar from "./components/OfficeSidebar.jsx";
import MapPreview from "./components/MapPreview.jsx";
import useNavigatorConfig from "./hooks/useNavigatorConfig.js";
import {
  DEFAULT_LANDING_KICKER,
  DEFAULT_LANDING_TAGLINE,
} from "./data/navigatorDefaults.js";
import { preloadModelAssets } from "./services/modelAsset.js";
import { getTranslator } from "./services/translations.js";

const START_FLOOR = "1st Floor";
const LANGUAGE_STORAGE_KEY = "olongapo.navigator.language.v1";
const SHOW_NAVIGATION_DEBUG =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("debugNavigation") === "1";
const IDLE_WARNING_MS = 15_000;
const IDLE_RETURN_SECONDS = 10;
const IDLE_RETURN_MS = IDLE_RETURN_SECONDS * 1000;

function getSavedLanguage() {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "fil"
      ? "fil"
      : "en";
  } catch {
    return "en";
  }
}

function getLocalizedFloorLabel(label, language) {
  const match = String(label ?? "").match(/^(\d+)(st|nd|rd|th)\s+Floor$/i);
  if (!match) {
    return label;
  }
  return language === "fil" ? `Palapag ${match[1]}` : `${match[1]}${match[2]} Floor`;
}

function getRouteDisplayFloor(office, floors) {
  const startingFloor = floors.find((floor) => floor.enabled !== false);
  return office?.floor === startingFloor?.label
    ? office.floor
    : startingFloor?.label || START_FLOOR;
}

export default function App() {
  const {
    config,
    modelAssetStatus,
    resolvedModelPaths,
    resolvedLogoUrl,
  } = useNavigatorConfig();
  const [language, setLanguage] = useState(getSavedLanguage);
  const t = useMemo(() => getTranslator(language), [language]);
  const [accessibilityMode, setAccessibilityMode] = useState(false);
  const floors = config.floors || [];
  const enabledFloorIds = new Set(
    floors.filter((floor) => floor.enabled !== false).map((floor) => floor.id),
  );
  const offices = (config.offices || []).filter(
    (office) => enabledFloorIds.has(office.floorId),
  );

  const floorOptions = useMemo(() => {
    return floors.filter((floor) => floor.enabled !== false).map((f, idx) => ({
      label: String(f.order || f.number || idx + 1),
      floor: f.label,
    }));
  }, [floors]);

  const [hasStarted, setHasStarted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOfficeId, setSelectedOfficeId] = useState(() => {
    return offices[0]?.id || "city-health";
  });
  const [activeFloor, setActiveFloor] = useState(
    () => floors.find((floor) => floor.enabled !== false)?.label || START_FLOOR,
  );
  const [navigationMessage, setNavigationMessage] = useState("");
  const [isRouteAnimating, setIsRouteAnimating] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(
    () => !window.matchMedia("(max-width: 860px)").matches,
  );
  const [mapCommand, setMapCommand] = useState(null);
  const [isIdleWarningVisible, setIsIdleWarningVisible] = useState(false);
  const [idleCountdownSeconds, setIdleCountdownSeconds] = useState(IDLE_RETURN_SECONDS);
  const [isTutorialVisible, setIsTutorialVisible] = useState(false);
  const idleWarningTimerRef = useRef(null);
  const idleReturnTimerRef = useRef(null);
  const idleCountdownTimerRef = useRef(null);
  const cityName = config.organizationName || config.cityName || "Olongapo City";
  const landingKicker =
    config.landingKicker === DEFAULT_LANDING_KICKER
      ? t("municipalWayfinding")
      : config.landingKicker;
  const landingTagline =
    config.landingTagline === DEFAULT_LANDING_TAGLINE
      ? t("landingTagline", { cityName })
      : config.landingTagline;

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch (error) {
      console.warn("Unable to save the language preference", error);
    }
  }, [language]);

  useEffect(() => {
    const modelPaths = [...new Set(resolvedModelPaths)];
    if (modelAssetStatus !== "ready" || modelPaths.length === 0) {
      return undefined;
    }

    let isCancelled = false;
    preloadModelAssets(modelPaths).then((results) => {
      if (isCancelled) {
        return;
      }

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            `Unable to preload 3D model: ${modelPaths[index]}`,
            result.reason,
          );
        }
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [modelAssetStatus, resolvedModelPaths]);

  // Keep selected office ID valid if offices list changes
  useEffect(() => {
    if (offices.length > 0 && !offices.some((o) => o.id === selectedOfficeId)) {
      setSelectedOfficeId(offices[0].id);
    }
  }, [offices, selectedOfficeId]);

  useEffect(() => {
    if (
      activeFloor !== "All Floors" &&
      !floorOptions.some((option) => option.floor === activeFloor)
    ) {
      setActiveFloor(floorOptions[0]?.floor || START_FLOOR);
    }
  }, [activeFloor, floorOptions]);

  const sendMapCommand = (type, payload = {}) => {
    setMapCommand((currentCommand) => ({
      type,
      payload,
      sequence: (currentCommand?.sequence ?? 0) + 1,
    }));
  };

  const clearIdleTimers = useCallback(() => {
    window.clearTimeout(idleWarningTimerRef.current);
    window.clearTimeout(idleReturnTimerRef.current);
    window.clearInterval(idleCountdownTimerRef.current);
    idleWarningTimerRef.current = null;
    idleReturnTimerRef.current = null;
    idleCountdownTimerRef.current = null;
  }, []);

  const handleReturnToLanding = useCallback(() => {
    clearIdleTimers();
    setHasStarted(false);
    setIsRouteAnimating(false);
    setIsIdleWarningVisible(false);
    setIdleCountdownSeconds(IDLE_RETURN_SECONDS);
    setIsTutorialVisible(false);
    setSearchTerm("");
    setActiveFloor(floors.find((floor) => floor.enabled !== false)?.label || START_FLOOR);
    setIsSidebarVisible(true);
    setMapCommand(null);
  }, [clearIdleTimers, floors]);

  const restartIdleTimers = useCallback(() => {
    clearIdleTimers();

    if (!hasStarted || isRouteAnimating) {
      return;
    }

    setIsIdleWarningVisible(false);
    setIdleCountdownSeconds(IDLE_RETURN_SECONDS);
    idleWarningTimerRef.current = window.setTimeout(() => {
      setIdleCountdownSeconds(IDLE_RETURN_SECONDS);
      setIsIdleWarningVisible(true);
      idleCountdownTimerRef.current = window.setInterval(() => {
        setIdleCountdownSeconds((seconds) => Math.max(seconds - 1, 0));
      }, 1000);
      idleReturnTimerRef.current = window.setTimeout(
        handleReturnToLanding,
        IDLE_RETURN_MS,
      );
    }, IDLE_WARNING_MS);
  }, [clearIdleTimers, handleReturnToLanding, hasStarted, isRouteAnimating]);

  useEffect(() => {
    if (!hasStarted || isRouteAnimating) {
      clearIdleTimers();
      setIsIdleWarningVisible(false);
      return undefined;
    }

    const activityEvents = ["pointerdown", "keydown", "touchstart"];

    restartIdleTimers();
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, restartIdleTimers, { passive: true });
    });

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, restartIdleTimers);
      });
      clearIdleTimers();
    };
  }, [clearIdleTimers, hasStarted, isRouteAnimating, restartIdleTimers]);

  const filteredOffices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return offices;
    }

    return offices.filter((office) => {
      const searchableText = [
        office.name,
        office.floor,
        office.category,
        office.description,
        ...(office.keywords || []),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [offices, searchTerm]);

  const selectedOffice = useMemo(
    () => offices.find((office) => office.id === selectedOfficeId) ?? offices[0],
    [offices, selectedOfficeId],
  );
  const handleSelectOffice = useCallback((officeId, options = {}) => {
    const office = offices.find((item) => item.id === officeId);
    const routeDisplayFloor =
      options.focusDestinationFloor && office
        ? office.floor
        : office
          ? getRouteDisplayFloor(office, floors)
          : floors.find((floor) => floor.enabled !== false)?.label || START_FLOOR;

    setSelectedOfficeId(officeId);
    setNavigationMessage("");
    if (office) {
      setActiveFloor(routeDisplayFloor);
    }
    sendMapCommand("enter-route", {
      floor: routeDisplayFloor,
      autoFloors: !options.focusDestinationFloor,
    });
  }, [floors, offices]);

  const handleNavigationStatus = useCallback((result) => {
    setIsRouteAnimating(result.status === "working");
    const isAccessibleRouteUnavailable =
      result.reason === "no-accessible-route" || accessibilityMode;
    setNavigationMessage(
      result.status === "unavailable"
        ? isAccessibleRouteUnavailable
          ? "accessibleUnavailable"
          : "noRoute"
        : "",
    );
  }, [accessibilityMode]);

  const handleSelectFloor = useCallback((floor) => {
    setActiveFloor(floor);
    sendMapCommand("focus-floor", { floor });
  }, []);

  const handleRecenter = useCallback(() => {
    setActiveFloor("All Floors");
    sendMapCommand("reset-view");
  }, []);

  const handleAccessibilityModeChange = useCallback(() => {
    setAccessibilityMode((currentMode) => !currentMode);
    setNavigationMessage("");
    sendMapCommand("enter-route", {
      floor: activeFloor,
      autoFloors: true,
    });
  }, [activeFloor]);

  const handleRouteFloorChange = useCallback((floor) => {
    setActiveFloor(floor);
  }, []);

  const formatFloor = (floor) => getLocalizedFloorLabel(floor, language);

  const handleStart = useCallback(() => {
    setActiveFloor("All Floors");
    setMapCommand((currentCommand) => ({
      type: "reset-view",
      payload: {},
      sequence: (currentCommand?.sequence ?? 0) + 1,
    }));
    setHasStarted(true);
    setIsTutorialVisible(true);
  }, []);

  return (
    <div className={`app ${hasStarted ? "app-home" : ""}`}>
      {!hasStarted ? (
        <>
          <Header
            cityName={cityName}
            title={config.navigatorTitle}
            logoUrl={resolvedLogoUrl}
            brandColor={config.brandColor || "#238b67"}
            language={language}
            t={t}
          />
          <LandingScreen
            cityName={cityName}
            title={config.navigatorTitle}
            kicker={landingKicker}
            tagline={landingTagline}
            brandColor={config.brandColor || "#238b67"}
            phone={config.phone}
            email={config.email}
            website={config.website}
            address={config.address}
            onStart={handleStart}
            t={t}
          />
        </>
      ) : (
        <main
          className={`workspace home-shell ${
            isSidebarVisible ? "" : "sidebar-hidden"
          }`}
          aria-label={t("buildingMap")}
        >
          {isSidebarVisible ? (
            <OfficeSidebar
              offices={filteredOffices}
              selectedOffice={selectedOffice}
              selectedOfficeId={selectedOffice?.id}
              formatFloor={formatFloor}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onSelectOffice={handleSelectOffice}
              onHideSidebar={() => setIsSidebarVisible(false)}
              t={t}
            />
          ) : null}

          <section className="map-area">
            <div className="map-toolbar" aria-label={t("mapActions")}>
              <div className="map-chip-group" aria-label={t("mapStatus")}>
                {!isSidebarVisible ? (
                  <button
                    className="tool-button sidebar-show-button"
                    type="button"
                    onClick={() => setIsSidebarVisible(true)}
                    aria-expanded={isSidebarVisible}
                    aria-label={t("showSearch")}
                  >
                    <PanelLeftOpen size={18} aria-hidden="true" />
                    {t("offices")}
                  </button>
                ) : null}
                <span className="map-chip">
                  <Layers size={16} aria-hidden="true" />
                  {activeFloor === "All Floors"
                    ? t("allFloors")
                    : formatFloor(activeFloor)}
                </span>
                <span className="map-chip muted">
                  <MapPinned size={16} aria-hidden="true" />
                  {activeFloor === "All Floors"
                    ? t("entranceOverview")
                    : t("focusedFloor")}
                </span>
              </div>

              <div className="map-action-group">
                <div
                  className="language-toggle toolbar-language-toggle"
                  role="group"
                  aria-label={t("language")}
                >
                  <button
                    type="button"
                    className={language === "en" ? "active" : ""}
                    aria-pressed={language === "en"}
                    onClick={() => setLanguage("en")}
                  >
                    {t("english")}
                  </button>
                  <button
                    type="button"
                    className={language === "fil" ? "active" : ""}
                    aria-pressed={language === "fil"}
                    onClick={() => setLanguage("fil")}
                  >
                    {t("filipino")}
                  </button>
                </div>
                <button
                  className={`tool-button accessibility-toggle ${
                    accessibilityMode ? "active" : ""
                  }`}
                  type="button"
                  onClick={handleAccessibilityModeChange}
                  aria-pressed={accessibilityMode}
                >
                  {t("pwdMode")}
                </button>
                <button
                  className="tool-button"
                  type="button"
                  onClick={() => setIsTutorialVisible(true)}
                >
                  <CircleHelp size={18} aria-hidden="true" />
                  {t("help")}
                </button>
                <button
                  className="tool-button"
                  type="button"
                  onClick={handleReturnToLanding}
                >
                  <House size={18} aria-hidden="true" />
                  {t("landing")}
                </button>
                <button
                  className="tool-button"
                  type="button"
                  onClick={handleRecenter}
                >
                  <Compass size={18} aria-hidden="true" />
                  {t("recenter")}
                </button>
              </div>
            </div>

            <MapPreview
              offices={offices}
              floors={floors}
              modelPaths={resolvedModelPaths}
              modelAssetStatus={modelAssetStatus}
              pathNodes={config.pathNodes || []}
              pathEdges={config.pathEdges || []}
              startNodeId={config.startNodeId}
              selectedOfficeId={selectedOffice?.id}
              mapCommand={mapCommand}
              onSelectOffice={handleSelectOffice}
              onRouteFloorChange={handleRouteFloorChange}
              onNavigationStatus={handleNavigationStatus}
              showNavigationDebug={SHOW_NAVIGATION_DEBUG}
              accessibilityMode={accessibilityMode}
              t={t}
            />

            {navigationMessage ? (
              <p className="navigation-feedback" role="status">
                {t(navigationMessage)}
              </p>
            ) : null}
            {accessibilityMode ? (
              <p className="accessibility-indicator" role="status">
                {t("accessibleActive")}
              </p>
            ) : null}

            <div className="floor-switcher" aria-label={t("floor")}>
              <span>{t("floor")}</span>
              <button
                className={activeFloor === "All Floors" ? "active" : ""}
                type="button"
                onClick={handleRecenter}
                aria-label={t("showAllFloors")}
              >
                {t("allFloorsShort")}
              </button>
              {floorOptions.map((option) => (
                <button
                  className={activeFloor === option.floor ? "active" : ""}
                  type="button"
                  key={option.floor}
                  onClick={() => handleSelectFloor(option.floor)}
                  aria-label={t("showFloor", {
                    floor: formatFloor(option.floor),
                  })}
                >
                  <Layers size={14} aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>

            <div className="map-zoom-controls" aria-label={t("mapActions")}>
              <button
                type="button"
                onClick={() => sendMapCommand("zoom-in")}
                aria-label={t("zoomIn")}
              >
                <Plus size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => sendMapCommand("zoom-out")}
                aria-label={t("zoomOut")}
              >
                <Minus size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleRecenter}
                aria-label={t("fitMap")}
              >
                <Maximize2 size={18} aria-hidden="true" />
              </button>
            </div>

          </section>
        </main>
      )}
      {hasStarted && isTutorialVisible ? (
        <div
          className="map-tutorial"
          role="dialog"
          aria-modal="true"
          aria-label={t("mapTutorial")}
        >
          <section className="map-tutorial-panel">
            <button
              className="tutorial-close"
              type="button"
              onClick={() => setIsTutorialVisible(false)}
              aria-label={t("closeTutorial")}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <span className="tutorial-kicker">
              <CircleHelp size={18} aria-hidden="true" />
              {t("quickGuide")}
            </span>
            <h2>{t("mapTutorial")}</h2>
            <div className="tutorial-steps">
              <div className="tutorial-step">
                <span className="tutorial-step-icon zoom-icons" aria-hidden="true">
                  <Plus size={18} />
                  <Minus size={18} />
                </span>
                <div>
                  <strong>{t("zoomModel")}</strong>
                  <p>{t("zoomHelp")}</p>
                </div>
              </div>
              <div className="tutorial-step">
                <span className="tutorial-step-icon" aria-hidden="true">
                  <Compass size={20} />
                </span>
                <div>
                  <strong>{t("moveView")}</strong>
                  <p>{t("moveHelp")}</p>
                </div>
              </div>
              <div className="tutorial-step">
                <span className="tutorial-step-icon" aria-hidden="true">
                  <Search size={20} />
                </span>
                <div>
                  <strong>{t("findAnOffice")}</strong>
                  <p>{t("officeHelp")}</p>
                </div>
              </div>
            </div>
            <button
              className="tutorial-primary"
              type="button"
              onClick={() => setIsTutorialVisible(false)}
            >
              {t("startNavigating")}
            </button>
          </section>
        </div>
      ) : null}
      {hasStarted && isIdleWarningVisible ? (
        <div
          className="idle-warning"
          role="dialog"
          aria-modal="true"
          aria-label={t("idleDialog")}
          onPointerDown={restartIdleTimers}
        >
          <div className="idle-warning-panel">
            <span className="idle-warning-icon" aria-hidden="true">
              <TimerReset size={34} />
            </span>
            <strong>{t("stillThere")}</strong>
            <div
              className="idle-countdown-ring"
              role="timer"
              aria-live="polite"
              aria-label={t("idleCountdown", {
                seconds: idleCountdownSeconds,
              })}
              style={{
                "--idle-progress": `${(idleCountdownSeconds / IDLE_RETURN_SECONDS) * 360}deg`,
              }}
            >
              <span>{idleCountdownSeconds}</span>
              <small>{t("seconds")}</small>
            </div>
            <p>{t("idleMessage")}</p>
            <button type="button" onClick={restartIdleTimers}>
              {t("continue")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
