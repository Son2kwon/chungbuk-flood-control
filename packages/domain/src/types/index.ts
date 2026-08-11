/**
 * Severity 등급. 값 크기 순서: WATCH < ALERT < SEVERE.
 */
export type Severity = "WATCH" | "ALERT" | "SEVERE";

export const SEVERITY_ORDER: Record<Severity, number> = {
  WATCH: 0,
  ALERT: 1,
  SEVERE: 2,
};

export type AlertState =
  | "MONITORING"
  | "RECOMMENDED"
  | "APPROVED"
  | "CONTROLLED"
  | "RELEASE_PENDING"
  | "REJECTED"
  | "FORCED";

/** 통제 권고 사다리 단계 초과 시 다음으로 넘어가는 담당자/직책 순서. index 0 = 1차 담당자, 마지막 = 최상단. */
export type Ladder = readonly string[];

export interface EscalationTimers {
  /** RECOMMENDED 단계 타이머 (등급별). 단위: ms */
  t1: Record<Severity, number>;
  /** APPROVED 단계 타이머. 단위: ms */
  t2: number;
  /** RELEASE_PENDING 단계 타이머. 단위: ms */
  t3: number;
  /** CONTROLLED 상태에서 해제 후보로 전이되기까지 요구되는 지속 저수위 시간. 단위: ms */
  releaseSustainMs: number;
}

export const DEFAULT_TIMERS: EscalationTimers = {
  t1: {
    WATCH: 30 * 60_000,
    ALERT: 15 * 60_000,
    SEVERE: 5 * 60_000,
  },
  t2: 20 * 60_000,
  t3: 60 * 60_000,
  releaseSustainMs: 30 * 60_000,
};

export interface SiteConfig {
  id: string;
  name: string;
  gaugeId: string;
  watchLevel: number;
  alertLevel: number;
  ladder: Ladder;
  timers?: Partial<EscalationTimers>;
}
