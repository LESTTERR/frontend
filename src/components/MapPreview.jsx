import ThreeMapViewer from "./ThreeMapViewer.jsx";

export default function MapPreview({ offices, selectedOfficeId, mapCommand }) {
  const selectedOffice = offices.find((office) => office.id === selectedOfficeId);

  return (
    <div className="map-preview" aria-label="Municipal building map preview">
      <div className="map-floor model-floor">
        <ThreeMapViewer
          selectedOffice={selectedOffice}
          viewCommand={mapCommand}
        />

        {selectedOffice ? (
          <div className="destination-label model-label">
            <span>Destination</span>
            <strong>{selectedOffice.name}</strong>
            <em>{selectedOffice.room}</em>
          </div>
        ) : null}
      </div>

      <div className="map-caption">
        <span>Live 3D Route</span>
        <strong>Choose an office to draw the route inside the model.</strong>
      </div>
    </div>
  );
}
