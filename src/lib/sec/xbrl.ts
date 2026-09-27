import type { Provenance } from "@/lib/provenance";
import { filingIndexUrl, normalizeCik, type Retrieval } from "./filings";

export type Quarter = { period: string; value: number; end: string; accn: string; form: string; start?: string; tag?: string; unit?: string; filedAt?: string; provenance?: Provenance };
export type XbrlFact = Quarter & {
  tag: string; unit: string; filedAt: string; provenance: Provenance;
  periodType: "duration" | "instant"; fy?: number; fp?: string; frame?: string;
};
export interface Fundamentals {
  revenue: Quarter[]; netIncome: Quarter[]; operatingCashFlow: Quarter[]; debt: Quarter | null;
  operatingIncome?: Quarter[]; eps?: Quarter[]; capex?: Quarter[]; cash?: Quarter | null; shares?: Quarter | null;
  annualRevenue?: Quarter[]; annualNetIncome?: Quarter[]; annualOperatingIncome?: Quarter[]; annualCapex?: Quarter[]; annualEps?: Quarter[];
  debtLabel?: string;
  // Companyfacts deliberately excludes dimensional facts. Do not invent segment allocations.
  segments?: { status: "unavailable"; reason: string };
}
export type CompanyFacts = { cik: number; entityName?: string; facts?: Record<string, Record<string, { units?: Record<string, RawPoint[]> }>> };
type RawPoint = { val: number; start?: string; end: string; accn: string; form: string; filed: string; fy?: number; fp?: string; frame?: string };
const DAY = 86400000;
const days = (start: string, end: string) => (Date.parse(end) - Date.parse(start)) / DAY + 1;
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const order = (a: XbrlFact, b: XbrlFact) => a.filedAt.localeCompare(b.filedAt) || a.accn.localeCompare(b.accn) || (a.fy ?? 0) - (b.fy ?? 0) || (a.fp ?? "").localeCompare(b.fp ?? "") || (a.frame ?? "").localeCompare(b.frame ?? "");

// Retain unframed comparative/restated facts and distinct fiscal contexts. No SEC array-order assumptions.
export function parseCompanyFacts(data: CompanyFacts, retrieval: Retrieval): XbrlFact[] {
  const cik = normalizeCik(String(data.cik));
  const out = new Map<string, XbrlFact>();
  for (const [namespace, concepts] of Object.entries(data.facts ?? {})) {
    for (const [concept, definition] of Object.entries(concepts)) {
      for (const [unit, points] of Object.entries(definition.units ?? {})) {
        for (const p of points) {
          if (!Number.isFinite(p.val) || !date(p.end) || !date(p.filed) || (p.start !== undefined && (!date(p.start) || p.start > p.end)) || !/^\d{10}-\d{2}-\d{6}$/.test(p.accn) || !p.form) continue;
          const tag = `${namespace}:${concept}`;
          const fact: XbrlFact = { value: p.val, period: p.frame ?? (p.start ? `${p.start}/${p.end}` : p.end),
            start: p.start, end: p.end, accn: p.accn, form: p.form, tag, unit, filedAt: p.filed,
            periodType: p.start ? "duration" : "instant", fy: p.fy, fp: p.fp, frame: p.frame,
            provenance: { kind: "retrieved", provider: "sec-xbrl", endpoint: retrieval.endpoint, retrievedAt: retrieval.retrievedAt, asOf: p.end,
              filing: { cik, accession: p.accn, form: p.form, filedAt: p.filed, tag, url: filingIndexUrl(cik, p.accn) } },
          };
          const key = [tag, unit, p.start, p.end, p.accn, p.fy, p.fp, p.frame].join("|");
          const old = out.get(key);
          // Conflicting duplicates are ambiguous; refuse instead of silently picking an arbitrary value.
          if (old && old.value !== fact.value) throw new Error(`Conflicting SEC facts for ${tag} ${p.accn}`);
          out.set(key, fact);
        }
      }
    }
  }
  return [...out.values()].sort((a, b) => a.end.localeCompare(b.end) || order(a, b) || a.tag.localeCompare(b.tag));
}
export function latestReported(points: XbrlFact[], asOf?: string): XbrlFact[] {
  const byPeriod = new Map<string, XbrlFact>();
  for (const p of points) {
    if (asOf && p.filedAt > asOf) continue;
    const key = [p.tag, p.unit, p.start, p.end].join("|");
    const old = byPeriod.get(key);
    if (!old || order(p, old) > 0) byPeriod.set(key, p);
  }
  return [...byPeriod.values()].sort((a, b) => a.end.localeCompare(b.end) || (a.start ?? "").localeCompare(b.start ?? "") || a.tag.localeCompare(b.tag) || a.unit.localeCompare(b.unit));
}
function compute(value: number, start: string, latest: XbrlFact, inputs: XbrlFact[], formula: string): XbrlFact {
  return { ...latest, value, start, frame: undefined, period: `${start}/${latest.end}`, periodType: "duration",
    provenance: { kind: "computed", asOf: latest.end, formula, inputs: inputs.map(p => p.provenance) } };
}
// Flow items only. EPS and weighted-average shares are not additive and must never use subtraction.
export function quarterlyFacts(points: XbrlFact[], count = 8, additive = true): XbrlFact[] {
  const current = latestReported(points);
  const quarters = new Map<string, XbrlFact>();
  for (const p of current) {
    if (p.start && days(p.start, p.end) >= 70 && days(p.start, p.end) <= 110) quarters.set(p.end, p);
  }
  if (additive) for (const p of current) {
    if (!p.start || quarters.has(p.end) || days(p.start, p.end) < 150 || days(p.start, p.end) > 380) continue;
    // A later restatement of the annual/YTD figure cannot be mixed with an old interim value.
    const changed = points.some(q => q.tag === p.tag && q.unit === p.unit && q.start === p.start && q.end === p.end && q.value !== p.value && order(q, p) < 0);
    const previous = latestReported(points.filter(q => q.start === p.start && q.end < p.end && q.unit === p.unit && q.tag === p.tag && q.filedAt <= p.filedAt && (!changed || q.accn === p.accn)))
      .filter(q => days(q.end, p.end) >= 70 && days(q.end, p.end) <= 110).at(-1);
    if (!previous) continue;
    const start = new Date(Date.parse(previous.end) + DAY).toISOString().slice(0, 10);
    quarters.set(p.end, compute(p.value - previous.value, start, p, [p, previous], "current fiscal YTD (or FY) − previous fiscal YTD; same tag, unit and fiscal start"));
  }
  return [...quarters.values()].sort((a, b) => a.end.localeCompare(b.end)).slice(-count);
}
const TAGS = {
  revenue: ["us-gaap:RevenuesNetOfInterestExpense", "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap:Revenues", "us-gaap:SalesRevenueNet", "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax", "ifrs-full:Revenue"],
  netIncome: ["us-gaap:NetIncomeLoss", "us-gaap:ProfitLoss", "ifrs-full:ProfitLoss"],
  operatingIncome: ["us-gaap:OperatingIncomeLoss", "ifrs-full:ProfitLossFromOperatingActivities"],
  operatingCashFlow: ["us-gaap:NetCashProvidedByUsedInOperatingActivities", "ifrs-full:CashFlowsFromUsedInOperatingActivities"],
  capex: ["us-gaap:PaymentsToAcquirePropertyPlantAndEquipment", "ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
  eps: ["us-gaap:EarningsPerShareDiluted", "us-gaap:EarningsPerShareBasic", "ifrs-full:DilutedEarningsLossPerShare"],
  cash: ["us-gaap:CashAndCashEquivalentsAtCarryingValue", "ifrs-full:CashAndCashEquivalents"],
  shares: ["dei:EntityCommonStockSharesOutstanding", "us-gaap:CommonStockSharesOutstanding", "ifrs-full:NumberOfSharesOutstanding"],
};
function concept(points: XbrlFact[], names: string[], periodType: XbrlFact["periodType"]): XbrlFact[] {
  let best: XbrlFact[] = [];
  let newest = "";
  for (const name of names) {
    const pts = points.filter(p => p.tag === name && p.periodType === periodType && /^(10-K|10-Q|20-F|40-F)(\/A)?$/.test(p.form));
    // Pick the freshest unit; prefer USD only on a tie. An older convenience translation
    // must not conceal a newer native-currency filing. Never convert or mix currencies.
    const units = [...new Set(pts.map(p => p.unit))];
    const newestFor = (unit: string) => pts.filter(p => p.unit === unit).reduce((end, p) => p.end > end ? p.end : end, "");
    units.sort((a, b) => newestFor(b).localeCompare(newestFor(a)) || Number(b === "USD" || b === "USD/shares") - Number(a === "USD" || a === "USD/shares") || a.localeCompare(b));
    const unit = units[0];
    const same = pts.filter(p => p.unit === unit);
    const end = same.reduce((end, p) => p.end > end ? p.end : end, "");
    if (end > newest) { best = same; newest = end; }
  }
  return best;
}
export function fundamentalsFromFacts(data: CompanyFacts, retrieval: Retrieval): Fundamentals | null {
  const points = parseCompanyFacts(data, retrieval);
  if (!points.length) return null;
  const bankInterest = points.filter(p => p.tag === "us-gaap:InterestIncomeExpenseNet" && p.start);
  const bankNoninterest = points.filter(p => p.tag === "us-gaap:NoninterestIncome" && p.start);
  const bank = bankInterest.length > 0 && bankNoninterest.length > 0;
  const noninterestByContext = new Map(bankNoninterest.map(p => [[p.accn, p.start, p.end, p.unit].join("|"), p]));
  const bankRevenue = bankInterest.flatMap(p => {
    const other = noninterestByContext.get([p.accn, p.start, p.end, p.unit].join("|"));
    if (!other) return [];
    return [{ ...p, value: p.value + other.value, tag: `${p.tag} + ${other.tag}`, provenance: { kind: "computed" as const, asOf: p.end, formula: "net interest income + noninterest income (same accession, duration and unit)", inputs: [p.provenance, other.provenance] } }];
  });
  const flow = (key: keyof typeof TAGS) => key === "revenue" && bank ? bankRevenue : concept(points, TAGS[key], "duration");
  const instant = (names: string[]) => latestReported(concept(points, names, "instant")).at(-1) ?? null;
  const annual = (key: keyof typeof TAGS) => latestReported(flow(key)).filter(p => p.start && days(p.start, p.end) >= 350 && days(p.start, p.end) <= 380).slice(-2);
  // These concepts are total reported debt measures, not a made-up sum with missing components treated as zero.
  let debt = instant(["us-gaap:LongTermDebtAndFinanceLeaseObligationsIncludingCurrentMaturities", "us-gaap:LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities", "us-gaap:LongTermDebtCurrent"]);
  const noncurrent = instant(["us-gaap:LongTermDebtNoncurrent"]);
  if (debt?.tag === "us-gaap:LongTermDebtCurrent") {
    debt = noncurrent && noncurrent.end === debt.end && noncurrent.accn === debt.accn && noncurrent.unit === debt.unit
      ? { ...debt, value: debt.value + noncurrent.value, tag: `${debt.tag} + ${noncurrent.tag}`, provenance: { kind: "computed", asOf: debt.end, formula: "current long-term debt + noncurrent long-term debt (same filing, date and unit)", inputs: [debt.provenance, noncurrent.provenance] } }
      : null;
  }
  return {
    revenue: quarterlyFacts(flow("revenue")), netIncome: quarterlyFacts(flow("netIncome")), operatingIncome: quarterlyFacts(flow("operatingIncome")),
    eps: quarterlyFacts(flow("eps"), 8, false), capex: quarterlyFacts(flow("capex")),
    operatingCashFlow: annual("operatingCashFlow"), annualRevenue: annual("revenue"), annualNetIncome: annual("netIncome"), annualOperatingIncome: annual("operatingIncome"), annualCapex: annual("capex"), annualEps: annual("eps"),
    debt, debtLabel: "Reported long-term debt (including current portion)", cash: instant(TAGS.cash), shares: instant(TAGS.shares),
    segments: { status: "unavailable", reason: "SEC companyfacts excludes dimensional disclosures; use filing inline-XBRL contexts for tagged segments/geographies." },
  };
}

export type XbrlFrame = { taxonomy: string; tag: string; ccp: string; uom: string; data: { cik: number; entityName: string; accn: string; start?: string; end: string; val: number }[] };
// Frames are cross-company calendar-aligned comparisons, not fiscal-quarter company history.
// Frame responses omit form and filing date, so never fabricate them or feed them into fundamentals.
export function parseFrame(data: XbrlFrame, retrieval: Retrieval) {
  return data.data.filter(p => Number.isFinite(p.val) && date(p.end)).map(p => ({
    cik: normalizeCik(String(p.cik)), name: p.entityName, value: p.val, accn: p.accn,
    start: p.start, end: p.end, period: data.ccp, unit: data.uom, tag: `${data.taxonomy}:${data.tag}`, form: null,
    provenance: { kind: "retrieved" as const, provider: "sec-xbrl" as const, endpoint: retrieval.endpoint, retrievedAt: retrieval.retrievedAt, asOf: p.end },
  }));
}
