import type { ChungbukSupabaseClient } from "../supabase/client";
import type { GaugeRow, ReadingRow, SiteRow, UserRow } from "../supabase/types";
import { GAUGES, GAUGE_READINGS, SITES, USERS } from "../seed/index";

/**
 * 로컬 번들 시드를 Supabase 테이블(users, gauges, sites, readings)에 적재한다.
 * 마이그레이션(db/migrations)과는 분리된 별도 스크립트다 — 스키마 변경과 데이터 적재는
 * 서로 다른 시점에, 서로 다른 이유로 일어난다.
 *
 * 멱등성: 모든 테이블에 PK/unique 제약이 있어 upsert로 여러 번 실행해도 안전하다.
 */
export async function loadSeed(client: ChungbukSupabaseClient): Promise<void> {
  await upsertUsers(client);
  await upsertGauges(client);
  await upsertSites(client);
  await upsertReadings(client);
}

async function upsertUsers(client: ChungbukSupabaseClient): Promise<void> {
  const rows: UserRow[] = USERS.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    ladder_group_id: u.ladderGroupId,
    ladder_order: u.ladderOrder,
  }));
  const { error } = await client.from("users").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`users 시드 적재 실패: ${error.message}`);
}

async function upsertGauges(client: ChungbukSupabaseClient): Promise<void> {
  const rows: GaugeRow[] = GAUGES.map((g) => ({
    id: g.id,
    name: g.name,
    river: g.river,
    warn_level: g.warnLevel,
    alert_level: g.alertLevel,
    upstream_of: [...g.upstreamOf],
  }));
  const { error } = await client.from("gauges").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`gauges 시드 적재 실패: ${error.message}`);
}

async function upsertSites(client: ChungbukSupabaseClient): Promise<void> {
  const rows: SiteRow[] = SITES.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    lat: s.lat,
    lng: s.lng,
    gauge_id: s.gaugeId,
    escalation_group_id: s.escalationGroupId,
  }));
  const { error } = await client.from("sites").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`sites 시드 적재 실패: ${error.message}`);
}

async function upsertReadings(client: ChungbukSupabaseClient): Promise<void> {
  const rows: ReadingRow[] = GAUGE_READINGS.flatMap((g) =>
    g.points.map((p) => ({
      gauge_id: g.gaugeId,
      observed_at: p.at.toISOString(),
      level: p.value,
      source: "replay" as const,
      interpolated: false,
    })),
  );
  const { error } = await client.from("readings").upsert(rows, { onConflict: "gauge_id,observed_at,source" });
  if (error) throw new Error(`readings 시드 적재 실패: ${error.message}`);
}
