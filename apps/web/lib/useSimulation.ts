"use client";

import { useSyncExternalStore } from "react";
import { useSimulationStore } from "./SimulationContext";

export function useSimulation() {
  const store = useSimulationStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { snapshot, store };
}
