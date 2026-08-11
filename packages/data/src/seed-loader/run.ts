#!/usr/bin/env node
/**
 * 시드 적재 CLI. 마이그레이션을 먼저 적용한 뒤 실행한다:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:load --workspace=@chungbuk/data
 *
 * 이 스크립트는 실행 시점에만 네트워크가 필요하다. ReplaySeedGaugeSource(도메인 구동용)는
 * 이 스크립트와 무관하게 항상 로컬 시드만으로 오프라인 동작한다.
 */
import { createSupabaseClient } from "../supabase/client";
import { loadSeed } from "./loadSeed";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}가 설정되어 있지 않습니다.`);
  }
  return value;
}

async function main(): Promise<void> {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createSupabaseClient(url, serviceRoleKey);
  await loadSeed(client);
  console.log("시드 적재 완료: users, gauges, sites, readings");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
