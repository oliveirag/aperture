
import { useMemo } from "react";
import { create } from "zustand";
import { HOLDINGS } from "@/data/portfolio";
import type { MarketResponse, Profile, Quote } from "@/lib/finnhub";
import { portfolioHoldings, usePortfolio } from "@/lib/portfolio-store";
import type { Holding } from "@/types/demo";

// "offline" means Finnhub could not be reached; every view falls back to the demo snapshot.
type Status = "idle" | "loading" | "live" | "offline";

interface MarketState {
  status: Status;
  quotes: Record<string, Quote>;
  profiles: Record<string, Profile>;
  refreshQuotes: (tickers: string[]) => Promise<void>;
  requestProfile: (ticker: string) => void;
}

const MAX_PER_REQUEST = 12;

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchMarket(symbols: string[], fields: string): Promise<MarketResponse> {
  const res = await fetch(`/api/market?symbols=${symbols.join(",")}&fields=${fields}`);
  if (!res.ok) throw new Error(`market ${res.status}`);
  return res.json();
}

// Profiles requested by TickerMarks in the same render are batched into one call.
const requested = new Set<string>();
let pending: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export const useMarket = create<MarketState>()((set, get) => ({
  status: "idle",
  quotes: {},
  profiles: {},

  // Holdings prices plus their profiles. Safe to call repeatedly: the server caches quotes for 60s.
  refreshQuotes: async (tickers) => {
    if (tickers.length === 0) return;
    if (get().status === "idle") set({ status: "loading" });
    tickers.forEach((t) => requested.add(t));
    const results = await Promise.allSettled(chunks(tickers, MAX_PER_REQUEST).map((c) => fetchMarket(c, "quote,profile")));
    const quotes: Record<string, Quote> = {};
    const profiles: Record<string, Profile> = {};
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      Object.assign(quotes, r.value.quotes);
      Object.assign(profiles, r.value.profiles);
    }
    // Keep the last good prices if this round failed.
    set((s) => {
      const merged = { ...s.quotes, ...quotes };
      return { status: Object.keys(merged).length > 0 ? "live" : "offline", quotes: merged, profiles: { ...s.profiles, ...profiles } };
    });
  },

  requestProfile: (ticker) => {
    if (requested.has(ticker)) return;
    requested.add(ticker);
    pending.push(ticker);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      const batch = pending;
      pending = [];
      flushTimer = null;
      for (const c of chunks(batch, MAX_PER_REQUEST)) {
        fetchMarket(c, "profile")
          .then((data) => set((s) => ({ profiles: { ...s.profiles, ...data.profiles } })))
          .catch(() => {});
      }
    }, 0);
  },
}));

export interface LiveHolding extends Holding {
  live: boolean;
  change: number;
  changePct: number;
}

// Holdings repriced with live quotes. A holding without a quote keeps its snapshot price and no day change.
export function priceHoldings(quotes: Record<string, Quote>, base: Holding[] = HOLDINGS) {
  const holdings: LiveHolding[] = base.map((h) => {
    const q = quotes[h.ticker];
    if (!q) return { ...h, live: false, change: 0, changePct: 0 };
    return { ...h, price: q.price, value: h.shares * q.price, live: true, change: h.shares * q.change, changePct: q.changePct };
  });
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const dayChange = holdings.reduce((s, h) => s + h.change, 0);
  const prevTotal = total - dayChange;
  return { holdings, total, dayChange, dayChangePct: prevTotal ? dayChange / prevTotal : 0 };
}

// Newest trade time across the quotes, in unix seconds.
export function latestQuoteTime(quotes: Record<string, Quote>) {
  return Math.max(0, ...Object.values(quotes).map((q) => q.time));
}

// The active portfolio (imported or demo) at live prices, or at its import/snapshot prices while offline.
export function useLiveHoldings() {
  const status = useMarket((s) => s.status);
  const quotes = useMarket((s) => s.quotes);
  const imported = usePortfolio((s) => s.imported);
  const snapshot = usePortfolio((s) => s.snapshot);
  const base = useMemo(() => portfolioHoldings(imported), [imported]);
  const priced = priceHoldings(status === "live" && !snapshot ? quotes : {}, base);
  const live = status === "live" && priced.holdings.some((h) => h.live);
  return { live, imported: imported !== null, ...priced };
}
