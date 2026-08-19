/**
 * 참고 사건 (2023 오송 궁평2지하차도 사고). 데모 타임라인 표시용 상수.
 * 도메인 상태기계에는 입력되지 않는다 — 순수 참고/맥락 정보다.
 */
export interface IncidentTimelineEntry {
  at: Date;
  label: string;
}

export const OSONG_INCIDENT_TIMELINE: readonly IncidentTimelineEntry[] = [
  { at: new Date("2023-07-14T17:20:00Z"), label: "금강홍수통제소 홍수주의보 발령 (미호천교)" },
  { at: new Date("2023-07-15T04:10:00Z"), label: "홍수경보 상향 (미호천교)" },
  { at: new Date("2023-07-15T07:01:00Z"), label: "현장 감리단장 1차 신고 (제방 월류 우려)" },
  { at: new Date("2023-07-15T07:56:00Z"), label: "2차 신고 (지하차도 통제 요청)" },
  { at: new Date("2023-07-15T08:30:00Z"), label: "궁평2지하차도 침수 발생" },
];
