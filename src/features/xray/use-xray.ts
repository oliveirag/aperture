"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { useHydratePortfolio, usePortfolio, type ImportedHolding } from "@/lib/portfolio-store";
import { DEMO_XRAY } from "@/lib/xray/demo";
import type { XrayModel } from "@/lib/xray/types";

const keyOf = (holdings: ImportedHolding[]) => JSON.stringify(holdings.map((h) => [h.ticker, h.shares]));

type Entry = { key: string; status: "loading" | "ready" | "error"; model: XrayModel | null; error: string | null };

// Last computed look-through, keyed by the imported holdings, so navigating back to X-Ray doesn't refetch.
const useLookthrough = create<{ entry: Entry | null; load: (holdings: ImportedHolding[], force?: boolean) => void }>()((set, get) => ({
  entry: null,
  load: (holdings, force = false) => {
    const key = keyOf(holdings);
    const current = get().entry;
    if (!force && current?.key === key && current.status !== "error") return;
    set({ entry: { key, status: "loading", model: null, error: null } });
    fetch("/api/lookthrough", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings: holdings.map(({ ticker, shares, price, name }) => ({ ticker, shares, price, name })) }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (get().entry?.key === key) set({ entry: { key, status: "ready", model: data as XrayModel, error: null } });
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : "Look-through failed";
        if (get().entry?.key === key) set({ entry: { key, status: "error", model: null, error } });
      });
  },
}));

export type XrayState =
  | { status: "ready"; model: XrayModel }
  | { status: "loading" }
  | { status: "error"; error: string; retry: () => void };

// The X-Ray for the active portfolio: curated canon for the demo, computed from real data for an imported one.
export function useXray(): XrayState {
  useHydratePortfolio();
  const hydrated = usePortfolio((s) => s.hydrated);
  const imported = usePortfolio((s) => s.imported);
  const entry = useLookthrough((s) => s.entry);
  const load = useLookthrough((s) => s.load);

  useEffect(() => {
    if (hydrated && imported) load(imported);
  }, [hydrated, imported, load]);

  if (!hydrated) return { status: "loading" };
  if (!imported) return { status: "ready", model: DEMO_XRAY };
  const mine = entry?.key === keyOf(imported) ? entry : null;
  if (mine?.status === "ready" && mine.model) return { status: "ready", model: mine.model };
  if (mine?.status === "error") return { status: "error", error: mine.error ?? "Look-through failed", retry: () => load(imported, true) };
  return { status: "loading" };
}
