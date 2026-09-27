"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { ShockResponse } from "@/app/api/shock/route";
import { HOLDINGS, PORTFOLIO_TOTAL } from "@/data/portfolio";
import { SCENARIOS } from "@/data/shock";
import { DEMO_HOLDINGS, useHydratePortfolio, usePortfolio, type ImportedHolding } from "@/lib/portfolio-store";
import type { NotModeled } from "@/lib/shock/live";
import type { ScenarioId, ShockScenario } from "@/types/demo";
import { useResearch } from "./research-store";
import { portfolioKey } from "@/lib/shock/research-model";

// What the Shock Test draws: both scenarios mapped onto the active portfolio at live prices (the demo included).
// The demo's precomputed scenarios are only a fallback when that fails.
export type ShockModel = {
  mode: "demo" | "live";
  total: number;
  positions: number;
  colors: Record<string, string>;
  // Live only: each position's current value, for the graph's holding nodes.
  values?: Record<string, number>;
  scenarios: ShockScenario[];
  // Live only: holdings without a modeled path (with their weight), and the share of money that has one.
  notModeled: Partial<Record<ScenarioId, NotModeled[]>>;
  modeledShare: Partial<Record<ScenarioId, number>>;
};

const DEMO_MODEL: ShockModel = {
  mode: "demo",
  total: PORTFOLIO_TOTAL,
  positions: HOLDINGS.length,
  colors: Object.fromEntries(HOLDINGS.map((h) => [h.ticker, h.color])),
  scenarios: SCENARIOS,
  notModeled: {},
  modeledShare: {},
};

const keyOf = (holdings: ImportedHolding[]) => JSON.stringify(holdings);

type Entry = { key: string; status: "loading" | "ready" | "error"; model: ShockModel | null; error: string | null };

const useLiveShock = create<{ entry: Entry | null; load: (holdings: ImportedHolding[], force?: boolean) => void }>()((set, get) => ({
  entry: null,
  load: (holdings, force = false) => {
    const key = keyOf(holdings);
    const current = get().entry;
    if (!force && current?.key === key && current.status !== "error") return;
    set({ entry: { key, status: "loading", model: null, error: null } });
    fetch("/api/shock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as ShockResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const model: ShockModel = {
          mode: "live",
          total: data.total,
          positions: holdings.length,
          colors: data.colors,
          values: data.values,
          scenarios: data.scenarios.map((s) => s.scenario),
          notModeled: Object.fromEntries(data.scenarios.map((s) => [s.scenario.id, s.notModeled])),
          modeledShare: Object.fromEntries(data.scenarios.map((s) => [s.scenario.id, s.modeledShare])),
        };
        if (get().entry?.key === key) set({ entry: { key, status: "ready", model, error: null } });
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : "Shock Test failed";
        if (get().entry?.key === key) set({ entry: { key, status: "error", model: null, error } });
      });
  },
}));

export type ShockModelState =
  | { status: "ready"; model: ShockModel }
  | { status: "loading" }
  | { status: "error"; error: string; retry: () => void };

export function useShockModel(): ShockModelState {
  useHydratePortfolio();
  const hydrated = usePortfolio((s) => s.hydrated);
  const imported = usePortfolio((s) => s.imported);
  const entry = useLiveShock((s) => s.entry);
  const load = useLiveShock((s) => s.load);
  const research = useResearch((s) => s.result);
  const addResearch = (model: ShockModel): ShockModel => {
    if (!research || research.portfolioKey !== portfolioKey(imported ?? HOLDINGS)) return model;
    return { ...model, scenarios: [...model.scenarios, research.result.scenario],
      modeledShare: { ...model.modeledShare, researched: research.result.modeledShare },
      notModeled: { ...model.notModeled, researched: research.result.notModeled } };
  };

  const holdings = imported ?? DEMO_HOLDINGS;
  useEffect(() => {
    if (hydrated) load(holdings);
  }, [hydrated, holdings, load]);

  if (!hydrated) return { status: "loading" };
  const mine = entry?.key === keyOf(holdings) ? entry : null;
  if (mine?.status === "ready" && mine.model) return { status: "ready", model: addResearch(mine.model) };
  if (mine?.status === "error") {
    if (!imported) return { status: "ready", model: addResearch(DEMO_MODEL) };
    return { status: "error", error: mine.error ?? "Shock Test failed", retry: () => load(imported, true) };
  }
  return { status: "loading" };
}

export function scenarioIn(model: ShockModel, id: ScenarioId) {
  return model.scenarios.find((s) => s.id === id) ?? model.scenarios[0];
}
