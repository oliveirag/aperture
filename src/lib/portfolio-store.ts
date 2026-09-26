import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { HOLDINGS } from "@/data/portfolio";
import type { Holding } from "@/types/demo";
import type { Snapshot } from "@/lib/imports/types";
import { mergeInputs } from "@/lib/imports/types";

const DEFAULT_COLOR = "#8FA3BF";

// A position from an import (screenshot, CSV, typed) or a practice portfolio. `price` is the price at the time,
// used until live quotes arrive.
export interface ImportedHolding {
  ticker: string;
  name: string;
  industry: string | null;
  shares: number;
  price: number;
}

// "practice" is a beginner's pretend portfolio: hypothetical dollars, never real money.
export type PortfolioKind = "imported" | "practice";

interface PortfolioState {
  // null means the canonical demo portfolio.
  imported: ImportedHolding[] | null;
  kind: PortfolioKind;
  // False until sessionStorage has been read; views that differ by portfolio wait for it.
  hydrated: boolean;
  snapshot: Snapshot | null;
  setSnapshot: (snapshot: Snapshot) => void;
  setImported: (holdings: ImportedHolding[], kind?: PortfolioKind) => void;
  resetToDemo: () => void;
}

// Kept for the browser session only; nothing leaves the device.
export const usePortfolio = create<PortfolioState>()(
  persist(
    (set) => ({
      imported: null,
      kind: "imported",
      hydrated: false,
      snapshot: null,
      setSnapshot: (snapshot) => set({ snapshot, kind:"imported", imported:mergeInputs(snapshot.results).map(r=>({ticker:r.ticker,name:r.name,industry:r.industry??null,shares:r.shares,price:r.price})) }),
      setImported: (holdings, kind = "imported") => set({ imported: holdings, kind, snapshot:null }),
      resetToDemo: () => set({ imported: null, kind: "imported", snapshot:null }),
    }),
    {
      name: "lookthrough-portfolio",
      storage: createJSONStorage(() => sessionStorage),
      // Rehydrated in an effect so the server render and first client render agree.
      skipHydration: true,
      partialize: (s) => ({ imported: s.imported, kind: s.kind, snapshot:s.snapshot }),
      onRehydrateStorage: () => () => usePortfolio.setState({ hydrated: true }),
    },
  ),
);

const DEMO_COLOR = new Map(HOLDINGS.map((h) => [h.ticker, h.color]));

// The active portfolio as display holdings, largest first.
export function portfolioHoldings(imported: ImportedHolding[] | null): Holding[] {
  if (!imported) return HOLDINGS;
  return imported
    .map((h) => ({
      ticker: h.ticker,
      name: h.name,
      type: "stock" as const,
      shares: h.shares,
      price: h.price,
      value: h.shares * h.price,
      category: h.industry ?? "",
      color: DEMO_COLOR.get(h.ticker) ?? DEFAULT_COLOR,
    }))
    .sort((a, b) => b.value - a.value);
}

// Loads the saved portfolio from sessionStorage after the first render.
export function useHydratePortfolio() {
  useEffect(() => {
    if (!usePortfolio.persist.hasHydrated()) usePortfolio.persist.rehydrate();
  }, []);
}
