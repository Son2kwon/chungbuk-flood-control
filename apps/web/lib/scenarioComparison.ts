import {
  ControlOrderEngine,
  InMemoryEventLog,
  ReplayClock,
  VirtualScheduler,
  type AlertState,
  type StateTransitionEvent,
} from "@chungbuk/domain";
import { createChungbukReplayGaugeSource, SITES } from "@chungbuk/data";
import { buildSiteConfig, SEED_START } from "./composition-root";

const SITE_ID = "gungpyeong2-underpass";
const FLOOD_AT = new Date("2023-07-15T08:30:00Z");

// Stage 1 테스트의 시나리오 B와 동일한 타이밍: T1(SEVERE)=5분 만료 직전에 승인, 06:50에 완료 보고.
const APPROVE_AFTER_MS = 5 * 60_000 - 1;
const COMPLETE_AFTER_APPROVE_MS = 1 + 15 * 60_000;

export interface ScenarioResult {
  key: "A" | "B";
  label: string;
  description: string;
  events: StateTransitionEvent[];
  stateAt0830: AlertState;
}

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
  const clock = new ReplayClock({ start: SEED_START, end: FLOOD_AT });
  const scheduler = new VirtualScheduler(clock);
  const eventLog = new InMemoryEventLog();
  const engine = new ControlOrderEngine({ site: siteConfig, gaugeSource, clock, scheduler, eventLog });
  engine.attach(clock);

  if (respond) {
    clock.tick(APPROVE_AFTER_MS);
    engine.approve("당직자", clock.now());
    clock.tick(COMPLETE_AFTER_APPROVE_MS);
    engine.reportFieldComplete("현장 대응팀", clock.now());
  }

  clock.seek(FLOOD_AT);

  return respond
    ? {
        key: "B",
        label: "시나리오 B · 대응",
        description: "06:35 승인, 06:50 현장완료 보고",
        events: [...eventLog.all()],
        stateAt0830: engine.state,
      }
    : {
        key: "A",
        label: "시나리오 A · 무응답",
        description: "아무도 응답하지 않음",
        events: [...eventLog.all()],
        stateAt0830: engine.state,
      };
}

export function computeScenarioComparison(): { scenarioA: ScenarioResult; scenarioB: ScenarioResult } {
  return { scenarioA: runScenario(false), scenarioB: runScenario(true) };
}
