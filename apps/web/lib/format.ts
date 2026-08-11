/** 시드의 타임스탬프 관례(ISO "Z" 표기 그대로가 정본, 실제로는 KST 벽시계 시각)에 맞춰
 * 항상 UTC getter로 표시한다 — 브라우저 로컬 타임존에 따라 시각이 밀리지 않도록 한다. */
export function formatClock(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function formatShortClock(date: Date): string {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatDate(date: Date): string {
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${mo}-${d}`;
}

/** 남은 시간(ms)을 mm:ss로. 음수는 00:00으로 clamp한다(만료 판정은 도메인이 한다, 표시만 clamp). */
export function formatCountdown(remainingMs: number): string {
  const clamped = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(clamped / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function formatLevel(value: number): string {
  return `${value.toFixed(2)}m`;
}
