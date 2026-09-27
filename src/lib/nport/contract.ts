import { SECTOR_LABELS, type SectorLabel } from "../sectors";
import { assertNumericProvenance, assertProvenance, type NumericProvenance, type RetrievedProvenance } from "../provenance";
import { normalizeSymbol, validSymbol, type FundIdentity, type ReconciledFund } from "./index";

export const ETF_SCHEMA_VERSION = 2 as const;
export type SectorClassification = {
  sector: SectorLabel;
  sic: string;
  cik: string;
  method: "sec-sic-crosswalk-v1";
  source: RetrievedProvenance;
};
export interface EtfHolding {
  ticker: string;
  name: string;
  /** Fraction of original net assets, never renormalized. */
  weight: number;
  identifiers?: { id: string; method: string }[];
  sector?: SectorLabel;
  classification?: SectorClassification;
}
export interface EtfProfile {
  ticker: string;
  holdings: EtfHolding[];
  sectors: { sector: SectorLabel; weight: number }[];
  asOf: string;
  source: "seed" | "live";
  schemaVersion?: typeof ETF_SCHEMA_VERSION;
  provider?: RetrievedProvenance["provider"];
  identity?: FundIdentity;
  unmatched?: ReconciledFund["unmatched"];
  coverage?: ReconciledFund["coverage"];
  warnings?: string[];
  holdingsSource?: RetrievedProvenance;
  provenance?: NumericProvenance;
}
export type SectorCoverage = {
  classifiedWeight: number;
  /** Signed remainder, including unmapped positions and net other assets/liabilities. */
  unclassifiedWeight: number;
  classifiedHoldings: number;
  totalHoldings: number;
};
export interface SourcedEtfProfile extends EtfProfile {
  schemaVersion: typeof ETF_SCHEMA_VERSION;
  last_updated: string;
  holdings: (EtfHolding & { symbol: string; description: string })[];
  provider: "sec-nport" | "sec-edgar" | "issuer-file";
  unmatched: ReconciledFund["unmatched"];
  coverage: ReconciledFund["coverage"];
  sectorCoverage: SectorCoverage;
  warnings: string[];
  holdingsSource: RetrievedProvenance;
  provenance: NumericProvenance;
}
export type SeedMeta = { schemaVersion: 2; generator: string; blocked: Record<string, { status: "unavailable"; reason: string }>; mappingCoverage: { unavailableBatches: number } };
export type EtfSeed = { profiles: Record<string, SourcedEtfProfile>; meta: SeedMeta };
function fail(field: string): never { throw new Error(`Invalid sourced ETF ${field}`); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("object");
  return value as Record<string, unknown>;
}
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const sector = (v: unknown): v is SectorLabel => SECTOR_LABELS.includes(v as SectorLabel);

/** Any evidence/version/runtime marker means this is NOT a legacy Alpha response. */
export function purportsSourced(value: Record<string, unknown>): boolean {
  return ["schemaVersion", "holdingsSource", "coverage", "provenance", "provider", "asOf", "unmatched", "sectorCoverage", "ticker"].some(key => key in value)
    || (Array.isArray(value.holdings) && value.holdings.some(h => h && typeof h === "object" && ("ticker" in h || "classification" in h || "identifiers" in h)));
}

/** Runtime boundary used by generation, getEtfProfile and the graph's future adapter. */
export function validateSourcedProfile(ticker: string, raw: unknown): SourcedEtfProfile {
  const p = record(raw);
  if (p.schemaVersion !== ETF_SCHEMA_VERSION || p.ticker !== normalizeSymbol(ticker) || !validSymbol(ticker)) fail("version/ticker");
  if (typeof p.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.asOf) || !Number.isFinite(Date.parse(p.asOf)) || new Date(p.asOf).toISOString().slice(0, 10) !== p.asOf || p.last_updated !== p.asOf) fail("date/alias");
  if (!["seed", "live"].includes(String(p.source))) fail("source");
  assertProvenance(p.holdingsSource);
  const source = p.holdingsSource;
  if (source.kind !== "retrieved" || source.provider !== p.provider || source.asOf !== p.asOf || source.retrievedAt.slice(0, 10) < p.asOf) fail("holdings source");
  const url = new URL(source.endpoint ?? "");
  if (source.provider === "sec-nport" || source.provider === "sec-edgar") {
    const filing = source.filing;
    if (!filing || !/^\d{10}-\d{2}-\d{6}$/.test(filing.accession) || filing.url !== source.endpoint || url.origin !== "https://www.sec.gov" || url.search || url.hash || !url.pathname.startsWith(`/Archives/edgar/data/${Number(filing.cik)}/${filing.accession.replace(/-/g, "")}/`)) fail("SEC source");
    if (source.provider === "sec-nport") {
      const identity = record(p.identity);
      if (!/^NPORT-P(?:\/A)?$/.test(filing.form) || url.pathname !== `/Archives/edgar/data/${Number(filing.cik)}/${filing.accession.replace(/-/g, "")}/primary_doc.xml` || identity.cik !== filing.cik || identity.ticker !== ticker || !/^S\d{9}$/.test(String(identity.seriesId)) || !/^C\d{9}$/.test(String(identity.classId))) fail("NPORT identity");
    } else if (filing.form !== "N-30D" || !["SPY", "DIA"].includes(ticker) || filing.cik !== (ticker === "SPY" ? "0000884394" : "0001041130") || !/^\/Archives\/edgar\/data\/\d+\/\d{18}\/\w+\.htm$/.test(url.pathname) || p.identity !== undefined) fail("trust filing form/identity");
  } else if (source.provider !== "issuer-file" || source.endpoint !== `https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${ticker.toLowerCase()}.xlsx` || !["SPY", "DIA"].includes(ticker) || source.filing) fail("issuer source");
  if (!Array.isArray(p.holdings) || !Array.isArray(p.unmatched) || !Array.isArray(p.sectors) || !Array.isArray(p.warnings) || !p.warnings.every(text)) fail("arrays");
  const tickers = new Set<string>();
  for (const item of p.holdings) {
    const h = record(item);
    if (!text(h.ticker) || !validSymbol(h.ticker) || tickers.has(h.ticker) || !text(h.name) || !finite(h.weight) || h.weight <= 0 || h.symbol !== h.ticker || h.description !== h.name) fail("holding/aliases/numeric weight");
    tickers.add(h.ticker);
    if (h.identifiers !== undefined && (!Array.isArray(h.identifiers) || !h.identifiers.every(i => text(i?.id) && text(i?.method)))) fail("identifiers");
    if (h.sector !== undefined || h.classification !== undefined) {
      const c = record(h.classification);
      if (!sector(h.sector) || h.sector === "Other" || c.sector !== h.sector || c.method !== "sec-sic-crosswalk-v1" || !/^\d{4}$/.test(String(c.sic)) || typeof c.sic !== "string" || !/^\d{10}$/.test(String(c.cik))) fail("classification");
      assertProvenance(c.source);
      if (c.source.kind !== "retrieved" || c.source.provider !== "sec-edgar" || c.source.endpoint !== `https://data.sec.gov/submissions/CIK${c.cik}.json`) fail("classification source");
    }
  }
  for (const item of p.unmatched) {
    const u = record(item);
    if (!text(u.name) || !text(u.reason) || !finite(u.weight) || (u.valueUsd !== undefined && !finite(u.valueUsd))) fail("unmatched");
    for (const key of ["title", "assetCategory", "country", "currency", "payoff"]) if (typeof u[key] !== "string") fail("unmatched fields");
  }
  const coverage = record(p.coverage);
  for (const key of ["balanceSheetRemainder", "unreportedWeight"]) if (coverage[key] !== undefined && !finite(coverage[key])) fail(`coverage ${key}`);
  for (const key of ["mappedWeight", "unmatchedWeight", "accountedWeight", "reportedWeight", "reconciliationError", "positionCount", "mappedPositions"]) if (!finite(coverage[key])) fail(`coverage ${key}`);
  for (const key of ["fullHoldings", "reconciled"]) if (typeof coverage[key] !== "boolean") fail(`coverage ${key}`);
  for (const key of ["positionCount", "mappedPositions"]) if (!Number.isInteger(coverage[key]) || (coverage[key] as number) < 0) fail("coverage count");
  const sc = record(p.sectorCoverage);
  for (const key of ["classifiedWeight", "unclassifiedWeight", "classifiedHoldings", "totalHoldings"]) if (!finite(sc[key])) fail(`sector coverage ${key}`);
  // Cast only after structural validation; cross-field invariants below reject inconsistent records.
  const result = p as unknown as SourcedEtfProfile;
  if (result.coverage.mappedPositions > result.coverage.positionCount || result.coverage.mappedPositions < result.holdings.length) fail("mapped position count");
  const sum = result.holdings.reduce((n, h) => n + h.weight, 0);
  const unmatched = result.unmatched.reduce((n, h) => n + h.weight, 0);
  if (!near(sum, result.coverage.mappedWeight) || !near(unmatched, result.coverage.unmatchedWeight) || !near(sum + unmatched, result.coverage.accountedWeight) || (result.coverage.reconciled && Math.abs(result.coverage.reconciliationError) > 0.005)) fail("coverage sums");
  const classified = result.holdings.filter(h => h.sector);
  if (!near(sc.classifiedWeight as number, classified.reduce((n, h) => n + h.weight, 0)) || !near((sc.classifiedWeight as number) + (sc.unclassifiedWeight as number), result.coverage.accountedWeight) || sc.classifiedHoldings !== classified.length || sc.totalHoldings !== result.holdings.length) fail("sector coverage sums");
  const seen = new Set<SectorLabel>();
  for (const item of p.sectors) {
    const s = record(item);
    if (!sector(s.sector) || seen.has(s.sector) || !finite(s.weight) || s.weight <= 0) fail("sector weight");
    seen.add(s.sector);
    if (!near(s.weight, classified.filter(h => h.sector === s.sector).reduce((n, h) => n + h.weight, 0))) fail("sector constituent sums");
  }
  if (new Set(classified.map(h => h.sector)).size !== seen.size) fail("missing sectors");
  const { provenance, holdingsSource: _source, ...data } = result;
  void _source;
  record(provenance);
  assertNumericProvenance(data, provenance);
  return structuredClone(result);
}

export function validateSeed(raw: unknown): EtfSeed {
  const root = record(raw);
  const meta = record(root._meta);
  if (meta.schemaVersion !== ETF_SCHEMA_VERSION || !text(meta.generator)) fail("root version");
  const blocked = record(meta.blocked);
  for (const [ticker, value] of Object.entries(blocked)) {
    const b = record(value);
    if (!validSymbol(ticker) || b.status !== "unavailable" || !text(b.reason) || Object.hasOwn(root, ticker)) fail("blocked fund");
  }
  const mapping = record(meta.mappingCoverage);
  if (!Number.isInteger(mapping.unavailableBatches) || (mapping.unavailableBatches as number) < 0) fail("mapping coverage");
  const profiles: Record<string, SourcedEtfProfile> = {};
  for (const [ticker, value] of Object.entries(root)) if (ticker !== "_meta") profiles[ticker] = validateSourcedProfile(ticker, value);
  return { profiles, meta: meta as unknown as SeedMeta };
}
