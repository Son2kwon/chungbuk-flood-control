import { describe, expect, it, vi } from "vitest";
import type { StateTransitionEvent } from "@chungbuk/domain";
import { SupabasePersistingEventLog } from "../src/supabase/SupabasePersistingEventLog.js";
import type { ChungbukSupabaseClient } from "../src/supabase/client.js";

function fakeClient(insertImpl: (table: string, rows: unknown[]) => { error: { message: string } | null }) {
  const insert = vi.fn((rows: unknown[]) => Promise.resolve(insertImpl("events", rows)));
  const from = vi.fn((_table: string) => ({ insert }));
  return { client: { from } as unknown as ChungbukSupabaseClient, insert, from };
}

const EVENT: StateTransitionEvent = {
  id: "evt-1",
  alertId: "miho-bridge-order-1",
  fromState: "MONITORING",
  toState: "RECOMMENDED",
  actor: "system",
  reason: undefined,
  occurredAt: new Date("2023-07-15T06:30:00Z"),
  metadata: { severity: "SEVERE" },
};

describe("SupabasePersistingEventLog", () => {
  it("append()는 네트워크 호출 없이 동기적으로 버퍼에 쌓인다", () => {
    const { client, from } = fakeClient(() => ({ error: null }));
    const log = new SupabasePersistingEventLog(client);

    log.append(EVENT);

    expect(from).not.toHaveBeenCalled();
    expect(log.all()).toEqual([EVENT]);
    expect(log.forAlert("miho-bridge-order-1")).toEqual([EVENT]);
    expect(log.pendingCount).toBe(1);
  });

  it("flush()는 대기 중인 이벤트를 snake_case 행으로 변환해 events 테이블에 insert한다", async () => {
    const { client, from, insert } = fakeClient(() => ({ error: null }));
    const log = new SupabasePersistingEventLog(client);
    log.append(EVENT);

    await log.flush();

    expect(from).toHaveBeenCalledWith("events");
    expect(insert).toHaveBeenCalledWith([
      {
        id: "evt-1",
        alert_id: "miho-bridge-order-1",
        from_state: "MONITORING",
        to_state: "RECOMMENDED",
        actor_id: "system",
        reason: null,
        occurred_at: "2023-07-15T06:30:00.000Z",
      },
    ]);
    expect(log.pendingCount).toBe(0);
  });

  it("flush()가 실패하면 pending을 보존해 재시도할 수 있게 한다", async () => {
    const { client } = fakeClient(() => ({ error: { message: "network down" } }));
    const log = new SupabasePersistingEventLog(client);
    log.append(EVENT);

    await expect(log.flush()).rejects.toThrow("network down");
    expect(log.pendingCount).toBe(1);
  });

  it("flush() 후 pending이 비어 있으면 다시 호출해도 insert를 부르지 않는다", async () => {
    const { client, insert } = fakeClient(() => ({ error: null }));
    const log = new SupabasePersistingEventLog(client);
    log.append(EVENT);
    await log.flush();

    await log.flush();

    expect(insert).toHaveBeenCalledTimes(1);
  });
});
