"use client";

import type { SiteSnapshot } from "../lib/simulationStore";
import { STATE_STYLES } from "../lib/stateColors";
import { StateDot } from "./StateDot";
import { formatCountdown, formatLevel } from "../lib/format";

interface ActiveOrderCardProps {
  site: SiteSnapshot;
  isSelected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onOpenReject: () => void;
  onAcknowledge: () => void;
  onReportFieldComplete: () => void;
  onApproveRelease: () => void;
}

const URGENT_THRESHOLD_MS = 60_000;

export function ActiveOrderCard({
  site,
  isSelected,
  onSelect,
  onApprove,
  onOpenReject,
  onAcknowledge,
  onReportFieldComplete,
  onApproveRelease,
}: ActiveOrderCardProps) {
  const style = STATE_STYLES[site.state];
  const urgent = site.remainingMs !== null && site.remainingMs <= URGENT_THRESHOLD_MS;

  return (
    <div className={isSelected ? "card card-selected" : "card"} onClick={onSelect} role="button" tabIndex={0}>
      <div className="card-header">
        <span className="card-title">{site.name}</span>
        <span className="state-badge">
          <StateDot state={site.state} />
          {style.label}
        </span>
      </div>

      <dl className="card-meta">
        <dt>등급</dt>
        <dd>{site.severity ?? "-"}</dd>
        <dt>현재 수위</dt>
        <dd>
          {site.currentLevel !== null ? formatLevel(site.currentLevel) : "-"}
          {site.interpolated ? " (보간)" : ""}
        </dd>
        <dt>임계값(주의보/경보)</dt>
        <dd>
          {formatLevel(site.watchLevel)} / {formatLevel(site.alertLevel)}
        </dd>
        <dt>배정</dt>
        <dd>
          {site.assignedRole ?? "-"} ({site.ladderStep + 1}/{site.ladder.length}단계)
        </dd>
      </dl>

      {site.remainingMs !== null && (
        <div className={urgent ? "card-countdown card-countdown-urgent" : "card-countdown tabular"}>
          {formatCountdown(site.remainingMs)}
          <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 6, color: "var(--text-muted)" }}>남은 시간</span>
        </div>
      )}

      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        {site.state === "RECOMMENDED" && (
          <>
            <button type="button" className="btn btn-primary" onClick={onApprove}>
              승인
            </button>
            <button type="button" className="btn btn-danger" onClick={onOpenReject}>
              기각
            </button>
          </>
        )}
        {site.state === "DIRECTED" && (
          <>
            {site.acknowledged ? (
              <span className="ack-badge">✓ 수신 확인됨</span>
            ) : (
              <button type="button" className="btn" onClick={onAcknowledge}>
                수신 확인
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={onReportFieldComplete}>
              현장완료 보고
            </button>
          </>
        )}
        {site.state === "RELEASE_PENDING" && (
          <button type="button" className="btn btn-primary" onClick={onApproveRelease}>
            해제 승인
          </button>
        )}
        {site.state === "FORCED" && <span style={{ fontSize: 12, color: "var(--state-forced)" }}>수동 개입이 필요합니다.</span>}
      </div>
    </div>
  );
}
