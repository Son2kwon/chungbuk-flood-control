import { describe, expect, it, vi } from "vitest";
import { ReplayClock } from "../src/clock/ReplayClock.js";
import { VirtualScheduler } from "../src/scheduler/VirtualScheduler.js";
import { ReplaySource } from "../src/gauge/ReplaySource.js";

describe("ReplayClock", () => {
  it("tick(ms)만큼 가상 시각을 전진시킨다", () => {
    const clock = new ReplayClock({ start: new Date("2024-01-01T00:00:00Z") });
    clock.tick(60_000);
    expect(clock.now()).toEqual(new Date("2024-01-01T00:01:00Z"));
  });

  it("배속(speed)을 곱해 전진한다", () => {
    const clock = new ReplayClock({ start: new Date("2024-01-01T00:00:00Z"), speed: 10 });
    clock.tick(1_000);
    expect(clock.now()).toEqual(new Date("2024-01-01T00:00:10Z"));
  });

  it("seek()으로 임의 시각에 즉시 이동한다", () => {
    const clock = new ReplayClock({ start: new Date("2024-01-01T00:00:00Z") });
    clock.seek(new Date("2024-01-01T05:00:00Z"));
    expect(clock.now()).toEqual(new Date("2024-01-01T05:00:00Z"));
  });

  it("end 범위를 넘어서는 이동을 거부한다", () => {
    const clock = new ReplayClock({
      start: new Date("2024-01-01T00:00:00Z"),
      end: new Date("2024-01-01T01:00:00Z"),
    });
    expect(() => clock.tick(2 * 60 * 60_000)).toThrow();
  });

  it("역방향 이동을 거부한다", () => {
    const clock = new ReplayClock({ start: new Date("2024-01-01T00:00:00Z") });
    clock.tick(60_000);
    expect(() => clock.seek(new Date("2024-01-01T00:00:00Z"))).toThrow();
  });

  it("실제 setTimeout/setInterval을 사용하지 않고 콜백을 구동한다", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    const clock = new ReplayClock({ start: new Date("2024-01-01T00:00:00Z") });
    const scheduler = new VirtualScheduler(clock);
    const fired: Date[] = [];
    scheduler.scheduleAt(new Date("2024-01-01T00:05:00Z"), () => fired.push(clock.now()));
    clock.tick(10 * 60_000);

    expect(fired).toEqual([new Date("2024-01-01T00:05:00Z")]);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
    setIntervalSpy.mockRestore();
  });
});

describe("VirtualScheduler", () => {
  it("도래한 콜백을 예약 시각 순서대로 실행한다", () => {
    const clock = new ReplayClock({ start: new Date("2024-01-01T00:00:00Z") });
    const scheduler = new VirtualScheduler(clock);
    const order: string[] = [];

    scheduler.scheduleAt(new Date("2024-01-01T00:03:00Z"), () => order.push("third"));
    scheduler.scheduleAt(new Date("2024-01-01T00:01:00Z"), () => order.push("first"));
    scheduler.scheduleAt(new Date("2024-01-01T00:02:00Z"), () => order.push("second"));

    clock.tick(5 * 60_000);
    expect(order).toEqual(["first", "second", "third"]);
  });

  it("cancel()한 콜백은 실행되지 않는다", () => {
    const clock = new ReplayClock({ start: new Date("2024-01-01T00:00:00Z") });
    const scheduler = new VirtualScheduler(clock);
    const callback = vi.fn();

    const id = scheduler.scheduleAt(new Date("2024-01-01T00:01:00Z"), callback);
    scheduler.cancel(id);
    clock.tick(5 * 60_000);

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("ReplaySource", () => {
  const source = new ReplaySource([
    {
      gaugeId: "g1",
      points: [
        { at: new Date("2024-01-01T00:00:00Z"), value: 1.0 },
        { at: new Date("2024-01-01T00:10:00Z"), value: 2.0 },
      ],
    },
  ]);

  it("정확히 관측점과 일치하면 보간하지 않는다", () => {
    const reading = source.read("g1", new Date("2024-01-01T00:00:00Z"));
    expect(reading).toEqual({ gaugeId: "g1", at: new Date("2024-01-01T00:00:00Z"), value: 1.0, interpolated: false });
  });

  it("관측점 사이는 선형 보간하고 interpolated: true를 단다", () => {
    const reading = source.read("g1", new Date("2024-01-01T00:05:00Z"));
    expect(reading?.value).toBeCloseTo(1.5);
    expect(reading?.interpolated).toBe(true);
  });

  it("시드 범위 밖은 null을 반환한다 (마지막 값 유지 금지)", () => {
    expect(source.read("g1", new Date("2023-12-31T23:59:00Z"))).toBeNull();
    expect(source.read("g1", new Date("2024-01-01T00:20:00Z"))).toBeNull();
  });

  it("알 수 없는 gaugeId는 null을 반환한다", () => {
    expect(source.read("unknown", new Date("2024-01-01T00:00:00Z"))).toBeNull();
  });
});
