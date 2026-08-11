import { DEFAULT_ESCALATION_GROUP_ID } from "./sites";

export interface UserSeed {
  id: string;
  name: string;
  role: string;
  ladderGroupId: string;
  ladderOrder: number;
}

/** 에스컬레이션 사다리 3단계: 담당자 → 부서장 → 상황실장. 프로토타입은 그룹을 하나만 둔다. */
export const USERS: readonly UserSeed[] = [
  {
    id: "u-officer",
    name: "담당자",
    role: "담당자",
    ladderGroupId: DEFAULT_ESCALATION_GROUP_ID,
    ladderOrder: 0,
  },
  {
    id: "u-dept-head",
    name: "부서장",
    role: "부서장",
    ladderGroupId: DEFAULT_ESCALATION_GROUP_ID,
    ladderOrder: 1,
  },
  {
    id: "u-situation-room-chief",
    name: "상황실장",
    role: "상황실장",
    ladderGroupId: DEFAULT_ESCALATION_GROUP_ID,
    ladderOrder: 2,
  },
];
