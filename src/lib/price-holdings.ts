// Server-only: prices raw positions with Finnhub. Shared by the screenshot (/api/snap) and typed/CSV (/api/price) imports.
import { HOLDINGS } from "@/data/portfolio";
import { finnhubConfigured, getProfile, getQuote } from "@/lib/finnhub";

// Keeps a single import under Finnhub's 60 calls/min free limit.
export const MAX_HOLDINGS = 25;

// Finnhub has no profile for ETFs; these names cover the demo ETFs when the screenshot shows none.
const KNOWN_NAMES = new Map(HOLDINGS.map((h) => [h.ticker, h.name]));

export type RawHolding = { ticker: string; shares: number | null; marketValue: number | null; name: string | null };

// "matched": Finnhub knows the ticker and priced it. "unpriced": no quote, value taken from the import (screenshot or CSV).
// "unknown": no quote and no value to fall back on; the row is shown but left out of the total.
export type SnapHolding = {
  ticker: string;
  name: string;
  industry: string | null;
  shares: number;
  price: number | null;
  value: number;
  status: "matched" | "unpriced" | "unknown";
};

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

// Brokerages write class shares as BRK.B, BRK/B or BRK-B; Finnhub wants BRK.B.
export function normalizeTicker(t: string) {
  return t.trim().toUpperCase().replace(/^\$/, "").replace(/[/-]/g, ".");
}

// Merges repeated tickers, prices each one with Finnhub, and fills in missing share counts from market value.
export async function priceHoldings(raw: RawHolding[]): Promise<SnapHolding[]> {
  const merged = new Map<string, RawHolding>();
  for (const h of raw) {
    if (typeof h?.ticker !== "string") continue;
    const ticker = normalizeTicker(h.ticker);
    if (!/^[A-Z][A-Z.]{0,5}$/.test(ticker)) continue;
    const prev = merged.get(ticker);
    merged.set(ticker, {
      ticker,
      shares: positive(h.shares) ? (prev?.shares ?? 0) + h.shares : (prev?.shares ?? null),
      marketValue: positive(h.marketValue) ? (prev?.marketValue ?? 0) + h.marketValue : (prev?.marketValue ?? null),
      name: prev?.name ?? (typeof h.name === "string" && h.name.trim() ? h.name.trim() : null),
    });
  }
  const rows = [...merged.values()].slice(0, MAX_HOLDINGS);

  const live = finnhubConfigured();
  const quotes = await Promise.allSettled(rows.map((h) => (live ? getQuote(h.ticker) : Promise.resolve(null))));
  const profiles = await Promise.allSettled(rows.map((h) => (live ? getProfile(h.ticker) : Promise.resolve(null))));

  const out: SnapHolding[] = [];
  rows.forEach((h, i) => {
    const q = quotes[i].status === "fulfilled" ? quotes[i].value : null;
    const p = profiles[i].status === "fulfilled" ? profiles[i].value : null;
    let shares = positive(h.shares) ? h.shares : null;
    if (shares === null && q && positive(h.marketValue)) shares = h.marketValue / q.price;
    if (shares === null) return;

    const name = p?.name ?? h.name ?? KNOWN_NAMES.get(h.ticker) ?? h.ticker;
    const industry = p?.industry || null;
    if (q) out.push({ ticker: h.ticker, name, industry, shares, price: q.price, value: shares * q.price, status: "matched" });
    else if (positive(h.marketValue))
      out.push({ ticker: h.ticker, name, industry, shares, price: h.marketValue / shares, value: h.marketValue, status: "unpriced" });
    else out.push({ ticker: h.ticker, name, industry, shares, price: null, value: 0, status: "unknown" });
  });
  return out;
}

