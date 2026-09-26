// Server-only: the IC Room fact pack. Every fact gets an id F1..Fn and a real source the memo can cite.
import { memo } from "@/lib/cache";
import { finnhubConfigured, getCompanyNews, getMetrics, getNextEarnings, getProfile, getQuote, getRecommendation, type Profile } from "@/lib/finnhub";
import { formatPct, formatUSD } from "@/lib/format";
import { generateGrounded, geminiConfigured } from "@/lib/gemini";
import { cachedRadarFor } from "@/lib/radar/live";
import {
  companyFor,
  displayName,
  extractBusiness,
  extractSection,
  filingIndexUrl,
  filingText,
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

export type Fact = Source & { content: string };
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
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

const BOILERPLATE = /forward-looking|cautionary statement|not the only (risks|ones)|carefully consider|in addition to the other information|should be (read|considered)/i;

// Skips the heading ("PART I / Item 1A. Risk Factors") and leading boilerplate paragraphs, so the excerpt starts on substance.
function body(section: string) {
  const paras = section.replace(/^[\s\S]{0,120}?item[^\n]*\n/i, "").split("\n");
  let i = 0;
  while (i < Math.min(paras.length, 12) && (BOILERPLATE.test(paras[i]) || paras[i].trim().length < 40)) i++;
  return paras.slice(i < paras.length ? i : 0).join("\n");
}

const billions = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? `$${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `$${(abs / 1e6).toFixed(1)}M` : formatUSD(abs);
  return n < 0 ? `−${s}` : s;
};
const monthYear = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" });

async function filingFacts(company: Company, name: string): Promise<Draft[]> {
  const tenK = (await listFilings(company.cik)).find((f: Filing) => f.form === "10-K");
  if (!tenK) return [];
  const text = await filingText(tenK);
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
      excerpt: clip(body(business), EXCERPT_CHARS),
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
      excerpt: clip(body(risks.text), EXCERPT_CHARS),
      url: tenK.url,
      content: clip(body(risks.text), CONTEXT_CHARS),
    });
  }
  return out;
}

const periodLabel = (q: Quarter) => `quarter ended ${monthYear(q.end)}`;

// Deterministic sentences from XBRL numbers; the source is the filing that reported the latest value.
export function fundamentalFacts(company: Company, name: string, f: Fundamentals): Draft[] {
  const out: Draft[] = [];
  const source = (q: Quarter, what: string, content: string): Draft => ({
    title: `${name} ${what} (SEC XBRL)`,
    docType: q.form === "10-K" ? "10-K" : "10-Q",
    issuer: company.name,
    date: q.end,
    section: "Financial statements (XBRL)",
    excerpt: content,
    url: filingIndexUrl(company.cik, q.accn),
    content,
  });
  const series = (list: Quarter[], label: string) => {
    if (list.length < 2) return;
    const latest = list[list.length - 1];
    const yearAgo = list.length >= 5 ? list[list.length - 5] : null;
    const growth = yearAgo && yearAgo.value > 0 ? ` That is ${formatPct(latest.value / yearAgo.value - 1)} vs the same quarter a year earlier.` : "";
    const trail = list.map((q) => `${monthYear(q.end)} ${billions(q.value)}`).join(", ");
    out.push(source(latest, `${label.toLowerCase()}, last ${list.length} quarters`, `${label} by quarter: ${trail}. Latest (${periodLabel(latest)}): ${billions(latest.value)}.${growth}`));
  };
  series(f.revenue, "Revenue");
  series(f.netIncome, "Net income");
  if (f.operatingCashFlow.length > 0) {
    const [prev, last] = f.operatingCashFlow.length > 1 ? f.operatingCashFlow : [null, f.operatingCashFlow[0]];
    out.push(
      source(
        last!,
        "operating cash flow",
        `Operating cash flow for the fiscal year ended ${monthYear(last!.end)}: ${billions(last!.value)}${prev ? ` (prior year ${billions(prev.value)})` : ""}.`,
      ),
    );
  }
  if (f.debt) out.push(source(f.debt, "total debt", `Total debt as of ${monthYear(f.debt.end)}: ${billions(f.debt.value)}.`));
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
    out.push({ title: `${name} valuation and price`, docType: "Market data", issuer: "Finnhub", date: today, excerpt: content, url: FINNHUB_URL, content });
  }
  const r = reco.status === "fulfilled" ? reco.value : null;
  if (r) {
    const positive = r.strongBuy + r.buy;
    const negative = r.sell + r.strongSell;
    const content = `Analyst ratings for ${monthYear(r.period)}: ${positive} positive, ${r.hold} neutral, ${negative} negative.`;
    out.push({ title: `${name} analyst ratings`, docType: "Market data", issuer: "Finnhub", date: r.period, excerpt: content, url: "https://finnhub.io/docs/api/recommendation-trends", content });
  }
  const e = earnings.status === "fulfilled" ? earnings.value : null;
  if (e) {
    const est = [e.revenueEstimate ? `revenue estimate ${billions(e.revenueEstimate)}` : "", e.epsEstimate ? `EPS estimate $${e.epsEstimate.toFixed(2)}` : ""].filter(Boolean).join(", ");
    const content = `Next earnings report scheduled for ${e.date}${est ? ` (${est})` : ""}.`;
    out.push({ title: `${name} next earnings`, docType: "Market data", issuer: "Finnhub", date: e.date, excerpt: content, url: "https://finnhub.io/docs/api/earnings-calendar", content });
  }
  return out;
}

// Recent news with web citations from Gemini's Google Search grounding; Finnhub company news when grounding fails.
async function newsFacts(ticker: string, name: string): Promise<Draft[]> {
  const today = new Date().toISOString().slice(0, 10);
  if (geminiConfigured()) {
    try {
      const { value } = await generateGrounded({
        tag: "ic-news",
        prompt:
          `What are the most important news items about ${name} (${ticker}) from the last 14 days, as of ${today}? ` +
          "Give up to four short factual sentences, one per news item, each with its date. No opinions, no investment advice.",
        budgetMs: 20000,
      });
      const facts: Draft[] = [];
      for (const claim of value.claims) {
        const cite = value.citations[claim.citations[0]];
        if (facts.some((f) => f.url === cite.url || f.excerpt === claim.text)) continue;
        facts.push({ title: `${name} news: ${cite.title}`, docType: "News", issuer: cite.title, date: today, excerpt: claim.text, url: cite.url, content: claim.text });
        if (facts.length === MAX_NEWS) break;
      }
      if (facts.length > 0) return facts;
    } catch (err) {
      console.error("[ic] grounded news failed:", err instanceof Error ? err.message.slice(0, 120) : "unknown");
    }
  }
  if (!finnhubConfigured()) return [];
  const news = await getCompanyNews(ticker).catch(() => []);
  return news.slice(0, MAX_NEWS).map((n) => {
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
  return [{ title: `${name} Filing Radar: ${filing.title}`, docType: filing.filingType, issuer: filing.company, date: filing.filedAt, section: filing.section, excerpt: quote, url: filing.url, content }];
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
  return memo(`ic:facts:${ticker}:${day}`, 6 * HOUR, async () => {
    const [company, profile] = await Promise.all([companyFor(ticker).catch(() => null), finnhubConfigured() ? getProfile(ticker).catch(() => null) : null]);
    if (!company && !profile) throw new UnknownTicker(ticker);
    const name = profile?.name ?? (company ? displayName(company.name) : ticker);
    const notes: string[] = [];
    const step = <T>(i: number, p: Promise<T>) => p.finally(() => onStep(i));
    const [filings, funds, market, news, radar] = await Promise.all([
      step(0, company ? settle(filingFacts(company, name), "SEC filing", notes) : Promise.resolve([])),
      step(1, company ? settle(fundamentals(company.cik).then((f) => (f ? fundamentalFacts(company, name, f) : [])), "Fundamentals", notes) : Promise.resolve([])),
      step(2, settle(marketFacts(ticker, name), "Market data", notes)),
      step(3, settle(newsFacts(ticker, name), "News", notes)),
      company ? radarFact(ticker, name).catch(() => []) : Promise.resolve([]),
    ]);
    const facts: Fact[] = [...filings, ...radar, ...funds, ...market, ...news].map((f, i) => ({ ...f, id: `F${i + 1}` }));
    if (facts.length === 0) throw new Error("no facts");
    return { ticker, name, profile, facts, notes };
  });
}

export class UnknownTicker extends Error {
  constructor(ticker: string) {
    super(`unknown ticker ${ticker}`);
  }
}
