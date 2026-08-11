"use client";

import { useState } from "react";
import type { SimulationSnapshot, SimulationStore } from "../lib/simulationStore";
import { ActiveOrderCard } from "./ActiveOrderCard";
import { RejectModal } from "./RejectModal";

const ACTIVE_STATES = new Set(["RECOMMENDED", "APPROVED", "RELEASE_PENDING", "FORCED"]);

interface ActiveOrdersPanelProps {
  snapshot: SimulationSnapshot;
  store: SimulationStore;
}

export function ActiveOrdersPanel({ snapshot, store }: ActiveOrdersPanelProps) {
  const [rejectTargetSiteId, setRejectTargetSiteId] = useState<string | null>(null);
  const activeSites = snapshot.sites.filter((site) => ACTIVE_STATES.has(site.state));
  const rejectTarget = rejectTargetSiteId ? snapshot.sites.find((s) => s.id === rejectTargetSiteId) : undefined;

  return (
    <section className="panel">
      <div className="panel-header">
        <span>활성 권고 ({activeSites.length})</span>
        {snapshot.errorMessage && <span style={{ color: "var(--state-forced)", fontWeight: 500 }}>{snapshot.errorMessage}</span>}
      </div>
      <div className="scroll-body">
        {activeSites.length === 0 && <p className="empty-state">현재 대응이 필요한 통제 권고가 없습니다.</p>}
        {activeSites.map((site) => (
          <ActiveOrderCard
            key={site.id}
            site={site}
            isSelected={site.id === snapshot.selectedSiteId}
            onSelect={() => store.selectSite(site.id)}
            onApprove={() => store.approve(site.id)}
            onOpenReject={() => setRejectTargetSiteId(site.id)}
            onReportFieldComplete={() => store.reportFieldComplete(site.id)}
            onApproveRelease={() => store.approveRelease(site.id)}
          />
        ))}
      </div>

      {rejectTarget && (
        <RejectModal
          siteName={rejectTarget.name}
          onCancel={() => setRejectTargetSiteId(null)}
          onSubmit={(reason) => {
            store.reject(rejectTarget.id, reason);
            setRejectTargetSiteId(null);
          }}
        />
      )}
    </section>
  );
}
