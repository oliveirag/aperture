import { assertProvenance, type NumericProvenance, type Provenance, type RetrievedProvenance } from "../provenance";
import { child, readXml, required, value } from "./xml";

export const TARGET_FUNDS = "SPY VOO IVV VTI QQQ KRE XLK XLF XLE SMH SOXX VNQ IWM DIA ARKK SCHD VGT XLRE".split(" ");
export type FundIdentity = { ticker: string; cik: string; seriesId: string; classId: string };
export type Position = { name: string; title: string; cusip?: string; isin?: string; ticker?: string; weight: number; valueUsd: number; assetCategory: string; country: string; currency: string; payoff: string };
export type ParsedFund = { identity: FundIdentity; asOf: string; netAssets: number; positions: Position[]; warnings: string[] };
export type Mapping = { ticker: string; identifier?: string; provenance: Provenance; method: "openfigi" | "sec-name" | "filing-ticker" | "issuer-ticker" };
export type Unmatched = Omit<Position, "valueUsd"> & { valueUsd?: number; reason: string };
export type ReconciledFund = {
  holdings: { ticker: string; name: string; weight: number }[];
  unmatched: Unmatched[];
  coverage: { mappedWeight: number; unmatchedWeight: number; accountedWeight: number; reportedWeight: number; balanceSheetRemainder?: number; unreportedWeight?: number; reconciliationError: number; positionCount: number; mappedPositions: number; fullHoldings: boolean; reconciled: boolean };
  warnings: string[];
};
export const normalizeSymbol = (ticker: string) => ticker.trim().toUpperCase().replace(/[/-]/g, ".");
export const validSymbol = (ticker: string) => /^[A-Z][A-Z0-9.]{0,14}$/.test(ticker) && !["USD", "CASH", "N.A", "NA"].includes(ticker);
export function resolveFund(ticker: string, raw: unknown): FundIdentity | null {
  const data = raw as { fields?: unknown; data?: unknown };
  if (!Array.isArray(data?.fields) || !Array.isArray(data.data)) throw new Error("Invalid SEC fund list");
  const fields: unknown[] = data.fields;
  const indexes = ["cik", "seriesId", "classId", "symbol"].map(field => fields.indexOf(field));
  if (indexes.some(i => i < 0)) throw new Error("Missing SEC fund fields");
  const matches = data.data.filter(row => Array.isArray(row) && row[indexes[3]] === normalizeSymbol(ticker));
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error("Ambiguous SEC fund class");
  const row = matches[0];
  const [cik, seriesId, classId] = indexes.map(i => String(row[i]));
  if (!/^\d{1,10}$/.test(cik) || !/^S\d{9}$/.test(seriesId) || !/^C\d{9}$/.test(classId)) throw new Error("Invalid SEC fund identity");
  return { ticker: normalizeSymbol(ticker), cik: cik.padStart(10, "0"), seriesId, classId };
}
function number(text: string, label: string): number {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || !Number.isFinite(Number(text))) throw new Error(`Invalid ${label} number`);
  return Number(text);
}
export function parseNport(xml: string, identity: FundIdentity): ParsedFund {
  const root = readXml(xml);
  if (root.name !== "edgarSubmission") throw new Error("Not NPORT XML");
  const header = required(root, "headerData");
  if (!/^NPORT-P(?:\/A)?$/.test(value(header, "submissionType"))) throw new Error("Not public NPORT-P");
  const form = required(root, "formData");
  const general = required(form, "genInfo");
  if (value(general, "seriesId") !== identity.seriesId || value(general, "regCik").padStart(10, "0") !== identity.cik) throw new Error("NPORT series/registrant mismatch");
  // N-PORT describes the whole series, not a single share class. Never divide weights by class assets.
  const asOf = value(general, "repPdDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(Date.parse(asOf)) || new Date(asOf).toISOString().slice(0, 10) !== asOf) throw new Error("Invalid holdings date");
  const netAssets = number(value(required(form, "fundInfo"), "netAssets"), "net assets");
  if (netAssets <= 0) throw new Error("Nonpositive net assets");
  const securities = required(form, "invstOrSecs").children.filter(node => node.name === "invstOrSec");
  if (!securities.length) throw new Error("NPORT has no disclosed holdings");
  const warnings: string[] = [];
  const positions = securities.map(node => {
    const identifiers = child(node, "identifiers");
    const asset = child(node, "assetConditional");
    const weight = number(value(node, "pctVal"), "weight") / 100;
    const valueUsd = number(value(node, "valUSD"), "position value");
    if (Math.abs(weight - valueUsd / netAssets) > 0.005) warnings.push(`Reported weight/value mismatch: ${value(node, "name")}`);
    const position: Position = {
      name: value(node, "name"), title: value(node, "title"),
      cusip: value(node, "cusip") || undefined,
      isin: identifiers && child(identifiers, "isin")?.attributes.value,
      ticker: identifiers && child(identifiers, "ticker")?.attributes.value,
      weight, valueUsd, assetCategory: value(node, "assetCat") || asset?.attributes.assetCat || "unknown",
      country: value(node, "invCountry"), currency: value(node, "curCd"), payoff: value(node, "payoffProfile"),
    };
    if (!position.name) throw new Error("Unnamed NPORT holding");
    return position;
  });
  return { identity, asOf, netAssets, positions, warnings };
}
export function positionKey(position: Position): string {
  return position.cusip && /^[A-Z0-9*@#]{9}$/.test(position.cusip) && position.cusip !== "000000000" ? `CUSIP:${position.cusip}`
    : position.isin && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(position.isin) ? `ISIN:${position.isin}` : `NAME:${position.title || position.name}`;
}
export function equity(position: Position): boolean {
  return position.assetCategory === "EC" && position.currency === "USD" && position.payoff === "Long" && position.weight > 0;
}
export function reconcile(parsed: Pick<ParsedFund, "positions" | "netAssets" | "warnings">, mappings: ReadonlyMap<string, Mapping>): ReconciledFund {
  const holdings = new Map<string, { ticker: string; name: string; weight: number }>();
  const unmatched: Unmatched[] = [];
  let mappedPositions = 0;
  for (const position of parsed.positions) {
    const mapping = mappings.get(positionKey(position));
    if (equity(position) && mapping && validSymbol(mapping.ticker)) {
      const previous = holdings.get(mapping.ticker);
      holdings.set(mapping.ticker, { ticker: mapping.ticker, name: previous?.name ?? position.name, weight: (previous?.weight ?? 0) + position.weight });
      mappedPositions++;
    } else unmatched.push({ ...position, reason: !equity(position) ? `Non-US-dollar long equity or non-equity (${position.assetCategory}, ${position.currency}, ${position.payoff})` : "Identifier not uniquely mapped to a US equity ticker" });
  }
  const sum = (rows: { weight: number }[]) => rows.reduce((total, row) => total + row.weight, 0);
  const reportedWeight = sum(parsed.positions);
  // The filing's full position values are independent of pctVal. The residual includes
  // cash, receivables and liabilities, NOT guessed equities or a normalized top-10 list.
  const balanceSheetRemainder = (parsed.netAssets - parsed.positions.reduce((total, p) => total + p.valueUsd, 0)) / parsed.netAssets;
  unmatched.push({ name: "Net other assets / liabilities", title: "Balance-sheet residual", weight: balanceSheetRemainder, valueUsd: balanceSheetRemainder * parsed.netAssets, assetCategory: "balance-sheet", country: "", currency: "USD", payoff: "", reason: "Net assets less all disclosed investment values; includes undisclosed cash, receivables and liabilities" });
  const mappedWeight = sum([...holdings.values()]);
  const unmatchedWeight = sum(unmatched);
  const accountedWeight = mappedWeight + unmatchedWeight;
  const reconciliationError = accountedWeight - 1;
  const reconciled = Math.abs(reconciliationError) <= 0.005 && !parsed.warnings.length;
  return {
    holdings: [...holdings.values()].sort((a, b) => b.weight - a.weight), unmatched,
    coverage: { mappedWeight, unmatchedWeight, accountedWeight, reportedWeight, balanceSheetRemainder, reconciliationError, positionCount: parsed.positions.length, mappedPositions, fullHoldings: true, reconciled },
    warnings: ["N-PORT holdings describe the entire fund series; sectors are not supplied by this filing", "Unmatched positions and signed net-other-assets remain visible; mapped coverage is not total source coverage", ...parsed.warnings, ...(!reconciled ? ["Holdings do not reconcile to net assets within 0.5 percentage points"] : [])],
  };
}
export function sourcedProfile(parsed: ParsedFund, mappings: ReadonlyMap<string, Mapping>, source: RetrievedProvenance) {
  assertProvenance(source);
  const url = new URL(source.endpoint ?? "");
  const folder = source.filing?.accession.replace(/-/g, "");
  if (source.provider !== "sec-nport" || !/^\d{18}$/.test(folder ?? "") || url.origin !== "https://www.sec.gov" || url.search || url.hash || url.pathname !== `/Archives/edgar/data/${Number(parsed.identity.cik)}/${folder}/primary_doc.xml` || source.filing?.cik !== parsed.identity.cik || source.filing?.url !== source.endpoint || source.asOf !== parsed.asOf) throw new Error("Untrusted or mismatched NPORT provenance");
  const result = reconcile(parsed, mappings);
  const identifiers = new Map<string, { id: string; method: Mapping["method"] }[]>();
  const mappingInputs = new Map<string, Provenance[]>();
  for (const position of parsed.positions) {
    const id = positionKey(position);
    const mapping = mappings.get(id);
    if (!equity(position) || !mapping || !validSymbol(mapping.ticker)) continue;
    identifiers.set(mapping.ticker, [...(identifiers.get(mapping.ticker) ?? []), { id: mapping.identifier ?? id, method: mapping.method }]);
    mappingInputs.set(mapping.ticker, [...(mappingInputs.get(mapping.ticker) ?? []), mapping.provenance]);
  }
  const holdings = result.holdings.map(h => ({ ...h, identifiers: identifiers.get(h.ticker) ?? [] }));
  const data = { ticker: parsed.identity.ticker, asOf: parsed.asOf, source: "seed" as const, provider: source.provider, identity: parsed.identity, ...result, holdings, sectors: [] as { sector: string; weight: number }[] };
  const weightSource: Provenance = { kind: "computed", formula: "N-PORT pctVal / 100; duplicate mapped tickers summed without normalization", inputs: [source] };
  const residualSource: Provenance = { kind: "computed", formula: "(netAssets - sum(all disclosed valUSD)) / netAssets", inputs: [source] };
  const provenance: Record<string, Provenance> = {};
  result.holdings.forEach((holding, i) => {
    const mappingSources = mappingInputs.get(holding.ticker) ?? [];
    provenance[`/holdings/${i}/weight`] = { ...weightSource, inputs: [source, ...mappingSources] };
  });
  result.unmatched.forEach((p, i) => {
    provenance[`/unmatched/${i}/weight`] = p.assetCategory === "balance-sheet" ? residualSource : weightSource;
    provenance[`/unmatched/${i}/valueUsd`] = p.assetCategory === "balance-sheet" ? { kind: "computed", formula: "netAssets - sum(all disclosed valUSD)", inputs: [source] } : source;
  });
  for (const key of Object.keys(result.coverage)) {
    if (typeof result.coverage[key as keyof typeof result.coverage] === "number") provenance[`/coverage/${key}`] = { kind: "computed", formula: "Count disclosed/mapped positions; sum mapped and unmatched weights; accountedWeight - 1 is reconciliationError", inputs: [weightSource, residualSource] };
  }
  return { ...data, provenance: provenance as NumericProvenance, holdingsSource: source };
}
