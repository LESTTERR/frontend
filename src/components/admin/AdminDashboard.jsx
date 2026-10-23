import { useState, useEffect, useMemo } from "react";
import { Building2, FolderOpen, MapPinned, Route, Activity } from "lucide-react";
import { loadNavigatorConfig } from "../../services/navigatorConfig.js";

export default function AdminDashboard() {
  const [config, setConfig] = useState(() => loadNavigatorConfig());

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
  const pathNodes = useMemo(() => config.pathNodes || [], [config.pathNodes]);
  const pathEdges = useMemo(() => config.pathEdges || [], [config.pathEdges]);

  const stats = [
    {
      label: "Total Offices",
      value: String(offices.length),
      change: `Across ${floors.length} floors`,
      icon: Building2,
      color: "green",
    },
    {
      label: "Active Floors",
      value: String(floors.length),
      change: floors.map((f) => f.label).join(", ") || "None",
      icon: FolderOpen,
      color: "blue",
    },
    {
      label: "Map Pins",
      value: String(pathNodes.length),
      change: `${pathNodes.filter((n) => n.type === "entrance").length} entry points`,
      icon: MapPinned,
      color: "amber",
    },
    {
      label: "Path Edges",
      value: String(pathEdges.length),
      change: pathEdges.length > 0 ? "Connected" : "Disconnected",
      icon: Route,
      color: "purple",
    },
  ];

  const categoryCounts = useMemo(() => {
    const counts = {};
    offices.forEach((o) => {
      counts[o.category] = (counts[o.category] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [offices]);

  const floorCounts = useMemo(() => {
    const counts = {};
    offices.forEach((o) => {
      counts[o.floor] = (counts[o.floor] || 0) + 1;
    });
    return floors.map((f) => ({
      label: f.label,
      count: counts[f.label] || 0,
    }));
  }, [offices, floors]);

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h1 className="admin-page-title">Dashboard</h1>
          <p className="admin-page-subtitle">
            Overview of your City Hall Navigator configuration
          </p>
        </div>
        <div className="admin-header-actions">
          <span className="admin-header-badge">● System Online</span>
          <span className="admin-mode-badge view">View Mode</span>
        </div>
      </div>

      <div className="admin-stats-grid">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="admin-stat-card">
              <div className={`admin-stat-icon-wrap ${stat.color}`}>
                <Icon size={24} />
              </div>
              <div className="admin-stat-content">
                <span className="admin-stat-value">{stat.value}</span>
                <span className="admin-stat-label">{stat.label}</span>
              </div>
              <span className="admin-stat-arrow">→</span>
            </div>
          );
        })}
      </div>

      <div className="admin-dashboard-row">
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Floor Distribution</h3>
            <span className="admin-card-badge">{floors.length} floors</span>
          </div>
          <div className="admin-card-body">
            <div className="admin-floor-distribution-list">
              {floorCounts.map((floor) => (
                <div key={floor.label} className="admin-floor-distribution-item">
                  <div className="floor-dist-info">
                    <span className="floor-dist-badge">
                      {floor.label.charAt(0)}F
                    </span>
                    <strong>{floor.label}</strong>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 999,
                      background: "#e2e8f0",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, floor.count * 12 + 20)}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: "var(--green)",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "0.82rem", color: "var(--muted)", fontWeight: 600 }}>
                    {floor.count} offices
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Categories</h3>
            <span className="admin-card-badge">{categoryCounts.length} categories</span>
          </div>
          <div className="admin-card-body">
            <div className="admin-floor-distribution-list">
              {categoryCounts.map(([category, count]) => (
                <div key={category} className="admin-floor-distribution-item">
                  <div className="floor-dist-info">
                    <span className="floor-dist-badge" style={{ background: "#f1f5f9", color: "#475569" }}>
                      {count}
                    </span>
                    <strong>{category}</strong>
                  </div>
                </div>
              ))}
              {categoryCounts.length === 0 && (
                <div style={{ padding: 16, color: "var(--muted)", textAlign: "center" }}>
                  No offices configured
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3>Recent Activity</h3>
          <span className="admin-card-badge">Live</span>
        </div>
        <div className="admin-card-body">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {[
              `Navigator config updated: ${offices.length} offices, ${floors.length} floors`,
              `Path network: ${pathNodes.length} nodes, ${pathEdges.length} edges`,
              `Brand: ${config.cityName} - ${config.navigatorTitle}`,
              `Last updated: ${config.updatedAt ? new Date(config.updatedAt).toLocaleString() : "Unknown"}`,
            ].map((activity) => (
              <div
                key={activity}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#fafcfb",
                  border: "1px solid var(--line)",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--green)",
                  }}
                />
                <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>{activity}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
