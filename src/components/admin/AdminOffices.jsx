import { useState, useEffect, useMemo } from "react";
import { Building2, Plus, Pencil, Trash2, Search } from "lucide-react";
import {
  loadNavigatorConfig,
  saveNavigatorConfig,
  addOffice,
  updateOffice,
  removeOffice,
} from "../../services/navigatorConfig.js";

export default function AdminOffices() {
  const [config, setConfig] = useState(() => loadNavigatorConfig());
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const handler = () => setConfig(loadNavigatorConfig());
    window.addEventListener("navigator-config-updated", handler);
    return () => window.removeEventListener("navigator-config-updated", handler);
  }, []);

  const offices = useMemo(() => config.offices || [], [config.offices]);
  const floors = useMemo(
    () => (config.floors || []).filter((floor) => floor.enabled !== false),
    [config.floors],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return offices;
    return offices.filter(
      (o) =>
        o.name.toLowerCase().includes(term) ||
        o.category.toLowerCase().includes(term) ||
        o.floor.toLowerCase().includes(term) ||
        o.room.toLowerCase().includes(term)
    );
  }, [offices, search]);

  const save = (nextConfig) => {
    saveNavigatorConfig(nextConfig);
    setConfig(nextConfig);
  };

  const startEdit = (office) => {
    setEditingId(office.id);
    setForm({ ...office });
    setIsAdding(false);
  };

  const startAdd = () => {
    setEditingId(null);
    setForm({
      name: "",
      category: "Public Service",
      floorId: floors[0]?.id || "",
      floor: floors[0]?.label || "1st Floor",
      room: "",
      description: "",
      mapPosition: { x: 50, y: 50 },
      modelObjects: [],
      keywords: [],
    });
    setIsAdding(true);
  };

  const cancel = () => {
    setEditingId(null);
    setIsAdding(false);
    setForm({});
  };

  const handleSave = () => {
    if (!form.name?.trim()) return;
    const next = saveNavigatorConfig({
      ...config,
      offices: isAdding
        ? addOffice(offices, {
            ...form,
            name: form.name.trim(),
            hours: form.hours || "8:00 AM - 5:00 PM",
          })
        : updateOffice(offices, editingId, {
            ...form,
            name: form.name.trim(),
          }),
    });
    save(next);
    cancel();
  };

  const handleDelete = (officeId) => {
    if (!window.confirm("Delete this office?")) return;
    save(saveNavigatorConfig({ ...config, offices: removeOffice(offices, officeId) }));
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h1 className="admin-page-title">Offices</h1>
          <p className="admin-page-subtitle">
            Manage office assignments, rooms, and metadata.
          </p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-mode-badge edit">Edit Mode</span>
          <button className="admin-btn admin-btn-primary" onClick={startAdd}>
            <Plus size={16} style={{ marginRight: 6 }} />
            Add Office
          </button>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-filter-bar">
            <div className="admin-search-wrap">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search offices..."
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
                  <th>Office</th>
                  <th>Category</th>
                  <th>Floor</th>
                  <th>Room</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(isAdding || editingId) &&
                  (() => {
                    const isNew = isAdding;
                    const office = isNew
                      ? form
                      : offices.find((o) => o.id === editingId);
                    if (!office && !isNew) return null;
                    return (
                      <tr>
                        <td>
                          <div className="admin-table-office-cell">
                            <input
                              className="admin-node-name-input"
                              value={form.name || ""}
                              onChange={(e) => updateField("name", e.target.value)}
                              placeholder="Office name"
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            className="admin-node-name-input"
                            value={form.category || ""}
                            onChange={(e) => updateField("category", e.target.value)}
                            placeholder="Category"
                          />
                        </td>
                        <td>
                          <select
                            className="admin-node-name-input"
                            value={form.floorId || floors[0]?.id || ""}
                            onChange={(e) => {
                              const floor = floors.find((item) => item.id === e.target.value);
                              if (floor) {
                                setForm((previous) => ({
                                  ...previous,
                                  floorId: floor.id,
                                  floor: floor.label,
                                }));
                              }
                            }}
                          >
                            {floors.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="admin-node-name-input"
                            value={form.room || ""}
                            onChange={(e) => updateField("room", e.target.value)}
                            placeholder="Room"
                          />
                        </td>
                        <td>
                          <div className="admin-table-actions">
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
                {filtered.map((office) => (
                  <tr key={office.id}>
                    <td>
                      <div className="admin-table-office-cell">
                        <strong>{office.name}</strong>
                        <small>{office.description}</small>
                      </div>
                    </td>
                    <td>
                      <span className="admin-badge-category">{office.category}</span>
                    </td>
                    <td>
                      <span className="admin-badge-floor">{office.floor}</span>
                    </td>
                    <td>{office.room}</td>
                    <td>
                      <div className="admin-table-actions">
                        <button
                          className="admin-icon-btn"
                          onClick={() => startEdit(office)}
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="admin-icon-btn danger"
                          onClick={() => handleDelete(office.id)}
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
                      No offices found.
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
