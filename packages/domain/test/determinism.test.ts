import { describe, expect, it } from "vitest";
import { ReplayClock } from "../src/clock/ReplayClock.js";
import { VirtualScheduler } from "../src/scheduler/VirtualScheduler.js";
import { InMemoryEventLog } from "../src/events/EventLog.js";
import { ReplaySource, type SeedPoint } from "../src/gauge/ReplaySource.js";
import { ControlOrderEngine } from "../src/workflow/ControlOrderEngine.js";
import type { SiteConfig } from "../src/types/index.js";

const GAUGE_ID = "mihocheongyo";
// packages/domain/test/mihocheongyo.test.ts 참고: 06:40 실측 관측값 = 계획홍수위 도달 시각.
const DESIGN_FLOOD_LEVEL = 9.3;
// 2023-07-15 06:00~09:00, 10분 간격 실측(packages/data/src/seed/readings.ts와 동일 값).
const MIHO_TIMES = [
  "06:00", "06:10", "06:20", "06:30", "06:40", "06:50", "07:00", "07:10", "07:20", "07:30",
  "07:40", "07:50", "08:00", "08:10", "08:20", "08:30", "08:40", "08:50", "09:00",
] as const;
const MIHO_VALUES = [
  8.91, 9.01, 9.1, 9.2, 9.3, 9.38, 9.47, 9.56, 9.64, 9.72,
  9.79, 9.85, 9.91, 9.96, 9.99, 10.01, 10.03, 10.05, 10.06,
] as const;
const SEED_POINTS: SeedPoint[] = MIHO_TIMES.map((t, i) => ({
  at: new Date(`2023-07-15T${t}:00Z`),
  value: MIHO_VALUES[i]!,
}));
// 데이터 범위(06:00~09:00)와 재생 시작점은 다르다 — packages/domain/test/mihocheongyo.test.ts,
// apps/web/lib/composition-root.ts의 SEED_START와 동일한 이유(06:00 시작이면 06:40 승격
// 시점에 사다리가 이미 최상단이라 "승격이 사다리를 점프시키는" 장면이 사라진다).
const REPLAY_START = new Date("2023-07-15T06:30:00Z");
const SITE: SiteConfig = {
  id: "miho-bridge",
  name: "미호천교",
  gaugeId: GAUGE_ID,
  watchLevel: 7.0,
  alertLevel: 8.0,
  designFloodLevel: DESIGN_FLOOD_LEVEL,
  ladder: ["담당 공무원", "팀장", "과장", "부단체장"],
};

/**
 * 06:30(ALERT 직행) → 06:40(DESIGN_FLOOD 승격, 타이머 리셋+사다리 점프) → 06:50(무응답 재배정)
 * → 07:00(FORCED)까지, 아무도 응답하지 않는 무응답 시나리오를 배속을 바꿔가며 재생한다.
 * 배속과 무관하게 가상 시각 구간이 동일하면(각 스텝의 가상 시간 폭은 speed로 나눈 뒤 다시 speed를
 * 곱해 상쇄되므로 변하지 않는다) 승격/재배정이 걸리는 정확한 시각도, 최종 이벤트 순서도 같아야 한다.
 */
function runNoResponseScenario(speed: number) {
  const gaugeSource = new ReplaySource([{ gaugeId: GAUGE_ID, points: SEED_POINTS }]);
  const clock = new ReplayClock({ start: REPLAY_START, end: SEED_POINTS[6]!.at, speed }); // end = 07:00
  const scheduler = new VirtualScheduler(clock);
  const eventLog = new InMemoryEventLog();
  const engine = new ControlOrderEngine({ site: SITE, gaugeSource, clock, scheduler, eventLog });
  engine.attach(clock);

  // 06:30 → 07:00, 30분을 30초 단위(60스텝)로 잘게 쪼갠다. 06:40/06:50/07:00 경계가
  // 정확히 스텝 경계와 일치하므로, 배속을 나누고 다시 곱해도 그 경계를 건너뛰지 않는다.
  const totalMs = 30 * 60_000;
  const steps = 60;
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

  it("배속을 바꿔도(가상 시각 기준 동일 구간) 최종 상태·등급 승격 시각·이벤트 순서가 모두 동일하다", () => {
    const run1x = runNoResponseScenario(1);
    const run60x = runNoResponseScenario(60);
    const run600x = runNoResponseScenario(600);

    for (const run of [run60x, run600x]) {
      expect(run.finalState).toBe(run1x.finalState);
      expect(run.events.map((e) => ({ ...e, occurredAt: e.occurredAt.getTime() }))).toEqual(
        run1x.events.map((e) => ({ ...e, occurredAt: e.occurredAt.getTime() })),
      );
    }

    // 승격이 정확히 06:40에 걸렸는지도 배속 무관하게 재확인한다.
    const upgradeEvent = run1x.events.find((e) => (e.reason ?? "").includes("DESIGN_FLOOD"));
    expect(upgradeEvent?.occurredAt).toEqual(new Date("2023-07-15T06:40:00Z"));
  });
});

/**
 * ReplayClock/VirtualScheduler는 등록된 breakpoint(타이머 만료 시각)와 seek()/tick()의 최종
 * 목표 시각에서만 게이지를 재관측한다. seek() 한 번으로 몇 시간을 건너뛰면, 그 사이의 등급
 * 승격 순간이 어떤 breakpoint와도 우연히 겹치지 않는 한 놓칠 수 있다 — 이걸 그냥 두면
 * "seek 몇 번으로 재생하느냐"에 따라 결과가 달라진다는 뜻이라 CLAUDE.md 제약 5(결정론성:
 * 같은 시드 + 같은 배속 + 같은 조작 = 항상 같은 결과)를 어긴다. ControlOrderEngine이 스스로
 * 재예약하는 게이지 폴링 breakpoint(GAUGE_POLL_INTERVAL_MS)를 심어 두고, ReplayClock이 그
 * breakpoint를 seek() 도중에도 동적으로 재계산하도록 고쳐서, 큰 seek() 한 번과 그와 동일한
 * 구간을 잘게 나눈 tick() 여러 번이 완전히 같은 결과를 내도록 보장한다.
 */
describe("결정론성 — seek() 경로와 tick() 경로의 동치성", () => {
  function runToEnd(advance: (clock: ReplayClock, targetMs: number) => void) {
    const gaugeSource = new ReplaySource([{ gaugeId: GAUGE_ID, points: SEED_POINTS }]);
    const end = SEED_POINTS[SEED_POINTS.length - 1]!.at;
    const clock = new ReplayClock({ start: REPLAY_START, end });
    const scheduler = new VirtualScheduler(clock);
    const eventLog = new InMemoryEventLog();
    const engine = new ControlOrderEngine({ site: SITE, gaugeSource, clock, scheduler, eventLog });
    engine.attach(clock);

    advance(clock, end.getTime());

    return { finalState: engine.state, events: eventLog.all() };
  }

  it("06:30에서 09:00으로 seek() 한 번 건너뛴 결과가, 1분 단위로 잘게 tick한 결과와 완전히 동일하다", () => {
    const viaSeek = runToEnd((clock, targetMs) => clock.seek(new Date(targetMs)));
    const viaMinuteTicks = runToEnd((clock, targetMs) => {
      while (clock.now().getTime() < targetMs) {
        clock.tick(Math.min(60_000, targetMs - clock.now().getTime()));
      }
    });

    expect(viaSeek.finalState).toBe("FORCED");
    expect(viaMinuteTicks.finalState).toBe(viaSeek.finalState);
    expect(viaMinuteTicks.events).toEqual(viaSeek.events);
  });
});
