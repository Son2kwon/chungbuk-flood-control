"use client";

import { useMemo } from "react";
import { OSONG_INCIDENT_TIMELINE } from "@chungbuk/data";
import { useSimulation } from "../../lib/useSimulation";
import { useFullscreen } from "../../lib/useFullscreen";
import { formatClock, formatDate } from "../../lib/format";
import { STATE_STYLES } from "../../lib/stateColors";

/** ControlOrderEngine.acknowledge()가 기록하는 이벤트 reason과 정확히 일치해야 한다. */
const ACKNOWLEDGE_REASON = "통제 지시 수신 확인";

/** ControlOrderEngine.forceActions()의 metadata.forcedAction 코드명 — CLAUDE.md에 고정돼 있다. */
const FORCED_ACTION_LABEL: Record<string, string> = {
  ENTRY_BAN_NOTICE: "진입 금지 알림",
  ADJACENT_SITE_ALERT: "인접 시설 확산 알림",
  PROVINCIAL_REPORT: "도 대책본부 보고",
};

type AckStatus = "미확인" | "확인했으나 미조치";

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
      /** DIRECTED 단계 무응답 재배정/FORCED 전이에 한해, 그 시점까지 수신 확인이 있었는지. */
      ackStatus: AckStatus | null;
      forcedActionLabel: string | null;
    }
  | { kind: "incident"; at: Date; label: string };

export default function AuditPage() {
  const { snapshot } = useSimulation();
  const { ref, isFullscreen, toggle } = useFullscreen<HTMLDivElement>();

  const rows: TimelineRow[] = useMemo(() => {
    const eventRows: TimelineRow[] = snapshot.events.map((e) => {
      const isAutoEscalation = (e.reason ?? "").includes("무응답");
      // "미확인" vs "확인했으나 미조치"는 DIRECTED 단계(T2) 무응답 재배정/FORCED 전이에만
      // 의미가 있다 — RECOMMENDED(T1)는 아직 승인 대기 단계라 "수신 확인" 개념이 없다.
      //
      // alertId(주문) 단위가 아니라 assignmentId(그 시점 담당자의 재직 기간) 단위로 확인
      // 여부를 따진다. 이 이벤트의 metadata.assignmentId는 "방금 무응답으로 만료된"
      // assignment를 가리킨다(ControlOrderEngine.climbOrForce 참고) — 팀장이 확인한 뒤
      // 과장에게 재배정되면, 과장의 무응답은 팀장의 확인과 별개의 assignmentId라 항상
      // "미확인"으로 잡힌다.
      const isDirectedEscalation = isAutoEscalation && e.fromState === "DIRECTED";
      const escalationAssignmentId =
        isDirectedEscalation && typeof e.metadata?.assignmentId === "string" ? e.metadata.assignmentId : null;
      const ackStatus: AckStatus | null = isDirectedEscalation
        ? snapshot.events.some(
            (other) => other.reason === ACKNOWLEDGE_REASON && other.metadata?.assignmentId === escalationAssignmentId,
          )
          ? "확인했으나 미조치"
          : "미확인"
        : null;
      const forcedActionCode = e.metadata?.forcedAction;
      const forcedActionLabel =
        typeof forcedActionCode === "string" ? (FORCED_ACTION_LABEL[forcedActionCode] ?? null) : null;

      return {
        kind: "event",
        at: e.occurredAt,
        siteName: snapshot.siteNameByAlertId[e.alertId] ?? e.alertId,
        fromLabel: STATE_STYLES[e.fromState].label,
        toLabel: STATE_STYLES[e.toState].label,
        actor: e.actor,
        reason: e.reason,
        isAutoEscalation,
        ackStatus,
        forcedActionLabel,
      };
    });
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
              {row.ackStatus && (
                <span
                  className={
                    row.ackStatus === "미확인"
                      ? "audit-badge audit-badge-unacknowledged"
                      : "audit-badge audit-badge-acknowledged-no-action"
                  }
                >
                  {row.ackStatus}
                </span>
              )}
              {row.forcedActionLabel && (
                <span className="audit-badge audit-badge-forced-action">{row.forcedActionLabel}</span>
              )}
              {!row.ackStatus && !row.forcedActionLabel && row.isAutoEscalation && (
                <span className="audit-badge audit-badge-escalation">무응답 자동 에스컬레이션</span>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
