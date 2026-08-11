import { describe, expect, it } from "vitest";
import { createChungbukReplayGaugeSource } from "../src/gauge-sources/ReplaySeedGaugeSource.js";
import { GAUGES } from "../src/seed/gauges.js";

describe("createChungbukReplayGaugeSource", () => {
  it("네트워크 없이 로컬 시드만으로 7개 관측소 전부를 조회할 수 있다", () => {
    const source = createChungbukReplayGaugeSource();
    for (const gauge of GAUGES) {
      const reading = source.read(gauge.id, new Date("2023-07-15T06:30:00Z"));
      expect(reading).not.toBeNull();
      expect(reading!.interpolated).toBe(false);
    }
  });

  it("정확한 관측점은 interpolated: false를 반환한다", () => {
    const source = createChungbukReplayGaugeSource();
    const reading = source.read("mihocheon-gyo", new Date("2023-07-15T06:50:00Z"));
    expect(reading).toEqual({
      gaugeId: "mihocheon-gyo",
      at: new Date("2023-07-15T06:50:00Z"),
      value: 9.38,
      interpolated: false,
    });
  });

  it("07:00~08:30 관측 공백 구간은 선형 보간하고 interpolated: true를 단다", () => {
    const source = createChungbukReplayGaugeSource();
    // 미호천교: 07:00 = 9.47, 08:30 = 10.01 → 정중앙(07:45)은 두 값의 평균.
    const reading = source.read("mihocheon-gyo", new Date("2023-07-15T07:45:00Z"));
    expect(reading?.interpolated).toBe(true);
    expect(reading?.value).toBeCloseTo((9.47 + 10.01) / 2, 5);
  });

  it("시드 범위 밖은 null이다 (마지막 값 유지 금지)", () => {
    const source = createChungbukReplayGaugeSource();
    expect(source.read("mihocheon-gyo", new Date("2023-07-15T06:00:00Z"))).toBeNull();
    expect(source.read("mihocheon-gyo", new Date("2023-07-15T09:30:00Z"))).toBeNull();
  });

  it("존재하지 않는 관측소 id는 null이다", () => {
    const source = createChungbukReplayGaugeSource();
    expect(source.read("no-such-gauge", new Date("2023-07-15T06:30:00Z"))).toBeNull();
  });
});
