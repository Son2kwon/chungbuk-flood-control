import type { SeedPoint } from "@chungbuk/domain";

/**
 * 2023-07-15 궁평2지하차도 사고 재현 시계열.
 *
 * 시각은 Stage 1 도메인 테스트와 동일한 관례로 ISO "Z" 표기를 그대로 사용한다
 * (실제로는 KST 벽시계 시각이지만, 프로토타입에서는 타임존 변환 없이 문자열 그대로를
 * 시드의 정본으로 삼는다 — 도메인/데이터/앱 전 계층이 같은 관례를 공유해야 하므로 여기서
 * 임의로 UTC 변환을 하지 않는다).
 *
 * 07:00~08:30 사이는 관측 공백이다. GaugeSource가 이 구간을 조회하면 선형 보간하고
 * interpolated: true를 반드시 반환해야 한다 (readings 테이블에는 원본 관측점만 저장한다).
 */
export interface GaugeReadingSeed {
  gaugeId: string;
  points: readonly SeedPoint[];
}

const TIMESTAMPS = [
  "2023-07-15T06:30:00Z",
  "2023-07-15T06:50:00Z",
  "2023-07-15T07:00:00Z",
  "2023-07-15T08:30:00Z",
  "2023-07-15T08:50:00Z",
  "2023-07-15T09:00:00Z",
] as const;

function points(values: readonly [number, number, number, number, number, number]): SeedPoint[] {
  return TIMESTAMPS.map((iso, i) => ({ at: new Date(iso), value: values[i]! }));
}

export const GAUGE_READINGS: readonly GaugeReadingSeed[] = [
  { gaugeId: "gasan-gyo", points: points([3.93, 3.95, 3.96, 4.04, 4.06, 4.07]) },
  { gaugeId: "bantan-gyo", points: points([3.41, 3.41, 3.39, 3.45, 3.43, 3.51]) },
  { gaugeId: "palgyeol-gyo", points: points([7.8, 7.84, 7.87, 8.09, 8.06, 8.07]) },
  { gaugeId: "mihocheon-gyo", points: points([9.2, 9.38, 9.47, 10.01, 10.05, 10.06]) },
  { gaugeId: "heungdeok-gyo", points: points([5.4, 5.27, 5.2, 4.79, 4.74, 4.68]) },
  { gaugeId: "hwanhui-gyo", points: points([4.96, 4.9, 4.88, 4.87, 5.01, 5.03]) },
  { gaugeId: "sangjocheon-gyo", points: points([3.89, 3.91, 3.95, 4.04, 4.03, 4.05]) },
];
