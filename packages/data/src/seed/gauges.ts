export interface GaugeSeed {
  id: string;
  name: string;
  river: string;
  warnLevel: number;
  alertLevel: number;
  /**
   * 계획홍수위(관측수위 환산치). 제도상 통제 요건 — DESIGN_FLOOD 등급 임계값.
   * 미호천교만 실측 근거가 있다(06:40 실측 관측값 = 국무조정실 발표 계획홍수위 도달 시각 —
   * CLAUDE.md "확정된 사양 결정" 절 참고). 나머지 관측소는 해발 표고 환산표가 없어
   * alertLevel + 1.0m(팔결교는 +2.0m, 데모 서사 순서 조정)를 임시값으로 둔다.
   * TODO: 관측소별 실측 계획홍수위 환산표 확보되면 전부 교체.
   */
  designFloodLevel: number;
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
    designFloodLevel: 5.5, // TODO: 임시값(alertLevel+1.0m). 실측 환산표로 교체.
    upstreamOf: ["bantan-gyo"],
  },
  {
    id: "bantan-gyo",
    name: "반탄교",
    river: "미호강",
    warnLevel: 3.0,
    alertLevel: 3.5,
    designFloodLevel: 4.5, // TODO: 임시값(alertLevel+1.0m). 실측 환산표로 교체.
    upstreamOf: ["palgyeol-gyo", "mihocheon-gyo", "heungdeok-gyo", "hwanhui-gyo"],
  },
  {
    id: "palgyeol-gyo",
    name: "팔결교",
    river: "미호강",
    warnLevel: 5.0,
    alertLevel: 6.0,
    // TODO: 임시값(alertLevel+2.0m), 실측 계획홍수위 확인 필요. +1.0m였을 때는 시드 관측값이
    // 이미 그 값을 넘어 시작하자마자 DESIGN_FLOOD로 진입해 곧 FORCED로 끝나버렸다 — 실측
    // 근거가 있는 미호천교(9.30, 06:50 FORCED)보다 먼저 끝나 데모 서사를 해쳤다. +2.0m로
    // 올려 06:00 시작 시점에 ALERT로만 시작하게 한다.
    designFloodLevel: 8.0,
    upstreamOf: ["sangjocheon-gyo"],
  },
  {
    id: "mihocheon-gyo",
    name: "미호천교",
    river: "미호강",
    warnLevel: 7.0,
    alertLevel: 8.0,
    // 확정값. 06:40 실측 관측값이 9.30이고, 국무조정실 발표상 06:40이 계획홍수위 도달
    // 시각이다 — 그 시각의 실측값 자체가 계획홍수위다. (이전 9.29는 06:30/06:50 관측값
    // 사이 선형보간 추정치였다 — 06:40 실측 데이터 확보 후 추정치 대신 실측값으로 교체.)
    designFloodLevel: 9.3,
    upstreamOf: ["sangjocheon-gyo"],
  },
  {
    id: "heungdeok-gyo",
    name: "흥덕교",
    river: "미호강",
    warnLevel: 4.0,
    alertLevel: 5.0,
    designFloodLevel: 6.0, // TODO: 임시값(alertLevel+1.0m). 실측 환산표로 교체.
    upstreamOf: ["sangjocheon-gyo"],
  },
  {
    id: "hwanhui-gyo",
    name: "환희교",
    river: "미호강",
    warnLevel: 3.6,
    alertLevel: 4.5,
    designFloodLevel: 5.5, // TODO: 임시값(alertLevel+1.0m). 실측 환산표로 교체.
    upstreamOf: ["sangjocheon-gyo"],
  },
  {
    id: "sangjocheon-gyo",
    name: "상조천교",
    river: "미호강",
    warnLevel: 2.5,
    alertLevel: 3.5,
    designFloodLevel: 4.5, // TODO: 임시값(alertLevel+1.0m). 실측 환산표로 교체.
    upstreamOf: [],
  },
] as const;
