import type { Severity } from "../types/index";

/**
 * 등급별 사다리 진입 인덱스. 사다리: 담당 공무원(0) → 팀장(1) → 과장(2) → 부단체장(top).
 * WARN: 담당 공무원(0)부터. ALERT: 팀장(1)부터. DESIGN_FLOOD: 과장(2)부터.
 * INUNDATION: 최상단(부단체장) 즉시 호출.
 */
export function ladderStartIndex(severity: Severity, ladderLength: number): number {
  const top = Math.max(0, ladderLength - 1);
  switch (severity) {
    case "WARN":
      return 0;
    case "ALERT":
      return Math.min(1, top);
    case "DESIGN_FLOOD":
      return Math.min(2, top);
    case "INUNDATION":
      return top;
  }
}
