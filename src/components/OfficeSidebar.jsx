import { Search, X } from "lucide-react";

export default function OfficeSidebar({
  offices,
  selectedOfficeId,
  searchTerm,
  onSearchChange,
  onSelectOffice,
}) {
  return (
    <aside className="sidebar" aria-label="Office search">
      <div className="sidebar-header">
        <p className="section-label">Find an Office</p>
        <h2>Where do you want to go?</h2>
      </div>

      <label className="search-box" htmlFor="office-search">
        <Search size={19} aria-hidden="true" />
        <input
          id="office-search"
          type="search"
          value={searchTerm}
          placeholder="Search office, service, or room"
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
              <span className="office-category">{office.category}</span>
              <strong>{office.name}</strong>
              <span>
                {office.floor} · {office.room}
              </span>
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
