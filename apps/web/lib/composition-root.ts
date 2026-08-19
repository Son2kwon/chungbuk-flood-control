import {
  ControlOrderEngine,
  InMemoryEventLog,
  LiveClock,
  ReplayClock,
  VirtualScheduler,
  type EventLog,
  type GaugeSource,
  type SiteConfig,
} from "@chungbuk/domain";
import {
  createChungbukReplayGaugeSource,
  DEFAULT_SCENARIO_ID,
  findScenario,
  GAUGES,
  SITES,
  USERS,
  type SiteSeed,
} from "@chungbuk/data";

const GAUGE_BY_ID = new Map(GAUGES.map((g) => [g.id, g]));

function resolveLadder(escalationGroupId: string): string[] {
  return USERS.filter((u) => u.ladderGroupId === escalationGroupId)
    .sort((a, b) => a.ladderOrder - b.ladderOrder)
    .map((u) => u.name);
}

/**
 * 시드의 Site/Gauge를 도메인의 SiteConfig로 변환한다. 합성 루트(전체 5개 지점)와
 * /compare(궁평2지하차도 단독, 독립 시뮬레이션)가 이 로직을 공유한다 — 사다리/임계값을
 * 유도하는 규칙은 한 곳에만 존재해야 한다.
 */
export function buildSiteConfig(site: SiteSeed): SiteConfig {
  const gauge = GAUGE_BY_ID.get(site.gaugeId);
  if (!gauge) throw new Error(`알 수 없는 관측소: ${site.gaugeId}`);
  return {
    id: site.id,
    name: site.name,
    gaugeId: site.gaugeId,
    watchLevel: gauge.warnLevel,
    alertLevel: gauge.alertLevel,
    designFloodLevel: gauge.designFloodLevel,
    ladder: resolveLadder(site.escalationGroupId),
  };
}

/**
 * 합성 루트. Clock/GaugeSource/EventLog의 실제 구현체를 여기서만 조립한다.
 * 도메인(ControlOrderEngine)은 이 중 어떤 것도 직접 만들지 않고 주입받기만 한다.
 */
export interface CompositionRoot {
  liveClock: LiveClock;
  replayClock: ReplayClock;
  scheduler: VirtualScheduler;
  eventLog: EventLog;
  gaugeSource: GaugeSource;
  sites: readonly SiteSeed[];
  siteConfigs: ReadonlyMap<string, SiteConfig>;
  engines: ReadonlyMap<string, ControlOrderEngine>;
  scenarioId: string;
  seedStart: Date;
  seedEnd: Date;
}

/** scenarioId를 생략하면 기본 시나리오("경보에서 참사까지")로 조립한다. */
export function createCompositionRoot(scenarioId: string = DEFAULT_SCENARIO_ID): CompositionRoot {
  const scenario = findScenario(scenarioId);
  const liveClock = new LiveClock();
  const replayClock = new ReplayClock({ start: scenario.start, end: scenario.end, speed: 1 });
  const scheduler = new VirtualScheduler(replayClock);
  const eventLog = new InMemoryEventLog();
  const gaugeSource = createChungbukReplayGaugeSource();

  const siteConfigs = new Map<string, SiteConfig>();
  const engines = new Map<string, ControlOrderEngine>();

  for (const site of SITES) {
    const siteConfig = buildSiteConfig(site);
    siteConfigs.set(site.id, siteConfig);

    const engine = new ControlOrderEngine({ site: siteConfig, gaugeSource, clock: replayClock, scheduler, eventLog });
    engine.attach(replayClock);
    engines.set(site.id, engine);
  }

  return {
    liveClock,
    replayClock,
    scheduler,
    eventLog,
    gaugeSource,
    sites: SITES,
    siteConfigs,
    engines,
    scenarioId: scenario.id,
    seedStart: scenario.start,
    seedEnd: scenario.end,
  };
}
