import { describe, expect, it } from "vitest";
import { ReplayClock } from "../src/clock/ReplayClock.js";
import { VirtualScheduler } from "../src/scheduler/VirtualScheduler.js";
import { InMemoryEventLog } from "../src/events/EventLog.js";
import { ReplaySource, type SeedPoint } from "../src/gauge/ReplaySource.js";
import { ControlOrderEngine } from "../src/workflow/ControlOrderEngine.js";
import type { SiteConfig } from "../src/types/index.js";

const GAUGE_ID = "mihocheongyo";
const SEED_POINTS: SeedPoint[] = [
  { at: new Date("2023-07-15T06:30:00Z"), value: 9.2 },
  { at: new Date("2023-07-15T06:50:00Z"), value: 9.38 },
  { at: new Date("2023-07-15T07:00:00Z"), value: 9.47 },
  { at: new Date("2023-07-15T08:30:00Z"), value: 10.01 },
  { at: new Date("2023-07-15T08:50:00Z"), value: 10.05 },
  { at: new Date("2023-07-15T09:00:00Z"), value: 10.06 },
];
const SITE: SiteConfig = {
  id: "miho-bridge",
  name: "미호천교",
  gaugeId: GAUGE_ID,
  watchLevel: 7.0,
  alertLevel: 8.0,
  ladder: ["담당자", "부서장", "실장", "대책본부장"],
};

function runNoResponseScenario(speed: number) {
  const gaugeSource = new ReplaySource([{ gaugeId: GAUGE_ID, points: SEED_POINTS }]);
  const clock = new ReplayClock({ start: SEED_POINTS[0]!.at, end: SEED_POINTS.at(-1)!.at, speed });
  const scheduler = new VirtualScheduler(clock);
  const eventLog = new InMemoryEventLog();
  const engine = new ControlOrderEngine({ site: SITE, gaugeSource, clock, scheduler, eventLog });
  engine.attach(clock);

  // 배속과 무관하게, tick을 잘게 쪼개도 결과는 동일해야 한다.
  const totalMs = 5 * 60_000;
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    clock.tick(totalMs / steps / speed);
  }

  return { finalState: engine.state, events: eventLog.all() };
}

describe("결정론성", () => {
  it("같은 시드로 같은 조작을 반복하면 항상 같은 이벤트 로그를 만든다", () => {
    const runA = runNoResponseScenario(1);
    const runB = runNoResponseScenario(1);

    expect(runA.finalState).toBe("FORCED");
    expect(runB.finalState).toBe(runA.finalState);
    expect(runB.events).toEqual(runA.events);
  });

  it("배속을 바꿔도(가상 시각 기준 동일 구간) 최종 결과는 동일하다", () => {
    const runSlow = runNoResponseScenario(1);
    const runFast = runNoResponseScenario(4);

    expect(runFast.finalState).toBe(runSlow.finalState);
    expect(runFast.events.map((e) => ({ ...e, occurredAt: e.occurredAt.getTime() }))).toEqual(
      runSlow.events.map((e) => ({ ...e, occurredAt: e.occurredAt.getTime() })),
    );
  });
});
