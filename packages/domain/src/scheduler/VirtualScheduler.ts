import type { ReplayClock } from "../clock/ReplayClock";
import type { Scheduler } from "./Scheduler";

interface Task {
  id: string;
  date: Date;
  callback: () => void;
  sequence: number;
}

/**
 * setTimeout/setInterval을 전혀 사용하지 않는 스케줄러. ReplayClock이 전진할 때마다
 * (tick/seek로 발생하는 onAdvance 이벤트) 그 구간에 도래한 콜백을 예약 시각 순서대로,
 * 동시각이면 예약된 순서대로 실행한다.
 */
export class VirtualScheduler implements Scheduler {
  private readonly tasks = new Map<string, Task>();
  private nextId = 0;
  private nextSequence = 0;

  constructor(private readonly clock: ReplayClock) {
    clock.onAdvance((_from, to) => this.runDue(to));
  }

  scheduleAt(date: Date, callback: () => void): string {
    const id = `task-${this.nextId++}`;
    this.tasks.set(id, { id, date, callback, sequence: this.nextSequence++ });
    this.clock.registerBreakpoint(date);
    return id;
  }

  cancel(id: string): void {
    this.tasks.delete(id);
  }

  private runDue(upTo: Date): void {
    const due = [...this.tasks.values()]
      .filter((task) => task.date.getTime() <= upTo.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime() || a.sequence - b.sequence);

    for (const task of due) {
      // 실행 도중 재스케줄될 수 있으므로, 아직 취소되지 않았을 때만 실행한다.
      if (!this.tasks.has(task.id)) continue;
      this.tasks.delete(task.id);
      task.callback();
    }
  }
}
