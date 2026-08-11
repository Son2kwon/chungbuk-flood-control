"use client";

import { useMemo } from "react";
import { OSONG_INCIDENT_TIMELINE } from "@chungbuk/data";
import { useSimulation } from "../../lib/useSimulation";
import { useFullscreen } from "../../lib/useFullscreen";
import { formatClock, formatDate } from "../../lib/format";
import { STATE_STYLES } from "../../lib/stateColors";

type TimelineRow =
  | {
      kind: "event";
      at: Date;
      siteName: string;
      fromLabel: string;
      toLabel: string;
      actor: string;
      reason: string | undefined;
      isAutoEscalation: boolean;
    }
  | { kind: "incident"; at: Date; label: string };

export default function AuditPage() {
  const { snapshot } = useSimulation();
  const { ref, isFullscreen, toggle } = useFullscreen<HTMLDivElement>();

  const rows: TimelineRow[] = useMemo(() => {
    const eventRows: TimelineRow[] = snapshot.events.map((e) => ({
      kind: "event",
      at: e.occurredAt,
      siteName: snapshot.siteNameByAlertId[e.alertId] ?? e.alertId,
      fromLabel: STATE_STYLES[e.fromState].label,
      toLabel: STATE_STYLES[e.toState].label,
      actor: e.actor,
      reason: e.reason,
      isAutoEscalation: (e.reason ?? "").includes("무응답"),
    }));
    const incidentRows: TimelineRow[] = OSONG_INCIDENT_TIMELINE.filter(
      (entry) => entry.at.getTime() <= snapshot.now.getTime(),
    ).map((entry) => ({ kind: "incident", at: entry.at, label: entry.label }));

    return [...eventRows, ...incidentRows].sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [snapshot.events, snapshot.siteNameByAlertId, snapshot.now]);

  return (
    <div ref={ref} className={isFullscreen ? "audit-page audit-fullscreen" : "audit-page"}>
      <header className="audit-header">
        <div>
          <h1 className="audit-title">감사 로그</h1>
          <span className="audit-subtitle tabular">
            {formatDate(snapshot.now)} · {formatClock(snapshot.now)} 기준 · 총 {rows.length}건
          </span>
        </div>
        <button type="button" className="btn" onClick={toggle}>
          {isFullscreen ? "전체화면 종료" : "전체화면"}
        </button>
      </header>

      <div className="audit-legend">
        <span className="state-badge">
          <span className="audit-swatch audit-swatch-escalation" />
          무응답으로 인한 자동 에스컬레이션
        </span>
        <span className="state-badge">
          <span className="audit-swatch audit-swatch-incident" />
          실제 사건 (참고 타임라인)
        </span>
      </div>

      <div className="audit-timeline">
        {rows.length === 0 && <p className="empty-state">아직 기록된 이벤트가 없습니다.</p>}

        {rows.map((row, i) =>
          row.kind === "incident" ? (
            <div className="audit-row audit-row-incident" key={`incident-${i}`}>
              <span className="audit-time tabular">{formatClock(row.at)}</span>
              <span className="audit-badge audit-badge-incident">실제 사건</span>
              <span className="audit-desc">{row.label}</span>
            </div>
          ) : (
            <div className={row.isAutoEscalation ? "audit-row audit-row-escalation" : "audit-row"} key={`event-${i}`}>
              <span className="audit-time tabular">{formatClock(row.at)}</span>
              <span className="audit-site">{row.siteName}</span>
              <span className="audit-transition">
                {row.fromLabel} → {row.toLabel}
              </span>
              <span className="audit-actor">{row.actor}</span>
              <span className="audit-reason">{row.reason ?? "-"}</span>
              {row.isAutoEscalation && <span className="audit-badge audit-badge-escalation">무응답 자동 에스컬레이션</span>}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
