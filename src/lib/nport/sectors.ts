import { assertProvenance, type Provenance, type RetrievedProvenance } from "../provenance";
import type { SectorLabel } from "../sectors";
import { normalizeSymbol, validSymbol } from "./index";
import { ETF_SCHEMA_VERSION, validateSourcedProfile, type EtfHolding, type SectorClassification } from "./contract";
import type { sourcedProfile } from "./index";
import type { parseIssuer } from "./issuer";
import type { trustProfile } from "./trust";

// Matches F's conservative sectorFromSic vocabulary, without editing its owned file.
// Deliberately NOT GICS: broad/ambiguous SICs (7370, 7374, 5961, etc.) stay unknown.
const SIC_SECTORS: Readonly<Record<string, SectorLabel>> = {
  "1311": "Energy", "2911": "Energy", "2834": "Health Care", "2836": "Health Care",
  "3571": "Technology", "3674": "Technology", "7372": "Technology",
  "4911": "Utilities", "4923": "Utilities", "4924": "Utilities", "4931": "Utilities",
  "6021": "Financials", "6022": "Financials", "6035": "Financials", "6036": "Financials",
  "6311": "Financials", "6321": "Financials", "6331": "Financials", "6798": "Real Estate",
  "5812": "Consumer Discretionary", "5411": "Consumer Staples",
};
export const SIC_CROSSWALK_SOURCE: Provenance = {
  kind: "assumption",
  source: "https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list",
  rationale: "sec-sic-crosswalk-v1: conservative exact SIC-to-Aperture-sector crosswalk, matching src/lib/sectors.ts in workstream F. This is not an official GICS classification; broad/ambiguous codes remain unclassified.",
};
export function classificationsFromSubmissions(raw: unknown, source: RetrievedProvenance): Map<string, SectorClassification> {
  assertProvenance(source);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid submissions identity");
  const d = raw as Record<string, unknown>;
  if (typeof d.cik !== "string" || !/^\d{10}$/.test(d.cik) || source.provider !== "sec-edgar" || source.endpoint !== `https://data.sec.gov/submissions/CIK${d.cik}.json`) throw new Error("Invalid submissions identity/source");
  if (typeof d.sic !== "string" || !/^\d{4}$/.test(d.sic) || !Array.isArray(d.tickers) || !d.tickers.every(t => typeof t === "string")) throw new Error("Invalid submissions SIC/tickers");
  const sector = SIC_SECTORS[d.sic];
  if (!sector) return new Map();
  // Only tickers actually listed by the same registrant. Empty lists (old XOM)
  // do not authorize restoring a historical ticker by name or fixture filename.
  return new Map(d.tickers.map(normalizeSymbol).filter(validSymbol).map(ticker => [ticker, { sector, sic: d.sic as string, cik: d.cik as string, method: "sec-sic-crosswalk-v1", source }]));
}

type InputProfile = ReturnType<typeof sourcedProfile> | ReturnType<typeof parseIssuer> | ReturnType<typeof trustProfile>;
export function classifyProfile(profile: InputProfile, classifications: ReadonlyMap<string, SectorClassification>) {
  const holdings = profile.holdings.map(h => {
    const classification = classifications.get(h.ticker);
    return { ...h, symbol: h.ticker, description: h.name, ...(classification ? { sector: classification.sector, classification } : {}) };
  });
  const classified = holdings.filter(h => h.classification);
  const labels = [...new Set(classified.map(h => h.sector!))].sort();
  const sectors = labels.map(sector => ({ sector, weight: classified.filter(h => h.sector === sector).reduce((n, h) => n + h.weight, 0) }));
  const classifiedWeight = classified.reduce((n, h) => n + h.weight, 0);
  const sectorCoverage = { classifiedWeight, unclassifiedWeight: profile.coverage.accountedWeight - classifiedWeight, classifiedHoldings: classified.length, totalHoldings: holdings.length };
  const evidence = (members: EtfHolding[]): Provenance => ({
    kind: "computed", formula: "Sum original constituent weights with an exact SEC SIC crosswalk classification; no normalization or inferred sector for other holdings", inputs: [SIC_CROSSWALK_SOURCE, profile.holdingsSource, ...members.flatMap(h => [profile.provenance[`/holdings/${holdings.findIndex(row => row.ticker === h.ticker)}/weight`], ...(h.classification ? [h.classification.source] : [])])],
  });
  const aggregate = evidence(classified);
  const provenance: Record<string, Provenance> = { ...profile.provenance,
    "/schemaVersion": { kind: "assumption", rationale: "Format version discriminator, not an observed financial quantity", source: "src/lib/nport/contract.ts: ETF_SCHEMA_VERSION" },
    "/sectorCoverage/classifiedWeight": aggregate,
    "/sectorCoverage/unclassifiedWeight": { kind: "computed", formula: "accountedWeight - classifiedWeight (signed, includes unmatched/net other assets)", inputs: [profile.provenance["/coverage/accountedWeight"], aggregate] },
    "/sectorCoverage/classifiedHoldings": { kind: "computed", formula: "Count holdings with a conservative SEC SIC classification", inputs: [aggregate] },
    "/sectorCoverage/totalHoldings": { kind: "computed", formula: "Count all mapped holdings", inputs: [profile.holdingsSource] },
  };
  sectors.forEach((s, i) => { provenance[`/sectors/${i}/weight`] = evidence(classified.filter(h => h.sector === s.sector)); });
  return validateSourcedProfile(profile.ticker, { ...profile, schemaVersion: ETF_SCHEMA_VERSION, last_updated: profile.asOf, holdings, sectors, sectorCoverage, provenance, warnings: [...profile.warnings, "Sector coverage is partial: SEC submissions SIC crosswalk, not GICS. Unclassified weight is explicit and is not zero exposure. Current issuer SIC is not a historical classification at the holdings date."] });
}
