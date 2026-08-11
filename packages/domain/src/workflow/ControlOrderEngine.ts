import type { Clock } from "../clock/Clock";
import type { ReplayClock } from "../clock/ReplayClock";
import { computeSeverity } from "../control/severity";
import { ladderStartIndex } from "../control/ladder";
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
 * 하나의 침수 취약지점(Site)에 대한 통제 권고 상태기계.
 * 수위 판독은 자동이지만, 승인/기각/현장완료/해제승인은 사람의 명시적 행위(actor)로만 일어난다.
 * 정해진 타이머(T1/T2/T3) 안에 그 행위가 없으면 사다리를 타고 자동으로 위로 올라간다.
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

  private _lastReading: Reading | null = null;
  private rejectedAtValue: number | null = null;
  private belowWatchSince: Date | null = null;

  private t1Id: string | null = null;
  private t2Id: string | null = null;
  private t3Id: string | null = null;
  private t1Due: Date | null = null;
  private t2Due: Date | null = null;
  private t3Due: Date | null = null;

  constructor(deps: ControlOrderEngineDeps) {
    this.site = deps.site;
    this.gaugeSource = deps.gaugeSource;
    this.clock = deps.clock;
    this.scheduler = deps.scheduler;
    this.eventLog = deps.eventLog;
    this.timers = {
      t1: { ...DEFAULT_TIMERS.t1, ...deps.site.timers?.t1 },
      t2: deps.site.timers?.t2 ?? DEFAULT_TIMERS.t2,
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
      case "APPROVED":
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
    return clock.onAdvance((_from, to) => this.sample(to));
  }

  /** at 시각의 게이지 값을 읽어 상태기계에 반영한다. attach() 없이 수동으로도 호출 가능. */
  sample(at: Date): void {
    const reading = this.gaugeSource.read(this.site.gaugeId, at);
    if (!reading) return;
    this._lastReading = reading;
    this.onReading(reading, at);
  }

  private onReading(reading: Reading, at: Date): void {
    const severity = computeSeverity(reading.value, this.site.watchLevel, this.site.alertLevel);

    switch (this._state) {
      case "MONITORING":
        if (severity) this.recommend(severity, at);
        break;
      case "RECOMMENDED":
        if (severity && this._severity && SEVERITY_ORDER[severity] > SEVERITY_ORDER[this._severity]) {
          this.bumpSeverity(severity, at);
        }
        break;
      case "CONTROLLED":
        this.trackReleaseCondition(reading, at);
        break;
      case "REJECTED":
        if (severity && this.rejectedAtValue !== null && reading.value > this.rejectedAtValue) {
          this.recommend(severity, at, "기각 후 수위 재상승 — 통제 권고 재발생");
        }
        break;
      default:
        break;
    }
  }

  private recommend(severity: Severity, at: Date, reason?: string): void {
    const from = this._state;
    this.currentOrderId = `${this.site.id}-order-${++this.orderSeq}`;
    this._severity = severity;
    this._ladderStep = ladderStartIndex(severity, this.site.ladder.length);
    this._state = "RECOMMENDED";
    this.logEvent(from, "RECOMMENDED", "system", reason, at, {
      severity,
      ladderStep: this._ladderStep,
      assignedTo: this.site.ladder[this._ladderStep],
    });
    this.scheduleT1(at);
  }

  private bumpSeverity(severity: Severity, at: Date): void {
    const from = this._severity;
    this._severity = severity;
    this._ladderStep = Math.max(this._ladderStep, ladderStartIndex(severity, this.site.ladder.length));
    this.logEvent(this._state, this._state, "system", `등급 상승: ${from} → ${severity}`, at, {
      severity,
      ladderStep: this._ladderStep,
      assignedTo: this.site.ladder[this._ladderStep],
    });
    this.scheduleT1(at);
  }

  private scheduleT1(at: Date): void {
    if (this.t1Id) this.scheduler.cancel(this.t1Id);
    const severity = this._severity ?? "WATCH";
    const due = new Date(at.getTime() + this.timers.t1[severity]);
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
    const due = new Date(at.getTime() + this.timers.t2);
    this.t2Due = due;
    this.t2Id = this.scheduler.scheduleAt(due, () => this.onT2Timeout());
  }

  private onT2Timeout(): void {
    this.t2Id = null;
    this.t2Due = null;
    if (this._state !== "APPROVED") return;
    const at = this.clock.now();
    this.climbOrForce(at, () => this.scheduleT2(at));
  }

  private climbOrForce(at: Date, reschedule: () => void): void {
    const top = this.site.ladder.length - 1;
    if (this._ladderStep < top) {
      const from = this.site.ladder[this._ladderStep];
      this._ladderStep += 1;
      this.logEvent(
        this._state,
        this._state,
        "system",
        `무응답(${from}) → ${this.site.ladder[this._ladderStep]}로 재배정`,
        at,
        { ladderStep: this._ladderStep, assignedTo: this.site.ladder[this._ladderStep] },
      );
      reschedule();
    } else {
      const from = this._state;
      this._state = "FORCED";
      this.logEvent(from, "FORCED", "system", `사다리 최상단(${this.site.ladder[top]}) 무응답 → 강제 조치`, at, {
        ladderStep: this._ladderStep,
      });
    }
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
      this._ladderStep += 1;
      this.logEvent(
        this._state,
        this._state,
        "system",
        `해제 승인 무응답(${from}) → ${this.site.ladder[this._ladderStep]}로 재배정`,
        at,
        { ladderStep: this._ladderStep, assignedTo: this.site.ladder[this._ladderStep] },
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
        this.logEvent(from, "RELEASE_PENDING", "system", `수위 ${this.site.watchLevel}m 미만 30분 지속`, at);
        this.scheduleT3(at);
      }
    } else {
      this.belowWatchSince = null;
    }
  }

  /** RECOMMENDED → APPROVED. actor의 명시적 승인 행위. */
  approve(actor: string, at: Date = this.clock.now()): void {
    if (this._state !== "RECOMMENDED") {
      throw new Error(`approve()는 RECOMMENDED 상태에서만 가능합니다 (현재: ${this._state})`);
    }
    if (this.t1Id) this.scheduler.cancel(this.t1Id);
    this.t1Id = null;
    const from = this._state;
    this._state = "APPROVED";
    this.logEvent(from, "APPROVED", actor, undefined, at);
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
    const from = this._state;
    this._state = "REJECTED";
    this.rejectedAtValue = this._lastReading?.value ?? null;
    this.logEvent(from, "REJECTED", actor, reason, at);
  }

  /** APPROVED → CONTROLLED. 현장 완료 보고. */
  reportFieldComplete(actor: string, at: Date = this.clock.now()): void {
    if (this._state !== "APPROVED") {
      throw new Error(`reportFieldComplete()는 APPROVED 상태에서만 가능합니다 (현재: ${this._state})`);
    }
    if (this.t2Id) this.scheduler.cancel(this.t2Id);
    this.t2Id = null;
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
    const from = this._state;
    this._state = "MONITORING";
    this._severity = null;
    this._ladderStep = 0;
    this.currentOrderId = null;
    this.logEvent(from, "MONITORING", actor, undefined, at);
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
