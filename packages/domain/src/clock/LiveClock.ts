import type { Clock } from "./Clock";

/**
 * 실제 벽시계 시각을 제공하는 유일한 지점. Clock 인터페이스 뒤에 실제 Date 접근을 가둔다 —
 * 도메인 로직/테스트는 이 클래스를 몰라도 되고, 항상 Clock을 통해서만 시각을 얻는다.
 */
export class LiveClock implements Clock {
  now(): Date {
    return new Date();
  }
}
