import type { Clock } from "./Clock";

export interface ReplayClockOptions {
  start: Date;
  end?: Date;
  /** 배속. tick(ms) 호출 시 실제로 흘려보내는 가상 시간 = ms * speed. 기본 1. */
  speed?: number;
}

export type AdvanceListener = (from: Date, to: Date) => void;

/**
 * 가상 시각 클럭. 실제 시간 흐름과 무관하게 tick()/seek()으로만 진행한다.
 * scheduler는 onAdvance로 구독해 도래한 타이머를 순서대로 실행한다.
 */
export class ReplayClock implements Clock {
  private current: Date;
  private readonly start: Date;
  private readonly end: Date | undefined;
  private _speed: number;
  private readonly listeners = new Set<AdvanceListener>();
  /** 스케줄러가 등록한, 정확한 시각에 멈춰서야 하는 지점들. tick()이 이 지점들을 건너뛰지 않도록 한다. */
  private readonly breakpoints: number[] = [];

  constructor(options: ReplayClockOptions) {
    this.start = options.start;
    this.end = options.end;
    this.current = options.start;
    this._speed = options.speed ?? 1;
  }

  now(): Date {
    return this.current;
  }

  get speed(): number {
    return this._speed;
  }

  setSpeed(speed: number): void {
    if (speed <= 0) {
      throw new Error("speed must be positive");
    }
    this._speed = speed;
  }

  /** ms(현실 기준 경과 시간)에 배속을 곱한 만큼 가상 시각을 전진시킨다. */
  tick(ms: number): void {
    if (ms < 0) {
      throw new Error("tick(ms) must be non-negative");
    }
    const next = new Date(this.current.getTime() + ms * this._speed);
    this.advanceTo(next);
  }

  /** 임의 시각으로 즉시 이동한다. start/end 범위를 벗어날 수 없다. */
  seek(date: Date): void {
    this.advanceTo(date);
  }

  private advanceTo(target: Date): void {
    if (target.getTime() < this.start.getTime()) {
      throw new Error("cannot seek before replay start");
    }
    if (this.end && target.getTime() > this.end.getTime()) {
      throw new Error("cannot seek past replay end");
    }
    if (target.getTime() < this.current.getTime()) {
      throw new Error("cannot move replay clock backwards");
    }

    const targetMs = target.getTime();
    let cursor = this.current.getTime();
    if (targetMs === cursor) return;

    // 이 구간 안에 있는 예약 지점들을 먼저, 정확한 시각으로 멈춰서 통과시킨다.
    // 그래야 그 시각에 도래하는 콜백이 clock.now()를 물었을 때 (건너뛴 목표 시각이 아니라)
    // 자신이 예약된 정확한 시각을 돌려받는다.
    const stops = [...new Set(this.breakpoints.filter((t) => t > cursor && t < targetMs))].sort(
      (a, b) => a - b,
    );

    for (const stop of stops) {
      const from = new Date(cursor);
      this.current = new Date(stop);
      cursor = stop;
      this.notify(from, this.current);
    }

    const from = new Date(cursor);
    this.current = target;
    this.notify(from, target);

    // 지나간 예약 지점은 더 이상 필요 없다.
    for (let i = this.breakpoints.length - 1; i >= 0; i--) {
      if (this.breakpoints[i]! <= targetMs) this.breakpoints.splice(i, 1);
    }
  }

  private notify(from: Date, to: Date): void {
    for (const listener of this.listeners) {
      listener(from, to);
    }
  }

  /** target 시각으로 진행할 때마다 호출된다. 구독 해제 함수를 반환한다. */
  onAdvance(listener: AdvanceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 스케줄러가 특정 시각에 정확히 멈춰서 콜백을 실행할 수 있도록 등록하는 지점.
   * VirtualScheduler.scheduleAt()이 내부적으로 호출한다.
   */
  registerBreakpoint(date: Date): void {
    this.breakpoints.push(date.getTime());
  }
}
