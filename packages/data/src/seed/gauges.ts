export interface GaugeSeed {
  id: string;
  name: string;
  river: string;
  warnLevel: number;
  alertLevel: number;
  /** 이 관측소보다 하류에 있는(= 이 관측소가 상류인) 관측소 id 목록. */
  upstreamOf: readonly string[];
}

/**
 * 미호강 관측소 7곳. 상하류 관계:
 * 가산교(진천) → 반탄교(증평) → {팔결교, 미호천교, 흥덕교, 환희교}(청주) → 상조천교(세종)
 */
export const GAUGES: readonly GaugeSeed[] = [
  {
    id: "gasan-gyo",
    name: "가산교",
    river: "미호강",
    warnLevel: 3.9,
    alertLevel: 4.5,
    upstreamOf: ["bantan-gyo"],
  },
  {
    id: "bantan-gyo",
    name: "반탄교",
    river: "미호강",
    warnLevel: 3.0,
    alertLevel: 3.5,
    upstreamOf: ["palgyeol-gyo", "mihocheon-gyo", "heungdeok-gyo", "hwanhui-gyo"],
  },
  {
    id: "palgyeol-gyo",
    name: "팔결교",
    river: "미호강",
    warnLevel: 5.0,
    alertLevel: 6.0,
    upstreamOf: ["sangjocheon-gyo"],
  },
  {
    id: "mihocheon-gyo",
    name: "미호천교",
    river: "미호강",
    warnLevel: 7.0,
    alertLevel: 8.0,
    upstreamOf: ["sangjocheon-gyo"],
  },
  {
    id: "heungdeok-gyo",
    name: "흥덕교",
    river: "미호강",
    warnLevel: 4.0,
    alertLevel: 5.0,
    upstreamOf: ["sangjocheon-gyo"],
  },
  {
    id: "hwanhui-gyo",
    name: "환희교",
    river: "미호강",
    warnLevel: 3.6,
    alertLevel: 4.5,
    upstreamOf: ["sangjocheon-gyo"],
  },
  {
    id: "sangjocheon-gyo",
    name: "상조천교",
    river: "미호강",
    warnLevel: 2.5,
    alertLevel: 3.5,
    upstreamOf: [],
  },
] as const;
