import type { Severity } from "../types/index";

/**
 * 수위 → 등급. WARN: watchLevel 이상, ALERT: alertLevel 이상, DESIGN_FLOOD: designFloodLevel 이상.
 * watchLevel 미만이면 등급 없음(null, 평상시).
 * INUNDATION(시설 침수심)은 게이지 수위가 아닌 별도 물리량이라 여기서 판정하지 않는다 —
 * ControlOrderEngine.reportInundation()을 통한 수동 보고로만 도달한다.
 */
export function computeSeverity(
  value: number,
  watchLevel: number,
  alertLevel: number,
  designFloodLevel: number,
): Severity | null {
  if (value >= designFloodLevel) return "DESIGN_FLOOD";
  if (value >= alertLevel) return "ALERT";
  if (value >= watchLevel) return "WARN";
  return null;
}
