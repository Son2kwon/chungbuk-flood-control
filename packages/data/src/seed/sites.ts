export type SiteType = "underpass" | "lowbridge" | "riverside_road";

export interface SiteSeed {
  id: string;
  name: string;
  type: SiteType;
  /** 대략값. TODO: 실측 좌표로 교체 필요 (프로토타입 단계에서는 행정구역 대략 중심점 사용). */
  lat: number;
  lng: number;
  gaugeId: string;
  escalationGroupId: string;
}

export const DEFAULT_ESCALATION_GROUP_ID = "chungbuk-default";

export const SITES: readonly SiteSeed[] = [
  {
    id: "gungpyeong2-underpass",
    name: "궁평2지하차도",
    type: "underpass",
    // TODO: 오송읍 대략 중심 좌표. 실제 지하차도 정밀 좌표로 교체 필요.
    lat: 36.6255,
    lng: 127.3287,
    gaugeId: "mihocheon-gyo",
    escalationGroupId: DEFAULT_ESCALATION_GROUP_ID,
  },
  {
    id: "palgyeol-lowbridge",
    name: "팔결 세월교",
    type: "lowbridge",
    // TODO: 청주시 청원구 대략 중심 좌표. 실제 세월교 좌표로 교체 필요.
    lat: 36.6631,
    lng: 127.4921,
    gaugeId: "palgyeol-gyo",
    escalationGroupId: DEFAULT_ESCALATION_GROUP_ID,
  },
  {
    id: "palgyeol-underpass",
    name: "팔결지하차도",
    type: "underpass",
    // TODO: 청주시 청원구 대략 중심 좌표. 실제 지하차도 좌표로 교체 필요.
    lat: 36.6598,
    lng: 127.4879,
    gaugeId: "palgyeol-gyo",
    escalationGroupId: DEFAULT_ESCALATION_GROUP_ID,
  },
  {
    id: "heungdeok-riverside-road",
    name: "흥덕대로 하상도로",
    type: "riverside_road",
    // TODO: 청주시 흥덕구 대략 중심 좌표. 실제 하상도로 좌표로 교체 필요.
    lat: 36.6359,
    lng: 127.4302,
    gaugeId: "heungdeok-gyo",
    escalationGroupId: DEFAULT_ESCALATION_GROUP_ID,
  },
  {
    id: "hwanhui-lowbridge",
    name: "환희동 세월교",
    type: "lowbridge",
    // TODO: 청주시 흥덕구 대략 중심 좌표. 실제 세월교 좌표로 교체 필요.
    lat: 36.6288,
    lng: 127.4218,
    gaugeId: "hwanhui-gyo",
    escalationGroupId: DEFAULT_ESCALATION_GROUP_ID,
  },
];
