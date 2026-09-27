// SEC public UIT N-30D schedules. No SSGA workbook bytes or ticker mappings used.
import * as XLSX from "xlsx";
import type { Fixture } from "../../../scripts/lib/fixtures";
import { assertProvenance, type Provenance, type RetrievedProvenance } from "../provenance";
import { positionKey, reconcile, type Position, type Mapping } from "./index";

const CIK = { SPY: "0000884394", DIA: "0001041130" } as const;
type Trust = keyof typeof CIK;
export type TrustSchedule = { asOf: string; netAssets: number; positions: Position[]; warnings: string[] };
export function trustSource(ticker: Trust, filing: Fixture, submissions: Fixture): RetrievedProvenance {
  if (submissions.provider !== "sec-edgar" || submissions.endpoint !== `https://data.sec.gov/submissions/CIK${CIK[ticker]}.json` || filing.provider !== "sec-edgar") throw new Error("Invalid trust submissions source");
  const d = JSON.parse(submissions.body);
  if (d.cik !== CIK[ticker]) throw new Error("Invalid trust submissions identity");
  const r = d.filings?.recent;
  if (!r || !Array.isArray(r.accessionNumber)) throw new Error("Missing trust filings");
  const index = r.accessionNumber.findIndex((accession: string, i: number) => filing.endpoint === `https://www.sec.gov/Archives/edgar/data/${Number(CIK[ticker])}/${accession.replace(/-/g, "")}/${r.primaryDocument[i]}`);
  if (index < 0 || r.form[index] !== "N-30D") throw new Error("Trust N-30D metadata missing");
  const source: RetrievedProvenance = { kind: "retrieved", provider: "sec-edgar", endpoint: filing.endpoint, retrievedAt: filing.retrievedAt, asOf: r.reportDate[index], filing: { cik: CIK[ticker], accession: r.accessionNumber[index], form: r.form[index], filedAt: r.filingDate[index], url: filing.endpoint } };
  assertProvenance(source);
  return source;
}
const clean = (value: unknown) => String(value ?? "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid trust schedule amount");
  return value;
}
export function parseTrustSchedule(ticker: Trust, html: string, source: RetrievedProvenance): TrustSchedule {
  assertProvenance(source);
  const filing = source.filing;
  const expected = filing && `https://www.sec.gov/Archives/edgar/data/${Number(CIK[ticker])}/${filing.accession.replace(/-/g, "")}/`;
  if (source.provider !== "sec-edgar" || filing?.cik !== CIK[ticker] || filing.form !== "N-30D" || source.endpoint !== filing.url || !source.endpoint?.startsWith(expected!) || !/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\/\w+\.htm$/.test(source.endpoint) || !source.asOf) throw new Error("Invalid trust source/identity");
  if (html.length > 8 * 1024 * 1024 || !/<html/i.test(html)) throw new Error("Invalid trust schedule HTML");
  const text = clean(html.replace(/<[^>]*>/g, " "));
  const date = new Date(`${source.asOf}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  if (!text.includes(date) || !/Schedule of Investments/i.test(text)) throw new Error("Trust schedule date missing");
  const book = XLSX.read(html, { type: "string", cellFormula: false, cellHTML: false });
  const tables = book.SheetNames.map(name => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: true, defval: "" }));
  const balance = tables.filter(rows => clean(rows[0]?.[0]) === "ASSETS");
  if (balance.length !== 1) throw new Error("Trust balance sheet missing/ambiguous");
  const netRows = balance[0].filter(row => clean(row[0]) === "NET ASSETS").map(row => amount(row[1]));
  if (!netRows.length || new Set(netRows).size !== 1) throw new Error("Trust net assets missing/ambiguous");
  const netAssets = netRows[0];
  const schedules = tables.filter(rows => ["Common Stocks", "Security Description"].includes(clean(rows[0]?.[0])) && clean(rows[0]?.[1]) === "Shares" && clean(rows[0]?.[2]) === "Value");
  const positions: Position[] = [];
  const totals: number[] = [];
  for (const rows of schedules) for (const row of rows.slice(1)) {
    const name = clean(row[0]).replace(/\s*\([a-z]\)/g, "").trim();
    if (/^Total Common Stocks/.test(name)) { totals.push(amount(row[2])); continue; }
    if (/^Common Stocks\s*[—–-]/.test(name) && !row[1] && !row[2]) continue;
    if (!name) throw new Error("Unnamed trust holding");
    amount(row[1]); // Every security must carry original shares and value.
    const valueUsd = amount(row[2]);
    positions.push({ name, title: name, weight: valueUsd / netAssets, valueUsd, assetCategory: "EC", country: "", currency: "USD", payoff: "Long" });
  }
  // Independent reported total prevents truncated schedules from passing merely
  // because a balancing residual was added. No assumed sector mix or normalization.
  if (positions.length < (ticker === "SPY" ? 500 : 30) || totals.length !== 1 || positions.reduce((n, p) => n + p.valueUsd, 0) !== totals[0] || new Set(positions.map(p => p.name)).size !== positions.length) throw new Error("Incomplete or inconsistent trust holdings schedule/total");
  const statementTotal = ticker === "SPY" ? balance[0].find(row => clean(row[0]) === "Total Investments") : balance[0].find(row => clean(row[0]).startsWith("Investments in unaffiliated issuers, at value"));
  if (!statementTotal || amount(statementTotal[1]) !== totals[0]) throw new Error("Trust investments do not match balance sheet");
  return { asOf: source.asOf, netAssets, positions, warnings: [] };
}
export function trustProfile(ticker: Trust, parsed: TrustSchedule, mappings: ReadonlyMap<string, Mapping>, holdingsSource: RetrievedProvenance) {
  const result = reconcile(parsed, mappings);
  const provenance: Record<string, Provenance> = {};
  const weight: Provenance = { kind: "computed", formula: "N-30D Schedule of Investments security value / Statement of Assets and Liabilities net assets; duplicate mapped tickers summed", inputs: [holdingsSource] };
  const residual: Provenance = { kind: "computed", formula: "(reported net assets - sum(all disclosed investments)) / net assets; full investment sum independently checked against reported schedule total and balance sheet", inputs: [holdingsSource] };
  result.holdings.forEach((h, i) => {
    const mapped = parsed.positions.filter(p => mappings.get(positionKey(p))?.ticker === h.ticker).map(p => mappings.get(positionKey(p))!.provenance);
    provenance[`/holdings/${i}/weight`] = { ...weight, inputs: [holdingsSource, ...mapped] };
  });
  result.unmatched.forEach((p, i) => {
    provenance[`/unmatched/${i}/weight`] = p.assetCategory === "balance-sheet" ? residual : weight;
    provenance[`/unmatched/${i}/valueUsd`] = p.assetCategory === "balance-sheet" ? { kind: "computed", formula: "net assets - disclosed investments", inputs: [holdingsSource] } : holdingsSource;
  });
  for (const [key, value] of Object.entries(result.coverage)) if (typeof value === "number") provenance[`/coverage/${key}`] = { kind: "computed", formula: "Count disclosed and mapped positions; sum original fractional weights, signed unmatched and net-other-assets residual; accountedWeight - 1", inputs: [weight, residual] };
  return { ...result, ticker, asOf: parsed.asOf, source: "seed" as const, provider: "sec-edgar" as const, holdingsSource, sectors: [], provenance, warnings: ["SEC N-30D complete UIT investment schedule, not N-PORT; older periodic snapshot, not daily issuer holdings", "No CUSIP/ISIN in this schedule: only exact unique SEC company-name matches are mapped; all others remain valued and unmatched", "Sector classifications, where available, are independently sourced SEC SIC crosswalks, not the filing's industry table"] };
}
