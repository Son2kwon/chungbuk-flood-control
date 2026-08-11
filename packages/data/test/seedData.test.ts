import { describe, expect, it } from "vitest";
import { GAUGES, GAUGE_READINGS, SITES, USERS } from "../src/seed/index.js";

describe("시드 데이터 정합성", () => {
  it("관측소는 7곳이고, 상하류 관계가 미호강 흐름과 일치한다", () => {
    expect(GAUGES).toHaveLength(7);

    const byId = new Map(GAUGES.map((g) => [g.id, g]));
    expect(byId.get("gasan-gyo")?.upstreamOf).toEqual(["bantan-gyo"]);
    expect(byId.get("bantan-gyo")?.upstreamOf).toEqual([
      "palgyeol-gyo",
      "mihocheon-gyo",
      "heungdeok-gyo",
      "hwanhui-gyo",
    ]);
    expect(byId.get("sangjocheon-gyo")?.upstreamOf).toEqual([]);

    // 상조천교(최하류)를 제외한 모든 지류가 결국 상조천교로 합류한다.
    for (const midstream of ["palgyeol-gyo", "mihocheon-gyo", "heungdeok-gyo", "hwanhui-gyo"]) {
      expect(byId.get(midstream)?.upstreamOf).toEqual(["sangjocheon-gyo"]);
    }

    // upstreamOf가 가리키는 id는 모두 실제 존재하는 관측소여야 한다.
    for (const gauge of GAUGES) {
      for (const downstreamId of gauge.upstreamOf) {
        expect(byId.has(downstreamId)).toBe(true);
      }
    }
  });

  it("모든 관측소는 6개 관측 시각 * 값 쌍을 갖고, 주의보 < 경보다", () => {
    expect(GAUGE_READINGS).toHaveLength(7);
    for (const g of GAUGE_READINGS) {
      expect(g.points).toHaveLength(6);
    }
    for (const gauge of GAUGES) {
      expect(gauge.warnLevel).toBeLessThan(gauge.alertLevel);
    }
  });

  it("지점은 5곳이고, 각 지점은 실존하는 관측소를 참조한다", () => {
    expect(SITES).toHaveLength(5);
    const gaugeIds = new Set(GAUGES.map((g) => g.id));
    for (const site of SITES) {
      expect(gaugeIds.has(site.gaugeId)).toBe(true);
    }
    expect(SITES.find((s) => s.id === "gungpyeong2-underpass")?.gaugeId).toBe("mihocheon-gyo");
  });

  it("에스컬레이션 사다리는 3단계이고 ladderOrder가 0부터 연속한다", () => {
    expect(USERS).toHaveLength(3);
    const orders = [...USERS].map((u) => u.ladderOrder).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2]);
  });
});
