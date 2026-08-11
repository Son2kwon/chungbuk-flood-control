"use client";

import type { SimulationSnapshot, SimulationStore } from "../lib/simulationStore";
import { formatClock } from "../lib/format";

interface IncidentBannersProps {
  snapshot: SimulationSnapshot;
  store: SimulationStore;
}

export function IncidentBanners({ snapshot, store }: IncidentBannersProps) {
  if (snapshot.reachedIncidents.length === 0) return null;

  return (
    <div>
      {snapshot.reachedIncidents.map((incident) => (
        <div className="incident-banner" key={incident.label}>
          <span className="incident-banner-time tabular">{formatClock(incident.at)}</span>
          <span>{incident.label}</span>
          <button
            type="button"
            className="incident-banner-dismiss"
            aria-label="배너 닫기"
            onClick={() => store.dismissIncident(incident.label)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
