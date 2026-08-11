export interface Reading {
  gaugeId: string;
  at: Date;
  /** 수위 (m) */
  value: number;
  /** 관측점 사이 선형 보간으로 계산된 값이면 true. */
  interpolated: boolean;
}

/**
 * 도메인은 수위 데이터가 어디서 왔는지(실시간 API / 리플레이 시드) 알아서는 안 된다.
 * 오직 "지금 수위가 얼마인지"만 이 인터페이스를 통해 묻는다.
 */
export interface GaugeSource {
  /** at 시각의 수위를 반환한다. 시드/데이터 범위 밖이면 null. */
  read(gaugeId: string, at: Date): Reading | null;
}
