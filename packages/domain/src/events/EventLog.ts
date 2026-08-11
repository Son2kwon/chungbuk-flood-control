import type { AlertState } from "../types/index";

export interface StateTransitionEvent {
  id: string;
  alertId: string;
  fromState: AlertState;
  toState: AlertState;
  actor: string;
  reason: string | undefined;
  occurredAt: Date;
  /** 등급, 사다리 단계 등 재구성에 필요한 부가 정보. */
  metadata?: Record<string, unknown>;
}

/**
 * append-only 이벤트 로그. 상태의 유일한 출처(source of truth).
 * UI에 보이는 모든 상태는 이 로그를 replay해서 재구성 가능해야 한다.
 */
export interface EventLog {
  append(event: StateTransitionEvent): void;
  all(): readonly StateTransitionEvent[];
  forAlert(alertId: string): readonly StateTransitionEvent[];
}

export class InMemoryEventLog implements EventLog {
  private readonly events: StateTransitionEvent[] = [];

  append(event: StateTransitionEvent): void {
    this.events.push(event);
  }

  all(): readonly StateTransitionEvent[] {
    return [...this.events];
  }

  forAlert(alertId: string): readonly StateTransitionEvent[] {
    return this.events.filter((event) => event.alertId === alertId);
  }
}
