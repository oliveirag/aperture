"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// What this device saw of each portfolio on earlier visits, for "since your last visit". Device-only (localStorage):
// it holds tickers and weights, never account data, and a portfolio is identified by its positions, not its prices.

export type Visit = { at: string; session: string; total: number; weights: Record<string, number>; flags: string[] };
type PortfolioSeen = {
  // The visit before this browser session, and this session's latest view.
  baseline: Visit | null;
  latest: Visit | null;
  // Filing accession or date the user marked reviewed, per ticker.
  reviewed: Record<string, string>;
  // Filings seen on the first visit are the baseline, not "new".
  firstSeen: Record<string, string>;
};

const MAX_PORTFOLIOS = 20;

type LastSeenState = {
  portfolios: Record<string, PortfolioSeen>;
  recordVisit: (key: string, visit: Omit<Visit, "session">) => void;
  markReviewed: (key: string, ticker: string, filing: string) => void;
  noteFiling: (key: string, ticker: string, filing: string) => void;
};

const EMPTY: PortfolioSeen = { baseline: null, latest: null, reviewed: {}, firstSeen: {} };

// One id per tab session, so reloads don't turn the current visit into "last visit".
export function sessionId() {
  try {
    const existing = sessionStorage.getItem("aperture-session");
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem("aperture-session", id);
    return id;
  } catch {
    return "memory";
  }
}

// Stable identity of a portfolio's positions (prices excluded, so repricing is the same portfolio).
export function positionsKey(positions: { ticker: string; shares: number }[] | null) {
  if (!positions) return "demo";
  return JSON.stringify(positions.map((p) => [p.ticker, p.shares]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function prune(portfolios: Record<string, PortfolioSeen>) {
  const keys = Object.keys(portfolios);
  if (keys.length <= MAX_PORTFOLIOS) return portfolios;
  const byAge = keys.sort((a, b) => (portfolios[a].latest?.at ?? "").localeCompare(portfolios[b].latest?.at ?? ""));
  const out = { ...portfolios };
  for (const k of byAge.slice(0, keys.length - MAX_PORTFOLIOS)) delete out[k];
  return out;
}

export const useLastSeen = create<LastSeenState>()(
  persist(
    (set) => ({
      portfolios: {},
      recordVisit: (key, visit) =>
        set((s) => {
          const prev = s.portfolios[key] ?? EMPTY;
          const session = sessionId();
          const current: Visit = { ...visit, session };
          const baseline = prev.latest && prev.latest.session !== session ? prev.latest : prev.baseline;
          return { portfolios: prune({ ...s.portfolios, [key]: { ...prev, baseline, latest: current } }) };
        }),
      markReviewed: (key, ticker, filing) =>
        set((s) => {
          const prev = s.portfolios[key] ?? EMPTY;
          return { portfolios: { ...s.portfolios, [key]: { ...prev, reviewed: { ...prev.reviewed, [ticker]: filing } } } };
        }),
      noteFiling: (key, ticker, filing) =>
        set((s) => {
          const prev = s.portfolios[key] ?? EMPTY;
          if (prev.firstSeen[ticker]) return s;
          return { portfolios: { ...s.portfolios, [key]: { ...prev, firstSeen: { ...prev.firstSeen, [ticker]: filing } } } };
        }),
    }),
    {
      name: "aperture-last-seen",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

export function hydrateLastSeen() {
  if (typeof window === "undefined" || useLastSeen.persist.hasHydrated()) return;
  try {
    void useLastSeen.persist.rehydrate();
  } catch {
    // Storage unavailable: "since last visit" simply has no baseline.
  }
}

// A filing is new when it differs from what the user marked reviewed and from the one seen on the first visit.
export function isNewFiling(seen: PortfolioSeen | undefined, ticker: string, filing: string) {
  if (!seen) return false;
  const marked = seen.reviewed[ticker];
  if (marked) return marked !== filing;
  const first = seen.firstSeen[ticker];
  return first !== undefined && first !== filing;
}

export type ExposureChange = { ticker: string; before: number; after: number };

// Pure: what moved between two visits. Weight moves under half a percentage point are noise at this scale.
export function diffVisits(before: Visit, after: Visit, minMove = 0.005) {
  const tickers = new Set([...Object.keys(before.weights), ...Object.keys(after.weights)]);
  const moved: ExposureChange[] = [...tickers]
    .map((t) => ({ ticker: t, before: before.weights[t] ?? 0, after: after.weights[t] ?? 0 }))
    .filter((c) => Math.abs(c.after - c.before) >= minMove)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  return {
    totalChange: after.total - before.total,
    moved,
    newFlags: after.flags.filter((f) => !before.flags.includes(f)),
    clearedFlags: before.flags.filter((f) => !after.flags.includes(f)),
  };
}
