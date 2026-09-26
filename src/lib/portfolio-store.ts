import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { HOLDINGS } from "@/data/portfolio";
import type { Holding } from "@/types/demo";

const DEFAULT_COLOR = "#8FA3BF";

// A position read from the user's screenshot. `price` is the price at import time, used until live quotes arrive.
export interface ImportedHolding {
  ticker: string;
  name: string;
  industry: string | null;
  shares: number;
  price: number;
}

interface PortfolioState {
  // null means the canonical demo portfolio.
  imported: ImportedHolding[] | null;
  setImported: (holdings: ImportedHolding[]) => void;
  resetToDemo: () => void;
}

// Kept for the browser session only; nothing leaves the device.
export const usePortfolio = create<PortfolioState>()(
  persist(
    (set) => ({
      imported: null,
      setImported: (holdings) => set({ imported: holdings }),
      resetToDemo: () => set({ imported: null }),
    }),
    {
      name: "lookthrough-portfolio",
      storage: createJSONStorage(() => sessionStorage),
      // Rehydrated in an effect so the server render and first client render agree.
      skipHydration: true,
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
