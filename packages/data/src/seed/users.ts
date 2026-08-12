import { DEFAULT_ESCALATION_GROUP_ID } from "./sites";

export interface UserSeed {
  id: string;
  name: string;
  role: string;
  ladderGroupId: string;
  ladderOrder: number;
}

/**
 * 에스컬레이션 사다리 4단계: 담당 공무원 → 팀장 → 과장 → 부단체장.
 * 오송 이후 제도화된 지하차도 담당자 지정 체계를 반영한다(CLAUDE.md 참고).
 * 프로토타입은 그룹을 하나만 둔다.
 */
export const USERS: readonly UserSeed[] = [
  {
    id: "u-officer",
    name: "담당 공무원",
    role: "담당 공무원",
    ladderGroupId: DEFAULT_ESCALATION_GROUP_ID,
    ladderOrder: 0,
  },
  {
    id: "u-team-lead",
    name: "팀장",
    role: "팀장",
    ladderGroupId: DEFAULT_ESCALATION_GROUP_ID,
    ladderOrder: 1,
  },
  {
    id: "u-division-head",
    name: "과장",
    role: "과장",
    ladderGroupId: DEFAULT_ESCALATION_GROUP_ID,
    ladderOrder: 2,
  },
  {
    id: "u-deputy-mayor",
    name: "부단체장",
    role: "부단체장",
    ladderGroupId: DEFAULT_ESCALATION_GROUP_ID,
    ladderOrder: 3,
  },
];
