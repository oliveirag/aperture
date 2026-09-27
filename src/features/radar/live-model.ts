// Pure glue between the X-Ray and the live Filing Radar: which companies to cover and why each one matters to you.
import type { RadarCard, Severity } from "@/data/radar";
import { formatPct } from "@/lib/format";
import type { ImportedHolding } from "@/lib/portfolio-store";
import type { RadarFiling } from "@/lib/radar/types";
import { cleanName } from "@/lib/xray/compute";
import type { XrayModel } from "@/lib/xray/types";

export const MAX_COVERED = 10;
const FALLBACK_COLOR = "#8FA3BF";
const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export type Covered = { ticker: string; name: string; color: string; weight: number; whyItMatters: string };

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Companies the Radar covers: stocks held directly (largest first), then the X-Ray's top-10 look-through companies.
// Funds are left out: they don't file 10-Ks.
export function coveredCompanies(model: XrayModel, holdings: ImportedHolding[]): Covered[] {
  return radarCandidates(model, holdings).slice(0, MAX_COVERED);
}

// Companies beyond the Radar's cap: listed, not silently dropped.
export function uncoveredCompanies(model: XrayModel, holdings: ImportedHolding[]): Covered[] {
  return radarCandidates(model, holdings).slice(MAX_COVERED);
}

function radarCandidates(model: XrayModel, holdings: ImportedHolding[]): Covered[] {
  // A held position without a company industry is a fund (Finnhub has profiles for companies only). An opaque
  // position with an industry is a stock whose live profile failed, so it stays covered.
  const funds = new Set([
    ...model.map.positions.filter((p) => p.category.startsWith("ETF")).map((p) => p.ticker),
    ...holdings.filter((h) => !h.industry).map((h) => h.ticker),
  ]);
  const out = new Map<string, Covered>();
  const direct = [...holdings].filter((h) => !funds.has(h.ticker)).sort((a, b) => b.shares * b.price - a.shares * a.price);
  for (const h of direct) {
    const e = model.topTen.find((x) => x.ticker === h.ticker);
    out.set(h.ticker, e ? fromExposure(e, model.total) : fromDirect(h, model.total));
  }
  for (const e of model.topTen) {
    if (out.has(e.ticker) || funds.has(e.ticker) || e.ticker.includes("·")) continue;
    out.set(e.ticker, fromExposure(e, model.total));
  }
  // Share classes (GOOGL and GOOG) are one filer: keep the larger.
  const seen = new Set<string>();
  return [...out.values()].filter((c) => !seen.has(c.name) && seen.add(c.name));
}

function fromExposure(e: XrayModel["topTen"][number], total: number): Covered {
  const weight = e.value / total;
  const pct = formatPct(weight);
  const paths = e.sources.map((s) => (s.via === "Direct" ? e.ticker : s.via));
  let why: string;
  if (paths.length > 1) why = `${e.name} is ${pct} of your money across ${joinNames(paths)}. A hit here moves ${paths.length} of your positions at once.`;
  else if (e.sources[0]?.via === "Direct") why = `${e.name} is ${pct} of your money, held directly.`;
  else why = `${e.name} is ${pct} of your money, all of it through ${paths[0]}.`;
  return { ticker: e.ticker, name: e.name, color: e.color, weight, whyItMatters: why };
}

function fromDirect(h: ImportedHolding, total: number): Covered {
  const weight = (h.shares * h.price) / total;
  const name = cleanName(h.name);
  return { ticker: h.ticker, name, color: FALLBACK_COLOR, weight, whyItMatters: `${name} is ${formatPct(weight)} of your money, held directly.` };
}

// A live filing comparison in the card shape the Radar UI draws.
export function toCard(filing: RadarFiling, covered: Covered): RadarCard & { severity: Severity } {
  const top = filing.changes[0];
  const excerpt = top ? (top.kind === "removed" ? (top.prior ?? "") : top.current) : filing.summary;
  return {
    id: `live-${filing.ticker.toLowerCase()}`,
    ticker: filing.ticker,
    company: covered.name,
    color: covered.color,
    filingType: filing.filingType,
    filedAt: filing.filedAt,
    priorFiledAt: filing.priorFiledAt,
    severity: filing.severity ?? "low",
    category: filing.category,
    title: filing.title,
    summary: filing.summary,
    whyItMatters: covered.whyItMatters,
    exposureWeight: covered.weight,
    changes: filing.changes,
    source: {
      id: `r-live-${filing.ticker.toLowerCase()}`,
      title: `${covered.name} Form ${filing.filingType} (filed ${filing.filedAt})`,
      docType: filing.filingType,
      issuer: filing.company,
      date: filing.filedAt,
      section: filing.section,
      excerpt,
      highlight: top?.highlight[0],
      url: filing.url,
    },
  };
}

// Highest severity first; within a severity, the bigger exposure first.
export function sortCards<T extends { severity: Severity; exposureWeight: number }>(cards: T[]) {
  return [...cards].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.exposureWeight - a.exposureWeight);
}

export function liveHeadline(cards: { severity: Severity; exposureWeight: number }[], filings: number, pending: boolean) {
  if (cards.length === 0 && (pending || filings === 0)) {
    const text = pending ? "Reading the latest filings from the companies you own." : "We couldn't read your companies' filings right now.";
    return { beginner: text, intermediate: text, advanced: text };
  }
  const high = cards.filter((c) => c.severity === "high");
  const medium = cards.filter((c) => c.severity === "medium").length;
  const low = cards.filter((c) => c.severity === "low").length;
  const pct = formatPct(high.reduce((s, c) => s + c.exposureWeight, 0));
  const companies = (n: number) => (n === 1 ? "company" : "companies");
  return {
    beginner:
      high.length > 0
        ? `${high.length === 1 ? "One company" : `${high.length} companies`} you own changed how ${high.length === 1 ? "it describes its" : "they describe their"} biggest risks.`
        : cards.length > 0
          ? `${cards.length} ${companies(cards.length)} you own updated their risk warnings. None was rated high severity.`
          : `No verified risk-warning changes in the ${filings} ${filings === 1 ? "filing" : "filings"} we read.`,
    intermediate:
      high.length > 0
        ? `${high.length} high-severity ${high.length === 1 ? "change" : "changes"} in companies that make up ${pct} of your money.`
        : `No high-severity changes across ${filings} ${filings === 1 ? "filing" : "filings"}.`,
    advanced: `${high.length} high, ${medium} medium, ${low} low severity changes across ${filings} filings; high-severity names are ${pct} of look-through exposure.`,
  };
}

export function highExposure(cards: { severity: Severity; exposureWeight: number }[]) {
  return cards.filter((c) => c.severity === "high").reduce((s, c) => s + c.exposureWeight, 0);
}
