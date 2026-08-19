export type SiteType = "underpass" | "lowbridge" | "riverside_road";

export interface SiteSeed {
  id: string;
  name: string;
  type: SiteType;
  lat: number;
  lng: number;
  /**
   * 좌표 출처. "verified"는 실측(주소/현장 확인 근거가 있는 좌표), "example"은 이
   * 프로토타입이 만든 예시 지점(실제 통제 대상 목록이 아직 없어 지배 관측소 인근에
   * 배치한 자리)이다. 지도 화면이 이 값으로 마커 스타일을 구분한다.
   */
  coordinateSource: "verified" | "example";
  gaugeId: string;
  escalationGroupId: string;
}

export const DEFAULT_ESCALATION_GROUP_ID = "chungbuk-default";

export const SITES: readonly SiteSeed[] = [
  {
    id: "gungpyeong2-underpass",
    name: "궁평2지하차도",
    type: "underpass",
    lat: 36.622552, // 실측
    lng: 127.345302,
    coordinateSource: "verified",
    gaugeId: "mihocheon-gyo",
    escalationGroupId: DEFAULT_ESCALATION_GROUP_ID,
  },
  {
    id: "palgyeol-lowbridge",
    name: "팔결 세월교",
    type: "lowbridge",
    // 예시 지점. 실제 통제 대상 목록은 청주시 정보공개청구 회신 후 교체 예정.
    // 지배 관측소(팔결교, 36.709872/127.468925)에서 북동쪽 약 320m 오프셋.
    lat: 36.712074,
    lng: 127.471230,
    coordinateSource: "example",
    gaugeId: "palgyeol-gyo",
    escalationGroupId: DEFAULT_ESCALATION_GROUP_ID,
  },
  {
    id: "palgyeol-underpass",
    name: "팔결지하차도",
    type: "underpass",
    // 예시 지점. 실제 통제 대상 목록은 청주시 정보공개청구 회신 후 교체 예정.
    // 지배 관측소(팔결교)에서 남쪽 약 300m 오프셋(팔결 세월교와 겹치지 않도록 반대 방향).
    lat: 36.707340,
    lng: 127.467775,
    coordinateSource: "example",
    gaugeId: "palgyeol-gyo",
    escalationGroupId: DEFAULT_ESCALATION_GROUP_ID,
  },
  {
    id: "heungdeok-riverside-road",
    name: "흥덕대로 하상도로",
    type: "riverside_road",
    // 예시 지점. 실제 통제 대상 목록은 청주시 정보공개청구 회신 후 교체 예정.
    // 지배 관측소(흥덕교, 36.646159/127.481060)에서 약 350m 오프셋.
    lat: 36.643436,
    lng: 127.483019,
    coordinateSource: "example",
    gaugeId: "heungdeok-gyo",
    escalationGroupId: DEFAULT_ESCALATION_GROUP_ID,
  },
  {
    id: "hwanhui-lowbridge",
    name: "환희동 세월교",
    type: "lowbridge",
    // 예시 지점. 실제 통제 대상 목록은 청주시 정보공개청구 회신 후 교체 예정.
    // 지배 관측소(환희교, 36.668597/127.341170)에서 약 280m 오프셋.
    lat: 36.669855,
    lng: 127.338454,
    coordinateSource: "example",
    gaugeId: "hwanhui-gyo",
    escalationGroupId: DEFAULT_ESCALATION_GROUP_ID,
  },
];
