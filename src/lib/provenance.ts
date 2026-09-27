export const PROVIDERS = ["sec-edgar", "sec-xbrl", "sec-nport", "finnhub", "alpha-vantage", "fred", "fdic", "stooq", "issuer-file", "gdelt", "user-import", "openfigi", "eia", "usitc"] as const;
export type Provider = typeof PROVIDERS[number];
export type FilingProvenance = { cik: string; accession: string; form: string; filedAt: string; url: string; section?: string; tag?: string };

type SourceDetails = {
  asOf?: string;
  stale?: boolean;
  filing?: FilingProvenance;
};
export type RetrievedProvenance = SourceDetails & {
  kind: "retrieved";
  retrievedAt: string;
} & ({ provider: Exclude<Provider, "user-import">; endpoint: string } | { provider: "user-import"; source: string; endpoint?: string });
export type ComputedProvenance = SourceDetails & {
  kind: "computed";
  formula: string;
  inputs: readonly Provenance[];
};
export type AssumptionProvenance = SourceDetails & {
  kind: "assumption";
  rationale: string;
  source: string;
};
export type Provenance = RetrievedProvenance | ComputedProvenance | AssumptionProvenance;
export type NumericProvenance = Readonly<Record<string, Provenance>>;
export type SourcedValue<T> = { value: T; provenance: Provenance };
export type DataEnvelope<T> = { data: T; provenance: NumericProvenance };

const PUBLIC_PARAMS = new Set(["symbol", "symbols", "ticker", "tickers", "function", "id", "s", "i", "cik", "accession", "form", "metric", "from", "to", "start_date", "end_date", "date", "series_id", "filters", "fields", "sort_by", "sort_order", "limit", "format", "query", "mode", "maxrecords", "timespan"]);
function fail(message: string): never { throw new Error(`Invalid provenance: ${message}`); }
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 8192 && value.trim().length > 0;

function sourceUrl(value: unknown): URL {
  if (!text(value)) return fail("source URL is required");
  let url: URL;
  try { url = new URL(value); } catch { return fail("source URL must be absolute HTTPS"); }
  if (url.protocol !== "https:" || url.username || url.password) return fail("source URL must be credential-free HTTPS");
  return url;
}

export function publicSourceUrl(value: string): string {
  const url = sourceUrl(value);
  const params = new URLSearchParams();
  for (const [key, val] of url.searchParams) if (PUBLIC_PARAMS.has(key.toLowerCase())) params.append(key, val);
  url.search = params.toString();
  url.hash = "";
  return url.toString();
}

function assertSourceUrl(value: unknown) {
  const url = sourceUrl(value);
  if (url.hash || [...url.searchParams.keys()].some(key => !PUBLIC_PARAMS.has(key.toLowerCase()))) fail("source URL contains an unapproved parameter or fragment");
}

function validDate(value: unknown, timestamp = false): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  if (timestamp && !value.includes("T")) return false;
  if (value.includes("T") && (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59)) return false;
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(Date.parse(value)) && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
}

export function assertProvenance(value: unknown, depth = 0): asserts value is Provenance {
  if (depth > 32 || !value || typeof value !== "object" || Array.isArray(value)) fail("invalid or excessively nested source");
  const item = value as Record<string, unknown>;
  if (item.asOf !== undefined && !validDate(item.asOf)) fail("invalid as-of date");
  if (item.stale !== undefined && typeof item.stale !== "boolean") fail("stale must be boolean");
  if (item.filing !== undefined) {
    const filing = item.filing as Partial<FilingProvenance> | null;
    if (!filing || !text(filing.cik) || !/^\d{1,10}$/.test(filing.cik) || !text(filing.accession) || !text(filing.form) || !validDate(filing.filedAt)) fail("invalid filing reference");
    if ((filing.section !== undefined && !text(filing.section)) || (filing.tag !== undefined && !text(filing.tag))) fail("filing section and tag must be strings");
    assertSourceUrl(filing.url);
  }
  switch (item.kind) {
    case "retrieved":
      if (!PROVIDERS.includes(item.provider as Provider) || !validDate(item.retrievedAt, true)) fail("provider and retrieval timestamp required");
      if (item.provider === "user-import" && !text(item.source)) fail("user-import requires a reviewed input source");
      if (item.provider !== "user-import" || item.endpoint !== undefined) assertSourceUrl(item.endpoint);
      break;
    case "computed":
      if (!text(item.formula) || !Array.isArray(item.inputs) || item.inputs.length === 0) fail("formula and nonempty inputs required");
      for (const input of item.inputs) assertProvenance(input, depth + 1);
      break;
    case "assumption":
      if (!text(item.rationale) || !text(item.source)) fail("assumption rationale and source required");
      break;
    default:
      fail("unknown kind");
  }
}

export function assertNumericProvenance(data: unknown, evidence: NumericProvenance): void {
  const numeric = new Set<string>();
  const visit = (value: unknown, pointer: string, parents: ReadonlySet<object>) => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`Expected finite number at ${pointer}`);
      if (!Object.hasOwn(evidence, pointer)) throw new Error(`Missing provenance at ${pointer}`);
      numeric.add(pointer);
      assertProvenance(evidence[pointer]);
    } else if (value && typeof value === "object") {
      if (parents.has(value) || parents.size > 64) throw new Error("Invalid numeric payload: cycle or excessive nesting");
      const next = new Set([...parents, value]);
      for (const [key, child] of Object.entries(value)) visit(child, `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`, next);
    }
  };
  visit(data, "", new Set());
  for (const pointer of Object.keys(evidence)) if (!numeric.has(pointer)) throw new Error(`Orphan provenance at ${pointer}`);
}
