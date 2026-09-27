// Server-only: the real look-through for a list of positions (live Finnhub prices and profiles, ETF holdings
// from the seed or Alpha Vantage). Shared by /api/aperture and the IC Room's portfolio fit.
import { HOLDINGS } from "@/data/portfolio";
import { getEtfProfile, isSeededEtf, normalizeTicker } from "@/lib/etf";
import { finnhubConfigured, getProfile, getQuote } from "@/lib/finnhub";
import { MAX_POSITIONS } from "@/lib/limits";
import { computeXray, type ApertureInput } from "@/lib/xray/compute";
import type { Valuation, XrayModel } from "@/lib/xray/types";

const KNOWN_COLORS = new Map(HOLDINGS.map((h) => [h.ticker, h.color]));

// `price` is the import-time fallback when there's no live quote.
export type PositionInput = { shares: number; price: number | null; name: string | null };

export { MAX_POSITIONS };

// Which prices a request wants: fresh quotes, or the ones it supplied (a saved snapshot, or the valuation the page
// already shows) so every view of one portfolio uses one set of values.
export type PriceMode = "live" | "supplied";
export const priceModeOf = (v: unknown): PriceMode => (v === "supplied" ? "supplied" : "live");

// Replaces quotes with the supplied prices where the request carried them.
export function applySuppliedPrices(inputs: ApertureInput[], holdings: Map<string, PositionInput>) {
  for (const input of inputs) {
    const supplied = holdings.get(input.ticker)?.price;
    if (supplied && Number.isFinite(supplied)) {
      input.price = supplied;
      input.priced = "supplied";
    }
  }
  return inputs;
}

function valuationOf(inputs: ApertureInput[]): Valuation {
  const supplied = inputs.filter((p) => p.priced !== "quote" && p.price > 0).length;
  const quoted = inputs.filter((p) => p.priced === "quote").length;
  const source =
    supplied === 0 ? "Finnhub quotes" : quoted === 0 ? "Prices supplied with the portfolio" : `Finnhub quotes; ${supplied} of ${inputs.length} positions at supplied prices`;
  return { asOf: new Date().toISOString(), source };
}
const TICKER = /^[A-Z][A-Z.]{0,5}$/;

// Request body rows ({ ticker, shares, price?, name? }) to positions, merging repeated tickers. Invalid rows are skipped.
export function parseHoldings(raw: unknown): Map<string, PositionInput> {
  const merged = new Map<string, PositionInput>();
  for (const h of (Array.isArray(raw) ? raw : []) as { ticker?: unknown; shares?: unknown; price?: unknown; name?: unknown }[]) {
    if (typeof h?.ticker !== "string" || typeof h.shares !== "number" || !Number.isFinite(h.shares) || !(h.shares > 0)) continue;
    const ticker = normalizeTicker(h.ticker);
    if (!TICKER.test(ticker)) continue;
    const prev = merged.get(ticker);
    merged.set(ticker, {
      shares: (prev?.shares ?? 0) + h.shares,
      price: typeof h.price === "number" && Number.isFinite(h.price) && h.price > 0 ? h.price : (prev?.price ?? null),
      name: typeof h.name === "string" ? h.name : (prev?.name ?? null),
    });
  }
  return merged;
}

// Prices and classifies each position: a stock (with its Finnhub industry), an ETF with holdings, or opaque.
export async function apertureInputs(merged: Map<string, PositionInput>): Promise<ApertureInput[]> {
  const tickers = [...merged.keys()];
  const live = finnhubConfigured();
  const [quotes, profiles] = await Promise.all([
    Promise.allSettled(tickers.map((t) => (live ? getQuote(t) : Promise.resolve(null)))),
    Promise.allSettled(tickers.map((t) => (live && !isSeededEtf(t) ? getProfile(t) : Promise.resolve(null)))),
  ]);

  // A Finnhub company profile means a stock; no profile, try it as an ETF.
  const inputs: ApertureInput[] = await Promise.all(
    tickers.map(async (ticker, i) => {
      const h = merged.get(ticker)!;
      const quote = quotes[i].status === "fulfilled" ? quotes[i].value : null;
      const profile = profiles[i].status === "fulfilled" ? profiles[i].value : null;
      const price = quote?.price ?? h.price ?? 0;
      const priced = quote?.price ? ("quote" as const) : ("supplied" as const);
      const name = profile?.name ?? h.name ?? ticker;
      if (profile) return { ticker, name, shares: h.shares, price, priced, kind: "stock" as const, industry: profile.industry || null };
      const etf = await getEtfProfile(ticker);
      if (etf) return { ticker, name, shares: h.shares, price, priced, kind: "etf" as const, etf };
      return { ticker, name, shares: h.shares, price, priced, kind: "opaque" as const };
    }),
  );

  return inputs;
}

// Returns null when no position has a price.
export async function aperture(merged: Map<string, PositionInput>): Promise<XrayModel | null> {
  return modelFor(await apertureInputs(merged));
}

export async function modelFor(inputs: ApertureInput[]): Promise<XrayModel | null> {
  if (!inputs.some((p) => p.price > 0)) return null;
  const live = finnhubConfigured();

  // ETF files spell names in capitals ("NVIDIA CORP"); swap in Finnhub names for the companies the page names.
  const valuation = valuationOf(inputs);
  const first = computeXray(inputs, KNOWN_COLORS, new Map(), valuation);
  const named = first.topTen.filter((e) => !e.sources.some((s) => s.via === "Direct")).map((e) => e.ticker);
  const names = new Map<string, string>();
  if (live) {
    const found = await Promise.allSettled(named.map(getProfile));
    named.forEach((t, i) => {
      const r = found[i];
      if (r.status === "fulfilled" && r.value) names.set(t, r.value.name);
    });
  }
  return names.size ? computeXray(inputs, KNOWN_COLORS, names, valuation) : first;
}
