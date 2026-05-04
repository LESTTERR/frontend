import { Clock3, DoorOpen, Layers, MapPinned, Navigation } from "lucide-react";

export default function OfficeDetails({ office, onSetDestination }) {
  return (
    <div className="office-details">
      <h2>{office.name}</h2>
      <p>{office.description}</p>

      <dl className="detail-list">
        <div>
          <dt>
            <Layers size={17} aria-hidden="true" />
            Floor
          </dt>
          <dd>{office.floor}</dd>
        </div>
        <div>
          <dt>
            <DoorOpen size={17} aria-hidden="true" />
            Room
          </dt>
          <dd>{office.room}</dd>
        </div>
        <div>
          <dt>
            <Clock3 size={17} aria-hidden="true" />
            Office Hours
          </dt>
          <dd>{office.hours}</dd>
        </div>
        <div>
          <dt>
            <MapPinned size={17} aria-hidden="true" />
            Category
          </dt>
          <dd>{office.category}</dd>
        </div>
      </dl>

      <button
        className="direction-button"
        type="button"
        onClick={onSetDestination}
      >
        <Navigation size={19} aria-hidden="true" />
        Set as Destination
      </button>
    </div>
  );
}
