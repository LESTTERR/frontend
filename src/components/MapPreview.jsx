import ThreeMapViewer from "./ThreeMapViewer.jsx";

export default function MapPreview({
  offices,
  selectedOfficeId,
  mapCommand,
  onSelectOffice,
  onRouteFloorChange,
}) {
  const selectedOffice = offices.find((office) => office.id === selectedOfficeId);

  return (
    <div className="map-preview" aria-label="City hall building map preview">
      <div className="map-floor model-floor">
        <ThreeMapViewer
          selectedOffice={selectedOffice}
          viewCommand={mapCommand}
          onSelectOffice={onSelectOffice}
          onRouteFloorChange={onRouteFloorChange}
        />
      </div>

      <div className="map-caption">
        <span>Live 3D Route</span>
        <strong>Choose an office to draw the route inside the model.</strong>
      </div>
    </div>
  );
}
