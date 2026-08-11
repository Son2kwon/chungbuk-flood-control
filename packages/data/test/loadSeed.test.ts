import { describe, expect, it, vi } from "vitest";
import { loadSeed } from "../src/seed-loader/loadSeed.js";
import type { ChungbukSupabaseClient } from "../src/supabase/client.js";
import { GAUGES, GAUGE_READINGS, SITES, USERS } from "../src/seed/index.js";

function fakeClient() {
  const calls: { table: string; rows: unknown[]; onConflict: string | undefined }[] = [];
  const from = vi.fn((table: string) => ({
    upsert: vi.fn((rows: unknown[], opts?: { onConflict?: string }) => {
      calls.push({ table, rows, onConflict: opts?.onConflict });
      return Promise.resolve({ error: null });
    }),
  }));
  return { client: { from } as unknown as ChungbukSupabaseClient, calls };
}

describe("loadSeed", () => {
  it("네 테이블(users, gauges, sites, readings)에 시드와 같은 개수의 행을 upsert한다", async () => {
    const { client, calls } = fakeClient();

    await loadSeed(client);

    const byTable = new Map(calls.map((c) => [c.table, c]));
    expect(byTable.get("users")?.rows).toHaveLength(USERS.length);
    expect(byTable.get("gauges")?.rows).toHaveLength(GAUGES.length);
    expect(byTable.get("sites")?.rows).toHaveLength(SITES.length);

    const expectedReadingRows = GAUGE_READINGS.reduce((sum, g) => sum + g.points.length, 0);
    expect(byTable.get("readings")?.rows).toHaveLength(expectedReadingRows);

    // 멱등 재적재를 위해 항상 PK/unique 제약 컬럼으로 onConflict를 지정한다.
    expect(byTable.get("users")?.onConflict).toBe("id");
    expect(byTable.get("readings")?.onConflict).toBe("gauge_id,observed_at,source");
  });

  it("readings 행은 시드 원본 관측점만 담고, 저장 시점에는 보간되지 않는다", async () => {
    const { client, calls } = fakeClient();
    await loadSeed(client);

    const readingRows = calls.find((c) => c.table === "readings")!.rows as { interpolated: boolean }[];
    expect(readingRows.every((r) => r.interpolated === false)).toBe(true);
  });
});
