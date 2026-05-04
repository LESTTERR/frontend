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
            <strong>{selectedOffice.name}</strong>
            <span>{selectedOffice.room}</span>
          </div>
        ) : null}
      </div>

      <div className="map-caption">
        <span>3D model loaded</span>
        <strong>Choose an office to center it, drag to rotate, and scroll to zoom.</strong>
      </div>
    </div>
  );
}
