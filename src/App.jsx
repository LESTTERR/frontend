import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleHelp,
  Compass,
  DoorOpen,
  Footprints,
  House,
  Layers,
  MapPinned,
  Maximize2,
  Minus,
  Navigation,
  PanelLeftOpen,
  Plus,
  Route,
  Search,
  TimerReset,
  X,
} from "lucide-react";
import Header from "./components/Header.jsx";
import LandingScreen from "./components/LandingScreen.jsx";
import OfficeSidebar from "./components/OfficeSidebar.jsx";
import MapPreview from "./components/MapPreview.jsx";
import { offices } from "./data/offices.js";

const CITY_NAME = "Olongapo City";
const START_FLOOR = "1st Floor";
const DEFAULT_SELECTED_OFFICE_ID = "city-health";
const IDLE_WARNING_MS = 30_000;
const IDLE_RETURN_MS = 10_000;
const floorOptions = [
  { label: "1", floor: "1st Floor" },
  { label: "2", floor: "2nd Floor" },
  { label: "3", floor: "3rd Floor" },
];

function getHallwaySide(mapPosition = {}) {
  if ((mapPosition.x ?? 50) < 42) {
    return "left side";
  }

  if ((mapPosition.x ?? 50) > 58) {
    return "right side";
  }

  return "center hallway";
}

function getHallwayDepth(mapPosition = {}) {
  if ((mapPosition.y ?? 50) < 42) {
    return "first hallway";
  }

  if ((mapPosition.y ?? 50) < 64) {
    return "middle hallway";
  }

  return "rear hallway";
}

function getVisitorDirections(office) {
  const side = getHallwaySide(office.mapPosition);
  const hallway = getHallwayDepth(office.mapPosition);
  const verticalAccess =
    office.floor === "2nd Floor"
      ? "main stairs"
      : office.floor === "3rd Floor"
        ? "elevator"
        : null;

  if (office.floor === "1st Floor") {
    return [
      "Start at the 1st Floor lobby marker.",
      `Follow the orange route toward the ${side} of the ${hallway}.`,
      `Stop at ${office.room}.`,
    ];
  }

  return [
    "Start at the 1st Floor lobby marker.",
    `Follow the orange route through the main hallway to the ${verticalAccess}.`,
    `Use the ${verticalAccess} to reach the ${office.floor}.`,
    `Press floor ${office.floor.charAt(0)} to view the final hallway segment toward the ${side} of the ${hallway}.`,
    `Stop at ${office.room}.`,
  ];
}

function getRouteDisplayFloor(office) {
  return office?.floor === START_FLOOR ? office.floor : START_FLOOR;
}

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOfficeId, setSelectedOfficeId] = useState(
    offices.find((office) => office.id === DEFAULT_SELECTED_OFFICE_ID)?.id ??
      offices[0].id,
  );
  const [activeFloor, setActiveFloor] = useState(START_FLOOR);
  const [showDirections, setShowDirections] = useState(true);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [mapCommand, setMapCommand] = useState(null);
  const [isIdleWarningVisible, setIsIdleWarningVisible] = useState(false);
  const [isTutorialVisible, setIsTutorialVisible] = useState(false);
  const idleWarningTimerRef = useRef(null);
  const idleReturnTimerRef = useRef(null);

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
    idleWarningTimerRef.current = null;
    idleReturnTimerRef.current = null;
  }, []);

  const handleReturnToLanding = useCallback(() => {
    clearIdleTimers();
    setHasStarted(false);
    setIsIdleWarningVisible(false);
    setIsTutorialVisible(false);
    setSearchTerm("");
    setActiveFloor(START_FLOOR);
    setShowDirections(true);
    setIsSidebarVisible(true);
    setMapCommand(null);
  }, [clearIdleTimers]);

  const restartIdleTimers = useCallback(() => {
    clearIdleTimers();

    if (!hasStarted) {
      return;
    }

    setIsIdleWarningVisible(false);
    idleWarningTimerRef.current = window.setTimeout(() => {
      setIsIdleWarningVisible(true);
      idleReturnTimerRef.current = window.setTimeout(
        handleReturnToLanding,
        IDLE_RETURN_MS,
      );
    }, IDLE_WARNING_MS);
  }, [clearIdleTimers, handleReturnToLanding, hasStarted]);

  useEffect(() => {
    if (!hasStarted) {
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
  }, [clearIdleTimers, hasStarted, restartIdleTimers]);

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
        ...office.keywords,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [searchTerm]);

  const selectedOffice =
    offices.find((office) => office.id === selectedOfficeId) ?? offices[0];
  const visitorDirections = getVisitorDirections(selectedOffice);

  const getRouteText = (office) => {
    const verticalStep =
      office.floor === "2nd Floor"
        ? `Main stairs to ${office.floor}`
        : office.floor === "3rd Floor"
          ? `Elevator to ${office.floor}`
          : "Main corridor";

    return `1st Floor lobby -> ${verticalStep} -> ${office.room}`;
  };

  const handleSelectOffice = (officeId, options = {}) => {
    const office = offices.find((item) => item.id === officeId);
    const routeDisplayFloor =
      options.focusDestinationFloor && office
        ? office.floor
        : office
          ? getRouteDisplayFloor(office)
          : START_FLOOR;

    setSelectedOfficeId(officeId);
    if (office) {
      setActiveFloor(routeDisplayFloor);
    }
    setShowDirections(true);
    sendMapCommand("enter-route", {
      floor: routeDisplayFloor,
      autoFloors: !options.focusDestinationFloor,
    });
  };

  const handleSelectFloor = (floor) => {
    setActiveFloor(floor);
    sendMapCommand("focus-floor", { floor });
  };

  const handleRecenter = () => {
    setActiveFloor("All Floors");
    sendMapCommand("reset-view");
  };

  const handleEnterRoute = () => {
    setActiveFloor(getRouteDisplayFloor(selectedOffice));
    setShowDirections(true);
    sendMapCommand("enter-route", { autoFloors: true });
  };

  const handleRouteFloorChange = (floor) => {
    setActiveFloor(floor);
  };

  const handleStart = () => {
    setHasStarted(true);
    setIsTutorialVisible(true);
  };

  return (
    <div className={`app ${hasStarted ? "app-home" : ""}`}>
      {!hasStarted ? (
        <>
          <Header cityName={CITY_NAME} />
          <LandingScreen
            cityName={CITY_NAME}
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
              selectedOfficeId={selectedOffice.id}
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
                <button
                  className="tool-button primary"
                  type="button"
                  onClick={handleEnterRoute}
                >
                  <Route size={18} aria-hidden="true" />
                  Enter Route
                </button>
              </div>
            </div>

            <MapPreview
              offices={offices}
              selectedOfficeId={selectedOffice.id}
              mapCommand={mapCommand}
              onSelectOffice={handleSelectOffice}
              onRouteFloorChange={handleRouteFloorChange}
            />

            <aside className="map-legend" aria-label="Map legend">
              <p>Legend</p>
              <div>
                <span className="legend-swatch floor-one" />
                First floor
              </div>
              <div>
                <span className="legend-swatch floor-two" />
                Second floor
              </div>
              <div>
                <span className="legend-swatch floor-three" />
                Third floor
              </div>
              <div>
                <span className="legend-swatch office" />
                White walls
              </div>
              <div>
                <span className="legend-swatch route" />
                Generated Path
              </div>
            </aside>

            {showDirections ? (
              <aside className="route-instructions" aria-label="Visitor directions">
                <div className="instruction-header-row">
                  <div className="instruction-heading">
                    <Footprints size={18} aria-hidden="true" />
                    <span>Visitor directions</span>
                  </div>
                  <button
                    className="instruction-close"
                    type="button"
                    onClick={() => setShowDirections(false)}
                    aria-label="Hide visitor directions"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
                <strong>{selectedOffice.name}</strong>
                <ol>
                  {visitorDirections.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </aside>
            ) : (
              <button
                className="directions-toggle"
                type="button"
                onClick={() => setShowDirections(true)}
                aria-label="Show visitor directions"
              >
                <Footprints size={18} aria-hidden="true" />
                Directions
              </button>
            )}

            <div className="floor-switcher" aria-label="Floor selector">
              <span>Floor</span>
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

            <aside className="route-summary" aria-label="Selected route summary">
              <div className="route-metric">
                <Route size={18} aria-hidden="true" />
                <span>Route</span>
                <strong>{getRouteText(selectedOffice)}</strong>
              </div>
              <div className="route-metric">
                <DoorOpen size={18} aria-hidden="true" />
                <span>Room</span>
                <strong>{selectedOffice.room}</strong>
              </div>
              <div className="route-metric destination">
                <Navigation size={18} aria-hidden="true" />
                <span>Destination</span>
                <strong>{selectedOffice.name}</strong>
              </div>
            </aside>
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
            <p>Touch anywhere to continue. Returning to the landing page in 10 seconds.</p>
            <button type="button" onClick={restartIdleTimers}>
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
