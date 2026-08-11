"use client";

import { useSimulation } from "../../lib/useSimulation";
import { formatClock } from "../../lib/format";

export default function NotifyPage() {
  const { snapshot } = useSimulation();
  const sorted = [...snapshot.notifications].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

  return (
    <div className="app-page">
      <div className="panel-header">
        <span>주민 알림 ({sorted.length})</span>
      </div>

      <div className="notice-banner">
        이 화면은 발송 mock입니다 — 실제로 문자가 나가지 않습니다. 실제 운영 시 긴급재난문자(CBS)와 연동됩니다.
      </div>

      <div className="scroll-body">
        {sorted.length === 0 && (
          <p className="empty-state">아직 발송된 알림이 없습니다. 상황실에서 통제 권고를 승인하면 자동 생성됩니다.</p>
        )}
        {sorted.map((n) => (
          <div className="card notify-card" key={n.id}>
            <div className="card-header">
              <span className="card-title">{n.targetArea}</span>
              <span className="tabular notify-time">{formatClock(n.sentAt)} 발송</span>
            </div>
            <p className="notify-message">{n.message}</p>
            <p className="notify-detour">우회 안내: {n.detour}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
