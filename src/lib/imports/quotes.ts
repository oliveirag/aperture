// One shared provider chain. Legacy unsourced responses are not promoted to fresh
// evidence; A's getQuote supplies original provider/retrieval/as-of metadata.
import { getQuote as sharedQuote, getProfile } from "@/lib/finnhub";
import { getEtfProfile as sharedEtfProfile } from "@/lib/etf";
import { assertProvenance, type Provenance, type RetrievedProvenance, type NumericProvenance } from "@/lib/provenance";
import type { ApertureInput } from "@/lib/xray/compute";
import type { PositionResult } from "./types";
export { getProfile };

export function quoteValuation(q: { price: number; time: number; provenance?: RetrievedProvenance }): PositionResult["valuation"] {
  const evidence = q.provenance;
  if (!evidence || !Number.isFinite(q.price) || q.price <= 0 || !Number.isFinite(q.time) || q.time <= 0) return undefined;
  assertProvenance(evidence);
  const host = evidence.provider === "finnhub" ? "finnhub.io" : evidence.provider === "alpha-vantage" ? "www.alphavantage.co" : null;
  if (!host || !evidence.endpoint || new URL(evidence.endpoint).hostname !== host) return undefined;
  return {price:q.price,source:evidence.provider,asOf:evidence.asOf ?? new Date(q.time*1000).toISOString(),retrievedAt:evidence.retrievedAt,provenance:evidence};
}
export async function getQuote(symbol: string): Promise<PositionResult["valuation"]> {
  const q = await sharedQuote(symbol);
  return q ? quoteValuation(q) : undefined;
}

// Structural bridge for the current API and C's additive N-PORT contract. No
// imports from unmerged modules. Preserve original evidence, not a fake Alpha URL.
type FundProfile = Pick<NonNullable<ApertureInput["etf"]>, "holdings" | "sectors" | "asOf"> & {
  provenance?: Provenance | NumericProvenance;
  holdingsSource?: RetrievedProvenance | {name:string;url?:string};
  coverage?: { reconciled: boolean; fullHoldings: boolean };
  unmatched?: {name:string;weight:number;assetCategory:string}[];
};
export function etfInput(profile: FundProfile | null): ApertureInput["etf"] | null {
  if (!profile?.provenance) return null;
  // X-Ray currently models long exposure. Do not renormalize a levered or
  // unreconciled fund; keep its full position value as opaque instead.
  const total = profile.holdings.reduce((sum,h)=>sum+h.weight,0);
  if (profile.holdings.some(h=>!Number.isFinite(h.weight)||h.weight<0) || total>1+1e-10 || (profile.coverage && (!profile.coverage.reconciled || !profile.coverage.fullHoldings))) return null;
  const source = profile.holdingsSource;
  if (source && "kind" in source) {
    assertProvenance(source);
    if (source.kind !== "retrieved" || !profile.coverage) return null;
    // Each mapped weight retains its computation/mapping evidence; the full
    // numeric map stays on the provider profile. Unmapped net weight remains Other.
    const numeric = profile.provenance as NumericProvenance;
    const evidence = profile.holdings.map((_,i)=>numeric[`/holdings/${i}/weight`]);
    if (evidence.some(p=>!p)) return null;
    evidence.forEach(p=>assertProvenance(p));
    return {holdings:profile.holdings,sectors:profile.sectors,asOf:profile.asOf,
      provenance:{kind:"computed",formula:"mapped long-equity holdings weights from reconciled fund source; unclassified net residual retained",inputs:[source,...evidence]},
      holdingsSource:{name:source.provider,url:source.endpoint}};
  }
  assertProvenance(profile.provenance);
  return {holdings:profile.holdings,sectors:profile.sectors,asOf:profile.asOf,provenance:profile.provenance,holdingsSource:source};
}
export async function getVerifiedEtfProfile(ticker: string): Promise<ApertureInput["etf"] | null> {
  return etfInput(await sharedEtfProfile(ticker));
}
