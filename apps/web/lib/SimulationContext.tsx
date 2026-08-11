"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { createSimulationStore, SimulationStore } from "./simulationStore";

const SimulationContext = createContext<SimulationStore | null>(null);

/**
 * 시뮬레이션은 앱 전체에서 단 하나만 존재해야 한다 — 상황실에서 승인한 결과가
 * /field, /notify, /audit, /compare에도 같은 이벤트 로그로 보여야 하기 때문이다.
 * 페이지마다 useSimulation()을 부르면 다른 훅이 아니라 이 Provider가 만든
 * 단일 store를 공유해서 받는다. rAF 재생 루프도 여기 한 곳에서만 돈다 —
 * 페이지마다 따로 돌면 같은 가상 시각이 여러 번 중복 전진한다.
 */
export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<SimulationStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createSimulationStore();
  }
  const store = storeRef.current;

  useEffect(() => {
    let frameId: number;
    const loop = () => {
      store.tickIfPlaying();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [store]);

  return <SimulationContext.Provider value={store}>{children}</SimulationContext.Provider>;
}

export function useSimulationStore(): SimulationStore {
  const store = useContext(SimulationContext);
  if (!store) throw new Error("useSimulationStore()는 SimulationProvider 안에서만 호출할 수 있습니다.");
  return store;
}
