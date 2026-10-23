import { lazy, Suspense, useState, useMemo } from "react";
import { MapPinned, Plus, Trash2, Pencil } from "lucide-react";
import {
  addPathNode,
  updatePathNode,
  removePathNode,
  saveNavigatorConfig,
} from "../../services/navigatorConfig.js";
import useNavigatorConfig from "../../hooks/useNavigatorConfig.js";

const ThreeMapViewer = lazy(() => import("../ThreeMapViewer.jsx"));
const NODE_TYPES = ["waypoint", "office", "entrance"];

export default function AdminMapPins() {
  const { config, resolvedModelPaths } = useNavigatorConfig();
  const floors = useMemo(
    () => (config.floors || []).filter((floor) => floor.enabled !== false),
    [config.floors],
  );
  const [selectedFloorLabel, setSelectedFloorLabel] = useState(
    () => floors[0]?.label || "1st Floor",
  );
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [viewerCommand, setViewerCommand] = useState({
    type: "focus-floor",
    payload: { floor: floors[0]?.label || "1st Floor" },
    sequence: 1,
  });

  const pathNodes = useMemo(() => config.pathNodes || [], [config.pathNodes]);
  const viewerNodes = useMemo(() => {
    if (isAdding && form.position) {
      return [
        ...pathNodes,
        {
          ...form,
          id: form.id || "pending-waypoint",
          name: form.name || "New pin",
          floor: selectedFloorLabel,
          floorId: floors.find((floor) => floor.label === selectedFloorLabel)?.id,
        },
      ];
    }
    if (editingId && form.position) {
      return pathNodes.map((node) =>
        node.id === editingId ? { ...node, ...form } : node,
      );
    }
    return pathNodes;
  }, [editingId, floors, form, isAdding, pathNodes, selectedFloorLabel]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return pathNodes;
    return pathNodes.filter(
      (n) =>
        n.name.toLowerCase().includes(term) ||
        n.type.toLowerCase().includes(term) ||
        n.floor.toLowerCase().includes(term)
    );
  }, [pathNodes, search]);

  const save = (nextConfig) => {
    return saveNavigatorConfig(nextConfig);
  };

  const startEdit = (node) => {
    setEditingId(node.id);
    setForm({ ...node, position: node.position ? { ...node.position } : null });
    setIsAdding(false);
    setValidationMessage("");
  };

  const startAdd = () => {
    setEditingId(null);
    setForm({
      id: `node-${Date.now()}`,
      name: "",
      type: "waypoint",
      floor: selectedFloorLabel,
      floorId: floors.find((floor) => floor.label === selectedFloorLabel)?.id,
      position: null,
      mapPosition: { x: 50, y: 50 },
      officeId: "",
    });
    setIsAdding(true);
    setValidationMessage("Click a point on the model to place this waypoint.");
  };

  const cancel = () => {
    setEditingId(null);
    setIsAdding(false);
    setForm({});
    setValidationMessage("");
  };

  const handleSave = () => {
    if (!form.name?.trim()) {
      setValidationMessage("Enter a name for this waypoint.");
      return;
    }

    if (!form.position) {
      setValidationMessage("Place the waypoint on the 3D model before saving.");
      return;
    }

    if (form.type === "office" && !form.officeId) {
      setValidationMessage("Link this office waypoint to an office destination.");
      return;
    }

    if (pathNodes.some((node) => node.id === form.id && node.id !== editingId)) {
      setValidationMessage("That waypoint ID is already in use. Use a different ID.");
      return;
    }

    const next = {
      ...config,
      startNodeId: config.startNodeId,
      pathNodes: isAdding
        ? addPathNode(pathNodes, form)
        : updatePathNode(pathNodes, editingId, form),
    };
    if (!save(next)) {
      setValidationMessage("Unable to save. Storage may be full or unavailable.");
      return;
    }
    cancel();
  };

  const handleDelete = (nodeId) => {
    if (!window.confirm("Delete this path node?")) return;
    const remainingNodes = removePathNode(pathNodes, nodeId);
    const next = {
      ...config,
      startNodeId:
        config.startNodeId === nodeId
          ? remainingNodes.find((node) => node.type === "kiosk")?.id || ""
          : config.startNodeId,
      pathNodes: remainingNodes,
      pathEdges: (config.pathEdges || []).filter(
        (edge) => edge.from !== nodeId && edge.to !== nodeId,
      ),
    };
    save(next);
  };

  const updateField = (field, value) => {
    if (field === "floorId") {
      const floor = floors.find((entry) => entry.id === value);
      if (floor) {
        setForm((prev) => ({ ...prev, floorId: floor.id, floor: floor.label }));
        showEditorFloor(floor.label);
      }
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "floor") showEditorFloor(value);
  };

  const updatePosition = (axis, value) => {
    setForm((prev) => ({
      ...prev,
      position: {
        ...(prev.position || { x: 0, y: 0, z: 0 }),
        [axis]: value === "" ? null : Number(value),
      },
    }));
  };

  const handlePlaceWaypoint = (position) => {
    if (!isAdding) return;
    setForm((previous) => ({ ...previous, position }));
    setValidationMessage("Position selected. Save the waypoint to keep it.");
  };

  const handleMoveWaypoint = (nodeId, position) => {
    if (isAdding) return;
    const node = pathNodes.find((pathNode) => pathNode.id === nodeId);
    if (!node) return;
    setEditingId(nodeId);
    setIsAdding(false);
    setForm((previous) => ({
      ...(editingId === nodeId ? previous : node),
      position,
    }));
    setValidationMessage("Position changed. Save the waypoint to keep the edit.");
  };

  const showEditorFloor = (floor) => {
    setSelectedFloorLabel(floor);
    const selectedFloor = floors.find((entry) => entry.label === floor);
    if (isAdding) {
      setForm((previous) => ({
        ...previous,
        floor,
        floorId: selectedFloor?.id || previous.floorId,
      }));
    }
    setViewerCommand((current) => ({
      type: "focus-floor",
      payload: { floor },
      sequence: current.sequence + 1,
    }));
  };

  const setStartNode = (node) => {
    save({ ...config, startNodeId: node.id });
    setValidationMessage(`${node.name} is now the kiosk route start.`);
  };

  const typeColor = (type) => {
    switch (type) {
      case "kiosk":
        return "#22c55e";
      case "stairs":
      case "stair":
        return "#3b82f6";
      case "elevator":
        return "#a855f7";
      case "office":
        return "#ef4444";
      case "entrance":
        return "#0891b2";
      default:
        return "#f59e0b";
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h1 className="admin-page-title">Map Pins</h1>
          <p className="admin-page-subtitle">
            Place pins on the existing model and explicitly connect safe
            walkable paths. Place office pins at accessible doorways, not room
            centers. Pins are not automatically routable.
          </p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-mode-badge edit">Edit Mode</span>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>3D map pin editor</h3>
            <p>
              {isAdding
                ? "Click the model where the new waypoint belongs."
                : "Select Edit, then drag a marker to adjust it. Coordinates are stored in model-local units."}
            </p>
          </div>
          <span className="admin-badge-floor">
            Start: {pathNodes.find((node) => node.id === config.startNodeId)?.name || "Kiosk not configured"}
          </span>
        </div>
        <div className="admin-waypoint-floor-controls" aria-label="Waypoint editor floor">
          <span>EDITING {selectedFloorLabel.toUpperCase()}</span>
          {floors.map((floor) => (
            <button
              type="button"
              key={floor.id}
              aria-pressed={selectedFloorLabel === floor.label}
              onClick={() => showEditorFloor(floor.label)}
            >
              {floor.label}
            </button>
          ))}
          <button
            className="admin-btn admin-btn-primary admin-add-pin-button"
            type="button"
            onClick={startAdd}
          >
            <Plus size={16} style={{ marginRight: 6 }} />
            Add Pin
          </button>
        </div>
        {isAdding ? (
          <div className="admin-pin-placement-toolbar">
            <label>
              Pin type
              <select
                value={form.type || "waypoint"}
                onChange={(event) => updateField("type", event.target.value)}
              >
                {NODE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <span>
              Click the visible {selectedFloorLabel} to place this pin. Its
              coordinate form will appear below the map.
            </span>
          </div>
        ) : null}
        <div className="admin-waypoint-viewer">
          <Suspense
            fallback={
              <div className="viewer-status" role="status">
                Loading waypoint editor...
              </div>
            }
          >
            <ThreeMapViewer
              offices={config.offices}
              floors={config.floors}
              modelPaths={resolvedModelPaths}
              pathNodes={viewerNodes}
              pathEdges={config.pathEdges || []}
              startNodeId={config.startNodeId}
              viewCommand={viewerCommand}
              editFloor={selectedFloorLabel}
              isolatedFloorView
              waypointEditMode
              selectedWaypointId={isAdding ? null : editingId}
              isPlacingWaypoint={isAdding}
              onWaypointPlace={handlePlaceWaypoint}
              onWaypointPositionChange={handleMoveWaypoint}
              showNavigationDebug
            />
          </Suspense>
        </div>
      </div>

      {validationMessage ? (
        <p className="admin-form-feedback" role="status">
          {validationMessage}
        </p>
      ) : null}

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-filter-bar">
            <div className="admin-search-wrap">
              <MapPinned size={16} />
              <input
                type="text"
                placeholder="Search pins..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="admin-card-body" style={{ padding: 0 }}>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Floor</th>
                  <th>Position</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(isAdding || editingId) &&
                  (() => {
                    const node = isAdding ? form : pathNodes.find((item) => item.id === editingId);
                    if (!node && !isAdding) return null;
                    return (
                      <tr>
                        <td>
                          <input
                            className="admin-node-name-input"
                            value={form.name || ""}
                            onChange={(e) => updateField("name", e.target.value)}
                            placeholder="Node name"
                          />
                        </td>
                        <td>
                          <select
                            className="admin-node-name-input"
                            value={form.type || "waypoint"}
                            onChange={(e) => updateField("type", e.target.value)}
                          >
                            {NODE_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="admin-node-name-input"
                            value={form.floorId || floors[0]?.id || ""}
                            onChange={(e) => updateField("floorId", e.target.value)}
                          >
                            {floors.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="admin-coord-view-pill">
                            {["x", "y", "z"].map((axis) => (
                              <label key={axis}>
                                <span>{axis.toUpperCase()}:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="admin-node-name-input"
                                  style={{ width: 74 }}
                                  value={form.position?.[axis] ?? ""}
                                  onChange={(event) =>
                                    updatePosition(axis, event.target.value)
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="admin-table-actions">
                            {form.type === "office" ? (
                              <select
                                className="admin-node-name-input"
                                value={form.officeId || ""}
                                onChange={(event) =>
                                  updateField("officeId", event.target.value)
                                }
                                aria-label="Office destination linked to waypoint"
                              >
                                <option value="">Link office</option>
                                {config.offices.map((office) => (
                                  <option key={office.id} value={office.id}>
                                    {office.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}
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
                {filtered.map((node) => (
                  <tr key={node.id}>
                    <td>
                      <div className="admin-table-office-cell">
                        <strong>{node.name}</strong>
                        <small>{node.id}</small>
                        {node.id === config.startNodeId ? <small>START NODE</small> : null}
                        {node.officeId ? (
                          <small>
                            Destination: {config.offices.find((office) => office.id === node.officeId)?.name || node.officeId}
                          </small>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span
                        className="admin-node-type-dot"
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: typeColor(node.type),
                          marginRight: 8,
                        }}
                      />
                      {node.type}
                    </td>
                    <td>
                      <span className="admin-badge-floor">{node.floor}</span>
                    </td>
                    <td>
                      <span className="admin-node-coords">
                        {node.position
                          ? `${node.position.x.toFixed(2)}, ${node.position.y.toFixed(2)}, ${node.position.z.toFixed(2)}`
                          : "Not placed"}
                      </span>
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        {node.type === "kiosk" && node.id !== config.startNodeId ? (
                          <button
                            className="admin-btn admin-btn-secondary"
                            type="button"
                            onClick={() => setStartNode(node)}
                          >
                            Set as start
                          </button>
                        ) : null}
                        <button className="admin-icon-btn" onClick={() => startEdit(node)} title="Edit and drag waypoint">
                          <Pencil size={16} />
                        </button>
                        <button
                          className="admin-icon-btn danger"
                          onClick={() => handleDelete(node.id)}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !isAdding && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                      No waypoints found.
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
