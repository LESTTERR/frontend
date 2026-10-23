import { lazy, Suspense, useState, useMemo } from "react";
import { Route, Plus, Trash2, Pencil } from "lucide-react";
import {
  addPathEdge,
  updatePathEdge,
  removePathEdge,
} from "../../services/navigatorConfig.js";
import {
  findWaypointRoute,
  validateNavigationGraph,
} from "../../services/pathfinding.js";
import useNavigatorConfig from "../../hooks/useNavigatorConfig.js";

const ThreeMapViewer = lazy(() => import("../ThreeMapViewer.jsx"));

function describeGraphIssue(issue) {
  const node = issue.nodeId ? `Waypoint ${issue.nodeId}` : null;
  const edge = issue.edgeId ? `Edge ${issue.edgeId}` : null;
  const messages = {
    "missing-start": "The selected kiosk start does not exist.",
    "start-not-kiosk": `${node} must be a kiosk to serve as the route start.`,
    "missing-position": `${node} has no 3D position.`,
    "invalid-floor": `${node} does not have a valid floor.`,
    "unlinked-office-node": `${node} is not linked to an office destination.`,
    "duplicate-node-id": `${node} has a duplicate ID.`,
    "missing-edge-node": `${edge} references a waypoint that does not exist.`,
    "edge-node-unplaced": `${edge} references an unplaced waypoint.`,
    "invalid-floor-transition": `${edge} has an invalid floor transition or connection type.`,
  };
  return messages[issue.code] || `${issue.code}${node ? `: ${node}` : ""}${edge ? `: ${edge}` : ""}.`;
}

export default function AdminPaths() {
  const { config, resolvedModelPaths, saveConfig } = useNavigatorConfig();
  const floors = (config.floors || []).filter((floor) => floor.enabled !== false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [isDrawingRoute, setIsDrawingRoute] = useState(false);
  const [isRouteActive, setIsRouteActive] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState(
    floors[0]?.label || "1st Floor",
  );
  const [routeStartId, setRouteStartId] = useState(config.startNodeId);
  const [routeDestinationId, setRouteDestinationId] = useState("");
  const [draftRouteId, setDraftRouteId] = useState("");
  const [nextNodeType, setNextNodeType] = useState("corridor");
  const [draftNodes, setDraftNodes] = useState([]);
  const [isRouteFinished, setIsRouteFinished] = useState(false);
  const [viewerCommand, setViewerCommand] = useState({
    type: "focus-floor",
    payload: { floor: floors[0]?.label || "1st Floor" },
    sequence: 1,
  });

  const pathEdges = useMemo(() => config.pathEdges || [], [config.pathEdges]);
  const pathNodes = useMemo(() => config.pathNodes || [], [config.pathNodes]);

  const nodeById = useMemo(() => new Map(pathNodes.map((n) => [n.id, n])), [pathNodes]);
  const graphIssues = useMemo(
    () =>
      validateNavigationGraph({
        nodes: pathNodes,
        edges: pathEdges,
        floors,
        startNodeId: config.startNodeId,
      }),
    [config.startNodeId, floors, pathEdges, pathNodes],
  );
  const destinationNodes = useMemo(
    () => pathNodes.filter((node) => node.type === "office" && node.officeId),
    [pathNodes],
  );

  const save = (nextConfig) => {
    return saveConfig(nextConfig);
  };

  const startEdit = (edge) => {
    setEditingId(edge.id);
    setForm({ ...edge });
    setIsAdding(false);
  };

  const startAdd = () => {
    setEditingId(null);
    setForm({
      id: `edge-${Date.now()}`,
      from: pathNodes[0]?.id || "",
      to: pathNodes[1]?.id || "",
      bidirectional: true,
      type: "walk",
    });
    setIsAdding(true);
  };

  const cancel = () => {
    setEditingId(null);
    setIsAdding(false);
    setForm({});
    setValidationMessage("");
  };

  const handleSave = () => {
    if (!form.from || !form.to || form.from === form.to) {
      setValidationMessage("Choose two different waypoint nodes.");
      return;
    }
    const fromNode = nodeById.get(form.from);
    const toNode = nodeById.get(form.to);
    if (!fromNode || !toNode) {
      setValidationMessage("The selected edge endpoint does not exist.");
      return;
    }
    if (!fromNode.position || !toNode.position) {
      setValidationMessage("Place both endpoint pins before saving this edge.");
      return;
    }
    const fromFloor = floorNumber(fromNode.floor, fromNode.floorId);
    const toFloor = floorNumber(toNode.floor, toNode.floorId);
    if (fromFloor === null || toFloor === null) {
      setValidationMessage("Both route endpoints must be assigned to a valid floor.");
      return;
    }
    if (fromFloor !== toFloor) {
      const validStairs =
        form.type === "stairs" &&
        ["stairs", "stair"].includes(fromNode.type) &&
        ["stairs", "stair"].includes(toNode.type) &&
        Math.abs(fromFloor - toFloor) === 1;
      const validElevator =
        form.type === "elevator" &&
        fromNode.type === "elevator" &&
        toNode.type === "elevator";
      if (!validStairs && !validElevator) {
        setValidationMessage(
          "Cross-floor edges must connect matching stair landings on adjacent floors or elevator pins.",
        );
        return;
      }
    } else if (form.type !== "walk") {
      setValidationMessage("Stair and elevator edge types must connect different floors.");
      return;
    }
    if (!save({
      ...config,
      pathEdges: isAdding
        ? addPathEdge(pathEdges, form)
        : updatePathEdge(pathEdges, editingId, form),
    })) {
      setValidationMessage("Unable to save. Storage may be full or unavailable.");
      return;
    }
    cancel();
  };

  const handleDelete = (edgeId) => {
    if (!window.confirm("Delete this path edge?")) return;
    save({ ...config, pathEdges: removePathEdge(pathEdges, edgeId) });
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const setEditorFloor = (floorLabel) => {
    setSelectedFloor(floorLabel);
    setViewerCommand((current) => ({
      type: "focus-floor",
      payload: { floor: floorLabel },
      sequence: current.sequence + 1,
    }));
  };

  const floorNumber = (floor, floorId) => {
    const configuredFloor =
      floors.find((entry) => entry.id === floorId) ||
      floors.find((entry) => entry.id === floor) ||
      floors.find((entry) => entry.label === floor) ||
      floors.find((entry) => String(entry.number) === String(floor));
    if (configuredFloor) {
      return Number(configuredFloor.order ?? configuredFloor.number);
    }
    const match = String(floor ?? "").match(/\d+/);
    return match ? Number(match[0]) : null;
  };

  const startNode = nodeById.get(routeStartId);
  const destinationNode = nodeById.get(routeDestinationId);
  const previousRouteNode =
    draftNodes[draftNodes.length - 1] || startNode;

  const isFloorAvailableForNextPoint = (floor) => {
    if (!previousRouteNode) return false;
    const currentNumber = floorNumber(previousRouteNode.floor, previousRouteNode.floorId);
    const nextNumber = floorNumber(floor);
    if (currentNumber === null || nextNumber === null) return false;
    if (currentNumber === nextNumber) return true;
    if (nextNodeType === "elevator") {
      return previousRouteNode.type === "elevator";
    }
    return (
      nextNodeType === "stairs" &&
      ["stairs", "stair"].includes(previousRouteNode.type) &&
      Math.abs(currentNumber - nextNumber) === 1
    );
  };

  const handleRoutePoint = (position) => {
    if (!isRouteActive || isRouteFinished) return;
    if (!isFloorAvailableForNextPoint(selectedFloor)) {
      setValidationMessage(
        "Select the same floor, or place matching stair/elevator transition pins on connected floors.",
      );
      return;
    }
    const nextNode = {
      id: `${draftRouteId}-node-${draftNodes.length}`,
      name: `${nextNodeType} ${draftNodes.length + 1}`,
      type: nextNodeType,
      floorId: floors.find((floor) => floor.label === selectedFloor)?.id || "",
      floor: selectedFloor,
      position,
      officeId: "",
    };
    setDraftNodes((current) => [...current, nextNode]);
    setValidationMessage("");
  };

  const buildDraftEdges = (includeDestination) => {
    if (!startNode || !draftNodes.length) return [];
    const sequence = [startNode, ...draftNodes];
    if (includeDestination && destinationNode) sequence.push(destinationNode);
    return sequence.slice(1).map((toNode, index) => {
      const fromNode = sequence[index];
      const fromFloor = floorNumber(fromNode.floor, fromNode.floorId);
      const toFloor = floorNumber(toNode.floor, toNode.floorId);
      const isTransition =
        fromFloor !== null && toFloor !== null && fromFloor !== toFloor;
      const type = isTransition
        ? fromNode.type === "elevator" && toNode.type === "elevator"
          ? "elevator"
          : "stairs"
        : "walk";
      return {
        id: `${draftRouteId}-edge-${index}`,
        from: fromNode.id,
        to: toNode.id,
        type,
        bidirectional: true,
      };
    });
  };

  const startRouteDrawing = () => {
    setValidationMessage("");
    setDraftNodes([]);
    setIsRouteFinished(false);
    if (!draftRouteId) setDraftRouteId(`route-${Date.now()}`);
    const selectedStart = nodeById.get(routeStartId);
    if (!selectedStart?.position || selectedStart.type !== "kiosk") {
      setValidationMessage("Place the selected kiosk and set it as the start node first.");
      return;
    }
    if (!destinationNodes.some((node) => node.id === routeDestinationId)) {
      setValidationMessage("Place and link an office entrance before creating its route.");
      return;
    }
    setIsRouteActive(true);
    setEditorFloor(selectedStart.floor);
  };

  const finishRouteDrawing = () => {
    if (!destinationNode?.position || draftNodes.length === 0) {
      setValidationMessage(
        "Add at least one manually placed route waypoint and select a placed office entrance.",
      );
      return;
    }
    const routeNodes = [startNode, ...draftNodes, destinationNode];
    const routeEdges = buildDraftEdges(true);
    const issues = validateNavigationGraph({
      nodes: routeNodes,
      edges: routeEdges,
      floors,
      startNodeId: routeStartId,
    });
    if (issues.length) {
      setValidationMessage(
        `Route cannot be finished: ${issues.map((issue) => `${issue.code}${issue.nodeId ? ` (${issue.nodeId})` : ""}${issue.edgeId ? ` (${issue.edgeId})` : ""}`).join(", ")}.`,
      );
      return;
    }
    const result = findWaypointRoute({
      nodes: routeNodes,
      edges: routeEdges,
      floors,
      startNodeId: routeStartId,
      destinationNodeId: routeDestinationId,
    });
    if (result.error) {
      setValidationMessage(`Route cannot be finished: ${result.error}.`);
      return;
    }
    setIsRouteFinished(true);
    setValidationMessage("Route preview reaches the selected office entrance.");
  };

  const saveRouteDrawing = () => {
    if (!isRouteFinished || !destinationNode) {
      setValidationMessage("Finish and validate the route before saving it.");
      return;
    }
    const newEdges = buildDraftEdges(true);
    const edgeKeys = new Set(
      pathEdges.map(
        (edge) =>
          `${edge.from}|${edge.to}|${edge.type}|${edge.bidirectional !== false}`,
      ),
    );
    save({
      ...config,
      pathNodes: [...pathNodes, ...draftNodes],
      pathEdges: [
        ...pathEdges,
        ...newEdges.filter(
          (edge) =>
            !edgeKeys.has(
              `${edge.from}|${edge.to}|${edge.type}|${edge.bidirectional !== false}`,
            ),
        ),
      ],
    });
    cancelRouteDrawing();
    setValidationMessage("Route saved to the walkable network.");
  };

  const cancelRouteDrawing = () => {
    setIsDrawingRoute(false);
    setIsRouteActive(false);
    setDraftNodes([]);
    setIsRouteFinished(false);
    setDraftRouteId("");
    setValidationMessage("");
  };

  const routePreviewNodes = isRouteActive
    ? [startNode, ...draftNodes, ...(isRouteFinished && destinationNode ? [destinationNode] : [])]
        .filter(Boolean)
    : pathNodes;
  const routePreviewEdges = isRouteActive
    ? buildDraftEdges(isRouteFinished)
    : pathEdges;

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h1 className="admin-page-title">Paths</h1>
          <p className="admin-page-subtitle">
            Connect walkable waypoint pairs. Routes use only these links; no
            automatic shortcut is created.
          </p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-mode-badge edit">Edit Mode</span>
          <button
            className="admin-btn admin-btn-secondary"
            type="button"
            onClick={() => {
              if (!isDrawingRoute) {
                setRouteStartId(config.startNodeId);
                setRouteDestinationId(destinationNodes[0]?.id || "");
                setDraftNodes([]);
                setIsRouteFinished(false);
                setDraftRouteId(`route-${Date.now()}`);
                setIsDrawingRoute(true);
                setIsRouteActive(false);
                setEditorFloor(
                  nodeById.get(config.startNodeId)?.floor ||
                    config.floors?.[0]?.label,
                );
              }
            }}
          >
            <Route size={16} style={{ marginRight: 6 }} />
            Create Route
          </button>
          <button className="admin-btn admin-btn-primary" onClick={startAdd}>
            <Plus size={16} style={{ marginRight: 6 }} />
            Add Edge
          </button>
        </div>
      </div>

      {isDrawingRoute ? (
        <div className="admin-card admin-route-drawing-card">
          <div className="admin-card-header">
            <div>
              <h3>Draw a walkable route</h3>
              <p>
                Click each corridor point in sequence. Floor changes require a
                matching stair or elevator transition; no shortcut is inferred.
              </p>
            </div>
            <span className="admin-badge-floor">EDITING {selectedFloor.toUpperCase()}</span>
          </div>
          <div className="admin-route-drawing-controls">
            <label>
              Start at kiosk
              <select
                value={routeStartId}
                disabled
              >
                {pathNodes
                  .filter((node) => node.type === "kiosk")
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name} ({node.floor})
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Office entrance
              <select
                value={routeDestinationId}
                onChange={(event) => setRouteDestinationId(event.target.value)}
                disabled={isRouteActive}
              >
                <option value="">Select a linked office entrance</option>
                {destinationNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name} ({node.floor})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Next point type
              <select
                value={nextNodeType}
                onChange={(event) => setNextNodeType(event.target.value)}
                disabled={!isRouteActive || isRouteFinished}
              >
                <option value="corridor">Corridor</option>
                <option value="stairs">Stair transition</option>
                <option value="elevator">Elevator transition</option>
                <option value="waypoint">Waypoint</option>
              </select>
            </label>
          </div>
          <div className="admin-waypoint-floor-controls">
            <span>Floor</span>
            {floors.map((floor) => (
              <button
                key={floor.id}
                type="button"
                aria-pressed={selectedFloor === floor.label}
                disabled={
                  (isRouteActive && !isFloorAvailableForNextPoint(floor.label)) ||
                  isRouteFinished
                }
                onClick={() => setEditorFloor(floor.label)}
              >
                {floor.label}
              </button>
            ))}
          </div>
          <div className="admin-waypoint-viewer">
            <Suspense
              fallback={
                <div className="viewer-status" role="status">Loading map editor...</div>
              }
            >
              <ThreeMapViewer
                offices={config.offices}
                floors={config.floors}
                modelPaths={resolvedModelPaths}
                pathNodes={routePreviewNodes}
                pathEdges={routePreviewEdges}
                startNodeId={routeStartId}
                viewCommand={viewerCommand}
                editFloor={selectedFloor}
                lockCameraRotation={false}
                isolatedFloorView
                isDrawingRoute={isRouteActive}
                onRoutePointPlace={handleRoutePoint}
                showNavigationDebug
              />
            </Suspense>
          </div>
          <div className="admin-route-drawing-actions">
            <span>{draftNodes.length} manually placed point{draftNodes.length === 1 ? "" : "s"}</span>
            {!isRouteActive ? (
              <button
                className="admin-btn admin-btn-primary"
                type="button"
                onClick={startRouteDrawing}
              >
                Start drawing
              </button>
            ) : null}
            <button
              className="admin-btn admin-btn-secondary"
              type="button"
              disabled={draftNodes.length === 0 || isRouteFinished}
              onClick={() => setDraftNodes((current) => current.slice(0, -1))}
            >
              Undo point
            </button>
            <button
              className="admin-btn admin-btn-secondary"
              type="button"
              disabled={isRouteFinished}
              onClick={finishRouteDrawing}
            >
              Finish at office
            </button>
            <button
              className="admin-btn admin-btn-primary"
              type="button"
              disabled={!isRouteFinished}
              onClick={saveRouteDrawing}
            >
              Save Route
            </button>
            <button
              className="admin-btn admin-btn-secondary"
              type="button"
              onClick={cancelRouteDrawing}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {graphIssues.length > 0 ? (
        <div className="admin-graph-warning" role="status">
          <strong>Navigation graph needs setup</strong>
          <ul>
            {graphIssues.map((issue, index) => (
              <li key={`${issue.code}-${issue.nodeId || issue.edgeId || index}`}>
                {describeGraphIssue(issue)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {validationMessage ? (
        <p className="admin-form-feedback" role="alert">{validationMessage}</p>
      ) : null}

      <div className="admin-card">
        <div className="admin-card-body" style={{ padding: 0 }}>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Connection</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(isAdding || editingId) &&
                  (() => {
                    const office = isAdding ? form : pathEdges.find((e) => e.id === editingId);
                    if (!office && !isAdding) return null;
                    return (
                      <tr>
                        <td>
                          <select
                            className="admin-node-name-input"
                            value={form.from || ""}
                            onChange={(e) => updateField("from", e.target.value)}
                          >
                            <option value="">Select node</option>
                            {pathNodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.name} ({n.id})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="admin-node-name-input"
                            value={form.to || ""}
                            onChange={(e) => updateField("to", e.target.value)}
                          >
                            <option value="">Select node</option>
                            {pathNodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.name} ({n.id})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="admin-node-name-input"
                            value={form.type || "walk"}
                            onChange={(e) => updateField("type", e.target.value)}
                            aria-label="Connection type"
                          >
                            <option value="walk">Walk</option>
                            <option value="stairs">Stairs</option>
                            <option value="elevator">Elevator</option>
                          </select>
                        </td>
                        <td>
                          <div className="admin-table-actions">
                            <label className="admin-edge-direction">
                              <input
                                type="checkbox"
                                checked={form.bidirectional !== false}
                                onChange={(event) =>
                                  updateField("bidirectional", event.target.checked)
                                }
                              />
                              Two-way
                            </label>
                            <button className="admin-btn admin-btn-primary" onClick={handleSave}>
                              Save
                            </button>
                            <button className="admin-btn admin-btn-secondary" onClick={cancel}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                {pathEdges.map((edge) => {
                  const fromNode = nodeById.get(edge.from);
                  const toNode = nodeById.get(edge.to);
                  return (
                    <tr key={edge.id}>
                      <td>
                        <div className="admin-edge-endpoint">
                          <span className="admin-edge-dot" />
                          {fromNode?.name || edge.from}
                        </div>
                      </td>
                      <td>
                        <div className="admin-edge-endpoint">
                          <span className="admin-edge-dot" />
                          {toNode?.name || edge.to}
                          {edge.bidirectional === false ? <small>One-way</small> : null}
                        </div>
                      </td>
                      <td>{edge.type || "walk"}</td>
                      <td>
                        <div className="admin-table-actions">
                          <button className="admin-icon-btn" onClick={() => startEdit(edge)} title="Edit">
                            <Pencil size={16} />
                          </button>
                          <button
                            className="admin-icon-btn danger"
                            onClick={() => handleDelete(edge.id)}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pathEdges.length === 0 && !isAdding && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                      No path edges configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
