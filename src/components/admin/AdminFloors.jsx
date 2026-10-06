import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Eye, FolderOpen, Plus, Pencil, Trash2 } from "lucide-react";
import useNavigatorConfig from "../../hooks/useNavigatorConfig.js";
import {
  addFloor,
  removeFloor,
  updateFloor,
} from "../../services/navigatorConfig.js";

const ThreeMapViewer = lazy(() => import("../ThreeMapViewer.jsx"));

export default function AdminFloors() {
  const {
    config,
    modelAssetStatus,
    resolvedModelPaths,
    saveConfig,
  } = useNavigatorConfig();
  const [editingId, setEditingId] = useState(null);
  const [previewFloorId, setPreviewFloorId] = useState("");
  const [form, setForm] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const floors = useMemo(() => config.floors || [], [config.floors]);
  const modelGroupNames = config.modelGroupNames || [];

  useEffect(() => {
    if (previewFloorId && !floors.some((floor) => floor.id === previewFloorId)) {
      setPreviewFloorId("");
    }
  }, [floors, previewFloorId]);

  const startEdit = (floor) => {
    setEditingId(floor.id);
    setForm({ ...floor });
    setIsAdding(false);
    setValidationMessage("");
  };

  const startAdd = () => {
    const nextOrder = floors.reduce(
      (maximum, floor) => Math.max(maximum, Number(floor.order ?? floor.number) || 0),
      0,
    ) + 1;
    setEditingId(null);
    setForm({
      id: `floor-${Date.now()}`,
      label: "",
      number: nextOrder,
      order: nextOrder,
      modelPath: "",
      modelGroupName: "",
      enabled: true,
      description: "",
    });
    setIsAdding(true);
    setValidationMessage("");
  };

  const cancel = () => {
    setEditingId(null);
    setIsAdding(false);
    setForm({});
    setValidationMessage("");
  };

  const handleSave = () => {
    const label = String(form.label || "").trim();
    const modelGroupName = String(form.modelGroupName || "").trim();
    const order = Number(form.order);
    if (!label) {
      setValidationMessage("Enter a name for this floor.");
      return;
    }
    if (!Number.isInteger(order) || order < 1) {
      setValidationMessage("Floor order must be a positive whole number.");
      return;
    }
    if (
      floors.some(
        (floor) =>
          floor.id !== editingId &&
          floor.label.trim().toLowerCase() === label.toLowerCase(),
      )
    ) {
      setValidationMessage("Floor names must be unique.");
      return;
    }
    if (
      floors.some(
        (floor) =>
          floor.id !== editingId &&
          Number(floor.order ?? floor.number) === order,
      )
    ) {
      setValidationMessage("Floor order must be unique.");
      return;
    }
    if (
      modelGroupName &&
      floors.some(
        (floor) =>
          floor.id !== editingId && floor.modelGroupName === modelGroupName,
      )
    ) {
      setValidationMessage("Each model group can be assigned to only one floor.");
      return;
    }
    const nextFloors = isAdding
      ? addFloor(floors, { ...form, label, modelGroupName, number: order, order })
      : updateFloor(floors, editingId, { ...form, label, modelGroupName, number: order, order });
    if (!nextFloors.some((floor) => floor.enabled !== false)) {
      setValidationMessage("At least one floor must remain enabled.");
      return;
    }

    saveConfig({ ...config, floors: nextFloors });
    cancel();
  };

  const handleDelete = (floorId) => {
    const isReferenced =
      config.offices.some((office) => office.floorId === floorId) ||
      config.pathNodes.some((node) => node.floorId === floorId);
    if (isReferenced) {
      setValidationMessage(
        "This floor is used by an office or route pin. Reassign those items before deleting the floor.",
      );
      return;
    }
    if (!window.confirm("Delete this floor configuration?")) return;
    const nextFloors = removeFloor(floors, floorId);
    if (!nextFloors.some((floor) => floor.enabled !== false)) {
      setValidationMessage("At least one floor must remain enabled.");
      return;
    }
    saveConfig({ ...config, floors: nextFloors });
    setValidationMessage("");
  };

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
      ...(field === "order" ? { number: Number(value) } : {}),
    }));
    setValidationMessage("");
  };

  const previewFloor = floors.find((floor) => floor.id === previewFloorId);
  const modelName = config.modelFiles.find(
    (file) => file.id === config.buildingModelFileId,
  )?.name;

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h1 className="admin-page-title">Floors</h1>
          <p className="admin-page-subtitle">
            Configure enabled floors and map each floor to a named group in the shared building GLB.
          </p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-mode-badge edit">Edit Mode</span>
          <button className="admin-btn admin-btn-primary" onClick={startAdd} type="button">
            <Plus size={16} aria-hidden="true" /> Add Floor
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-body">
          <p className="admin-floor-model-status">
            Shared model: <strong>{modelName || "Using bundled model"}</strong>
            {modelName
              ? ` · ${modelGroupNames.length} named groups detected`
              : " · upload a GLB in Organization Settings to configure floor groups"}
          </p>
          <div className="admin-floors-list">
            {(isAdding || editingId) ? (
              <div className="admin-floor-item-card admin-floor-editor">
                <div className="admin-floor-edit-fields">
                  <div className="admin-form-group">
                    <label htmlFor="floor-label">Floor name</label>
                    <input
                      id="floor-label"
                      className="admin-node-name-input"
                      value={form.label || ""}
                      onChange={(event) => updateField("label", event.target.value)}
                      placeholder="e.g. Ground Floor or Basement"
                      maxLength={80}
                    />
                  </div>
                  <div className="admin-form-group">
                    <label htmlFor="floor-order">Display / route order</label>
                    <input
                      id="floor-order"
                      className="admin-node-name-input"
                      type="number"
                      min="1"
                      step="1"
                      value={form.order ?? ""}
                      onChange={(event) => updateField("order", event.target.value)}
                    />
                  </div>
                  <div className="admin-form-group">
                    <label htmlFor="floor-group">Model group</label>
                    <input
                      id="floor-group"
                      className="admin-node-name-input"
                      list="floor-group-suggestions"
                      value={form.modelGroupName || ""}
                      onChange={(event) => updateField("modelGroupName", event.target.value)}
                      placeholder="Select or enter exact GLB group name"
                      maxLength={200}
                    />
                    <datalist id="floor-group-suggestions">
                      {modelGroupNames.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                    <small>Choose a detected floor group or enter the exact group name from the GLB hierarchy.</small>
                  </div>
                  <div className="admin-form-group">
                    <label htmlFor="floor-description">Description</label>
                    <textarea
                      id="floor-description"
                      className="admin-node-name-input"
                      value={form.description || ""}
                      onChange={(event) => updateField("description", event.target.value)}
                      rows={2}
                      maxLength={240}
                    />
                  </div>
                  <label className="admin-floor-enabled">
                    <input
                      type="checkbox"
                      checked={form.enabled !== false}
                      onChange={(event) => updateField("enabled", event.target.checked)}
                    />
                    Enabled for navigation
                  </label>
                </div>
                {validationMessage ? <p className="admin-inline-error" role="alert">{validationMessage}</p> : null}
                <div className="admin-header-actions">
                  <button className="admin-btn admin-btn-primary" onClick={handleSave} type="button">Save floor</button>
                  <button className="admin-btn admin-btn-secondary" onClick={cancel} type="button">Cancel</button>
                </div>
              </div>
            ) : null}

            {floors.map((floor) => (
              <div key={floor.id} className={`admin-floor-item-card ${floor.enabled === false ? "is-disabled" : ""}`}>
                <div className="admin-floor-number-badge">{floor.order ?? floor.number}</div>
                <div className="admin-floor-details">
                  <span className="admin-floor-title">{floor.label}</span>
                  <span className="admin-floor-sub">
                    {floor.modelGroupName
                      ? `GLB group: ${floor.modelGroupName}`
                      : "No group assigned"}
                    {floor.enabled === false ? " · Disabled" : ""}
                    {floor.description ? ` · ${floor.description}` : ""}
                  </span>
                </div>
                <div className="admin-header-actions">
                  <button
                    className="admin-icon-btn"
                    type="button"
                    onClick={() => setPreviewFloorId(previewFloorId === floor.id ? "" : floor.id)}
                    aria-pressed={previewFloorId === floor.id}
                    title="Preview floor model"
                  >
                    <Eye size={16} aria-hidden="true" />
                  </button>
                  <button className="admin-icon-btn" type="button" onClick={() => startEdit(floor)} title="Edit floor">
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button className="admin-icon-btn danger" type="button" onClick={() => handleDelete(floor.id)} title="Delete floor">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {validationMessage && !isAdding && !editingId ? (
            <p className="admin-inline-error" role="alert">{validationMessage}</p>
          ) : null}
        </div>
      </div>

      {previewFloor ? (
        <section className="admin-card admin-floor-preview" aria-label={`${previewFloor.label} preview`}>
          <div className="admin-card-body">
            <div className="admin-section-header">
              <div>
                <h2 className="admin-page-title">{previewFloor.label} preview</h2>
                <p className="admin-page-subtitle">
                  {previewFloor.modelGroupName
                    ? `Showing the “${previewFloor.modelGroupName}” group.`
                    : "No named GLB group is assigned; showing the legacy floor-filtered view."}
                </p>
              </div>
              <button className="admin-btn admin-btn-secondary" type="button" onClick={() => setPreviewFloorId("")}>
                Close preview
              </button>
            </div>
            <div className="admin-floor-preview-viewer">
              {modelAssetStatus === "loading" ? (
                <div className="viewer-status" role="status">Loading saved building model...</div>
              ) : modelAssetStatus === "missing" ? (
                <div className="viewer-status error" role="alert">The selected GLB is missing from this browser.</div>
              ) : (
                <Suspense fallback={<div className="viewer-status">Loading 3D preview...</div>}>
                  <ThreeMapViewer
                    offices={config.offices}
                    floors={floors}
                    modelPaths={resolvedModelPaths}
                    pathNodes={[]}
                    pathEdges={[]}
                    selectedOffice={null}
                    viewCommand={{
                      type: "focus-floor",
                      payload: { floor: previewFloor.label },
                      sequence: 1,
                    }}
                    editFloor={previewFloor.label}
                    waypointEditMode
                    isolatedFloorView
                    showOfficeLabels={false}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
