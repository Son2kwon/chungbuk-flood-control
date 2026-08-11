import type { Severity } from "../types/index";

/**
 * 등급별 사다리 진입 인덱스.
 * WATCH: 1차 담당자(0)부터. ALERT: 부서장(1)부터. SEVERE: 최상단 즉시 호출.
 */
export function ladderStartIndex(severity: Severity, ladderLength: number): number {
  const top = Math.max(0, ladderLength - 1);
  switch (severity) {
    case "WATCH":
      return 0;
    case "ALERT":
      return Math.min(1, top);
    case "SEVERE":
      return top;
  }
}
