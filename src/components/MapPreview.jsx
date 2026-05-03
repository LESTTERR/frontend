import ThreeMapViewer from "./ThreeMapViewer.jsx";

export default function MapPreview({ offices, selectedOfficeId }) {
  const selectedOffice = offices.find((office) => office.id === selectedOfficeId);

  return (
    <div className="map-preview" aria-label="Municipal building map preview">
      <div className="map-floor model-floor">
        <ThreeMapViewer />

        {selectedOffice ? (
          <div className="destination-label model-label">
            <strong>{selectedOffice.name}</strong>
            <span>{selectedOffice.room}</span>
          </div>
        ) : null}
      </div>

      <div className="map-caption">
        <span>3D model loaded</span>
        <strong>Drag to rotate, scroll to zoom, and use the sidebar to choose an office.</strong>
      </div>
    </div>
  );
}
