/**
 * 리플레이 시나리오 — GAUGE_READINGS 시드(07-14 14:30~07-15 09:00) 중 어느 구간을,
 * 어떤 서사로 재생할지 정의한다. 도메인은 이 개념을 모른다 — 그냥 clock의 start/end일
 * 뿐이다. UI(TopBar 시나리오 선택 등)와 합성 루트(composition-root)만 이 목록을 참조한다.
 */
export interface Scenario {
  id: string;
  label: string;
  description: string;
  start: Date;
  end: Date;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "warn-stage",
    label: "주의보 단계",
    description: "MONITORING → 통제 권고(승인/기각) → 위험 해소 → 해제",
    // 미호천교 07-14 18:50 WARN 최초 도달 전 여유를 두고 18:00부터, 21:30까지 —
    // 20:50 이후 수위가 주의보 미만으로 내려가 RELEASE_PENDING까지 자연스럽게 이어진다.
    start: new Date("2023-07-14T18:00:00Z"),
    end: new Date("2023-07-14T21:30:00Z"),
  },
  {
    id: "alert-to-disaster",
    label: "경보에서 참사까지",
    description: "DIRECTED 직행 → 06:40 DESIGN_FLOOD 승격 → 에스컬레이션 → 07:00 FORCED",
    // 데이터는 06:00부터 있지만 재생은 06:30부터 시작한다. 06:00부터 재생하면 06:15/06:30에
    // ALERT 사다리가 이미 최상단까지 재배정돼서, 06:40 DESIGN_FLOOD 승격이 사다리를
    // 점프시키는 장면 자체가 사라진다("이미 꼭대기라 오를 곳이 없다"). 06:30 시작이면
    // 06:40 승격이 실제로 팀장→과장으로 사다리를 점프시키고, FORCED도 07:00에 걸려
    // 07:01 신고 타임라인과 대비된다.
    start: new Date("2023-07-15T06:30:00Z"),
    end: new Date("2023-07-15T09:00:00Z"),
  },
];

export const DEFAULT_SCENARIO_ID = "alert-to-disaster";

export function findScenario(id: string): Scenario {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`알 수 없는 시나리오: ${id}`);
  return scenario;
}
