import { describe, expect, it } from "vitest";
import { ReplayClock } from "../src/clock/ReplayClock.js";
import { VirtualScheduler } from "../src/scheduler/VirtualScheduler.js";
import { InMemoryEventLog } from "../src/events/EventLog.js";
import { ReplaySource, type SeedPoint } from "../src/gauge/ReplaySource.js";
import { ControlOrderEngine } from "../src/workflow/ControlOrderEngine.js";
import type { SiteConfig } from "../src/types/index.js";

// 미호천교 시드: 주의보 7.0m / 경보 8.0m. 오송 궁평2지하차도 사고 재현 시나리오.
const GAUGE_ID = "mihocheongyo";
const SEED_POINTS: SeedPoint[] = [
  { at: new Date("2023-07-15T06:30:00Z"), value: 9.2 },
  { at: new Date("2023-07-15T06:50:00Z"), value: 9.38 },
  { at: new Date("2023-07-15T07:00:00Z"), value: 9.47 },
  { at: new Date("2023-07-15T08:30:00Z"), value: 10.01 },
  { at: new Date("2023-07-15T08:50:00Z"), value: 10.05 },
  { at: new Date("2023-07-15T09:00:00Z"), value: 10.06 },
];
const SEED_START = SEED_POINTS[0]!.at;
const SEED_END = SEED_POINTS[SEED_POINTS.length - 1]!.at;

const SITE: SiteConfig = {
  id: "miho-bridge",
  name: "미호천교",
  gaugeId: GAUGE_ID,
  watchLevel: 7.0,
  alertLevel: 8.0,
  ladder: ["담당자", "부서장", "실장", "대책본부장"],
};

function setup(site: SiteConfig = SITE, points: SeedPoint[] = SEED_POINTS) {
  const gaugeSource = new ReplaySource([{ gaugeId: site.gaugeId, points }]);
  const start = points[0]!.at;
  const end = points[points.length - 1]!.at;
  const clock = new ReplayClock({ start, end });
  const scheduler = new VirtualScheduler(clock);
  const eventLog = new InMemoryEventLog();
  const engine = new ControlOrderEngine({ site, gaugeSource, clock, scheduler, eventLog });
  engine.attach(clock);
  return { clock, scheduler, eventLog, engine };
}

describe("시나리오 A: 무응답", () => {
  it("06:30에 SEVERE로 RECOMMENDED에 진입하고, 최상단에서 T1 초과로 FORCED가 된다", () => {
    const { clock, engine, eventLog } = setup();

    expect(engine.state).toBe("RECOMMENDED");
    expect(engine.severity).toBe("SEVERE");
    expect(engine.ladderStep).toBe(SITE.ladder.length - 1); // SEVERE는 최상단 즉시 호출
    expect(engine.lastReading).toEqual({ gaugeId: GAUGE_ID, at: SEED_START, value: 9.2, interpolated: false });
    expect(engine.deadlineAt).toEqual(new Date("2023-07-15T06:35:00Z")); // T1(SEVERE) = 5분
    const alertId = engine.alertId!;

    // SEVERE의 T1은 5분. 아무도 응답하지 않는다.
    clock.tick(5 * 60_000);

    expect(engine.state).toBe("FORCED");
    expect(engine.deadlineAt).toBeNull(); // FORCED에는 활성 타이머가 없다

    const events = eventLog.forAlert(alertId);
    expect(events.map((e) => e.toState)).toEqual(["RECOMMENDED", "FORCED"]);
    expect(events[0]!.occurredAt).toEqual(SEED_START);
    expect(events[0]!.actor).toBe("system");
    expect(events[1]!.fromState).toBe("RECOMMENDED");
    expect(events[1]!.occurredAt).toEqual(new Date("2023-07-15T06:35:00Z"));
    expect(events[1]!.actor).toBe("system");
    expect(events[1]!.reason).toContain("대책본부장");
  });
});

describe("시나리오 B: 대응", () => {
  it("06:35 승인, 06:50 현장완료 보고 시 08:30(침수 시각)에 CONTROLLED 상태다", () => {
    const { clock, engine } = setup();

    expect(engine.state).toBe("RECOMMENDED");

    // T1(SEVERE) 만료(06:35) 직전에 승인한다.
    clock.tick(5 * 60_000 - 1);
    engine.approve("field-officer-1", clock.now());
    expect(engine.state).toBe("APPROVED");

    // 06:50에 현장 완료 보고.
    clock.tick(1 + 15 * 60_000);
    expect(clock.now()).toEqual(new Date("2023-07-15T06:50:00Z"));
    engine.reportFieldComplete("field-officer-1", clock.now());
    expect(engine.state).toBe("CONTROLLED");

    // 08:30(침수 시각)까지 진행해도 CONTROLLED를 유지한다.
    clock.tick(100 * 60_000);
    expect(clock.now()).toEqual(new Date("2023-07-15T08:30:00Z"));
    expect(engine.state).toBe("CONTROLLED");
  });
});

describe("시나리오 C: 경계", () => {
  it("기각 시 reason 없이 호출하면 예외를 던진다", () => {
    const { clock, engine } = setup();
    expect(engine.state).toBe("RECOMMENDED");

    expect(() => engine.reject("dept-head", "", clock.now())).toThrow();
    // 런타임 호출부가 reason을 아예 넘기지 않는 경우까지 방어한다.
    const rejectWithoutReason = engine.reject.bind(engine) as (actor: string) => void;
    expect(() => rejectWithoutReason("dept-head")).toThrow();
  });

  it("기각 후 수위가 더 오르면 새 권고가 재발생한다", () => {
    const risingPoints: SeedPoint[] = [
      { at: new Date("2024-01-01T00:00:00Z"), value: 7.5 }, // WATCH
      { at: new Date("2024-01-01T00:30:00Z"), value: 7.5 }, // 변화 없음 — 재발생 안 함
      { at: new Date("2024-01-01T01:00:00Z"), value: 8.5 }, // ALERT, 기각 시점보다 상승 — 재발생
    ];
    const site: SiteConfig = { ...SITE, id: "miho-bridge-2", gaugeId: "rising-gauge" };
    const { clock, engine } = setup(site, risingPoints);

    expect(engine.state).toBe("RECOMMENDED");
    expect(engine.severity).toBe("WATCH");
    const firstOrderId = engine.alertId;

    engine.reject("dept-head", "오탐으로 판단, 수위 안정적", clock.now());
    expect(engine.state).toBe("REJECTED");

    clock.tick(30 * 60_000); // 00:30 — 7.5, 기각 시점과 동일 → 재발생 없음
    expect(engine.state).toBe("REJECTED");

    clock.tick(30 * 60_000); // 01:00 — 8.5, 기각 시점(7.5)보다 상승 → 재발생
    expect(engine.state).toBe("RECOMMENDED");
    expect(engine.severity).toBe("ALERT");
    expect(engine.alertId).not.toBe(firstOrderId);
  });
});
