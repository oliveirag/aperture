import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { HOLDINGS } from "@/data/portfolio";
import type { Holding } from "@/types/demo";
import type { ApertureInput } from "@/lib/xray/compute";
import { positionValue } from "@/lib/xray/valuation";

const DEFAULT_COLOR = "#8FA3BF";

// A position from an import (screenshot, CSV, typed) or a practice portfolio. `price` is the price at the time,
// used until live quotes arrive.
export interface ImportedHolding {
  ticker: string;
  name: string;
  industry: string | null;
  shares: number;
  price: number;
  kind?: ApertureInput["kind"];
  marketValue?: number;
  provenance?: ApertureInput["provenance"];
}

// Additive fields preserve compatibility with legacy demo display holdings.
export type PortfolioHolding = Holding & Pick<ImportedHolding, "kind" | "marketValue" | "provenance">;

// The demo portfolio in the same shape, so it goes through the same live pricing and look-through as an import.
// The snapshot prices are only a fallback for positions Finnhub can't quote.
export const DEMO_HOLDINGS: ImportedHolding[] = HOLDINGS.map((h) => ({ ticker: h.ticker, name: h.name, industry: h.category, shares: h.shares, price: h.price }));

// "practice" is a beginner's pretend portfolio: hypothetical dollars, never real money.
export type PortfolioKind = "imported" | "practice";

interface PortfolioState {
  // null means the canonical demo portfolio.
  imported: ImportedHolding[] | null;
  kind: PortfolioKind;
  // The user's own portfolio while the demo is showing, so switching to the demo never throws it away.
  stashed: { holdings: ImportedHolding[]; kind: PortfolioKind } | null;
  // False until sessionStorage has been read; views that differ by portfolio wait for it.
  hydrated: boolean;
  setImported: (holdings: ImportedHolding[], kind?: PortfolioKind) => void;
  resetToDemo: () => void;
  restoreStashed: () => void;
}

// Kept for the browser session only; nothing leaves the device.
export const usePortfolio = create<PortfolioState>()(
  persist(
    (set) => ({
      imported: null,
      kind: "imported",
      stashed: null,
      hydrated: false,
      setImported: (holdings, kind = "imported") => set({ imported: holdings, kind, stashed: null }),
      resetToDemo: () =>
        set((s) => ({ imported: null, kind: "imported", stashed: s.imported ? { holdings: s.imported, kind: s.kind } : s.stashed })),
      restoreStashed: () => set((s) => (s.stashed ? { imported: s.stashed.holdings, kind: s.stashed.kind, stashed: null } : {})),
    }),
    {
      name: "aperture-portfolio",
      storage: createJSONStorage(() => sessionStorage),
      // Rehydrated in an effect so the server render and first client render agree.
      skipHydration: true,
      partialize: (s) => ({ imported: s.imported, kind: s.kind, stashed: s.stashed }),
      onRehydrateStorage: () => () => usePortfolio.setState({ hydrated: true }),
    },
  ),
);

const DEMO_COLOR = new Map(HOLDINGS.map((h) => [h.ticker, h.color]));

// The active portfolio as display holdings, largest first.
export function portfolioHoldings(imported: ImportedHolding[] | null): PortfolioHolding[] {
  if (!imported) return HOLDINGS;
  return imported
    .map((h) => ({
      ticker: h.ticker,
      name: h.name,
      type: h.kind === "etf" ? "etf" as const : "stock" as const,
      kind: h.kind,
      shares: h.shares,
      price: h.price,
      marketValue: h.marketValue,
      provenance: h.provenance,
      value: positionValue(h),
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
