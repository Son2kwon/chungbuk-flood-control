import type { GaugeSource, Reading } from "./GaugeSource";

export interface SeedPoint {
  at: Date;
  value: number;
}

export interface ReplaySeed {
  gaugeId: string;
  points: readonly SeedPoint[];
}

/**
 * 고정된 시계열 배열에서 읽는 GaugeSource. 관측점 사이는 선형 보간한다.
 * 시드 범위 밖은 null을 반환한다 (마지막 값을 그대로 유지하지 않는다).
 */
export class ReplaySource implements GaugeSource {
  private readonly seeds = new Map<string, SeedPoint[]>();

  constructor(seeds: readonly ReplaySeed[]) {
    for (const seed of seeds) {
      const sorted = [...seed.points].sort((a, b) => a.at.getTime() - b.at.getTime());
      this.seeds.set(seed.gaugeId, sorted);
    }
  }

  read(gaugeId: string, at: Date): Reading | null {
    const points = this.seeds.get(gaugeId);
    if (!points || points.length === 0) return null;

    const t = at.getTime();
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (t < first.at.getTime() || t > last.at.getTime()) return null;

    let lower = points[0]!;
    let upper = points[0]!;
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      if (point.at.getTime() === t) {
        return { gaugeId, at, value: point.value, interpolated: false };
      }
      if (point.at.getTime() < t) {
        lower = point;
      }
      if (point.at.getTime() > t) {
        upper = point;
        break;
      }
    }

    const span = upper.at.getTime() - lower.at.getTime();
    const ratio = span === 0 ? 0 : (t - lower.at.getTime()) / span;
    const value = lower.value + (upper.value - lower.value) * ratio;
    return { gaugeId, at, value, interpolated: true };
  }
}
