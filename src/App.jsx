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

const START_FLOOR = "1st Floor";
const SHOW_NAVIGATION_DEBUG =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("debugNavigation") === "1";
const IDLE_WARNING_MS = 8_000;
const IDLE_RETURN_SECONDS = 10;
const IDLE_RETURN_MS = IDLE_RETURN_SECONDS * 1000;

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
    setNavigationMessage(
      result.status === "unavailable"
        ? "No route available to this office."
        : "",
    );
  }, []);

  const handleSelectFloor = useCallback((floor) => {
    setActiveFloor(floor);
    sendMapCommand("focus-floor", { floor });
  }, []);

  const handleRecenter = useCallback(() => {
    setActiveFloor("All Floors");
    sendMapCommand("reset-view");
  }, []);

  const handleRouteFloorChange = useCallback((floor) => {
    setActiveFloor(floor);
  }, []);

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
            cityName={config.organizationName || config.cityName || "Olongapo City"}
            title={config.navigatorTitle}
            logoUrl={resolvedLogoUrl}
          />
          <LandingScreen
            cityName={config.organizationName || config.cityName || "Olongapo City"}
            title={config.navigatorTitle}
            tagline={config.landingTagline}
            onStart={handleStart}
          />
        </>
      ) : (
        <main
          className={`workspace home-shell ${
            isSidebarVisible ? "" : "sidebar-hidden"
          }`}
          aria-label="City hall office map"
        >
          {isSidebarVisible ? (
            <OfficeSidebar
              offices={filteredOffices}
              selectedOffice={selectedOffice}
              selectedOfficeId={selectedOffice?.id}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onSelectOffice={handleSelectOffice}
              onHideSidebar={() => setIsSidebarVisible(false)}
            />
          ) : null}

          <section className="map-area">
            <div className="map-toolbar" aria-label="Map actions">
              <div className="map-chip-group" aria-label="Map status">
                {!isSidebarVisible ? (
                  <button
                    className="tool-button sidebar-show-button"
                    type="button"
                    onClick={() => setIsSidebarVisible(true)}
                    aria-expanded={isSidebarVisible}
                    aria-label="Show office search"
                  >
                    <PanelLeftOpen size={18} aria-hidden="true" />
                    Offices
                  </button>
                ) : null}
                <span className="map-chip">
                  <Layers size={16} aria-hidden="true" />
                  {activeFloor}
                </span>
                <span className="map-chip muted">
                  <MapPinned size={16} aria-hidden="true" />
                  {activeFloor === "All Floors" ? "Entrance overview" : "Focused floor view"}
                </span>
              </div>

              <div className="map-action-group">
                <button
                  className="tool-button"
                  type="button"
                  onClick={() => setIsTutorialVisible(true)}
                >
                  <CircleHelp size={18} aria-hidden="true" />
                  Help
                </button>
                <button
                  className="tool-button"
                  type="button"
                  onClick={handleReturnToLanding}
                >
                  <House size={18} aria-hidden="true" />
                  Landing
                </button>
                <button
                  className="tool-button"
                  type="button"
                  onClick={handleRecenter}
                >
                  <Compass size={18} aria-hidden="true" />
                  Recenter
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
            />

            {navigationMessage ? (
              <p className="navigation-feedback" role="status">
                {navigationMessage}
              </p>
            ) : null}

            <div className="floor-switcher" aria-label="Floor selector">
              <span>Floor</span>
              <button
                className={activeFloor === "All Floors" ? "active" : ""}
                type="button"
                onClick={handleRecenter}
                aria-label="Show all floors"
              >
                All
              </button>
              {floorOptions.map((option) => (
                <button
                  className={activeFloor === option.floor ? "active" : ""}
                  type="button"
                  key={option.floor}
                  onClick={() => handleSelectFloor(option.floor)}
                  aria-label={`Show ${option.floor}`}
                >
                  <Layers size={14} aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>

            <div className="map-zoom-controls" aria-label="Map zoom controls">
              <button
                type="button"
                onClick={() => sendMapCommand("zoom-in")}
                aria-label="Zoom in"
              >
                <Plus size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => sendMapCommand("zoom-out")}
                aria-label="Zoom out"
              >
                <Minus size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleRecenter}
                aria-label="Fit map to screen"
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
          aria-label="How to use the 3D map"
        >
          <section className="map-tutorial-panel">
            <button
              className="tutorial-close"
              type="button"
              onClick={() => setIsTutorialVisible(false)}
              aria-label="Close map tutorial"
            >
              <X size={18} aria-hidden="true" />
            </button>
            <span className="tutorial-kicker">
              <CircleHelp size={18} aria-hidden="true" />
              Quick guide
            </span>
            <h2>How to use the 3D map</h2>
            <div className="tutorial-steps">
              <div className="tutorial-step">
                <span className="tutorial-step-icon zoom-icons" aria-hidden="true">
                  <Plus size={18} />
                  <Minus size={18} />
                </span>
                <div>
                  <strong>Zoom the model</strong>
                  <p>Pinch on the screen, scroll the mouse wheel, or press the + and - buttons.</p>
                </div>
              </div>
              <div className="tutorial-step">
                <span className="tutorial-step-icon" aria-hidden="true">
                  <Compass size={20} />
                </span>
                <div>
                  <strong>Move the view</strong>
                  <p>Drag the 3D map to rotate and inspect the building.</p>
                </div>
              </div>
              <div className="tutorial-step">
                <span className="tutorial-step-icon" aria-hidden="true">
                  <Search size={20} />
                </span>
                <div>
                  <strong>Find an office</strong>
                  <p>Search or tap an office name, then follow the orange route.</p>
                </div>
              </div>
            </div>
            <button
              className="tutorial-primary"
              type="button"
              onClick={() => setIsTutorialVisible(false)}
            >
              Start navigating
            </button>
          </section>
        </div>
      ) : null}
      {hasStarted && isIdleWarningVisible ? (
        <div
          className="idle-warning"
          role="dialog"
          aria-modal="true"
          aria-label="Still using the city hall navigator"
          onPointerDown={restartIdleTimers}
        >
          <div className="idle-warning-panel">
            <span className="idle-warning-icon" aria-hidden="true">
              <TimerReset size={34} />
            </span>
            <strong>Are you still there?</strong>
            <div
              className="idle-countdown-ring"
              role="timer"
              aria-live="polite"
              aria-label={`${idleCountdownSeconds} seconds before returning to the landing page`}
              style={{
                "--idle-progress": `${(idleCountdownSeconds / IDLE_RETURN_SECONDS) * 360}deg`,
              }}
            >
              <span>{idleCountdownSeconds}</span>
              <small>seconds</small>
            </div>
            <p>Touch anywhere to continue. No response will return this screen to the landing page.</p>
            <button type="button" onClick={restartIdleTimers}>
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
