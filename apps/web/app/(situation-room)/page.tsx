"use client";

import { useSimulation } from "../../lib/useSimulation";
import { TopBar } from "../../components/TopBar";
import { IncidentBanners } from "../../components/IncidentBanners";
import { SiteMap } from "../../components/SiteMap";
import { ActiveOrdersPanel } from "../../components/ActiveOrdersPanel";
import { LevelChart } from "../../components/LevelChart";

export default function SituationRoomPage() {
  const { snapshot, store } = useSimulation();

  return (
    <div className="app-shell">
      <TopBar snapshot={snapshot} store={store} />
      <IncidentBanners snapshot={snapshot} store={store} />
      <div className="main-grid">
        <SiteMap snapshot={snapshot} store={store} />
        <div className="right-column">
          <ActiveOrdersPanel snapshot={snapshot} store={store} />
          <LevelChart snapshot={snapshot} store={store} />
        </div>
      </div>
    </div>
  );
}
