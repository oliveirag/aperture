// Server-only: the IC Room fact pack. Every fact gets an id F1..Fn and a real source the memo can cite.
import { memo } from "@/lib/cache";
import { finnhubConfigured, getCompanyNews, getMetrics, getNextEarnings, getProfile, getQuote, getRecommendation, type Profile } from "@/lib/finnhub";
import { formatPct, formatUSD } from "@/lib/format";
import { cachedRadarFor } from "@/lib/radar/live";
import { sourceQuote } from "@/lib/radar/verify";
import type { Provenance } from "@/lib/provenance";
import {
  companyFor,
  displayName,
  extractBusiness,
  extractSection,
  filingIndexUrl,
  filingDocument,
  fundamentals,
  listFilings,
  type Company,
  type Filing,
  type Fundamentals,
  type Quarter,
} from "@/lib/sec";
import type { Source } from "@/types/demo";

const HOUR = 60 * 60 * 1000;
// What the analysts read from a long document; the drawer shows a shorter excerpt.
const CONTEXT_CHARS = 6000;
const EXCERPT_CHARS = 480;
const MAX_NEWS = 4;

// Numbers behind a fact, for the rules-based committee. Stripped before a fact reaches the browser.
export type Signal =
  | { kind: "revenue" | "netIncome"; latest: number; yearAgo: number | null; end: string }
  | { kind: "cash"; latest: number; prior: number | null; end: string }
  | { kind: "debt"; value: number; measure?: string }
  | { kind: "market"; price: number | null; pe: number | null; low: number | null; high: number | null; beta: number | null; margin: number | null }
  | { kind: "analysts"; positive: number; neutral: number; negative: number }
  | { kind: "earnings"; date: string }
  | { kind: "radar"; label: string; category: string; severity: string | null; change: "new" | "changed" | "removed"; form: string };

export type Fact = Source & { content: string; signal?: Signal; provenance?: Provenance; numericEvidence?: Quarter[]; quoteVerified?: boolean };
export type FactPack = { ticker: string; name: string; profile: Profile | null; facts: Fact[]; notes: string[] };

export const factSteps = (ticker: string) => [
  `Reading ${ticker}'s latest 10-K on SEC EDGAR`,
  "Pulling 8 quarters of fundamentals",
  "Market data: valuation, analyst ratings, next earnings",
  "Searching news from the last 14 days",
];

type Draft = Omit<Fact, "id">;

// Cuts at a sentence end so excerpts never stop mid-word.
function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return end > max * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" "));
}

const BOILERPLATE = /forward-looking|cautionary statement|not the only (risks|ones)|carefully consider|in addition to the other information|should be (read|considered)/i;

// Skips the heading ("PART I / Item 1A. Risk Factors") and leading boilerplate paragraphs, so the excerpt starts on substance.
function body(section: string) {
  const paras = section.replace(/^[\s\S]{0,120}?item[^\n]*\n/i, "").split("\n");
  let i = 0;
  while (i < Math.min(paras.length, 12) && (BOILERPLATE.test(paras[i]) || paras[i].trim().length < 40)) i++;
  return paras.slice(i < paras.length ? i : 0).join("\n");
}

export const billions = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? `$${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `$${(abs / 1e6).toFixed(1)}M` : formatUSD(abs);
  return n < 0 ? `−${s}` : s;
};
export const monthYear = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" });

async function filingFacts(company: Company, name: string): Promise<Draft[]> {
  const tenK = (await listFilings(company.cik)).find((f: Filing) => f.form === "10-K");
  if (!tenK) return [];
  const document = await filingDocument(tenK);
  return filingFactsFromText(company, name, tenK, document.text, document.provenance);
}

export function filingFactsFromText(company: Company, name: string, tenK: Filing, text: string, provenance?: Provenance): Draft[] {
  const out: Draft[] = [];
  const business = extractBusiness(text);
  const title = `${name} Form 10-K (filed ${tenK.filedAt})`;
  if (business) {
    out.push({
      title,
      docType: "10-K",
      issuer: company.name,
      date: tenK.filedAt,
      section: "Item 1. Business",
      excerpt: sourceQuote(clip(body(business), EXCERPT_CHARS), text) ?? "",
      quoteVerified: true,
      url: tenK.url,
      content: clip(body(business), CONTEXT_CHARS),
    });
  }
  const risks = extractSection(text, "10-K");
  if (risks.found) {
    out.push({
      title,
      docType: "10-K",
      issuer: company.name,
      date: tenK.filedAt,
      section: "Item 1A. Risk Factors",
      excerpt: sourceQuote(clip(body(risks.text), EXCERPT_CHARS), text) ?? "",
      quoteVerified: true,
      url: tenK.url,
      content: clip(body(risks.text), CONTEXT_CHARS),
    });
  }
  return out.filter(f => f.excerpt.length > 0).map(f => ({ ...f, provenance: provenance ? { ...provenance, filing: provenance.filing ? { ...provenance.filing, section: f.section } : undefined } : undefined }));
}

const periodLabel = (q: Quarter) => `quarter ended ${monthYear(q.end)}`;
const factValue = (q: Quarter) => !q.unit || q.unit === "USD" ? billions(q.value) : `${q.unit} ${q.value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;

// Deterministic sentences from XBRL numbers; the source is the filing that reported the latest value.
export function fundamentalFacts(company: Company, name: string, f: Fundamentals): Draft[] {
  const out: Draft[] = [];
  const source = (q: Quarter, what: string, content: string, signal?: Signal, inputs: Quarter[] = [q]): Draft => ({
    // Existing rules format signal values as dollars; native-currency facts remain visible,
    // but must not enter those USD-only deterministic statements until the consumer is widened.
    signal: inputs.every(p => !p.unit || p.unit === "USD") ? signal : undefined,
    numericEvidence: inputs,
    provenance: inputs.every(p => p.provenance) ? { kind: "computed", formula: "Format reported values by period and unit; where stated YoY = latest / matching prior-year quarter − 1", inputs: inputs.map(p => p.provenance!) } : undefined,
    title: `${name} ${what} (SEC XBRL, ${q.form})`,
    // SourceDocType does not yet support 20-F/40-F; label financial data as such, never as a fictitious 10-Q.
    docType: q.form.startsWith("10-K") ? "10-K" : q.form.startsWith("10-Q") ? "10-Q" : "Market data",
    issuer: company.name,
    date: q.end,
    section: "Financial statements (XBRL)",
    excerpt: content,
    url: filingIndexUrl(company.cik, q.accn),
    content,
  });
  const series = (list: Quarter[], label: string, kind: "revenue" | "netIncome") => {
    if (list.length < 2) return;
    const latest = list[list.length - 1];
    const yearAgo = list.find(q => {
      const days = (Date.parse(latest.end) - Date.parse(q.end)) / 86400000;
      return days >= 350 && days <= 380 && q.unit === latest.unit;
    }) ?? null;
    const growth = yearAgo && yearAgo.value > 0 ? ` That is ${formatPct(latest.value / yearAgo.value - 1)} vs the same quarter a year earlier.` : "";
    const trail = list.map((q) => `${monthYear(q.end)} ${factValue(q)}`).join(", ");
    const signal: Signal = { kind, latest: latest.value, yearAgo: yearAgo?.value ?? null, end: latest.end };
    out.push(source(latest, `${label.toLowerCase()}, last ${list.length} quarters`, `${label} by quarter: ${trail}. Latest (${periodLabel(latest)}): ${factValue(latest)}.${growth}`, signal, list));
  };
  series(f.revenue, "Revenue", "revenue");
  series(f.netIncome, "Net income", "netIncome");
  if (f.operatingCashFlow.length > 0) {
    const [prev, last] = f.operatingCashFlow.length > 1 ? f.operatingCashFlow : [null, f.operatingCashFlow[0]];
    out.push(
      source(
        last!,
        "operating cash flow",
        `Operating cash flow for the fiscal year ended ${monthYear(last!.end)}: ${factValue(last!)}${prev ? ` (prior year ${factValue(prev)})` : ""}.`,
        { kind: "cash", latest: last!.value, prior: prev?.value ?? null, end: last!.end },
        f.operatingCashFlow,
      ),
    );
  }
  if (f.debt) out.push(source(f.debt, f.debtLabel ?? "total debt", `${f.debtLabel ?? "Total debt"} as of ${monthYear(f.debt.end)}: ${factValue(f.debt)}.`, { kind: "debt", value: f.debt.value, measure: f.debtLabel ?? "Total debt" }));
  for (const [label, values] of [["Operating income", f.operatingIncome], [f.eps?.at(-1)?.tag?.includes("Basic") ? "Basic EPS" : "Diluted EPS", f.eps], ["Capital expenditure", f.capex]] as const) {
    const latest = values?.at(-1);
    if (latest) out.push(source(latest, label.toLowerCase(), `${label} for the ${periodLabel(latest)}: ${factValue(latest)}.`));
  }
  for (const [label, point] of [["Cash and cash equivalents", f.cash], ["Shares outstanding", f.shares]] as const) {
    if (point) out.push(source(point, label.toLowerCase(), `${label} as of ${monthYear(point.end)}: ${factValue(point)}.`));
  }
  if (!f.revenue.length && f.annualRevenue?.length) {
    const latest = f.annualRevenue.at(-1)!;
    out.push(source(latest, "annual revenue", `Revenue for fiscal year ended ${monthYear(latest.end)}: ${factValue(latest)}. Quarterly revenue is not tagged in this source.`));
  }
  return out;
}

const FINNHUB_URL = "https://finnhub.io/docs/api/company-basic-financials";

async function marketFacts(ticker: string, name: string): Promise<Draft[]> {
  if (!finnhubConfigured()) return [];
  const [quote, metrics, reco, earnings] = await Promise.allSettled([getQuote(ticker), getMetrics(ticker), getRecommendation(ticker), getNextEarnings(ticker)]);
  const today = new Date().toISOString().slice(0, 10);
  const out: Draft[] = [];
  const q = quote.status === "fulfilled" ? quote.value : null;
  const m = metrics.status === "fulfilled" ? metrics.value : null;
  if (q || m) {
    const parts = [
      q ? `Price ${formatUSD(q.price, 2)} (${formatPct(q.changePct)} today)` : "",
      m?.peTTM ? `P/E (trailing 12 months) ${m.peTTM.toFixed(1)}` : "",
      m?.week52Low && m.week52High ? `52-week range ${formatUSD(m.week52Low, 2)} to ${formatUSD(m.week52High, 2)}` : "",
      m?.beta ? `beta ${m.beta.toFixed(2)}` : "",
      m?.revenueGrowthTTMYoy !== null && m?.revenueGrowthTTMYoy !== undefined ? `revenue growth (TTM, YoY) ${m.revenueGrowthTTMYoy.toFixed(1)}%` : "",
      m?.netMarginTTM !== null && m?.netMarginTTM !== undefined ? `net margin (TTM) ${m.netMarginTTM.toFixed(1)}%` : "",
    ].filter(Boolean);
    const content = `${parts.join("; ")}.`;
    const signal: Signal = { kind: "market", price: q?.price ?? null, pe: m?.peTTM ?? null, low: m?.week52Low ?? null, high: m?.week52High ?? null, beta: m?.beta ?? null, margin: m?.netMarginTTM ?? null };
    out.push({ title: `${name} valuation and price`, docType: "Market data", issuer: "Finnhub", date: today, excerpt: content, url: FINNHUB_URL, content, signal });
  }
  const r = reco.status === "fulfilled" ? reco.value : null;
  if (r) {
    const positive = r.strongBuy + r.buy;
    const negative = r.sell + r.strongSell;
    const content = `Analyst ratings for ${monthYear(r.period)}: ${positive} positive, ${r.hold} neutral, ${negative} negative.`;
    out.push({ title: `${name} analyst ratings`, docType: "Market data", issuer: "Finnhub", date: r.period, excerpt: content, url: "https://finnhub.io/docs/api/recommendation-trends", content, signal: { kind: "analysts", positive, neutral: r.hold, negative } });
  }
  const e = earnings.status === "fulfilled" ? earnings.value : null;
  if (e) {
    const est = [e.revenueEstimate ? `revenue estimate ${billions(e.revenueEstimate)}` : "", e.epsEstimate ? `EPS estimate $${e.epsEstimate.toFixed(2)}` : ""].filter(Boolean).join(", ");
    const content = `Next earnings report scheduled for ${e.date}${est ? ` (${est})` : ""}.`;
    out.push({ title: `${name} next earnings`, docType: "Market data", issuer: "Finnhub", date: e.date, excerpt: content, url: "https://finnhub.io/docs/api/earnings-calendar", content, signal: { kind: "earnings", date: e.date } });
  }
  return out;
}

// Stock-picking and promotional headlines are opinion, not news; the committee shouldn't cite them as facts.
const PROMO = /\b(stocks?|shares?) to (buy|sell|own|avoid)\b|\bto buy (now|and hold|before)\b|\bshould you (buy|sell)\b|\bif you (invest|put|had invested)\b|\bmillionaire\b|\bup next\b|\bprice target\b|\b(buy|sell) (rating|signal)\b|\bno-brainer\b|\bmake you rich\b|\bunstoppable\b/i;

// Provider text only: generated grounded claims can contain unsupported numbers.
// Workstream E can supply its deterministic news evidence adapter here at integration.
async function newsFacts(ticker: string): Promise<Draft[]> {
  if (!finnhubConfigured()) return [];
  const news = await getCompanyNews(ticker).catch(() => []);
  return news.filter((n) => !PROMO.test(n.headline)).slice(0, MAX_NEWS).map((n) => {
    const content = n.summary ? `${n.headline}. ${clip(n.summary, 300)}` : n.headline;
    return {
      title: n.headline,
      docType: "News" as const,
      issuer: n.source,
      date: new Date(n.datetime * 1000).toISOString().slice(0, 10),
      excerpt: content,
      url: n.url,
      content,
    };
  });
}

async function radarFact(ticker: string, name: string): Promise<Draft[]> {
  const filing = await cachedRadarFor(ticker);
  const top = filing?.changes[0];
  if (!filing || !top) return [];
  const quote = top.kind === "removed" ? (top.prior ?? "") : top.current;
  const content = `${filing.title}. ${filing.summary} Quoted from the ${filing.filingType}: "${quote}"`;
  const signal: Signal = { kind: "radar", label: top.label, category: filing.category, severity: filing.severity, change: top.kind, form: filing.filingType };
  return [{ title: `${name} Filing Radar: ${filing.title}`, docType: filing.filingType, issuer: filing.company, date: top.kind === "removed" ? filing.priorFiledAt : filing.filedAt, section: filing.section, excerpt: quote, url: top.kind === "removed" ? filing.priorUrl : filing.url, content, signal, quoteVerified: true, provenance: top.kind === "removed" ? filing.provenance?.prior : filing.provenance?.latest }];
}

async function settle<T>(p: Promise<T[]>, label: string, notes: string[]): Promise<T[]> {
  try {
    return await p;
  } catch (err) {
    console.error(`[ic] ${label} failed:`, err instanceof Error ? err.message.slice(0, 120) : "unknown");
    notes.push(`${label} unavailable`);
    return [];
  }
}

// Builds (or returns today's cached) fact pack. `onStep(i)` fires as each step in factSteps() finishes.
export function buildFactPack(ticker: string, onStep: (index: number) => void = () => {}): Promise<FactPack> {
  const day = new Date().toISOString().slice(0, 10);
  return memo(`ic:facts:v2:${ticker}:${day}`, 6 * HOUR, async () => {
    const [company, profile] = await Promise.all([companyFor(ticker).catch(() => null), finnhubConfigured() ? getProfile(ticker).catch(() => null) : null]);
    if (!company && !profile) throw new UnknownTicker(ticker);
    const name = profile?.name ?? (company ? displayName(company.name) : ticker);
    const notes: string[] = [];
    const step = <T>(i: number, p: Promise<T>) => p.finally(() => onStep(i));
    const [filings, funds, market, news, radar] = await Promise.all([
      step(0, company ? settle(filingFacts(company, name), "SEC filing", notes) : Promise.resolve([])),
      step(1, company ? settle(fundamentals(company.cik).then((f) => (f ? fundamentalFacts(company, name, f) : [])), "Fundamentals", notes) : Promise.resolve([])),
      step(2, settle(marketFacts(ticker, name), "Market data", notes)),
      step(3, settle(newsFacts(ticker), "News", notes)),
      company ? radarFact(ticker, name).catch(() => []) : Promise.resolve([]),
    ]);
    const facts: Fact[] = [...filings, ...radar, ...funds, ...market, ...news].map((f, i) => ({ ...f, id: `F${i + 1}` }));
    if (facts.length === 0) throw new Error("no facts");
    return { ticker, name, profile, facts, notes };
  }, { persist: true });
}

export class UnknownTicker extends Error {
  constructor(ticker: string) {
    super(`unknown ticker ${ticker}`);
  }
}
