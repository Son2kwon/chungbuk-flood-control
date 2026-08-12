import type { AlertState } from "@chungbuk/domain";

export interface StateStyle {
  label: string;
  /** CSS 커스텀 프로퍼티 이름. 실제 라이트/다크 값은 globals.css에서 정의한다. */
  var: string;
  /** true면 원(dot)을 채우지 않고 테두리만 그린다 — REJECTED를 "회색 테두리"로 표시하기 위함. */
  outline?: boolean;
}

/**
 * 상태 → 색 매핑. v2 사양 지정값을 그대로 쓴다:
 * MONITORING 회색 / RECOMMENDED 노랑 / DIRECTED 주황 / CONTROLLED 파랑 /
 * RELEASE_PENDING 하늘 / REJECTED 회색 테두리 / FORCED 빨강.
 * 색은 항상 상태 라벨 텍스트와 함께 쓴다 — 색만으로 상태를 구분하지 않는다.
 */
export const STATE_STYLES: Record<AlertState, StateStyle> = {
  MONITORING: { label: "평시 감시", var: "--state-monitoring" },
  RECOMMENDED: { label: "통제 권고", var: "--state-recommended" },
  DIRECTED: { label: "통제 지시 · 현장 조치 중", var: "--state-directed" },
  CONTROLLED: { label: "통제 완료", var: "--state-controlled" },
  RELEASE_PENDING: { label: "해제 대기", var: "--state-release-pending" },
  REJECTED: { label: "기각", var: "--state-rejected", outline: true },
  FORCED: { label: "강제 조치", var: "--state-forced" },
};
