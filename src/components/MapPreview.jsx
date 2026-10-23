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
  accessibilityMode = false,
  t,
}) {
  const selectedOffice = offices?.find((office) => office.id === selectedOfficeId) || offices?.[0];

  return (
    <div className="map-preview" aria-label={t("buildingMap")}>
      <div className="map-floor model-floor">
        <Suspense
          fallback={
            <div className="viewer-status" aria-live="polite">
              {t("loadingMap")}
            </div>
          }
        >
          {modelAssetStatus === "loading" ? (
            <div className="viewer-status" role="status">{t("loadingSavedModel")}</div>
          ) : modelAssetStatus === "missing" ? (
            <div className="viewer-status error" role="alert">
              {t("missingModel")}
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
              accessibilityMode={accessibilityMode}
              optimizeForKiosk
              t={t}
            />
          )}
        </Suspense>
      </div>

      <div className="map-caption">
        <span>{t("liveRoute")}</span>
        <strong>{t("chooseOffice")}</strong>
      </div>
    </div>
  );
});

export default MapPreview;
