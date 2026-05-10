import { useMemo, useState } from "react";
import {
  Compass,
  DoorOpen,
  Footprints,
  Layers,
  MapPinned,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  Route,
  X,
} from "lucide-react";
import Header from "./components/Header.jsx";
import LandingScreen from "./components/LandingScreen.jsx";
import OfficeSidebar from "./components/OfficeSidebar.jsx";
import MapPreview from "./components/MapPreview.jsx";
import { offices } from "./data/offices.js";

const CITY_NAME = "Olongapo City";
const START_FLOOR = "1st Floor";
const DEFAULT_SELECTED_OFFICE_ID = "main-lobby";
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

  if (office.floor === "1st Floor") {
    return [
      "Start at the main entrance on the 1st Floor.",
      `Follow the orange route toward the ${side} of the ${hallway}.`,
      `Stop at ${office.room}.`,
    ];
  }

  return [
    "Start at the main entrance on the 1st Floor.",
    "Follow the orange route through the main hallway to the stair or elevator.",
    `Use the main stairs or elevator to reach the ${office.floor}.`,
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
  const [mapCommand, setMapCommand] = useState(null);

  const sendMapCommand = (type, payload = {}) => {
    setMapCommand((currentCommand) => ({
      type,
      payload,
      sequence: (currentCommand?.sequence ?? 0) + 1,
    }));
  };

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
    const needsStairs = office.floor !== "1st Floor";
    const verticalStep = needsStairs
      ? `Stairs or elevator to ${office.floor}`
      : "Main corridor";

    return `Main entrance (${START_FLOOR}) -> ${verticalStep} -> ${office.room}`;
  };

  const handleSelectOffice = (officeId) => {
    const office = offices.find((item) => item.id === officeId);

    setSelectedOfficeId(officeId);
    if (office) {
      setActiveFloor(getRouteDisplayFloor(office));
    }
    setShowDirections(true);
    sendMapCommand("enter-route");
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
    sendMapCommand("enter-route");
  };

  return (
    <div className={`app ${hasStarted ? "app-home" : ""}`}>
      {!hasStarted ? (
        <>
          <Header cityName={CITY_NAME} />
          <LandingScreen
            cityName={CITY_NAME}
            onStart={() => setHasStarted(true)}
          />
        </>
      ) : (
        <main className="workspace home-shell" aria-label="City hall office map">
          <OfficeSidebar
            offices={filteredOffices}
            selectedOffice={selectedOffice}
            selectedOfficeId={selectedOffice.id}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onSelectOffice={handleSelectOffice}
          />

          <section className="map-area">
            <div className="map-toolbar" aria-label="Map actions">
              <div className="map-chip-group" aria-label="Map status">
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
            />

            <aside className="map-legend" aria-label="Map legend">
              <p>Legend</p>
              <div>
                <span className="legend-swatch mayor" />
                Sky-blue floors
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
    </div>
  );
}
