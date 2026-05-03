import { useMemo, useState } from "react";
import { Building2, Compass, Route } from "lucide-react";
import Header from "./components/Header.jsx";
import LandingScreen from "./components/LandingScreen.jsx";
import OfficeSidebar from "./components/OfficeSidebar.jsx";
import MapPreview from "./components/MapPreview.jsx";
import OfficeDetails from "./components/OfficeDetails.jsx";
import { offices } from "./data/offices.js";

const MUNICIPAL_NAME = "Olongapo City";

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOfficeId, setSelectedOfficeId] = useState(offices[0].id);

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

  return (
    <div className="app">
      <Header municipalName={MUNICIPAL_NAME} />

      {!hasStarted ? (
        <LandingScreen
          municipalName={MUNICIPAL_NAME}
          onStart={() => setHasStarted(true)}
        />
      ) : (
        <main className="workspace" aria-label="Municipal office map">
          <OfficeSidebar
            offices={filteredOffices}
            selectedOfficeId={selectedOffice.id}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onSelectOffice={setSelectedOfficeId}
          />

          <section className="map-area">
            <div className="map-toolbar" aria-label="Map actions">
              <button className="tool-button" type="button">
                <Compass size={18} aria-hidden="true" />
                Recenter
              </button>
              <button className="tool-button primary" type="button">
                <Route size={18} aria-hidden="true" />
                Preview Path
              </button>
            </div>

            <MapPreview
              offices={offices}
              selectedOfficeId={selectedOffice.id}
              onSelectOffice={setSelectedOfficeId}
            />
          </section>

          <aside className="details-panel" aria-label="Selected office details">
            <div className="details-heading">
              <Building2 size={22} aria-hidden="true" />
              <span>Selected Office</span>
            </div>
            <OfficeDetails office={selectedOffice} />
          </aside>
        </main>
      )}
    </div>
  );
}
