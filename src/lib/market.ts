
import { create } from "zustand";
import { HOLDINGS } from "@/data/portfolio";
import type { MarketResponse, Profile, Quote } from "@/lib/finnhub";
import type { Holding } from "@/types/demo";

// "offline" means Finnhub could not be reached; every view falls back to the demo snapshot.
type Status = "idle" | "loading" | "live" | "offline";

interface MarketState {
  status: Status;
  quotes: Record<string, Quote>;
  profiles: Record<string, Profile>;
  refreshQuotes: () => Promise<void>;
  requestProfile: (ticker: string) => void;
}

const MAX_PER_REQUEST = 12;
const HOLDING_TICKERS = HOLDINGS.map((h) => h.ticker);

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
  refreshQuotes: async () => {
    if (get().status === "loading") return;
    if (get().status === "idle") set({ status: "loading" });
    HOLDING_TICKERS.forEach((t) => requested.add(t));
    try {
      const data = await fetchMarket(HOLDING_TICKERS, "quote,profile");
      const live = Object.keys(data.quotes).length > 0;
      set((s) => ({
        status: live ? "live" : "offline",
        quotes: { ...s.quotes, ...data.quotes },
        profiles: { ...s.profiles, ...data.profiles },
      }));
    } catch {
      // Keep the last good prices if we had them.
      set((s) => ({ status: Object.keys(s.quotes).length > 0 ? "live" : "offline" }));
    }
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
      for (let i = 0; i < batch.length; i += MAX_PER_REQUEST) {
        fetchMarket(batch.slice(i, i + MAX_PER_REQUEST), "profile")
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
export function priceHoldings(quotes: Record<string, Quote>) {
  const holdings: LiveHolding[] = HOLDINGS.map((h) => {
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

// Holdings and total at live prices, or at the demo snapshot while offline.
export function useLiveHoldings() {
  const status = useMarket((s) => s.status);
  const quotes = useMarket((s) => s.quotes);
  return { live: status === "live", ...priceHoldings(status === "live" ? quotes : {}) };
}
