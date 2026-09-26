import { create } from "zustand";

export type ScenarioId = "cre" | "ai-capex";

type ShockState = {
  scenarioId: ScenarioId;
  severity: number; // slider value in scenario units
  hasRun: boolean; // false until a scenario is started
  selectedHolding: string | null; // ticker whose path is highlighted
  selectedEdgeId: string | null; // edge whose evidence is open
  setScenario: (id: ScenarioId, baseSeverity: number) => void; // severity=base, hasRun=true, clears selections
  setSeverity: (s: number) => void;
  selectHolding: (t: string | null) => void;
  selectEdge: (id: string | null) => void;
  reset: () => void; // scenarioId "cre", severity 20, hasRun false, selections null
};

const initial = {
  scenarioId: "cre" as ScenarioId,
  severity: 20,
  hasRun: false,
  selectedHolding: null,
  selectedEdgeId: null,
};

export const useShock = create<ShockState>()((set) => ({
  ...initial,
  setScenario: (scenarioId, baseSeverity) =>
    set({ scenarioId, severity: baseSeverity, hasRun: true, selectedHolding: null, selectedEdgeId: null }),
  setSeverity: (severity) => set({ severity }),
  selectHolding: (selectedHolding) => set({ selectedHolding }),
  selectEdge: (selectedEdgeId) => set({ selectedEdgeId }),
  reset: () => set(initial),
}));
