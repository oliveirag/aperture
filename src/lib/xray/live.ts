// Server-only: the real look-through for a list of positions (live Finnhub prices and profiles, ETF holdings
// from the seed or Alpha Vantage). Shared by /api/lookthrough and the IC Room's portfolio fit.
import { HOLDINGS } from "@/data/portfolio";
import { getEtfProfile, normalizeTicker } from "@/lib/etf";
import { finnhubConfigured, getProfile, getQuote } from "@/lib/finnhub";
import { computeXray, type LookthroughInput } from "@/lib/xray/compute";
import type { XrayModel } from "@/lib/xray/types";

const KNOWN_COLORS = new Map(HOLDINGS.map((h) => [h.ticker, h.color]));

// `price` is the import-time fallback when there's no live quote.
export type PositionInput = { shares: number; price: number | null; name: string | null };

export const MAX_POSITIONS = 25;
const TICKER = /^[A-Z][A-Z.]{0,5}$/;

// Request body rows ({ ticker, shares, price?, name? }) to positions, merging repeated tickers. Invalid rows are skipped.
export function parseHoldings(raw: unknown): Map<string, PositionInput> {
  const merged = new Map<string, PositionInput>();
  for (const h of (Array.isArray(raw) ? raw : []) as { ticker?: unknown; shares?: unknown; price?: unknown; name?: unknown }[]) {
    if (typeof h?.ticker !== "string" || typeof h.shares !== "number" || !(h.shares > 0)) continue;
    const ticker = normalizeTicker(h.ticker);
    if (!TICKER.test(ticker)) continue;
    const prev = merged.get(ticker);
    merged.set(ticker, {
      shares: (prev?.shares ?? 0) + h.shares,
      price: typeof h.price === "number" && h.price > 0 ? h.price : (prev?.price ?? null),
      name: typeof h.name === "string" ? h.name : (prev?.name ?? null),
    });
  }
  return merged;
}

// Prices and classifies each position: a stock (with its Finnhub industry), an ETF with holdings, or opaque.
export async function lookthroughInputs(merged: Map<string, PositionInput>): Promise<LookthroughInput[]> {
  const tickers = [...merged.keys()];
  const live = finnhubConfigured();
  const [quotes, profiles] = await Promise.all([
    Promise.allSettled(tickers.map((t) => (live ? getQuote(t) : Promise.resolve(null)))),
    Promise.allSettled(tickers.map((t) => (live ? getProfile(t) : Promise.resolve(null)))),
  ]);

  // A Finnhub company profile means a stock; no profile, try it as an ETF.
  const inputs: LookthroughInput[] = await Promise.all(
    tickers.map(async (ticker, i) => {
      const h = merged.get(ticker)!;
      const quote = quotes[i].status === "fulfilled" ? quotes[i].value : null;
      const profile = profiles[i].status === "fulfilled" ? profiles[i].value : null;
      const price = quote?.price ?? h.price ?? 0;
      const name = profile?.name ?? h.name ?? ticker;
      if (profile) return { ticker, name, shares: h.shares, price, kind: "stock" as const, industry: profile.industry || null };
      const etf = await getEtfProfile(ticker);
      if (etf) return { ticker, name, shares: h.shares, price, kind: "etf" as const, etf };
      return { ticker, name, shares: h.shares, price, kind: "opaque" as const };
    }),
  );

  return inputs;
}

// Returns null when no position has a price.
export async function lookthrough(merged: Map<string, PositionInput>): Promise<XrayModel | null> {
  return modelFor(await lookthroughInputs(merged));
}

export async function modelFor(inputs: LookthroughInput[]): Promise<XrayModel | null> {
  if (!inputs.some((p) => p.price > 0)) return null;
  const live = finnhubConfigured();

  // ETF files spell names in capitals ("NVIDIA CORP"); swap in Finnhub names for the companies the page names.
  const first = computeXray(inputs, KNOWN_COLORS);
  const named = first.topTen.filter((e) => !e.sources.some((s) => s.via === "Direct")).map((e) => e.ticker);
  const names = new Map<string, string>();
  if (live) {
    const found = await Promise.allSettled(named.map(getProfile));
    named.forEach((t, i) => {
      const r = found[i];
      if (r.status === "fulfilled" && r.value) names.set(t, r.value.name);
    });
  }
  return names.size ? computeXray(inputs, KNOWN_COLORS, names) : first;
}
