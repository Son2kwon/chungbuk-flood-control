import { describe, expect, it } from "vitest";
import { ReplayClock } from "../src/clock/ReplayClock.js";
import { VirtualScheduler } from "../src/scheduler/VirtualScheduler.js";
import { InMemoryEventLog } from "../src/events/EventLog.js";
import { ReplaySource, type SeedPoint } from "../src/gauge/ReplaySource.js";
import { ControlOrderEngine } from "../src/workflow/ControlOrderEngine.js";
import type { SiteConfig } from "../src/types/index.js";

// 미호천교 시드: 주의보 7.0m / 경보 8.0m. 오송 궁평2지하차도 사고 재현 시나리오.
// 2023-07-15 06:00~09:00, 10분 간격 실측(packages/data/src/seed/readings.ts와 동일 값).
//
// 계획홍수위(designFloodLevel)는 9.30으로 확정한다. 06:40 실측 관측값이 9.30이고,
// 국무조정실 발표상 06:40이 계획홍수위 도달 시각이다 — 그 시각의 실측값 자체가 곧
// 계획홍수위다(이전 9.29는 06:30/06:50 관측값 사이 선형보간 추정치였다).
const GAUGE_ID = "mihocheongyo";
const DESIGN_FLOOD_LEVEL = 9.3;
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

/**
 * 데이터 범위(06:00~09:00)와 재생 시작점은 다르다 — apps/web/lib/composition-root.ts의
 * SEED_START와 동일한 이유다. 06:00부터 재생하면 06:15/06:30에 ALERT 사다리가 이미
 * 최상단까지 재배정돼서, 06:40 DESIGN_FLOOD 승격이 사다리를 점프시키는 장면 자체가
 * 사라진다. 06:30부터 재생해야 06:40 승격이 실제로 팀장→과장으로 점프시키고, FORCED도
 * 07:00에 걸려 07:01 신고 타임라인과 대비된다.
 */
const REPLAY_START = new Date("2023-07-15T06:30:00Z");

// 사다리: 담당 공무원 → 팀장 → 과장 → 부단체장 (index 0~3)
const LADDER = ["담당 공무원", "팀장", "과장", "부단체장"] as const;

const SITE: SiteConfig = {
  id: "miho-bridge",
  name: "미호천교",
  gaugeId: GAUGE_ID,
  watchLevel: 7.0,
  alertLevel: 8.0,
  designFloodLevel: DESIGN_FLOOD_LEVEL,
  ladder: LADDER,
};

function setup(site: SiteConfig = SITE, points: SeedPoint[] = SEED_POINTS, end?: Date, start?: Date) {
  const gaugeSource = new ReplaySource([{ gaugeId: site.gaugeId, points }]);
  const clockStart = start ?? points[0]!.at;
  const clock = new ReplayClock({ start: clockStart, end: end ?? points[points.length - 1]!.at });
  const scheduler = new VirtualScheduler(clock);
  const eventLog = new InMemoryEventLog();
  const engine = new ControlOrderEngine({ site, gaugeSource, clock, scheduler, eventLog });
  engine.attach(clock);
  return { clock, scheduler, eventLog, engine };
}

describe("시나리오 A: 무응답 (오송 재현)", () => {
  it("06:30 ALERT로 DIRECTED 직행(RECOMMENDED 생략) → 06:40 DESIGN_FLOOD 승격(정각, 타이머 리셋+사다리 점프) → 06:50 무응답 재배정 → 07:00 FORCED(3개 액션 개별 기록)", () => {
    const { clock, engine, eventLog } = setup(SITE, SEED_POINTS, undefined, REPLAY_START);

    // 06:30: 9.20m는 ALERT(경보) 등급 — 의무 통제이므로 RECOMMENDED를 건너뛰고 DIRECTED로 직행.
    expect(engine.state).toBe("DIRECTED");
    expect(engine.severity).toBe("ALERT");
    expect(engine.ladderStep).toBe(1); // ALERT는 팀장(index 1)부터
    expect(engine.lastReading).toEqual({ gaugeId: GAUGE_ID, at: REPLAY_START, value: 9.2, interpolated: false });
    expect(engine.deadlineAt).toEqual(new Date("2023-07-15T06:45:00Z")); // T2(ALERT) = 15분
    const alertId = engine.alertId!;

    // 06:40: 실측값이 정확히 9.30(계획홍수위, 보간이 아니라 그 시각 자체의 실측점) →
    // DESIGN_FLOOD로 승격. 팀장(1)에서 과장(2)으로 사다리가 점프하고 타이머가 리셋된다.
    // >= 비교이고 부동소수점 보간을 거치지 않는 정확한 관측점이라 06:40 정각에 걸린다
    // (관측 시각·폴링 시각 정렬도 정수 밀리초 산술이라 어긋나지 않는다 — 아래 별도 단위
    // 테스트로 이 지점을 못박는다).
    clock.tick(10 * 60_000);
    expect(clock.now()).toEqual(new Date("2023-07-15T06:40:00Z"));
    expect(engine.state).toBe("DIRECTED");
    expect(engine.severity).toBe("DESIGN_FLOOD");
    expect(engine.ladderStep).toBe(2); // 과장으로 점프
    expect(engine.deadlineAt).toEqual(new Date("2023-07-15T06:50:00Z")); // T2(DESIGN_FLOOD)=10분으로 리셋

    // 06:50: 과장도 무응답 → 부단체장(최상단)으로 재배정.
    clock.tick(10 * 60_000);
    expect(engine.state).toBe("DIRECTED");
    expect(engine.ladderStep).toBe(3);
    expect(engine.deadlineAt).toEqual(new Date("2023-07-15T07:00:00Z"));

    // 07:00: 최상단(부단체장)도 무응답 → FORCED.
    clock.tick(10 * 60_000);
    expect(engine.state).toBe("FORCED");
    expect(engine.deadlineAt).toBeNull();

    const events = eventLog.forAlert(alertId);
    expect(events.map((e) => e.toState)).toEqual([
      "DIRECTED",
      "DIRECTED",
      "DIRECTED",
      "FORCED",
      "FORCED",
      "FORCED",
      "FORCED",
    ]);

    // [0] MONITORING → DIRECTED (06:30, ALERT)
    expect(events[0]!.fromState).toBe("MONITORING");
    expect(events[0]!.occurredAt).toEqual(REPLAY_START);
    expect(events[0]!.actor).toBe("system");
    expect(events[0]!.metadata).toMatchObject({ severity: "ALERT", ladderStep: 1, assignedTo: "팀장" });

    // [1] 승격: ALERT → DESIGN_FLOOD (06:40 정각) — 국무조정실 발표 시각과 정확히 일치해야 한다.
    expect(events[1]!.occurredAt).toEqual(new Date("2023-07-15T06:40:00Z"));
    expect(events[1]!.reason).toContain("DESIGN_FLOOD");
    expect(events[1]!.metadata).toMatchObject({ severity: "DESIGN_FLOOD", ladderStep: 2, assignedTo: "과장" });

    // [2] 무응답 재배정: 과장 → 부단체장 (06:50)
    expect(events[2]!.occurredAt).toEqual(new Date("2023-07-15T06:50:00Z"));
    expect(events[2]!.reason).toContain("무응답");
    expect(events[2]!.metadata).toMatchObject({ ladderStep: 3, assignedTo: "부단체장" });

    // [3] FORCED 진입 (07:00)
    expect(events[3]!.fromState).toBe("DIRECTED");
    expect(events[3]!.occurredAt).toEqual(new Date("2023-07-15T07:00:00Z"));
    expect(events[3]!.reason).toContain("부단체장");

    // [4]~[6] FORCED 액션 3종 — 각각 개별 이벤트로 기록되어야 한다.
    expect(events[4]!.fromState).toBe("FORCED");
    expect(events[4]!.reason).toContain("진입 금지");
    expect(events[4]!.metadata).toMatchObject({ forcedAction: "ENTRY_BAN_NOTICE" });

    expect(events[5]!.reason).toContain("인접 시설");
    expect(events[5]!.metadata).toMatchObject({ forcedAction: "ADJACENT_SITE_ALERT" });

    expect(events[6]!.reason).toContain("대책본부");
    expect(events[6]!.metadata).toMatchObject({ forcedAction: "PROVINCIAL_REPORT" });

    // 모든 FORCED 액션은 같은 시각(07:00)에 개별 이벤트로 기록된다.
    expect(events[4]!.occurredAt).toEqual(new Date("2023-07-15T07:00:00Z"));
    expect(events[5]!.occurredAt).toEqual(new Date("2023-07-15T07:00:00Z"));
    expect(events[6]!.occurredAt).toEqual(new Date("2023-07-15T07:00:00Z"));
  });

  it("06:40 DESIGN_FLOOD 승격은 >= 비교·부동소수점·관측 시각 정렬 어디에도 오차 없이 정각에 걸린다", () => {
    // 06:40은 국무조정실 공식 발표 헤드라인 시각이라 오차가 있으면 안 된다. 이 테스트는
    // 그 세 지점(>= 대 >, 부동소수점, 폴링/관측 시각 정렬)을 개별적으로 확인한다.
    const gaugeSource = new ReplaySource([{ gaugeId: GAUGE_ID, points: SEED_POINTS }]);

    // 1) 06:40은 보간이 아니라 실측점 자체다 — 부동소수점 보간 연산을 거치지 않는다.
    const exactReading = gaugeSource.read(GAUGE_ID, new Date("2023-07-15T06:40:00Z"));
    expect(exactReading).toEqual({
      gaugeId: GAUGE_ID,
      at: new Date("2023-07-15T06:40:00Z"),
      value: 9.3,
      interpolated: false,
    });

    // 2) 그 값과 계획홍수위가 >= 비교로 정확히 같다(> 였다면 이 순간 걸리지 않았을 것이다).
    expect(exactReading!.value >= DESIGN_FLOOD_LEVEL).toBe(true);
    expect(exactReading!.value).toBe(DESIGN_FLOOD_LEVEL);

    // 3) 06:30 재생 시작 + 게이지 폴링(1분 간격) 10회 = 06:40 정각. 정수 밀리초 산술이라
    // 부동소수점 누적 오차가 없다 — 관측 시각과 폴링 시각이 정확히 만난다.
    const { clock, engine } = setup(SITE, SEED_POINTS, undefined, REPLAY_START);
    clock.tick(10 * 60_000);
    expect(clock.now().getTime()).toBe(new Date("2023-07-15T06:40:00Z").getTime());
    expect(engine.severity).toBe("DESIGN_FLOOD");
  });
});

describe("시나리오 B: 대응 (수신 확인 후 조치)", () => {
  it("06:35 수신 확인(타이머 불변) → 06:40 승격 → 06:49:59.999 현장완료 보고 → 08:30에도 CONTROLLED 유지", () => {
    const { clock, engine, eventLog } = setup(SITE, SEED_POINTS, undefined, REPLAY_START);

    expect(engine.state).toBe("DIRECTED");
    expect(engine.deadlineAt).toEqual(new Date("2023-07-15T06:45:00Z"));

    // 06:35: 수신 확인. 상태 전이 없음, 이벤트만 기록. 타이머는 그대로 진행된다 —
    // "확인했으나 미조치"와 "미확인"을 구분하기 위함이지, 조치를 대신하지 않는다.
    clock.tick(5 * 60_000);
    engine.acknowledge("field-officer-1", clock.now());
    expect(engine.state).toBe("DIRECTED");
    expect(engine.deadlineAt).toEqual(new Date("2023-07-15T06:45:00Z")); // 불변

    const ackEvent = eventLog.forAlert(engine.alertId!).at(-1)!;
    expect(ackEvent.fromState).toBe("DIRECTED");
    expect(ackEvent.toState).toBe("DIRECTED");
    expect(ackEvent.actor).toBe("field-officer-1");
    expect(ackEvent.reason).toContain("수신 확인");

    // 06:40: 그래도 승격은 일어난다 (수신 확인이 승격을 막지 않는다).
    clock.tick(5 * 60_000);
    expect(engine.severity).toBe("DESIGN_FLOOD");
    expect(engine.deadlineAt).toEqual(new Date("2023-07-15T06:50:00Z"));

    // T2(DESIGN_FLOOD) 만료(06:50) 직전에 현장완료 보고 → CONTROLLED.
    clock.tick(10 * 60_000 - 1);
    engine.reportFieldComplete("현장 대응팀", clock.now());
    expect(engine.state).toBe("CONTROLLED");

    // 08:30(실제 침수 시각)까지 진행해도 CONTROLLED를 유지한다.
    clock.tick(1);
    expect(clock.now()).toEqual(new Date("2023-07-15T06:50:00Z"));
    clock.tick(100 * 60_000);
    expect(clock.now()).toEqual(new Date("2023-07-15T08:30:00Z"));
    expect(engine.state).toBe("CONTROLLED");
  });
});

describe("시나리오 C: 경계", () => {
  it("RECOMMENDED(WARN) 상태에서 reason 없이 기각하면 예외를 던진다", () => {
    const site: SiteConfig = { ...SITE, id: "miho-bridge-warn", gaugeId: "warn-gauge" };
    const points: SeedPoint[] = [{ at: new Date("2024-01-01T00:00:00Z"), value: 7.5 }];
    const { engine, clock } = setup(site, points);

    expect(engine.state).toBe("RECOMMENDED"); // WARN만 RECOMMENDED를 거친다
    expect(engine.severity).toBe("WARN");

    expect(() => engine.reject("dept-head", "", clock.now())).toThrow();
    const rejectWithoutReason = engine.reject.bind(engine) as (actor: string) => void;
    expect(() => rejectWithoutReason("dept-head")).toThrow();
  });

  it("기각 후 WARN 정도로만 오르면 재발생 없음, ALERT까지 오르면 WARN 재발생을 거쳐 DIRECTED로 승격한다", () => {
    // 관측 창(끝 시각)과 T2 데드라인이 우연히 겹치지 않도록 여유를 둔다: ALERT 승격은
    // 00:30에 걸리고(T2 due=00:45), 관측은 00:40에 끝난다 — "데드라인 도래"와 "관측 종료"가
    // 같은 순간이 되는 경계 케이스는 이 테스트의 관심사가 아니다.
    const risingPoints: SeedPoint[] = [
      { at: new Date("2024-01-01T00:00:00Z"), value: 7.5 }, // WARN
      { at: new Date("2024-01-01T00:20:00Z"), value: 7.5 }, // 변화 없음 — 재발생 안 함
      { at: new Date("2024-01-01T00:40:00Z"), value: 8.5 }, // 선형 상승 — 그 사이 WARN 재발생 후 ALERT 승격
    ];
    const site: SiteConfig = { ...SITE, id: "miho-bridge-2", gaugeId: "rising-gauge" };
    const { clock, engine, eventLog } = setup(site, risingPoints);

    expect(engine.state).toBe("RECOMMENDED");
    const firstOrderId = engine.alertId;

    engine.reject("dept-head", "오탐으로 판단, 수위 안정적", clock.now());
    expect(engine.state).toBe("REJECTED");

    clock.tick(20 * 60_000); // 00:20 — 7.5, 기각 시점과 동일 → 재발생 없음
    expect(engine.state).toBe("REJECTED");

    // 00:20→00:40 큰 폭 tick 한 번이지만, 값이 선형으로 오르는 한 실제로 WARN 재발생(00:21)을
    // 먼저 거친 뒤에 ALERT로 승격(00:30)한다 — 중간을 건너뛰고 곧장 ALERT로 순간이동하지 않는다.
    clock.tick(20 * 60_000); // 00:40
    expect(engine.state).toBe("DIRECTED");
    expect(engine.severity).toBe("ALERT");
    expect(engine.ladderStep).toBe(1);
    expect(engine.deadlineAt).toEqual(new Date("2024-01-01T00:45:00Z")); // T2(ALERT)=15분, 아직 미만료
    expect(engine.alertId).not.toBe(firstOrderId);

    const events = eventLog.forAlert(engine.alertId!);
    expect(events.map((e) => ({ at: e.occurredAt, from: e.fromState, to: e.toState }))).toEqual([
      { at: new Date("2024-01-01T00:21:00Z"), from: "REJECTED", to: "RECOMMENDED" },
      { at: new Date("2024-01-01T00:30:00Z"), from: "RECOMMENDED", to: "DIRECTED" },
    ]);
  });

  it("WARN → ALERT → DESIGN_FLOOD 순차 승격: 큰 폭 tick 한 번에도 중간 등급을 실제로 거쳐간다", () => {
    const points: SeedPoint[] = [
      { at: new Date("2024-01-01T00:00:00Z"), value: 7.5 }, // WARN → RECOMMENDED, T1=30분
      { at: new Date("2024-01-01T00:10:00Z"), value: 9.5 }, // 10분 뒤 값(선형 보간으로 그 사이 ALERT·DESIGN_FLOOD를 통과)
    ];
    const site: SiteConfig = { ...SITE, id: "miho-bridge-3", gaugeId: "jump-gauge" };
    const { clock, engine, eventLog } = setup(site, points);

    expect(engine.state).toBe("RECOMMENDED");
    expect(engine.severity).toBe("WARN");
    expect(engine.ladderStep).toBe(0);
    expect(engine.deadlineAt).toEqual(new Date("2024-01-01T00:30:00Z")); // T1 30분

    // 한 번의 큰 tick(00:00→00:10)이지만, 게이지 재관측 주기(1분)가 그 사이의 크로스 시점을
    // 실제로 붙잡는다: 00:03에 ALERT, 00:09에 DESIGN_FLOOD — 순간이동이 아니라 순차 승격이다.
    clock.tick(10 * 60_000);
    expect(engine.state).toBe("DIRECTED"); // 승인 없이도 승격만으로 DIRECTED 진입
    expect(engine.severity).toBe("DESIGN_FLOOD");
    expect(engine.ladderStep).toBe(2); // 과장 — DESIGN_FLOOD 자체의 진입 지점과 동일한 결과
    expect(engine.deadlineAt).toEqual(new Date("2024-01-01T00:19:00Z")); // T2(DESIGN_FLOOD)=10분, 실제 크로스 시각(00:09) 기준

    const events = eventLog.forAlert(engine.alertId!);
    expect(events.map((e) => ({ at: e.occurredAt, from: e.fromState, to: e.toState }))).toEqual([
      { at: new Date("2024-01-01T00:00:00Z"), from: "MONITORING", to: "RECOMMENDED" },
      { at: new Date("2024-01-01T00:03:00Z"), from: "RECOMMENDED", to: "DIRECTED" }, // WARN → ALERT 승격
      { at: new Date("2024-01-01T00:09:00Z"), from: "DIRECTED", to: "DIRECTED" }, // ALERT → DESIGN_FLOOD 승격
    ]);
    expect(events[1]!.reason).toContain("ALERT");
    expect(events[2]!.reason).toContain("DESIGN_FLOOD");
  });

  it("등급은 병렬 조건이다: WARN 미만에서 DESIGN_FLOOD 초과로 관측이 곧장 건너뛰면, 중간 등급 없이 사다리도 과장까지 한 번에 점프한다", () => {
    // 스펙: "순차 진행이 아니다. 병렬 조건이며 먼저 걸리는 것이 발동한다." 위 테스트는 값이
    // 선형으로 올라 중간 등급을 실제로 "관측"하는 경우였다. 이 테스트는 그 반대 — 인접
    // 관측점 사이 간격(30초)을 게이지 폴링 주기(60초)보다 짧게 둬서, 중간값을 아예 관측하지
    // 못하는 상황을 재현한다. 관측되지 않은 등급은 거칠 수 없다 — MONITORING에서 최초로
    // 읽은 값이 이미 DESIGN_FLOOD이면, WARN이나 ALERT를 만든 적도 없이 곧장 DESIGN_FLOOD다.
    const points: SeedPoint[] = [
      { at: new Date("2024-02-01T00:00:00Z"), value: 5.0 }, // watchLevel(7.0) 미만 — 평시 감시
      { at: new Date("2024-02-01T00:00:30Z"), value: 10.0 }, // designFloodLevel(9.29) 초과
    ];
    const site: SiteConfig = { ...SITE, id: "miho-bridge-instant-jump", gaugeId: "instant-jump-gauge" };
    const { clock, engine, eventLog } = setup(site, points);

    expect(engine.state).toBe("MONITORING");

    clock.tick(30_000);

    expect(engine.state).toBe("DIRECTED");
    expect(engine.severity).toBe("DESIGN_FLOOD");
    expect(engine.ladderStep).toBe(2); // 과장 — WARN(0)도 ALERT(1)도 만든 적 없이 곧장

    const events = eventLog.all();
    expect(events).toHaveLength(1); // RECOMMENDED도, 중간 DIRECTED(ALERT)도 없다
    expect(events[0]!.fromState).toBe("MONITORING");
    expect(events[0]!.toState).toBe("DIRECTED");
    expect(events[0]!.metadata).toMatchObject({ severity: "DESIGN_FLOOD", ladderStep: 2, assignedTo: "과장" });
  });

  it("현장에서 시설 침수심 5cm 도달을 수동 보고하면 INUNDATION 등급으로 즉시 최상단(부단체장) DIRECTED에 진입한다", () => {
    // INUNDATION은 게이지 수위가 아니라 시설 단위 침수심이라 GaugeSource로 자동 판정할 수 없다.
    // TODO: 시설별 침수심 센서/신고 입력이 생기면 SiteSensorSource 같은 별도 소스로 분리하고,
    // 이 수동 보고 액션은 그 소스의 자동 트리거로 대체하거나 병행한다.
    const site: SiteConfig = { ...SITE, id: "miho-bridge-inundation", gaugeId: "monitoring-gauge" };
    const points: SeedPoint[] = [{ at: new Date("2024-01-01T00:00:00Z"), value: 5.0 }]; // watchLevel 미만 — 평시 감시
    const { clock, engine } = setup(site, points);

    expect(engine.state).toBe("MONITORING");

    engine.reportInundation("현장 대응팀", clock.now());

    expect(engine.state).toBe("DIRECTED");
    expect(engine.severity).toBe("INUNDATION");
    expect(engine.ladderStep).toBe(3); // 부단체장 즉시 호출
    expect(engine.deadlineAt).toEqual(new Date("2024-01-01T00:03:00Z")); // T2(INUNDATION)=3분
  });

  it("INUNDATION으로 수동 진입해도 CONTROLLED → RELEASE_PENDING → MONITORING 경로가 막히지 않는다", () => {
    // 수동 액션이라고 해제 경로에서 예외 취급하지 않는다 — DIRECTED 이후의 흐름은
    // severity가 무엇이었는지와 무관하게 항상 동일한 상태기계를 탄다.
    const site: SiteConfig = { ...SITE, id: "miho-bridge-inundation-release", gaugeId: "inundation-release-gauge" };
    const points: SeedPoint[] = [
      { at: new Date("2024-01-01T00:00:00Z"), value: 5.0 }, // watchLevel 미만 — 계속 이 값으로 평탄
      { at: new Date("2024-01-01T00:40:00Z"), value: 5.0 },
    ];
    const { clock, engine } = setup(site, points, points[1]!.at);

    expect(engine.state).toBe("MONITORING");
    engine.reportInundation("현장 대응팀", clock.now());
    expect(engine.state).toBe("DIRECTED");
    expect(engine.severity).toBe("INUNDATION");

    engine.reportFieldComplete("현장 대응팀", clock.now());
    expect(engine.state).toBe("CONTROLLED");

    clock.tick(1 * 60_000); // 00:01 — watchLevel(5.0 < 7.0) 미만 지속 시작
    expect(engine.state).toBe("CONTROLLED");

    clock.tick(30 * 60_000); // 00:31 — 30분 지속 → RELEASE_PENDING
    expect(engine.state).toBe("RELEASE_PENDING");

    engine.approveRelease("상황실 운영자", clock.now());
    expect(engine.state).toBe("MONITORING");
    expect(engine.severity).toBeNull();
    expect(engine.alertId).toBeNull();
  });
});

describe("시나리오 D: 해제", () => {
  const site: SiteConfig = { ...SITE, id: "miho-bridge-release", gaugeId: "release-gauge" };
  const points: SeedPoint[] = [
    { at: new Date("2024-03-01T00:00:00Z"), value: 8.5 }, // ALERT → DIRECTED
    { at: new Date("2024-03-01T00:02:00Z"), value: 6.0 }, // watchLevel 미만 시작
    { at: new Date("2024-03-01T02:00:00Z"), value: 6.0 }, // 계속 낮게 유지
  ];

  it("CONTROLLED 후 watchLevel 미만이 30분 지속되면 RELEASE_PENDING, 승인하면 MONITORING으로 복귀한다", () => {
    const { clock, engine } = setup(site, points, new Date("2024-03-01T02:00:00Z"));

    engine.reportFieldComplete("현장 대응팀", clock.now());
    expect(engine.state).toBe("CONTROLLED");

    clock.tick(2 * 60_000); // 00:02 — watchLevel 미만 시작
    expect(engine.state).toBe("CONTROLLED");

    clock.tick(30 * 60_000); // 00:32 — 30분 지속
    expect(engine.state).toBe("RELEASE_PENDING");
    expect(engine.ladderStep).toBe(0);
    expect(engine.deadlineAt).toEqual(new Date("2024-03-01T01:32:00Z")); // T3 60분

    engine.approveRelease("상황실 운영자", clock.now());
    expect(engine.state).toBe("MONITORING");
    expect(engine.severity).toBeNull();
    expect(engine.alertId).toBeNull();
  });

  it("RELEASE_PENDING에서 T3 초과 시 사다리 재배정된다 (해제 방치도 관리 실패)", () => {
    const { clock, engine, eventLog } = setup(site, points, new Date("2024-03-01T02:00:00Z"));

    engine.reportFieldComplete("현장 대응팀", clock.now());
    clock.tick(2 * 60_000);
    clock.tick(30 * 60_000);
    expect(engine.state).toBe("RELEASE_PENDING");

    clock.tick(60 * 60_000); // T3 초과 (01:32)
    expect(engine.state).toBe("RELEASE_PENDING"); // 자동 승인하지 않는다 — 통제 유지가 안전한 기본값
    expect(engine.ladderStep).toBe(1); // 팀장으로 재배정
    expect(engine.deadlineAt).toEqual(new Date("2024-03-01T02:32:00Z"));

    const last = eventLog.all().at(-1)!;
    expect(last.reason).toContain("무응답");
  });
});

describe("시나리오 E: 확인은 alert가 아니라 assignment(그 순간 담당자) 단위로 귀속된다", () => {
  // 감사 로그(apps/web/app/audit/page.tsx)가 실제로 쓰는 매칭 규칙을 그대로 재현한다:
  // 무응답 재배정/FORCED 이벤트의 metadata.assignmentId와 같은 assignmentId를 가진
  // acknowledge 이벤트가 있으면 "확인했으나 미조치", 없으면 "미확인".
  function ackStatusFor(
    events: readonly { reason: string | undefined; metadata?: Record<string, unknown> }[],
    escalation: { reason: string | undefined; metadata?: Record<string, unknown> },
  ) {
    const assignmentId = escalation.metadata?.assignmentId;
    const acknowledged = events.some(
      (e) => e.reason === "통제 지시 수신 확인" && e.metadata?.assignmentId === assignmentId,
    );
    return acknowledged ? "확인했으나 미조치" : "미확인";
  }

  // 공유 SEED_POINTS(실측 데이터)와 독립된 전용 시드다 — 이 시나리오는 "assignment 단위
  // 귀속"이라는 일반적인 도메인 성질을 검증하는 것이지, 미호천교 실측 시나리오 자체를
  // 검증하는 게 아니다. 실측 데이터의 정확한 타이밍이 바뀌어도 이 테스트는 영향받지 않는다.
  it("팀장이 확인한 뒤 등급 승격으로 과장에게 재배정되면, 과장의 무응답은 '미확인'이다(팀장의 확인을 물려받지 않는다)", () => {
    const points: SeedPoint[] = [
      { at: new Date("2023-07-15T06:00:00Z"), value: 8.5 }, // ALERT
      { at: new Date("2023-07-15T06:05:00Z"), value: 9.5 }, // DESIGN_FLOOD
      { at: new Date("2023-07-15T06:20:00Z"), value: 9.5 },
    ];
    const site: SiteConfig = { ...SITE, id: "miho-bridge-e1", gaugeId: "ack-e1-gauge" };
    const { clock, engine, eventLog } = setup(site, points, points[2]!.at);

    expect(engine.state).toBe("DIRECTED");
    expect(engine.severity).toBe("ALERT");

    clock.tick(2 * 60_000); // 06:02 — 팀장이 확인
    engine.acknowledge("팀장", clock.now());

    // 06:00→9.5로 선형 상승하는 값이 06:04에 9.30(계획홍수위)을 넘는다 — DESIGN_FLOOD
    // 승격, 과장에게 재배정(새 assignment). 06:05까지 tick해서 승격이 끝난 상태를 본다.
    clock.tick(3 * 60_000); // 06:05
    expect(engine.severity).toBe("DESIGN_FLOOD");
    expect(engine.ladderStep).toBe(2); // 과장
    expect(engine.deadlineAt).toEqual(new Date("2023-07-15T06:14:00Z")); // T2(DESIGN_FLOOD)=10분, 06:04 기준

    clock.tick(9 * 60_000); // 06:14 — 과장 무응답 → 부단체장 재배정
    expect(engine.ladderStep).toBe(3);

    const events = eventLog.forAlert(engine.alertId!);
    const climbEvent = events.find((e) => (e.reason ?? "").includes("무응답(과장)"))!;
    const bumpEvent = events.find((e) => (e.reason ?? "").includes("등급 상승"))!;
    const ackEvent = events.find((e) => e.reason === "통제 지시 수신 확인")!;

    // 팀장의 확인과 과장의 assignment는 서로 다른 assignmentId다.
    expect(climbEvent.metadata?.assignmentId).toBe(bumpEvent.metadata?.assignmentId); // 둘 다 "과장" assignment
    expect(climbEvent.metadata?.assignmentId).not.toBe(ackEvent.metadata?.assignmentId); // 팀장 assignment와는 다름

    expect(ackStatusFor(events, climbEvent)).toBe("미확인");
  });

  it("과장이 직접 확인한 뒤 무응답이면 '확인했으나 미조치'다", () => {
    const points: SeedPoint[] = [
      { at: new Date("2023-07-15T06:00:00Z"), value: 8.5 },
      { at: new Date("2023-07-15T06:05:00Z"), value: 9.5 },
      { at: new Date("2023-07-15T06:20:00Z"), value: 9.5 },
    ];
    const site: SiteConfig = { ...SITE, id: "miho-bridge-e2", gaugeId: "ack-e2-gauge" };
    const { clock, engine, eventLog } = setup(site, points, points[2]!.at);

    clock.tick(5 * 60_000); // 06:05 — DESIGN_FLOOD 승격(06:04), 과장에게 재배정
    expect(engine.severity).toBe("DESIGN_FLOOD");
    expect(engine.ladderStep).toBe(2);

    clock.tick(60_000); // 06:06 — 과장이 직접 확인
    engine.acknowledge("과장", clock.now());

    clock.tick(8 * 60_000); // 06:14 — 그래도 무응답 → 부단체장 재배정
    expect(engine.ladderStep).toBe(3);

    const events = eventLog.forAlert(engine.alertId!);
    const climbEvent = events.find((e) => (e.reason ?? "").includes("무응답(과장)"))!;

    expect(ackStatusFor(events, climbEvent)).toBe("확인했으나 미조치");
  });
});

describe("시나리오 F: 주의보 단계 라이프사이클 (07-14 실측, WARN 등급)", () => {
  // 미호천교 07-14 18:00~21:30 실측(packages/data/src/seed/readings.ts와 동일 값).
  // 18:50 실측 7.00m — 주의보 기준 최초 도달(발령 17:20보다 90분 늦음). 20:50 이후 수위가
  // 주의보 미만으로 내려가 RELEASE_PENDING까지 자연스럽게 이어진다 — apps/web의
  // "주의보 단계" 시나리오(packages/data/src/seed/scenarios.ts)와 동일 구간·값이다.
  const WARN_TIMES = ["18:00", "18:30", "18:50", "19:00", "19:30", "19:50", "20:00", "20:30", "20:50", "21:00", "21:30"] as const;
  const WARN_VALUES = [6.93, 6.98, 7.0, 7.02, 7.03, 7.04, 7.03, 7.01, 6.99, 6.97, 6.92] as const;
  const WARN_POINTS: SeedPoint[] = WARN_TIMES.map((t, i) => ({
    at: new Date(`2023-07-14T${t}:00Z`),
    value: WARN_VALUES[i]!,
  }));
  const WARN_SITE: SiteConfig = { ...SITE, id: "miho-bridge-warn-stage", gaugeId: "warn-stage-gauge" };

  it("18:50 WARN 진입 → 무응답 T1(30분) 재배정 → 승인·현장완료(CONTROLLED) → 저수위 30분 지속 → RELEASE_PENDING → 해제 승인(MONITORING)", () => {
    const start = WARN_POINTS[0]!.at;
    const end = WARN_POINTS[WARN_POINTS.length - 1]!.at;
    const source = new ReplaySource([{ gaugeId: WARN_SITE.gaugeId, points: WARN_POINTS }]);
    const clock = new ReplayClock({ start, end });
    const scheduler = new VirtualScheduler(clock);
    const eventLog = new InMemoryEventLog();
    const engine = new ControlOrderEngine({ site: WARN_SITE, gaugeSource: source, clock, scheduler, eventLog });
    engine.attach(clock);

    // 18:50: 7.00m는 WARN(주의보) — DIRECTED가 아니라 RECOMMENDED(승인 대기)로 진입한다.
    clock.seek(new Date("2023-07-14T18:50:00Z"));
    expect(engine.state).toBe("RECOMMENDED");
    expect(engine.severity).toBe("WARN");
    expect(engine.ladderStep).toBe(0); // 담당 공무원
    expect(engine.deadlineAt).toEqual(new Date("2023-07-14T19:20:00Z")); // T1 30분

    // 19:20: 담당 공무원 무응답 → T1 재배정. 승인/기각 없이도 상태는 여전히 RECOMMENDED다.
    clock.seek(new Date("2023-07-14T19:20:00Z"));
    expect(engine.state).toBe("RECOMMENDED");
    expect(engine.ladderStep).toBe(1); // 팀장
    expect(engine.deadlineAt).toEqual(new Date("2023-07-14T19:50:00Z")); // T1 재예약

    // 19:25: 팀장이 승인 → DIRECTED (재량 승인, 사다리 단계는 그대로).
    clock.seek(new Date("2023-07-14T19:25:00Z"));
    engine.approve("팀장", clock.now());
    expect(engine.state).toBe("DIRECTED");
    expect(engine.ladderStep).toBe(1);
    expect(engine.deadlineAt).toEqual(new Date("2023-07-14T19:55:00Z")); // T2(WARN)=30분

    // 19:30: 현장완료 보고 → CONTROLLED.
    clock.seek(new Date("2023-07-14T19:30:00Z"));
    engine.reportFieldComplete("현장 대응팀", clock.now());
    expect(engine.state).toBe("CONTROLLED");
    expect(engine.deadlineAt).toBeNull();

    // 20:41: 20:30(7.01)→20:50(6.99) 사이 보간으로 실제 하한 통과 시각(20:40, 정확히
    // 7.00이라 <에는 미달)보다 1분 뒤 게이지 폴링에서 주의보 미만이 처음 관측된다.
    clock.seek(new Date("2023-07-14T20:41:00Z"));
    expect(engine.state).toBe("CONTROLLED"); // 아직 30분 미지속

    // 21:11: 20:41부터 30분 지속 → RELEASE_PENDING. 사다리는 처음부터(담당 공무원) 다시 시작.
    clock.seek(new Date("2023-07-14T21:11:00Z"));
    expect(engine.state).toBe("RELEASE_PENDING");
    expect(engine.ladderStep).toBe(0);
    expect(engine.deadlineAt).toEqual(new Date("2023-07-14T22:11:00Z")); // T3 60분

    // 21:20: 해제 승인 → MONITORING, 주문(alertId) 종료.
    clock.seek(new Date("2023-07-14T21:20:00Z"));
    engine.approveRelease("상황실 운영자", clock.now());
    expect(engine.state).toBe("MONITORING");
    expect(engine.severity).toBeNull();
    expect(engine.alertId).toBeNull();

    // 21:30 시나리오 범위 끝까지 MONITORING을 유지한다.
    clock.seek(end);
    expect(engine.state).toBe("MONITORING");

    const events = eventLog.all();
    expect(events.map((e) => ({ at: e.occurredAt, from: e.fromState, to: e.toState }))).toEqual([
      { at: new Date("2023-07-14T18:50:00Z"), from: "MONITORING", to: "RECOMMENDED" },
      { at: new Date("2023-07-14T19:20:00Z"), from: "RECOMMENDED", to: "RECOMMENDED" },
      { at: new Date("2023-07-14T19:25:00Z"), from: "RECOMMENDED", to: "DIRECTED" },
      { at: new Date("2023-07-14T19:30:00Z"), from: "DIRECTED", to: "CONTROLLED" },
      { at: new Date("2023-07-14T21:11:00Z"), from: "CONTROLLED", to: "RELEASE_PENDING" },
      { at: new Date("2023-07-14T21:20:00Z"), from: "RELEASE_PENDING", to: "MONITORING" },
    ]);
    expect(events[1]!.reason).toContain("무응답(담당 공무원)");
    expect(events[4]!.reason).toContain("30분 지속");
  });
});
