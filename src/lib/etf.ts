// Server-only, offline-first ETF evidence. Seed is generated from recorded SEC/issuer
// files; no automatic Alpha Vantage quota spending or unverified top-holdings fallback.
import seed from "@/data/etf-seed.json";
import { sectorFromGics, type SectorLabel } from "@/lib/sectors";
import type { Provenance } from "@/lib/provenance";
import { TARGET_FUNDS, normalizeSymbol } from "./nport";
import { purportsSourced, validateSeed, validateSourcedProfile, type EtfHolding, type EtfProfile, type SourcedEtfProfile } from "./nport/contract";
export type { EtfHolding, EtfProfile, SourcedEtfProfile } from "./nport/contract";

type RawProfile = {
  last_updated?: string;
  sectors?: { sector: string; weight: string }[];
  holdings?: { symbol: string; description: string; weight: string }[];
};
const SEED = validateSeed(seed);
export const normalizeTicker = normalizeSymbol;
export function isSeededEtf(ticker: string) {
  const t = normalizeTicker(ticker);
  // Includes known-but-unavailable funds so callers do not mistake them for equities.
  return TARGET_FUNDS.includes(t) || Object.hasOwn(SEED.profiles, t);
}

// Retains the legacy Alpha response parser API for explicit callers/tests. The runtime
// never retrieves it: partial legacy results are not represented as verified full data.
export function parseProfile(ticker: string, raw: unknown, source: EtfProfile["source"]): EtfProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (purportsSourced(raw as Record<string, unknown>)) {
    try { return { ...validateSourcedProfile(normalizeTicker(ticker), raw), source }; }
    catch { return null; } // Explicit rejection; never reinterpret malformed evidence as legacy.
  }
  const legacy = raw as RawProfile;
  if (!Array.isArray(legacy.holdings) || !legacy.holdings.every(h => h && typeof h.symbol === "string" && typeof h.description === "string" && typeof h.weight === "string") || (legacy.sectors !== undefined && (!Array.isArray(legacy.sectors) || !legacy.sectors.every(s => s && typeof s.sector === "string" && typeof s.weight === "string"))) || (legacy.last_updated !== undefined && typeof legacy.last_updated !== "string")) return null;
  const merged = new Map<string, EtfHolding>();
  for (const h of legacy.holdings ?? []) {
    const t = normalizeTicker(h.symbol ?? "");
    const weight = Number(h.weight);
    if (!/^[A-Z][A-Z.]{0,5}$/.test(t) || !Number.isFinite(weight) || !(weight > 0)) continue;
    const previous = merged.get(t);
    merged.set(t, { ticker: t, name: previous?.name ?? h.description ?? t, weight: (previous?.weight ?? 0) + weight });
  }
  if (!merged.size) return null;
  const sectors = new Map<SectorLabel, number>();
  for (const s of legacy.sectors ?? []) {
    const weight = Number(s.weight);
    if (!Number.isFinite(weight) || !(weight > 0)) continue;
    const sector = sectorFromGics(s.sector);
    sectors.set(sector, (sectors.get(sector) ?? 0) + weight);
  }
  return {
    ticker: normalizeTicker(ticker), holdings: [...merged.values()].sort((a, b) => b.weight - a.weight),
    sectors: [...sectors].map(([sector, weight]) => ({ sector, weight })),
    asOf: (legacy.last_updated ?? "").slice(0, 10), source,
    warnings: ["Legacy top-holdings response: full coverage and retrieval provenance are unverified"],
  };
}
export function etfAvailability(ticker: string): { available: boolean; reason?: string } {
  const t = normalizeTicker(ticker);
  return Object.hasOwn(SEED.profiles, t) ? { available: true } : { available: false, reason: SEED.meta.blocked[t]?.reason ?? "No recorded full holdings source available" };
}
export async function getEtfProfile(ticker: string): Promise<SourcedEtfProfile | null> {
  const t = normalizeTicker(ticker);
  if (!/^[A-Z][A-Z0-9.]{0,14}$/.test(t) || !Object.hasOwn(SEED.profiles, t)) return null;
  const profile = structuredClone(SEED.profiles[t]);
  if (Date.now() - Date.parse(profile.holdingsSource.retrievedAt) > 24 * 60 * 60 * 1000) {
    const markStale = (evidence: Provenance): Provenance => evidence.kind === "computed"
      ? { ...evidence, stale: true, inputs: evidence.inputs.map(markStale) }
      : evidence.kind === "retrieved" ? { ...evidence, stale: true } : evidence;
    profile.holdingsSource = { ...profile.holdingsSource, stale: true };
    for (const holding of profile.holdings) if (holding.classification) holding.classification.source = { ...holding.classification.source, stale: true };
    profile.provenance = Object.fromEntries(Object.entries(profile.provenance ?? {}).map(([pointer, evidence]) => [pointer, markStale(evidence)]));
    profile.warnings = [...(profile.warnings ?? []), `Cached holdings snapshot retrieved ${profile.holdingsSource.retrievedAt}; holdings as of ${profile.asOf}. Refresh needed.`];
  }
  return profile;
}
