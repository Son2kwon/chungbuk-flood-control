import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 스키마 제네릭을 붙이지 않는다: 실제 프로젝트라면 `supabase gen types typescript`로
 * 라이브 스키마에서 생성한 타입을 쓰겠지만, 이 프로토타입 단계에서 손으로 그 타입을
 * 흉내 내면 supabase-js 내부 제네릭 제약과 버전마다 어긋나기 쉽다. 대신 각 테이블에
 * 쓰는 행 타입(UserRow, EventRow 등)은 호출부 코드에서 명시적으로 타입을 지정해 안전성을 지킨다.
 */
export type ChungbukSupabaseClient = SupabaseClient;

/**
 * 합성 루트에서만 호출한다. url/key는 항상 호출부(env 등)에서 주입받는다 —
 * 이 패키지는 자격증명을 하드코딩하거나 기본값을 갖지 않는다.
 */
export function createSupabaseClient(url: string, serviceRoleKey: string): ChungbukSupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
