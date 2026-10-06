import { memo, Suspense, lazy } from "react";

const ThreeMapViewer = lazy(() => import("./ThreeMapViewer.jsx"));

const MapPreview = memo(function MapPreview({
  offices,
  floors,
  modelPaths,
  modelAssetStatus = "ready",
  pathNodes,
  pathEdges,
  startNodeId,
  selectedOfficeId,
  mapCommand,
  onSelectOffice,
  onRouteFloorChange,
  onNavigationStatus,
  showNavigationDebug = false,
}) {
  const selectedOffice = offices?.find((office) => office.id === selectedOfficeId) || offices?.[0];

  return (
    <div className="map-preview" aria-label="City hall building map preview">
      <div className="map-floor model-floor">
        <Suspense
          fallback={
            <div className="viewer-status" aria-live="polite">
              Loading map...
            </div>
          }
        >
          {modelAssetStatus === "loading" ? (
            <div className="viewer-status" role="status">Loading saved building model...</div>
          ) : modelAssetStatus === "missing" ? (
            <div className="viewer-status error" role="alert">
              Saved building model is missing. Re-upload it in Organization Settings.
            </div>
          ) : (
            <ThreeMapViewer
              offices={offices}
              floors={floors}
              modelPaths={modelPaths}
              pathNodes={pathNodes}
              pathEdges={pathEdges}
              startNodeId={startNodeId}
              selectedOffice={selectedOffice}
              viewCommand={mapCommand}
              onSelectOffice={onSelectOffice}
              onRouteFloorChange={onRouteFloorChange}
              onNavigationStatus={onNavigationStatus}
              showNavigationDebug={showNavigationDebug}
              showOfficeLabels={true}
            />
          )}
        </Suspense>
      </div>

      <div className="map-caption">
        <span>Live 3D Route</span>
        <strong>Choose an office to draw the route inside the model.</strong>
      </div>
    </div>
  );
});

export default MapPreview;
