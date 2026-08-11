import type { Severity } from "../types/index";

/**
 * 수위 → 등급.
 * WATCH: watchLevel 이상, ALERT: alertLevel 이상, SEVERE: alertLevel + 1.0m 이상.
 * watchLevel 미만이면 등급 없음(null, 평상시).
 */
export function computeSeverity(
  value: number,
  watchLevel: number,
  alertLevel: number,
): Severity | null {
  if (value >= alertLevel + 1.0) return "SEVERE";
  if (value >= alertLevel) return "ALERT";
  if (value >= watchLevel) return "WATCH";
  return null;
}
