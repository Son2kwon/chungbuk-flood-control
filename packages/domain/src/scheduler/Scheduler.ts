export interface Scheduler {
  /** date 시각에 callback을 예약한다. 취소용 id를 반환한다. */
  scheduleAt(date: Date, callback: () => void): string;
  cancel(id: string): void;
}
