import {
  Building2,
  ChevronRight,
  Landmark,
  Layers,
  MapPinned,
  Navigation,
  Search,
  X,
} from "lucide-react";

export default function OfficeSidebar({
  offices,
  selectedOffice,
  selectedOfficeId,
  searchTerm,
  onSearchChange,
  onSelectOffice,
}) {
  return (
    <aside className="sidebar" aria-label="Office search">
      <div className="sidebar-brand-panel">
        <div className="sidebar-brand-row">
          <span className="sidebar-brand-icon" aria-hidden="true">
            <MapPinned size={22} />
          </span>
          <div>
            <p>City Hall</p>
            <strong>Navigator</strong>
          </div>
        </div>
      </div>

      <div className="sidebar-search-panel">
        <div className="sidebar-search-heading">
          <Search size={16} aria-hidden="true" />
          <span>Search</span>
        </div>

        <label className="search-box" htmlFor="office-search">
          <Search size={20} aria-hidden="true" />
          <input
            id="office-search"
            type="search"
            value={searchTerm}
            placeholder="Find an office or department..."
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {searchTerm ? (
            <button
              className="clear-search"
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>

      {selectedOffice ? (
        <div className="active-destination">
          <span className="active-destination-icon" aria-hidden="true">
            <Navigation size={18} />
          </span>
          <div>
            <strong>Navigating to</strong>
            <span>
              {selectedOffice.name} - {selectedOffice.floor} - {selectedOffice.room}
            </span>
          </div>
          <em>Active</em>
        </div>
      ) : null}

      <div className="office-section-heading">
        <span />
        <strong>{searchTerm ? "Search Results" : "All Offices"}</strong>
      </div>

      <div className="office-list" role="list">
        {offices.length > 0 ? (
          offices.map((office) => (
            <button
              className={`office-card ${
                selectedOfficeId === office.id ? "active" : ""
              }`}
              key={office.id}
              type="button"
              onClick={() => onSelectOffice(office.id)}
            >
              <span className="office-card-icon" aria-hidden="true">
                {office.id === "mayors-office" ? (
                  <Landmark size={24} />
                ) : (
                  <Building2 size={24} />
                )}
              </span>
              <span className="office-card-copy">
                <strong>{office.name}</strong>
                <span className="office-floor-pill">
                  <Layers size={14} aria-hidden="true" />
                  {office.floor}
                </span>
              </span>
              <ChevronRight className="office-card-arrow" size={18} aria-hidden="true" />
            </button>
          ))
        ) : (
          <div className="empty-state">
            <strong>No office found</strong>
            <span>Try searching for Mayor, Treasurer, permit, or health.</span>
          </div>
        )}
      </div>
    </aside>
  );
}
