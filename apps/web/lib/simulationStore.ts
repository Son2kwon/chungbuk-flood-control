import type { AlertState, ControlOrderEngine, Severity, StateTransitionEvent } from "@chungbuk/domain";
import {
  DEFAULT_SCENARIO_ID,
  OSONG_INCIDENT_TIMELINE,
  SCENARIOS,
  findScenario,
  type IncidentTimelineEntry,
  type Scenario,
  type SiteType,
} from "@chungbuk/data";
import { createCompositionRoot, type CompositionRoot } from "./composition-root";
import { buildNotification, type NotificationRecord } from "./notifications";

export const SPEED_OPTIONS = [1, 60, 600] as const;
export type SpeedOption = (typeof SPEED_OPTIONS)[number];

/** 이 프로토타입에는 로그인/사용자 선택 UI가 없다 — 모든 수동 조작은 이 배우 이름으로 기록된다. */
const DEMO_ACTOR = "상황실 운영자";
const FIELD_ACTOR = "현장 대응팀";
/** ControlOrderEngine.acknowledge()가 기록하는 이벤트 reason과 정확히 일치해야 한다. */
const ACKNOWLEDGE_REASON = "통제 지시 수신 확인";

export interface SiteSnapshot {
  id: string;
  name: string;
  type: SiteType;
  lat: number;
  lng: number;
  /** "verified"(실측) | "example"(예시 지점, 실제 통제 대상 목록 확정 전). 지도 마커 스타일 구분용. */
  coordinateSource: "verified" | "example";
  gaugeId: string;
  state: AlertState;
  severity: Severity | null;
  currentLevel: number | null;
  interpolated: boolean;
  watchLevel: number;
  alertLevel: number;
  ladder: readonly string[];
  ladderStep: number;
  assignedRole: string | null;
  alertId: string | null;
  deadlineAt: Date | null;
  remainingMs: number | null;
  /** 현재 배정(alertId) 건에 대해 "현장 도착" 보고가 있었는지. 도메인 상태가 아니라 현장 화면 전용 UI 표시다. */
  arrivedOnSite: boolean;
  /** 현재 배정(alertId) 건에 대해 "통제 지시 수신 확인" 이벤트가 있었는지. 이벤트 로그에서 파생한다. */
  acknowledged: boolean;
}

export interface SimulationSnapshot {
  now: Date;
  seedStart: Date;
  seedEnd: Date;
  isPlaying: boolean;
  isFinished: boolean;
  speed: SpeedOption;
  sites: SiteSnapshot[];
  selectedSiteId: string;
  reachedIncidents: IncidentTimelineEntry[];
  errorMessage: string | null;
  /** 전체 이벤트 로그 (감사 로그 화면용). 시간순이 아닐 수 있어 화면에서 정렬해 쓴다. */
  events: readonly StateTransitionEvent[];
  /** alertId → 지점명. events에는 지점명이 없어 화면에서 조인할 때 쓴다. */
  siteNameByAlertId: Readonly<Record<string, string>>;
  notifications: readonly NotificationRecord[];
  /** 현재 재생 중인 시나리오와 선택 가능한 전체 목록 (상단 시나리오 드롭다운용). */
  scenario: Scenario;
  scenarios: readonly Scenario[];
}

type Listener = () => void;

export class SimulationStore {
  private root: CompositionRoot;
  private isPlaying = false;
  private lastFrameAt: Date | null = null;
  private selectedSiteId: string;
  private dismissedIncidents = new Set<string>();
  private errorMessage: string | null = null;
  private listeners = new Set<Listener>();
  private snapshot: SimulationSnapshot;
  private arrivedAlertIds = new Set<string>();
  private alertIdToSiteName = new Map<string, string>();
  private notifications: NotificationRecord[] = [];
  private notificationSeq = 0;

  constructor() {
    this.root = createCompositionRoot(DEFAULT_SCENARIO_ID);
    this.selectedSiteId = this.root.sites[0]!.id;
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): SimulationSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): SimulationSnapshot {
    const now = this.root.replayClock.now();
    const allEvents = this.root.eventLog.all();
    const sites: SiteSnapshot[] = this.root.sites.map((site) => {
      const engine = this.root.engines.get(site.id)!;
      const config = this.root.siteConfigs.get(site.id)!;
      const deadlineAt = engine.deadlineAt;
      const alertId = engine.alertId;

      // 지금까지 등장한 모든 alertId를 지점명에 매핑해 둔다 — 감사 로그가 지나간 이벤트도
      // 지점명으로 보여줘야 하므로, alertId가 사라진(RELEASE 이후) 뒤에도 남아 있어야 한다.
      if (alertId) this.alertIdToSiteName.set(alertId, site.name);

      // acknowledged는 UI 전용 플래그가 아니라 이벤트 로그에서 파생한다 — 도메인이 실제로
      // 기록한 acknowledge() 이벤트가 있는지로 판정한다. alertId가 아니라 assignmentId로
      // 매칭한다: 팀장이 확인한 뒤 등급 승격/무응답으로 과장에게 재배정되면, 과장은 아직
      // 확인한 적 없는 새 assignment이므로 배지가 다시 "수신 확인" 버튼으로 돌아가야 한다.
      const assignmentId = engine.assignmentId;
      const acknowledged = assignmentId
        ? allEvents.some((e) => e.reason === ACKNOWLEDGE_REASON && e.metadata?.assignmentId === assignmentId)
        : false;

      return {
        id: site.id,
        name: site.name,
        type: site.type,
        lat: site.lat,
        lng: site.lng,
        coordinateSource: site.coordinateSource,
        gaugeId: site.gaugeId,
        state: engine.state,
        severity: engine.severity,
        currentLevel: engine.lastReading?.value ?? null,
        interpolated: engine.lastReading?.interpolated ?? false,
        watchLevel: config.watchLevel,
        alertLevel: config.alertLevel,
        ladder: config.ladder,
        ladderStep: engine.ladderStep,
        assignedRole: config.ladder[engine.ladderStep] ?? null,
        alertId,
        deadlineAt,
        remainingMs: deadlineAt ? deadlineAt.getTime() - now.getTime() : null,
        arrivedOnSite: alertId ? this.arrivedAlertIds.has(alertId) : false,
        acknowledged,
      };
    });

    return {
      now,
      seedStart: this.root.seedStart,
      seedEnd: this.root.seedEnd,
      isPlaying: this.isPlaying,
      isFinished: now.getTime() >= this.root.seedEnd.getTime(),
      speed: this.root.replayClock.speed as SpeedOption,
      sites,
      selectedSiteId: this.selectedSiteId,
      // 하한 없이 now까지 지난 사건을 전부 보여준다 — 시나리오 시작 시각보다 이전에 일어난
      // 실제 사건(예: 경보 시나리오는 06:30부터라 그 이전의 주의보 발령·경보 상향을 이미
      // 지나쳐 시작한다)은 "재생 시작과 동시에 이미 벌어진 배경 사실"로 곧장 보여주는 게
      // 맞다 — 반대로 아직 오지 않은 사건(예: 주의보 시나리오 구간에는 07:01 신고가 없다)은
      // now가 그 시각에 못 미치므로 자연히 뜨지 않는다. 시나리오마다 별도 하한이 필요 없다.
      reachedIncidents: OSONG_INCIDENT_TIMELINE.filter(
        (entry) => entry.at.getTime() <= now.getTime() && !this.dismissedIncidents.has(entry.label),
      ),
      errorMessage: this.errorMessage,
      events: allEvents,
      siteNameByAlertId: Object.fromEntries(this.alertIdToSiteName),
      notifications: [...this.notifications],
      scenario: findScenario(this.root.scenarioId),
      scenarios: SCENARIOS,
    };
  }

  /** 합성 루트의 liveClock으로 실제 경과 시간을 재서 가상 시각을 전진시킨다. rAF 루프에서 매 프레임 호출한다. */
  tickIfPlaying = (): void => {
    if (!this.isPlaying) return;

    const realNow = this.root.liveClock.now();
    if (this.lastFrameAt === null) {
      this.lastFrameAt = realNow;
      return;
    }
    const deltaMs = realNow.getTime() - this.lastFrameAt.getTime();
    this.lastFrameAt = realNow;
    if (deltaMs <= 0) return;

    const remainingVirtualMs = this.root.seedEnd.getTime() - this.root.replayClock.now().getTime();
    if (remainingVirtualMs <= 0) {
      this.isPlaying = false;
      this.notify();
      return;
    }

    const speed = this.root.replayClock.speed;
    const maxRealMs = remainingVirtualMs / speed;
    const applyRealMs = Math.min(deltaMs, maxRealMs);
    this.root.replayClock.tick(applyRealMs);
    if (this.root.replayClock.now().getTime() >= this.root.seedEnd.getTime()) {
      this.isPlaying = false;
    }
    this.notify();
  };

  play = (): void => {
    if (this.snapshot.isFinished) return;
    this.isPlaying = true;
    this.lastFrameAt = null;
    this.notify();
  };

  pause = (): void => {
    this.isPlaying = false;
    this.lastFrameAt = null;
    this.notify();
  };

  /** 초기화 — 현재 재생 중인 시나리오는 그대로 두고 그 시나리오의 시작 시각으로 되돌린다. */
  reset = (): void => {
    this.rebuildRoot(this.root.scenarioId);
  };

  /** 시나리오 전환 — 엔진과 이벤트 로그를 완전히 새로 만든다. 이전 시나리오의 흔적이 남지 않는다. */
  switchScenario = (scenarioId: string): void => {
    if (scenarioId === this.root.scenarioId) return;
    this.rebuildRoot(scenarioId);
  };

  private rebuildRoot(scenarioId: string): void {
    this.root = createCompositionRoot(scenarioId);
    this.isPlaying = false;
    this.lastFrameAt = null;
    this.selectedSiteId = this.root.sites[0]!.id;
    this.dismissedIncidents.clear();
    this.errorMessage = null;
    this.arrivedAlertIds.clear();
    this.alertIdToSiteName.clear();
    this.notifications = [];
    this.notificationSeq = 0;
    this.notify();
  }

  /** 앞으로만 이동할 수 있다 — 되돌리기는 초기화(reset)로만 가능하다 (도메인의 단조 시간 불변식). */
  seek = (target: Date): void => {
    const now = this.root.replayClock.now();
    if (target.getTime() <= now.getTime()) return;
    const clamped = new Date(Math.min(target.getTime(), this.root.seedEnd.getTime()));
    this.root.replayClock.seek(clamped);
    if (this.root.replayClock.now().getTime() >= this.root.seedEnd.getTime()) {
      this.isPlaying = false;
    }
    this.notify();
  };

  setSpeed = (speed: SpeedOption): void => {
    this.root.replayClock.setSpeed(speed);
    this.notify();
  };

  selectSite = (siteId: string): void => {
    this.selectedSiteId = siteId;
    this.notify();
  };

  dismissIncident = (label: string): void => {
    this.dismissedIncidents.add(label);
    this.notify();
  };

  /** 승인은 통제 권고를 APPROVED로 전이시키는 동시에, 그 시점에 주민 알림을 자동 생성한다(mock). */
  approve = (siteId: string): void => {
    const engine = this.root.engines.get(siteId);
    const site = this.root.sites.find((s) => s.id === siteId);
    if (!engine || !site) return;
    try {
      const now = this.root.replayClock.now();
      engine.approve(DEMO_ACTOR, now);
      this.notifications.push(buildNotification(site, now, this.notificationSeq++));
      this.errorMessage = null;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
    this.notify();
  };

  reject = (siteId: string, reason: string): void => {
    this.runAction(siteId, (engine, now) => engine.reject(DEMO_ACTOR, reason, now));
  };

  /**
   * DIRECTED 지시를 수신했다는 확인만 기록한다. 상태도, 타이머도 건드리지 않는다 —
   * 확인 후에도 카운트다운은 계속 돌고, 조치가 없으면 그대로 에스컬레이션된다.
   */
  acknowledge = (siteId: string): void => {
    const config = this.root.siteConfigs.get(siteId);
    const engine = this.root.engines.get(siteId);
    const actor = config && engine ? (config.ladder[engine.ladderStep] ?? DEMO_ACTOR) : DEMO_ACTOR;
    this.runAction(siteId, (e, now) => e.acknowledge(actor, now));
  };

  /** 현장 대응팀의 완료 보고. 상황실 화면과 /field 화면 양쪽에서 호출될 수 있다. */
  reportFieldComplete = (siteId: string): void => {
    this.runAction(siteId, (engine, now) => engine.reportFieldComplete(FIELD_ACTOR, now));
  };

  approveRelease = (siteId: string): void => {
    this.runAction(siteId, (engine, now) => engine.approveRelease(DEMO_ACTOR, now));
  };

  /** "현장 도착" — 도메인 상태를 바꾸지 않는 현장 화면 전용 표시. 도메인에 기록되지 않는다. */
  markArrived = (siteId: string): void => {
    const engine = this.root.engines.get(siteId);
    const alertId = engine?.alertId;
    if (!alertId) return;
    this.arrivedAlertIds.add(alertId);
    this.notify();
  };

  private runAction(siteId: string, action: (engine: ControlOrderEngine, now: Date) => void): void {
    const engine = this.root.engines.get(siteId);
    if (!engine) return;
    try {
      action(engine, this.root.replayClock.now());
      this.errorMessage = null;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    }
    this.notify();
  }

  getGaugeSource() {
    return this.root.gaugeSource;
  }
}

export function createSimulationStore(): SimulationStore {
  return new SimulationStore();
}
