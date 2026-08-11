/**
 * 모든 시각은 이 인터페이스를 통해서만 얻는다. Date.now() / new Date() 직접 호출 금지.
 */
export interface Clock {
  now(): Date;
}
