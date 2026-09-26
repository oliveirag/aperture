import type { RadarCard } from "@/data/radar";
import { getProfile } from "@/lib/finnhub";
import { diffSections } from "@/lib/radar/diff";
import { explainChanges } from "@/lib/radar/explain";
import { getAnnualReports, getCik, getRiskFactors } from "@/lib/sec";
import { cleanName } from "@/lib/xray/compute";

export const runtime = "nodejs";
export const maxDuration = 90;

const TICKER = /^[A-Z][A-Z.]{0,5}$/;

// A card without the portfolio-specific fields; the client adds exposure and "why this matters" from its X-Ray.
export type RadarFiling = Omit<RadarCard, "whyItMatters" | "exposureWeight" | "color">;

export type RadarResult =
  | { status: "ok"; card: RadarFiling; model: string }
  // Compared, and nothing material changed.
  | { status: "quiet"; ticker: string; company: string; filedAt: string; priorFiledAt: string; url: string }
  // Not comparable: a fund, a foreign filer (20-F), a first 10-K, or an unparseable filing.
  | { status: "skipped"; ticker: string; company?: string; reason: string };

// One result per (ticker, filing pair): each pair is diffed and explained once.
const results = new Map<string, Promise<RadarResult>>();

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function analyze(ticker: string, refresh: boolean): Promise<RadarResult> {
  const cik = await getCik(ticker);
  if (!cik) return { status: "skipped", ticker, reason: "Not an SEC-registered company (funds are covered through their holdings)" };
  const [{ name, filings }, profile] = await Promise.all([getAnnualReports(cik), getProfile(ticker).catch(() => null)]);
  const company = cleanName(profile?.name ?? name);
  const [latest, prior] = filings;
  // A registrant with no 10-K yet is usually a new entity (a spin-off or holding-company reorganization, e.g. XOM in 2026).
  if (!latest) return { status: "skipped", ticker, company, reason: "No annual report under this SEC registration yet" };
  if (!prior) return { status: "skipped", ticker, company, reason: "Only one annual report so far; needs two to compare" };

  const key = `${ticker}:${latest.accession}:${prior.accession}`;
  if (!refresh && results.has(key)) return results.get(key)!;

  const run = (async (): Promise<RadarResult> => {
    const [now, then] = await Promise.all([getRiskFactors(latest), getRiskFactors(prior)]);
    if (!now || !then) return { status: "skipped", ticker, company, reason: "Couldn't find Item 1A. Risk Factors in the filing" };
    const candidates = diffSections(then, now);
    const quiet = { status: "quiet" as const, ticker, company, filedAt: latest.filedAt, priorFiledAt: prior.filedAt, url: latest.url };
    if (candidates.length === 0) return quiet;

    const { value, model } = await explainChanges(company, latest.filedAt, prior.filedAt, candidates);
    if (value.changes.length === 0) return quiet;
    const lead = value.changes[0];
    return {
      status: "ok",
      model,
      card: {
        id: `live-${ticker.toLowerCase()}`,
        ticker,
        company,
        filingType: "10-K",
        filedAt: latest.filedAt,
        priorFiledAt: prior.filedAt,
        severity: value.severity,
        category: value.category || "Risk factors",
        title: value.title || lead.label,
        summary: value.summary,
        changes: value.changes.map((c) => ({ kind: c.kind, label: c.label, prior: c.prior, current: c.excerpt, highlight: c.highlight })),
        source: {
          id: `r-${ticker.toLowerCase()}-${latest.accession}`,
          title: `${company} Form 10-K (filed ${latest.filedAt})`,
          docType: "10-K",
          issuer: company,
          date: latest.filedAt,
          section: "Item 1A. Risk Factors",
          excerpt: lead.excerpt,
          highlight: lead.highlight[0],
          url: latest.url,
        },
      },
    };
  })();
  results.set(key, run);
  run.catch(() => results.delete(key));
  return run;
}

// Filing Radar for one company: compares Item 1A of its two latest 10-Ks. Body: { ticker, refresh? }.
export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) return fail("Filing Radar is not configured", 503);
  let body: { ticker?: unknown; refresh?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase().replace(/[/-]/g, ".") : "";
  if (!TICKER.test(ticker)) return fail("Invalid ticker", 400);

  try {
    return Response.json(await analyze(ticker, body.refresh === true));
  } catch (err) {
    console.error(`[radar] ${ticker}:`, err instanceof Error ? err.message.slice(0, 200) : "unknown");
    return fail("Couldn't read this company's filings right now. Try again in a moment.", 502);
  }
}
