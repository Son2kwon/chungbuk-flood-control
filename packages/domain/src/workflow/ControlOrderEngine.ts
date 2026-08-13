import type { Clock } from "../clock/Clock";
import type { ReplayClock } from "../clock/ReplayClock";
import { computeSeverity } from "../control/severity";
import { ladderStartIndex } from "../control/ladder";
import { withEuroParticle } from "../control/korean";
import type { EventLog } from "../events/EventLog";
import type { GaugeSource, Reading } from "../gauge/GaugeSource";
import type { Scheduler } from "../scheduler/Scheduler";
import {
  DEFAULT_TIMERS,
  SEVERITY_ORDER,
  type AlertState,
  type EscalationTimers,
  type Severity,
  type SiteConfig,
} from "../types/index";

export interface ControlOrderEngineDeps {
  site: SiteConfig;
  gaugeSource: GaugeSource;
  clock: Clock;
  scheduler: Scheduler;
  eventLog: EventLog;
}

/**
 * 게이지 재관측 주기(내부 구현 세부사항, SiteConfig로 노출하지 않는다). T1/T2/T3는 "사람이
 * 응답할 때까지" 기다리는 정책이지만, 이건 정책이 아니라 "임계값을 실제로 넘는 순간을
 * 놓치지 않기 위한" 메커니즘이다 — ReplayClock/VirtualScheduler는 등록된 breakpoint(타이머
 * 만료 시각)와 seek()/tick()의 최종 목표 시각에서만 게이지를 재관측하므로, 아무 타이머도
 * 안 걸린 채 큰 폭으로 seek()하면 그 사이의 등급 변화나 저수위 지속 조건을 지나쳐버린다.
 * 이 주기 자체를 스케줄러 breakpoint로 등록해 두면(스스로를 계속 재예약한다), seek()이
 * 배속·구간 크기와 무관하게 이 주기마다 반드시 멈춰서 게이지를 재확인하게 된다.
 */
const GAUGE_POLL_INTERVAL_MS = 60_000;

/**
 * 하나의 침수 취약지점(Site)에 대한 통제 권고 상태기계.
 * 수위 판독은 자동이지만, 승인/기각/수신확인/현장완료/해제승인/침수신고는 사람의 명시적
 * 행위(actor)로만 일어난다. 정해진 타이머(T1/T2/T3) 안에 그 행위가 없으면 사다리를 타고
 * 자동으로 위로 올라간다.
 *
 * 호우경보(ALERT) 이상은 재량이 아니라 의무 통제이므로, RECOMMENDED(승인 대기)를 거치지
 * 않고 곧장 DIRECTED(지시)로 진입한다. RECOMMENDED는 WARN 등급에서만 존재한다.
 */
export class ControlOrderEngine {
  private readonly site: SiteConfig;
  private readonly gaugeSource: GaugeSource;
  private readonly clock: Clock;
  private readonly scheduler: Scheduler;
  private readonly eventLog: EventLog;
  private readonly timers: EscalationTimers;

  private _state: AlertState = "MONITORING";
  private _severity: Severity | null = null;
  private _ladderStep = 0;
  private currentOrderId: string | null = null;
  private orderSeq = 0;
  private eventSeq = 0;

  /**
   * "지금 사다리의 이 단계를 맡고 있는 사람"의 재직 기간 단위. alertId(주문) 하나에 여러
   * assignment가 순차로 걸린다 — 사다리가 재배정되거나(무응답 재배정) 등급 승격으로
   * 담당자가 바뀔 때마다 새 assignment가 시작된다. acknowledge()는 항상 "현재"
   * assignment에 귀속된다: 팀장이 확인한 뒤 과장으로 재배정되면, 과장의 무응답은
   * 팀장의 확인과 무관하게 "미확인"이어야 한다 — 그걸 구분 못 하면 실제로 아무도
   * 확인하지 않은 재배정도 "확인했으나 미조치"로 잘못 표시된다.
   */
  private currentAssignmentId: string | null = null;
  private assignmentSeq = 0;

  private _lastReading: Reading | null = null;
  private rejectedAtValue: number | null = null;
  private belowWatchSince: Date | null = null;

  private t1Id: string | null = null;
  private t2Id: string | null = null;
  private t3Id: string | null = null;
  private t1Due: Date | null = null;
  private t2Due: Date | null = null;
  private t3Due: Date | null = null;
  private pollId: string | null = null;

  constructor(deps: ControlOrderEngineDeps) {
    this.site = deps.site;
    this.gaugeSource = deps.gaugeSource;
    this.clock = deps.clock;
    this.scheduler = deps.scheduler;
    this.eventLog = deps.eventLog;
    this.timers = {
      t1: deps.site.timers?.t1 ?? DEFAULT_TIMERS.t1,
      t2: { ...DEFAULT_TIMERS.t2, ...deps.site.timers?.t2 },
      t3: deps.site.timers?.t3 ?? DEFAULT_TIMERS.t3,
      releaseSustainMs: deps.site.timers?.releaseSustainMs ?? DEFAULT_TIMERS.releaseSustainMs,
    };
  }

  get state(): AlertState {
    return this._state;
  }

  get severity(): Severity | null {
    return this._severity;
  }

  get ladderStep(): number {
    return this._ladderStep;
  }

  get alertId(): string | null {
    return this.currentOrderId;
  }

  /**
   * 지금 사다리 단계를 맡고 있는 담당자의 재직(assignment) id. acknowledge()가 어느
   * assignment에 귀속되는지, 그리고 UI가 "지금 이 담당자가 확인했는가"를 판정할 때 쓴다 —
   * alertId만으로 판정하면 재배정 이후에도 이전 담당자의 확인이 남아있는 것처럼 보인다.
   */
  get assignmentId(): string | null {
    return this.currentAssignmentId;
  }

  /** 마지막으로 관측한 게이지 값. UI가 "현재 수위"를 표시할 때 재조회 없이 쓸 수 있다. */
  get lastReading(): Reading | null {
    return this._lastReading;
  }

  /**
   * 현재 활성 타이머(T1/T2/T3)의 만료 시각. 타이머가 없는 상태(예: MONITORING, CONTROLLED,
   * FORCED)면 null. UI는 이 값과 clock.now()의 차이로 카운트다운을 표시할 뿐, 만료 여부를
   * 스스로 판정하지 않는다 — 판정은 항상 스케줄러/엔진이 한다.
   */
  get deadlineAt(): Date | null {
    switch (this._state) {
      case "RECOMMENDED":
        return this.t1Due;
      case "DIRECTED":
        return this.t2Due;
      case "RELEASE_PENDING":
        return this.t3Due;
      default:
        return null;
    }
  }

  /** ReplayClock에 연결해 클럭이 전진할 때마다 게이지를 자동으로 샘플링하게 한다. */
  attach(clock: ReplayClock): () => void {
    this.sample(clock.now());
    this.schedulePoll(clock.now());
    return clock.onAdvance((_from, to) => this.sample(to));
  }

  /** at 시각의 게이지 값을 읽어 상태기계에 반영한다. attach() 없이 수동으로도 호출 가능. */
  sample(at: Date): void {
    const reading = this.gaugeSource.read(this.site.gaugeId, at);
    if (!reading) return;
    this._lastReading = reading;
    this.onReading(reading, at);
  }

  /**
   * GAUGE_POLL_INTERVAL_MS마다 스스로를 재예약하는 breakpoint. 콜백 자체는 아무 것도
   * 판정하지 않는다 — breakpoint를 세워 두면 스케줄러가 그 시각에 클럭을 멈추고, 그때
   * attach()가 구독해 둔 sample()이 자연히 같이 불린다. 즉 이 재관측은 sample()을 직접
   * 부르지 않고도, 클럭이 그 시각을 반드시 통과하게 만드는 방식으로 이뤄진다.
   */
  private schedulePoll(at: Date): void {
    if (this.pollId) this.scheduler.cancel(this.pollId);
    const due = new Date(at.getTime() + GAUGE_POLL_INTERVAL_MS);
    this.pollId = this.scheduler.scheduleAt(due, () => this.onPoll());
  }

  private onPoll(): void {
    this.pollId = null;
    this.schedulePoll(this.clock.now());
  }

  /** 새 담당자 재직(assignment)을 시작한다. 이전 assignment의 확인 여부는 이걸 넘겨받지 않는다. */
  private newAssignment(): string {
    this.currentAssignmentId = `${this.currentOrderId}-assignment-${++this.assignmentSeq}`;
    return this.currentAssignmentId;
  }

  private onReading(reading: Reading, at: Date): void {
    const severity = computeSeverity(
      reading.value,
      this.site.watchLevel,
      this.site.alertLevel,
      this.site.designFloodLevel,
    );

    switch (this._state) {
      case "MONITORING":
        if (severity) this.enterFresh(severity, at);
        break;
      case "RECOMMENDED":
        // RECOMMENDED는 WARN 전용이다. ALERT 이상으로 오르면 승인 대기를 건너뛰고
        // 곧장 DIRECTED로 직행한다 — 의무 통제 구간에서는 승인 절차 자체가 없다.
        if (severity && severity !== "WARN") {
          this.escalateFromRecommended(severity, at);
        }
        break;
      case "DIRECTED":
        if (severity && this._severity && SEVERITY_ORDER[severity] > SEVERITY_ORDER[this._severity]) {
          this.bumpSeverity(severity, at);
        }
        break;
      case "CONTROLLED":
        this.trackReleaseCondition(reading, at);
        break;
      case "REJECTED":
        if (severity && this.rejectedAtValue !== null && reading.value > this.rejectedAtValue) {
          this.enterFresh(severity, at, "기각 후 수위 재상승 — 통제 권고 재발생");
        }
        break;
      default:
        break;
    }
  }

  /** MONITORING/REJECTED에서 새 order로 진입한다. WARN이면 RECOMMENDED, 그 이상이면 DIRECTED. */
  private enterFresh(severity: Severity, at: Date, reason?: string): void {
    if (severity === "WARN") {
      this.recommend(at, reason);
    } else {
      this.freshDirect(severity, at, reason);
    }
  }

  private recommend(at: Date, reason?: string): void {
    const from = this._state;
    this.currentOrderId = `${this.site.id}-order-${++this.orderSeq}`;
    this._severity = "WARN";
    this._ladderStep = ladderStartIndex("WARN", this.site.ladder.length);
    this._state = "RECOMMENDED";
    this.newAssignment();
    this.logEvent(from, "RECOMMENDED", "system", reason, at, {
      severity: "WARN",
      ladderStep: this._ladderStep,
      assignedTo: this.site.ladder[this._ladderStep],
      assignmentId: this.currentAssignmentId,
    });
    this.scheduleT1(at);
  }

  private freshDirect(severity: Severity, at: Date, reason?: string): void {
    const from = this._state;
    this.currentOrderId = `${this.site.id}-order-${++this.orderSeq}`;
    this._severity = severity;
    this._ladderStep = ladderStartIndex(severity, this.site.ladder.length);
    this._state = "DIRECTED";
    this.newAssignment();
    this.logEvent(from, "DIRECTED", "system", reason, at, {
      severity,
      ladderStep: this._ladderStep,
      assignedTo: this.site.ladder[this._ladderStep],
      assignmentId: this.currentAssignmentId,
    });
    this.scheduleT2(at);
  }

  /** RECOMMENDED(WARN) 중 ALERT 이상으로 승격 — 승인 없이 곧장 DIRECTED로, 타이머 리셋 + 사다리 점프. */
  private escalateFromRecommended(severity: Severity, at: Date): void {
    if (this.t1Id) this.scheduler.cancel(this.t1Id);
    this.t1Id = null;
    this.t1Due = null;
    const from = this._state;
    this._severity = severity;
    this._ladderStep = ladderStartIndex(severity, this.site.ladder.length);
    this._state = "DIRECTED";
    // WARN 담당자(담당 공무원)의 assignment는 여기서 끝난다 — ALERT 이상은 다른 사람(사다리
    // 상위 단계) 몫이므로, 그 사람이 아직 확인한 적 없는 새 assignment로 넘어간다.
    this.newAssignment();
    this.logEvent(from, "DIRECTED", "system", `WARN → ${severity} 승격 — 의무 통제 직행`, at, {
      severity,
      ladderStep: this._ladderStep,
      assignedTo: this.site.ladder[this._ladderStep],
      assignmentId: this.currentAssignmentId,
    });
    this.scheduleT2(at);
  }

  /** DIRECTED 상태에서 상위 등급으로 승격 — 타이머 리셋 + 사다리 점프(현재 단계보다 낮아지지 않음). */
  private bumpSeverity(severity: Severity, at: Date): void {
    const from = this._severity;
    this._severity = severity;
    const nextStep = Math.max(this._ladderStep, ladderStartIndex(severity, this.site.ladder.length));
    // 담당자가 실제로 바뀔 때만(사다리 단계가 오를 때만) 새 assignment를 연다. 이미 최상단이라
    // 승격에도 단계가 그대로면(같은 사람) 기존 assignment의 확인 여부를 그대로 이어받는다.
    if (nextStep !== this._ladderStep) {
      this._ladderStep = nextStep;
      this.newAssignment();
    }
    this.logEvent(this._state, this._state, "system", `등급 상승: ${from} → ${severity}`, at, {
      severity,
      ladderStep: this._ladderStep,
      assignedTo: this.site.ladder[this._ladderStep],
      assignmentId: this.currentAssignmentId,
    });
    this.scheduleT2(at);
  }

  private scheduleT1(at: Date): void {
    if (this.t1Id) this.scheduler.cancel(this.t1Id);
    const due = new Date(at.getTime() + this.timers.t1);
    this.t1Due = due;
    this.t1Id = this.scheduler.scheduleAt(due, () => this.onT1Timeout());
  }

  private onT1Timeout(): void {
    this.t1Id = null;
    this.t1Due = null;
    if (this._state !== "RECOMMENDED") return;
    const at = this.clock.now();
    this.climbOrForce(at, () => this.scheduleT1(at));
  }

  private scheduleT2(at: Date): void {
    if (this.t2Id) this.scheduler.cancel(this.t2Id);
    const severity = this._severity ?? "WARN";
    const due = new Date(at.getTime() + this.timers.t2[severity]);
    this.t2Due = due;
    this.t2Id = this.scheduler.scheduleAt(due, () => this.onT2Timeout());
  }

  private onT2Timeout(): void {
    this.t2Id = null;
    this.t2Due = null;
    if (this._state !== "DIRECTED") return;
    const at = this.clock.now();
    this.climbOrForce(at, () => this.scheduleT2(at));
  }

  private climbOrForce(at: Date, reschedule: () => void): void {
    const top = this.site.ladder.length - 1;
    // 이 이벤트가 보고하는 건 "방금 시한을 넘긴 그 assignment"다 — 새로 여는 assignment가
    // 아니다. 그래서 재배정하기 전에 지금 만료되는 assignment의 id를 먼저 붙잡아 둔다.
    const expiredAssignmentId = this.currentAssignmentId;
    if (this._ladderStep < top) {
      const from = this.site.ladder[this._ladderStep];
      this._ladderStep += 1;
      this.newAssignment();
      this.logEvent(
        this._state,
        this._state,
        "system",
        `무응답(${from}) → ${withEuroParticle(this.site.ladder[this._ladderStep]!)} 재배정`,
        at,
        { ladderStep: this._ladderStep, assignedTo: this.site.ladder[this._ladderStep], assignmentId: expiredAssignmentId },
      );
      reschedule();
    } else {
      const from = this._state;
      this._state = "FORCED";
      this.logEvent(from, "FORCED", "system", `사다리 최상단(${this.site.ladder[top]}) 무응답 → 강제 조치`, at, {
        ladderStep: this._ladderStep,
        assignmentId: expiredAssignmentId,
      });
      this.forceActions(at);
    }
  }

  /**
   * 사다리 최상단에서도 시한을 초과하면 수행하는 강제 조치 3종. 각각 개별 이벤트로 기록한다.
   * 코드명(metadata.forcedAction)은 CLAUDE.md "확정된 사양 결정" 절에 고정돼 있다 — UI가
   * 그대로 참조하므로 여기서 바꾸면 그쪽도 함께 바꿔야 한다.
   * 1번은 통제 사실 통보이지 주민 대피 명령이 아니다 — 대피는 회의체 결정 사항이라 시스템이
   * 자동 발령하지 않는다.
   */
  private forceActions(at: Date): void {
    this.logEvent("FORCED", "FORCED", "system", "해당 시설 진입 금지 알림 발송 + 우회 경로 정보 제공", at, {
      forcedAction: "ENTRY_BAN_NOTICE",
    });
    this.logEvent("FORCED", "FORCED", "system", "인접 시설 담당자에게 확산 알림 발송", at, {
      forcedAction: "ADJACENT_SITE_ALERT",
    });
    this.logEvent("FORCED", "FORCED", "system", "도 대책본부 자동 보고", at, {
      forcedAction: "PROVINCIAL_REPORT",
    });
  }

  private scheduleT3(at: Date): void {
    if (this.t3Id) this.scheduler.cancel(this.t3Id);
    const due = new Date(at.getTime() + this.timers.t3);
    this.t3Due = due;
    this.t3Id = this.scheduler.scheduleAt(due, () => this.onT3Timeout());
  }

  private onT3Timeout(): void {
    this.t3Id = null;
    this.t3Due = null;
    if (this._state !== "RELEASE_PENDING") return;
    const at = this.clock.now();
    const top = this.site.ladder.length - 1;
    if (this._ladderStep < top) {
      const from = this.site.ladder[this._ladderStep];
      const expiredAssignmentId = this.currentAssignmentId;
      this._ladderStep += 1;
      this.newAssignment();
      this.logEvent(
        this._state,
        this._state,
        "system",
        `해제 승인 무응답(${from}) → ${withEuroParticle(this.site.ladder[this._ladderStep]!)} 재배정`,
        at,
        { ladderStep: this._ladderStep, assignedTo: this.site.ladder[this._ladderStep], assignmentId: expiredAssignmentId },
      );
      this.scheduleT3(at);
    } else {
      // 해제를 강제로 자동 승인하지 않는다: 무응답의 안전한 기본값은 "통제 유지"이다.
      this.logEvent(
        this._state,
        this._state,
        "system",
        `사다리 최상단(${this.site.ladder[top]}) 무응답 — 해제 보류 유지, 수동 개입 필요`,
        at,
        { ladderStep: this._ladderStep },
      );
    }
  }

  private trackReleaseCondition(reading: Reading, at: Date): void {
    if (reading.value < this.site.watchLevel) {
      if (this.belowWatchSince === null) {
        this.belowWatchSince = at;
        return;
      }
      if (at.getTime() - this.belowWatchSince.getTime() >= this.timers.releaseSustainMs) {
        const from = this._state;
        this._state = "RELEASE_PENDING";
        this._ladderStep = 0;
        this.belowWatchSince = null;
        this.newAssignment();
        this.logEvent(from, "RELEASE_PENDING", "system", `수위 ${this.site.watchLevel}m 미만 30분 지속`, at, {
          ladderStep: this._ladderStep,
          assignedTo: this.site.ladder[this._ladderStep],
          assignmentId: this.currentAssignmentId,
        });
        this.scheduleT3(at);
      }
    } else {
      this.belowWatchSince = null;
    }
  }

  /** RECOMMENDED → DIRECTED. actor의 명시적 승인 행위(WARN 등급의 의무 통제 전 재량 승인). */
  approve(actor: string, at: Date = this.clock.now()): void {
    if (this._state !== "RECOMMENDED") {
      throw new Error(`approve()는 RECOMMENDED 상태에서만 가능합니다 (현재: ${this._state})`);
    }
    if (this.t1Id) this.scheduler.cancel(this.t1Id);
    this.t1Id = null;
    this.t1Due = null;
    const from = this._state;
    this._state = "DIRECTED";
    // 담당자는 바뀌지 않는다(WARN 사다리 시작 단계 그대로) — 승인은 "같은 사람"이 임무
    // 유형만 바꾸는 것이라 assignment를 새로 열지 않는다.
    this.logEvent(from, "DIRECTED", actor, undefined, at, {
      severity: this._severity,
      ladderStep: this._ladderStep,
      assignedTo: this.site.ladder[this._ladderStep],
      assignmentId: this.currentAssignmentId,
    });
    this.scheduleT2(at);
  }

  /** RECOMMENDED → REJECTED. reason은 필수이며, 없으면 예외를 던진다. */
  reject(actor: string, reason: string, at: Date = this.clock.now()): void {
    if (!reason || reason.trim().length === 0) {
      throw new Error("기각 사유(reason)는 필수입니다.");
    }
    if (this._state !== "RECOMMENDED") {
      throw new Error(`reject()는 RECOMMENDED 상태에서만 가능합니다 (현재: ${this._state})`);
    }
    if (this.t1Id) this.scheduler.cancel(this.t1Id);
    this.t1Id = null;
    this.t1Due = null;
    const from = this._state;
    this._state = "REJECTED";
    this.rejectedAtValue = this._lastReading?.value ?? null;
    this.logEvent(from, "REJECTED", actor, reason, at);
  }

  /**
   * DIRECTED 상태에서 "통제 지시를 수신했다"는 확인만 기록한다. 상태 전이 없음, T2 타이머도
   * 건드리지 않는다 — 확인으로 타이머가 멈추면 "확인했으나 미조치"와 "미확인"을 감사 로그에서
   * 구분할 수 없게 된다. T2는 조치 완료까지의 시한이지, 열람까지의 시한이 아니다.
   */
  acknowledge(actor: string, at: Date = this.clock.now()): void {
    if (this._state !== "DIRECTED") {
      throw new Error(`acknowledge()는 DIRECTED 상태에서만 가능합니다 (현재: ${this._state})`);
    }
    // 지금 이 순간의 assignment에만 귀속된다 — 나중에 사다리가 재배정되거나 등급 승격으로
    // 담당자가 바뀌면 새 assignment는 이 확인을 물려받지 않는다(그게 이 필드의 존재 이유다).
    this.logEvent(this._state, this._state, actor, "통제 지시 수신 확인", at, {
      assignmentId: this.currentAssignmentId,
    });
  }

  /** DIRECTED → CONTROLLED. 현장 완료 보고. */
  reportFieldComplete(actor: string, at: Date = this.clock.now()): void {
    if (this._state !== "DIRECTED") {
      throw new Error(`reportFieldComplete()는 DIRECTED 상태에서만 가능합니다 (현재: ${this._state})`);
    }
    if (this.t2Id) this.scheduler.cancel(this.t2Id);
    this.t2Id = null;
    this.t2Due = null;
    const from = this._state;
    this._state = "CONTROLLED";
    this.belowWatchSince = null;
    this.logEvent(from, "CONTROLLED", actor, undefined, at);
  }

  /** RELEASE_PENDING → MONITORING. 해제 승인. */
  approveRelease(actor: string, at: Date = this.clock.now()): void {
    if (this._state !== "RELEASE_PENDING") {
      throw new Error(`approveRelease()는 RELEASE_PENDING 상태에서만 가능합니다 (현재: ${this._state})`);
    }
    if (this.t3Id) this.scheduler.cancel(this.t3Id);
    this.t3Id = null;
    this.t3Due = null;
    const from = this._state;
    this._state = "MONITORING";
    this._severity = null;
    this._ladderStep = 0;
    this.currentOrderId = null;
    this.currentAssignmentId = null;
    this.logEvent(from, "MONITORING", actor, undefined, at);
  }

  /**
   * 현장에서 시설 침수심 5cm 이상을 수동으로 보고한다. INUNDATION은 게이지 수위가 아니라
   * 시설 단위 침수심이라 GaugeSource로 자동 판정할 수 없어, 이 수동 액션으로만 도달한다.
   * MONITORING/RECOMMENDED/DIRECTED/REJECTED에서 호출 가능하며, 항상 즉시 DIRECTED ·
   * 사다리 최상단(부단체장)으로 진입(또는 점프)한다.
   * TODO: 시설별 침수심 센서/신고 입력이 생기면 SiteSensorSource 같은 별도 소스로 분리하고,
   * 이 수동 보고는 그 소스의 자동 트리거와 병행하거나 대체한다.
   */
  reportInundation(actor: string, at: Date = this.clock.now(), reason?: string): void {
    const message = reason ?? "현장 침수심 5cm 이상 보고";
    const ladderStep = ladderStartIndex("INUNDATION", this.site.ladder.length);

    switch (this._state) {
      case "MONITORING":
      case "REJECTED": {
        const from = this._state;
        this.currentOrderId = `${this.site.id}-order-${++this.orderSeq}`;
        this._severity = "INUNDATION";
        this._ladderStep = ladderStep;
        this._state = "DIRECTED";
        this.newAssignment();
        this.logEvent(from, "DIRECTED", actor, message, at, {
          severity: "INUNDATION",
          ladderStep: this._ladderStep,
          assignedTo: this.site.ladder[this._ladderStep],
          assignmentId: this.currentAssignmentId,
        });
        this.scheduleT2(at);
        return;
      }
      case "RECOMMENDED": {
        if (this.t1Id) this.scheduler.cancel(this.t1Id);
        this.t1Id = null;
        this.t1Due = null;
        const from = this._state;
        this._severity = "INUNDATION";
        this._ladderStep = ladderStep;
        this._state = "DIRECTED";
        this.newAssignment();
        this.logEvent(from, "DIRECTED", actor, message, at, {
          severity: "INUNDATION",
          ladderStep: this._ladderStep,
          assignedTo: this.site.ladder[this._ladderStep],
          assignmentId: this.currentAssignmentId,
        });
        this.scheduleT2(at);
        return;
      }
      case "DIRECTED": {
        if (this.t2Id) this.scheduler.cancel(this.t2Id);
        this.t2Id = null;
        this.t2Due = null;
        this._severity = "INUNDATION";
        const nextStep = Math.max(this._ladderStep, ladderStep);
        if (nextStep !== this._ladderStep) {
          this._ladderStep = nextStep;
          this.newAssignment();
        }
        this.logEvent(this._state, this._state, actor, message, at, {
          severity: "INUNDATION",
          ladderStep: this._ladderStep,
          assignedTo: this.site.ladder[this._ladderStep],
          assignmentId: this.currentAssignmentId,
        });
        this.scheduleT2(at);
        return;
      }
      default:
        throw new Error(`reportInundation()은 ${this._state} 상태에서는 호출할 수 없습니다.`);
    }
  }

  private logEvent(
    fromState: AlertState,
    toState: AlertState,
    actor: string,
    reason: string | undefined,
    occurredAt: Date,
    metadata?: Record<string, unknown>,
  ): void {
    this.eventLog.append({
      id: `${this.site.id}-evt-${this.eventSeq++}`,
      alertId: this.currentOrderId ?? this.site.id,
      fromState,
      toState,
      actor,
      reason,
      occurredAt,
      ...(metadata ? { metadata } : {}),
    });
  }
}
