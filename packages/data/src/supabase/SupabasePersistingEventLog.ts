import type { EventLog, StateTransitionEvent } from "@chungbuk/domain";
import type { ChungbukSupabaseClient } from "./client";
import type { EventRow } from "./types";

/**
 * 도메인의 EventLog는 동기 인터페이스다 (도메인 로직은 I/O 지연을 몰라야 한다).
 * 하지만 실제 영속화(Supabase insert)는 네트워크 호출이라 비동기일 수밖에 없다.
 *
 * 그래서 append()는 항상 인메모리 버퍼에 동기로 쌓기만 하고, 실제 DB 반영은
 * flush()가 담당한다. flush()는 도메인이 아니라 합성 루트(예: API 라우트 핸들러가
 * 응답을 보내기 전)가 명시적으로 호출해 durability를 확인해야 하는 지점에서만 부른다.
 */
export class SupabasePersistingEventLog implements EventLog {
  private readonly buffer: StateTransitionEvent[] = [];
  private pending: StateTransitionEvent[] = [];

  constructor(private readonly client: ChungbukSupabaseClient) {}

  append(event: StateTransitionEvent): void {
    this.buffer.push(event);
    this.pending.push(event);
  }

  all(): readonly StateTransitionEvent[] {
    return [...this.buffer];
  }

  forAlert(alertId: string): readonly StateTransitionEvent[] {
    return this.buffer.filter((event) => event.alertId === alertId);
  }

  /** 아직 flush되지 않은 이벤트 수. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** 대기 중인 이벤트를 events 테이블에 insert한다. 실패하면 pending을 그대로 보존해 재시도할 수 있게 한다. */
  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const toFlush = this.pending;
    this.pending = [];

    const rows = toFlush.map(toEventRow);
    const { error } = await this.client.from("events").insert(rows);
    if (error) {
      // 실패한 항목은 유실되지 않도록 앞쪽에 되돌려 놓는다 (그 사이 새로 append된 것보다 먼저 재시도).
      this.pending = [...toFlush, ...this.pending];
      throw new Error(`이벤트 영속화 실패: ${error.message}`);
    }
  }
}

function toEventRow(event: StateTransitionEvent): EventRow {
  return {
    id: event.id,
    alert_id: event.alertId,
    from_state: event.fromState,
    to_state: event.toState,
    actor_id: event.actor,
    reason: event.reason ?? null,
    occurred_at: event.occurredAt.toISOString(),
  };
}
