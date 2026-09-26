"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { ShockResponse } from "@/app/api/shock/route";
import { HOLDINGS, PORTFOLIO_TOTAL } from "@/data/portfolio";
import { SCENARIOS } from "@/data/shock";
import { useHydratePortfolio, usePortfolio, type ImportedHolding } from "@/lib/portfolio-store";
import type { NotModeled } from "@/lib/shock/live";
import type { ScenarioId, ShockScenario } from "@/types/demo";

// What the Shock Test draws: the curated scenarios for the demo, or the same scenarios mapped onto your portfolio.
export type ShockModel = {
  mode: "demo" | "live";
  total: number;
  positions: number;
  colors: Record<string, string>;
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

const keyOf = (holdings: ImportedHolding[]) => JSON.stringify(holdings.map((h) => [h.ticker, h.shares]));

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
      body: JSON.stringify({ holdings: holdings.map(({ ticker, shares, price, name }) => ({ ticker, shares, price, name })) }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as ShockResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const model: ShockModel = {
          mode: "live",
          total: data.total,
          positions: holdings.length,
          colors: data.colors,
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

  useEffect(() => {
    if (hydrated && imported) load(imported);
  }, [hydrated, imported, load]);

  if (!hydrated) return { status: "loading" };
  if (!imported) return { status: "ready", model: DEMO_MODEL };
  const mine = entry?.key === keyOf(imported) ? entry : null;
  if (mine?.status === "ready" && mine.model) return { status: "ready", model: mine.model };
  if (mine?.status === "error") return { status: "error", error: mine.error ?? "Shock Test failed", retry: () => load(imported, true) };
  return { status: "loading" };
}

export function scenarioIn(model: ShockModel, id: ScenarioId) {
  return model.scenarios.find((s) => s.id === id) ?? model.scenarios[0];
}
