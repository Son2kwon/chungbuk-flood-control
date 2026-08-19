import {
  ControlOrderEngine,
  InMemoryEventLog,
  ReplayClock,
  VirtualScheduler,
  type AlertState,
  type StateTransitionEvent,
} from "@chungbuk/domain";
import { createChungbukReplayGaugeSource, findScenario, SITES } from "@chungbuk/data";
import { buildSiteConfig } from "./composition-root";
import { formatShortClock } from "./format";

const SITE_ID = "gungpyeong2-underpass";
/** 이 비교는 항상 "경보에서 참사까지" 시나리오 고정이다 — 상황실의 시나리오 선택과 무관하다. */
const SCENARIO_START = findScenario("alert-to-disaster").start;
/** 실제 유입 시각(국무조정실 발표). 시나리오 A/B 최종 상태를 이 시점 기준으로 대비시킨다. */
const FLOOD_AT = new Date("2023-07-15T08:27:00Z");

// packages/domain/test/mihocheongyo.test.ts 시나리오 B와 동일한 타이밍.
// 06:30 실측 9.20m = ALERT로 DIRECTED 직행(의무 통제라 승인 절차가 없다) → 06:35 수신
// 확인(타이머 불변) → 06:40 DESIGN_FLOOD 승격(타이머 리셋) → T2(DESIGN_FLOOD)=10분
// 만료(06:50) 직전에 완료 보고.
const ACKNOWLEDGE_AT = new Date("2023-07-15T06:35:00Z");
const COMPLETE_AT = new Date("2023-07-15T06:49:59.999Z");

export interface ScenarioResult {
  key: "A" | "B";
  label: string;
  description: string;
  events: StateTransitionEvent[];
  stateAtFloodTime: AlertState;
}

/** 두 시나리오 칼럼이 공통으로 표시하는 "실제 유입 시각" 라벨. */
export const FLOOD_AT_LABEL = formatShortClock(FLOOD_AT);

/**
 * 실시간 재생과 무관하게, 독립된 합성 루트로 결정론적으로 시나리오를 끝까지 돌린다.
 * /compare는 "실제로 무슨 일이 있었는지"가 아니라 "무응답 vs 대응"이라는 반사실적 비교이므로,
 * 상황실의 살아있는 시뮬레이션(SimulationStore)과는 별개의 계산이다.
 */
function runScenario(respond: boolean): ScenarioResult {
  const site = SITES.find((s) => s.id === SITE_ID);
  if (!site) throw new Error(`알 수 없는 지점: ${SITE_ID}`);

  const siteConfig = buildSiteConfig(site);
  const gaugeSource = createChungbukReplayGaugeSource();
  const clock = new ReplayClock({ start: SCENARIO_START, end: FLOOD_AT });
  const scheduler = new VirtualScheduler(clock);
  const eventLog = new InMemoryEventLog();
  const engine = new ControlOrderEngine({ site: siteConfig, gaugeSource, clock, scheduler, eventLog });
  engine.attach(clock);

  if (respond) {
    clock.seek(ACKNOWLEDGE_AT);
    engine.acknowledge("당직자", clock.now());
    clock.seek(COMPLETE_AT);
    engine.reportFieldComplete("현장 대응팀", clock.now());
  }

  clock.seek(FLOOD_AT);

  return respond
    ? {
        key: "B",
        label: "시나리오 B · 대응",
        description: "06:35 수신 확인, 06:49 현장완료 보고",
        events: [...eventLog.all()],
        stateAtFloodTime: engine.state,
      }
    : {
        key: "A",
        label: "시나리오 A · 무응답",
        description: "아무도 응답하지 않음",
        events: [...eventLog.all()],
        stateAtFloodTime: engine.state,
      };
}

export function computeScenarioComparison(): { scenarioA: ScenarioResult; scenarioB: ScenarioResult } {
  return { scenarioA: runScenario(false), scenarioB: runScenario(true) };
}
