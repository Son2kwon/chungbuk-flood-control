import type { AlertState } from "@chungbuk/domain";

export interface StateStyle {
  label: string;
  /** CSS 커스텀 프로퍼티 이름. 실제 라이트/다크 값은 globals.css에서 정의한다. */
  var: string;
}

/**
 * 상태 → 색 매핑. MONITORING/RECOMMENDED/APPROVED/CONTROLLED/FORCED 색은 스펙 지정값
 * (회색/노랑/주황/파랑/빨강)을 그대로 쓴다. REJECTED/RELEASE_PENDING은 스펙에 없어
 * 나머지 팔레트에서 의미가 맞는 색을 골라 확장했다.
 * 색은 항상 상태 라벨 텍스트와 함께 쓴다 — 색만으로 상태를 구분하지 않는다.
 */
export const STATE_STYLES: Record<AlertState, StateStyle> = {
  MONITORING: { label: "평시 감시", var: "--state-monitoring" },
  RECOMMENDED: { label: "통제 권고", var: "--state-recommended" },
  APPROVED: { label: "승인됨 · 현장 배정", var: "--state-approved" },
  CONTROLLED: { label: "통제 완료", var: "--state-controlled" },
  RELEASE_PENDING: { label: "해제 대기", var: "--state-release-pending" },
  REJECTED: { label: "기각", var: "--state-rejected" },
  FORCED: { label: "강제 조치", var: "--state-forced" },
};
