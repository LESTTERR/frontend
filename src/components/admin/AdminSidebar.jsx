import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  MapPinned,
  FolderOpen,
  Building2,
  Route,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";

const ADMIN_SECTIONS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview and stats" },
  { id: "offices", label: "Offices", icon: Building2, description: "Manage offices" },
  { id: "floors", label: "Floors", icon: FolderOpen, description: "Floor configurations" },
  { id: "map-pins", label: "Map Pins", icon: MapPinned, description: "Marker positions" },
  { id: "paths", label: "Paths", icon: Route, description: "Route networks" },
  { id: "settings", label: "Settings", icon: Settings, description: "App configuration" },
];

export default function AdminSidebar({ activeSection, onNavigate, onLogout }) {
  return (
    <nav className="admin-sidebar">
      <div className="admin-sidebar-header">
        <div className="admin-sidebar-brand">
          <div className="admin-brand-icon">
            <LayoutDashboard size={20} />
          </div>
          <div>
            <span className="admin-brand-kicker">Administration</span>
            <strong className="admin-brand-title">Control Panel</strong>
          </div>
        </div>
      </div>

      <div className="admin-sidebar-nav">
        <p className="admin-nav-section-title">Main Menu</p>
        <ul className="admin-nav-list">
          {ADMIN_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <li key={section.id}>
                <button
                  className={`admin-nav-item ${isActive ? "active" : ""}`}
                  onClick={() => onNavigate(section.id)}
                >
                  <span className="admin-nav-icon">
                    <Icon size={18} />
                  </span>
                  <span className="admin-nav-text">
                    <span className="admin-nav-label">{section.label}</span>
                    <span className="admin-nav-sub">{section.description}</span>
                  </span>
                  {isActive && <span className="admin-nav-badge">Active</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="admin-sidebar-footer">
        <Link to="/" className="admin-footer-link">
          <ChevronRight size={16} />
          Back to Navigator
        </Link>
        <button
          className="admin-footer-link logout-btn"
          onClick={onLogout}
          type="button"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </nav>
  );
}
