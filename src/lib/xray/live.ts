// Server-only: the shared valuation/look-through for reviewed positions, using
// exported quote and verified ETF adapters. Shared by /api/aperture and IC fit.
import { HOLDINGS } from "@/data/portfolio";
import { isSeededEtf, normalizeTicker } from "@/lib/etf";
import { getVerifiedEtfProfile } from "@/lib/imports/quotes";
import { finnhubConfigured, getProfile, getQuote } from "@/lib/finnhub";
import { computeXray, type ApertureInput } from "@/lib/xray/compute";
import type { XrayModel } from "@/lib/xray/types";
import { positionValue } from "./valuation";
import { assertProvenance } from "@/lib/provenance";

const KNOWN_COLORS = new Map(HOLDINGS.map((h) => [h.ticker, h.color]));

// A supplied price is the portfolio's frozen valuation, shared across views.
// Refresh explicitly replaces it; rendering another tab must not reprice shares.
export type PositionInput = { shares: number; price: number | null; name: string | null; kind?: ApertureInput["kind"]; marketValue?: number; industry?: string | null; provenance?: ApertureInput["provenance"] };

export const MAX_POSITIONS = 50;
const TICKER = /^[A-Z][A-Z0-9.]{0,14}$/;

// Request body rows ({ ticker, shares, price?, name? }) to positions, merging repeated tickers. Invalid rows are skipped.
export function parseHoldings(raw: unknown): Map<string, PositionInput> {
  const merged = new Map<string, PositionInput>();
  for (const h of (Array.isArray(raw) ? raw : []) as Record<string, unknown>[]) {
    if (typeof h?.ticker !== "string" || typeof h.shares !== "number" || !Number.isFinite(h.shares) || h.shares < 0) continue;
    const kind = ["stock", "etf", "cash", "opaque"].includes(String(h.kind)) ? h.kind as ApertureInput["kind"] : undefined;
    const marketValue = typeof h.marketValue === "number" && Number.isFinite(h.marketValue) && h.marketValue >= 0 ? h.marketValue : undefined;
    if (h.marketValue !== undefined && marketValue === undefined) throw new Error("Invalid explicit position valuation.");
    if (h.shares === 0 && marketValue === undefined) continue;
    const ticker = kind === "opaque" ? h.ticker.trim().toUpperCase() : normalizeTicker(h.ticker);
    if (!TICKER.test(ticker) && !(kind === "opaque" && ticker.length > 0 && ticker.length <= 280 && marketValue !== undefined)) continue;
    const prev = merged.get(ticker);
    if (prev && prev.kind !== kind) throw new Error(`Conflicting security types for ${ticker}.`);
    const price = typeof h.price === "number" && Number.isFinite(h.price) && (h.price > 0 || (h.price === 0 && marketValue !== undefined)) ? h.price : null;
    const shares = (prev?.shares ?? 0) + h.shares;
    if (!Number.isFinite(shares)) throw new Error("Portfolio quantity exceeds the supported numeric range.");
    const explicit = marketValue !== undefined || prev?.marketValue !== undefined;
    if (prev && explicit && ((prev.marketValue === undefined && prev.price === null) || (marketValue === undefined && price === null))) throw new Error("Cannot merge an unvalued position with a reviewed value.");
    const value = prev && explicit ? positionValue({ ...prev, price: prev.price ?? 0 }) + positionValue({ shares: h.shares, price: price ?? 0, marketValue }) : marketValue;
    const provenance = h.provenance as ApertureInput["provenance"];
    if (provenance) assertProvenance(provenance);
    const formula = "sum(supplied position valuations)";
    const priorEvidence = prev?.provenance?.kind === "computed" && prev.provenance.formula === formula ? prev.provenance.inputs : prev?.provenance ? [prev.provenance] : [];
    merged.set(ticker, {
      shares, kind, marketValue: value,
      price: prev ? (explicit ? 0 : price !== null && prev.price !== null ? (prev.shares * prev.price + h.shares * price) / shares : null) : price,
      name: typeof h.name === "string" ? h.name : (prev?.name ?? null),
      industry: typeof h.industry === "string" ? h.industry : null,
      provenance: prev?.provenance && provenance ? {kind:"computed",formula,inputs:[...priorEvidence,provenance]} : prev ? undefined : provenance,
    });
  }
  return merged;
}

// Prices and classifies each position: a stock (with its Finnhub industry), an ETF with holdings, or opaque.
export async function apertureInputs(merged: Map<string, PositionInput>): Promise<ApertureInput[]> {
  const tickers = [...merged.keys()];
  const live = finnhubConfigured();
  const [quotes, profiles] = await Promise.all([
    Promise.allSettled(tickers.map((t) => (live && t !== "USD" && merged.get(t)!.marketValue === undefined && merged.get(t)!.price === null ? getQuote(t) : Promise.resolve(null)))),
    Promise.allSettled(tickers.map((t) => (live && t !== "USD" && !merged.get(t)!.kind && !isSeededEtf(t) ? getProfile(t) : Promise.resolve(null)))),
  ]);

  // A Finnhub company profile means a stock; no profile, try it as an ETF.
  const inputs: ApertureInput[] = await Promise.all(
    tickers.map(async (ticker, i) => {
      const h = merged.get(ticker)!;
      const quote = quotes[i].status === "fulfilled" ? quotes[i].value : null;
      const profile = profiles[i].status === "fulfilled" ? profiles[i].value : null;
      const kind = h.kind ?? (ticker === "USD" ? "cash" : undefined);
      const price = h.price ?? (kind === "cash" ? 1 : quote?.price) ?? (h.marketValue !== undefined ? 0 : undefined);
      if (price === undefined || !Number.isFinite(price) || (price <= 0 && h.marketValue === undefined)) throw new Error(`Price unavailable for ${ticker}; portfolio valuation is incomplete. Review a dated value before analysis.`);
      const base = {ticker,name:profile?.name ?? h.name ?? ticker,shares:h.shares,price,marketValue:h.marketValue,provenance:h.provenance};
      if (kind === "cash" || kind === "opaque") return {...base,kind};
      if (kind === "stock" || profile) return {...base,kind:"stock" as const,industry:profile?.industry || h.industry || null};
      const etf = await getVerifiedEtfProfile(ticker);
      if (etf) return {...base,kind:"etf" as const,etf};
      return {...base,kind:"opaque" as const};
    }),
  );

  return inputs;
}

// Explicit reviewed values (including a zero cash balance) produce a real model.
export async function aperture(merged: Map<string, PositionInput>): Promise<XrayModel | null> {
  return modelFor(await apertureInputs(merged));
}

export async function modelFor(inputs: ApertureInput[]): Promise<XrayModel | null> {
  if (inputs.length === 0) return null;
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
