/**
 * Severity 등급. 값 크기 순서: WARN < ALERT < DESIGN_FLOOD < INUNDATION.
 * 순차 진행이 아니라 병렬 조건이며, 먼저 걸리는 것이 발동하고 상위 등급 도달 시 즉시 승격한다.
 * WARN/ALERT/DESIGN_FLOOD는 게이지 수위로 자동 판정한다(control/severity.ts).
 * INUNDATION(시설 침수심 ≥5cm)은 게이지 수위와 다른 물리량이라 자동 판정하지 않고,
 * ControlOrderEngine.reportInundation()을 통한 수동 보고로만 도달한다.
 */
export type Severity = "WARN" | "ALERT" | "DESIGN_FLOOD" | "INUNDATION";

export const SEVERITY_ORDER: Record<Severity, number> = {
  WARN: 0,
  ALERT: 1,
  DESIGN_FLOOD: 2,
  INUNDATION: 3,
};

export type AlertState =
  | "MONITORING"
  | "RECOMMENDED"
  | "DIRECTED"
  | "CONTROLLED"
  | "RELEASE_PENDING"
  | "REJECTED"
  | "FORCED";

/**
 * 통제 권고 사다리 단계 초과 시 다음으로 넘어가는 담당자/직책 순서.
 * index 0 = 1차 담당자(담당 공무원), 마지막 = 최상단(부단체장).
 */
export type Ladder = readonly string[];

export interface EscalationTimers {
  /** RECOMMENDED 단계 타이머. WARN 등급에서만 RECOMMENDED에 머무르므로 단일 값이다. 단위: ms */
  t1: number;
  /** DIRECTED 단계 타이머 (등급별). 단위: ms */
  t2: Record<Severity, number>;
  /** RELEASE_PENDING 단계 타이머. 단위: ms */
  t3: number;
  /** CONTROLLED 상태에서 해제 후보로 전이되기까지 요구되는 지속 저수위 시간. 단위: ms */
  releaseSustainMs: number;
}

export const DEFAULT_TIMERS: EscalationTimers = {
  t1: 30 * 60_000,
  t2: {
    WARN: 30 * 60_000,
    ALERT: 15 * 60_000,
    DESIGN_FLOOD: 10 * 60_000,
    INUNDATION: 3 * 60_000,
  },
  t3: 60 * 60_000,
  releaseSustainMs: 30 * 60_000,
};

export interface SiteConfig {
  id: string;
  name: string;
  gaugeId: string;
  /** 주의보 기준(계획홍수량 50% 상당). WARN 등급 임계값. */
  watchLevel: number;
  /** 경보 기준(계획홍수량 70% 상당). ALERT 등급 임계값. */
  alertLevel: number;
  /**
   * 계획홍수위(관측수위 환산치). 제도상 통제 요건 — DESIGN_FLOOD 등급 임계값.
   * 해발(m ASL) 표고값의 관측소별 환산표가 없는 경우, 공식 발표된 도달 시각을 관측
   * 시계열에서 선형보간 역산해 구한다(CLAUDE.md "확정된 사양 결정" 절 참고).
   * TODO: 실측 환산표가 확보되면 역산값 대신 교체한다.
   */
  designFloodLevel: number;
  ladder: Ladder;
  timers?: Partial<EscalationTimers>;
}
