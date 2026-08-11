"use client";

import type { StateTransitionEvent } from "@chungbuk/domain";
import { useSimulation } from "../../lib/useSimulation";
import { formatClock, formatCountdown } from "../../lib/format";

/** 이 배정(alertId) 건이 APPROVED로 (재)들어온 가장 최근 시각 — "배정 시각"으로 보여준다. */
function findAssignedAt(events: readonly StateTransitionEvent[], alertId: string | null): Date | null {
  if (!alertId) return null;
  let latest: Date | null = null;
  for (const e of events) {
    if (e.alertId !== alertId || e.toState !== "APPROVED") continue;
    if (!latest || e.occurredAt.getTime() > latest.getTime()) latest = e.occurredAt;
  }
  return latest;
}

export default function FieldPage() {
  const { snapshot, store } = useSimulation();
  const assigned = snapshot.sites.filter((s) => s.state === "APPROVED");

  return (
    <div className="app-page field-page">
      <header className="field-header">
        <h1>현장 대응팀</h1>
        <span className="tabular field-clock">{formatClock(snapshot.now)}</span>
      </header>

      <div className="scroll-body">
        {assigned.length === 0 && <p className="empty-state">나에게 배정된 통제 요청이 없습니다.</p>}

        {assigned.map((site) => {
          const assignedAt = findAssignedAt(snapshot.events, site.alertId);
          const urgent = site.remainingMs !== null && site.remainingMs <= 60_000;
          return (
            <div className="field-card" key={site.id}>
              <div className="field-card-title">{site.name}</div>
              <dl className="card-meta">
                <dt>배정 시각</dt>
                <dd>{assignedAt ? formatClock(assignedAt) : "-"}</dd>
                <dt>등급</dt>
                <dd>{site.severity ?? "-"}</dd>
              </dl>

              {site.remainingMs !== null && (
                <div className={urgent ? "card-countdown card-countdown-urgent" : "card-countdown tabular"}>
                  {formatCountdown(site.remainingMs)}
                  <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 6, color: "var(--text-muted)" }}>남은 시간</span>
                </div>
              )}

              <div className="field-actions">
                <button
                  type="button"
                  className={site.arrivedOnSite ? "btn btn-field-arrived" : "btn"}
                  onClick={() => store.markArrived(site.id)}
                  disabled={site.arrivedOnSite}
                >
                  {site.arrivedOnSite ? "✓ 현장 도착함" : "현장 도착"}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => store.reportFieldComplete(site.id)}>
                  통제 완료
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
