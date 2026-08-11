import { ReplaySource, type GaugeSource, type ReplaySeed } from "@chungbuk/domain";
import { GAUGE_READINGS } from "../seed/readings";

/**
 * 번들된 로컬 시드로만 동작하는 GaugeSource. 네트워크/DB 접근이 전혀 없다.
 * 도메인의 ReplaySource(선형 보간 + 범위 밖 null)를 그대로 재사용한다 —
 * 데이터 계층은 시드를 조립할 뿐, 보간 로직을 다시 구현하지 않는다.
 */
export function createChungbukReplayGaugeSource(): GaugeSource {
  const seeds: ReplaySeed[] = GAUGE_READINGS.map((g) => ({
    gaugeId: g.gaugeId,
    points: g.points,
  }));
  return new ReplaySource(seeds);
}
