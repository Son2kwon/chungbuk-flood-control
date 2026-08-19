import type { GaugeSource } from "@chungbuk/domain";
import { GAUGE_READINGS } from "@chungbuk/data";

export interface LevelPoint {
  at: Date;
  value: number;
}

export interface LevelSegment {
  interpolated: boolean;
  points: LevelPoint[];
}

/**
 * 시드의 원본 관측점을 그대로 선으로 잇는다 — 도메인이 두 관측점 사이를 선형 보간하므로,
 * 관측점 자체가 곧 그 선의 완전한 정보다(중간을 더 촘촘히 샘플링해도 같은 직선일 뿐이다).
 * 관측점 간격이 평소(최소 간격)의 2배를 넘는 구간만 "관측 공백"으로 보고 점선 처리한다 —
 * 그래야 유의미하게 큰 공백만 도드라지고, 정상 관측 간격(현재 시드는 전 구간 10분 등간격
 * 실측이라 공백이 없다) 구간까지 전부 점선으로 뒤덮이지 않는다.
 *
 * 값 자체는 항상 gaugeSource.read()로 조회한다 — 시드 배열의 값을 직접 베끼지 않고,
 * 도메인이 실제로 돌려주는 값(source of truth)을 신뢰한다.
 *
 * GAUGE_READINGS는 이제 여러 시나리오가 공유하는 17시간짜리 원본이라, 현재 재생 구간
 * [windowStart, windowEnd] 밖의 관측점은 반드시 걸러내야 한다 — 안 그러면 다른 시나리오
 * 구간의 값(예: 전날 최저 수위)까지 Y축 자동 스케일과 선 경로에 섞여 들어간다.
 */
export function buildLevelSegments(
  gaugeSource: GaugeSource,
  gaugeId: string,
  windowStart: Date,
  windowEnd: Date,
): LevelSegment[] {
  const all = GAUGE_READINGS.find((g) => g.gaugeId === gaugeId)?.points ?? [];
  const raw = all.filter((p) => p.at.getTime() >= windowStart.getTime() && p.at.getTime() <= windowEnd.getTime());
  if (raw.length === 0) return [];

  const sorted = [...raw].sort((a, b) => a.at.getTime() - b.at.getTime());
  const gaps = sorted.slice(1).map((p, i) => p.at.getTime() - sorted[i]!.at.getTime());
  const baselineGap = gaps.length > 0 ? Math.min(...gaps) : 0;
  const isVoidGap = (gapMs: number) => baselineGap > 0 && gapMs > baselineGap * 2;

  const segments: LevelSegment[] = [];
  let current: LevelSegment | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i]!;
    const reading = gaugeSource.read(gaugeId, point.at);
    const value = reading?.value ?? point.value;

    const gapBefore = i > 0 ? point.at.getTime() - sorted[i - 1]!.at.getTime() : 0;
    const segmentInterpolated = i > 0 && isVoidGap(gapBefore);

    if (!current || current.interpolated !== segmentInterpolated) {
      const bridge: LevelPoint | undefined = current ? current.points[current.points.length - 1] : undefined;
      current = { interpolated: segmentInterpolated, points: bridge ? [bridge] : [] };
      segments.push(current);
    }
    current.points.push({ at: point.at, value });
  }

  return segments;
}
