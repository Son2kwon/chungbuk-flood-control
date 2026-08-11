"use client";

import { SimulationProvider } from "../lib/SimulationContext";
import { AppNav } from "./AppNav";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SimulationProvider>
      <AppNav />
      {children}
    </SimulationProvider>
  );
}
