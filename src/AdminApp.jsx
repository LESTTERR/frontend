import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import AdminLogin from "./components/admin/AdminLogin.jsx";
import AdminSidebar from "./components/admin/AdminSidebar.jsx";
import AdminDashboard from "./components/admin/AdminDashboard.jsx";
import AdminOffices from "./components/admin/AdminOffices.jsx";
import AdminFloors from "./components/admin/AdminFloors.jsx";
import AdminMapPins from "./components/admin/AdminMapPins.jsx";
import AdminPaths from "./components/admin/AdminPaths.jsx";
import AdminMunicipality from "./components/admin/AdminMunicipality.jsx";
import { isAdminUnlocked, lockAdmin } from "./services/navigatorConfig.js";
import useNavigatorConfig from "./hooks/useNavigatorConfig.js";

const ADMIN_SECTIONS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview and stats" },
  { id: "offices", label: "Offices", icon: Building2, description: "Manage offices" },
  { id: "floors", label: "Floors", icon: FolderOpen, description: "Floor configurations" },
  { id: "map-pins", label: "Map Pins", icon: MapPinned, description: "Marker positions" },
  { id: "paths", label: "Paths", icon: Route, description: "Route networks" },
  { id: "settings", label: "Settings", icon: Settings, description: "App configuration" },
];

export default function AdminApp() {
  const navigate = useNavigate();
  const { config } = useNavigatorConfig();
  const [isUnlocked, setIsUnlocked] = useState(() => isAdminUnlocked());
  const [activeSection, setActiveSection] = useState("dashboard");
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  );

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--brand-color",
      config.brandColor || "#238b67",
    );
  }, [config.brandColor]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      );
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleUnlock = () => setIsUnlocked(true);
  const handleLogout = () => {
    lockAdmin();
    setIsUnlocked(false);
    navigate("/", { replace: true });
  };

  if (!isUnlocked) {
    return (
      <div className="admin-app">
        <AdminLogin onUnlock={handleUnlock} />
      </div>
    );
  }

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <AdminDashboard />;
      case "offices":
        return <AdminOffices />;
      case "floors":
        return <AdminFloors />;
      case "map-pins":
        return <AdminMapPins />;
      case "paths":
        return <AdminPaths />;
      case "settings":
        return <AdminMunicipality />;
      default:
        return null;
    }
  };

  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <div className="admin-topbar-brand">
            <img
              className="admin-topbar-seal"
              src="/pic/GAPO SEAL copy.png"
              alt=""
            />
            <div>
              <span className="admin-topbar-city">Olongapo City</span>
              <span className="admin-topbar-title">City Hall Navigator - Admin</span>
            </div>
          </div>
        </div>
        <div className="admin-topbar-right">
          <span className="admin-topbar-clock">
            {currentTime}
            <span className="admin-topbar-dot">●</span>
            Admin Mode
          </span>
          <Link to="/" className="admin-topbar-kiosk-btn">
            View Kiosk
          </Link>
          <button className="admin-topbar-logout-btn" onClick={handleLogout} type="button">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      <div className="admin-shell">
        <AdminSidebar
          activeSection={activeSection}
          onNavigate={setActiveSection}
          onLogout={handleLogout}
        />

        <main className="admin-main-content">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
