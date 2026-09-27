// Server-only: scenario evidence from the companies' own SEC filings. For a driver such as chip supply or the US
// dollar, finds the risk-factor sentence in each company's latest 10-K that describes its exposure to that driver.
// Every passage is copied from EDGAR text, so it needs no web search or model and cannot be a hallucinated quote.
import { memo } from "@/lib/cache";
import { sentencesOf } from "@/lib/radar/text-diff";
import { companyFor, displayName, extractSection, filingText, listFilings, type Filing } from "@/lib/sec";
import type { Driver, ResearchEvidence } from "./research-model";

const DAY = 24 * 60 * 60 * 1000;
const MAX_COMPANIES = 4;
const MAX_PASSAGE = 450;

// What a sentence must name to describe the company's exposure to the driver: the price or supply mechanism
// itself, not just the commodity ("petroleum contamination" is not oil-price exposure).
const MECHANISM: Record<Driver, RegExp> = {
  oil: /\b((oil|fuel|energy|gasoline|diesel|jet fuel) (prices?|costs?)|prices? of (oil|fuel|energy)|fuel surcharges?)\b/i,
  "import-costs": /\b(tariffs?|import (duties|duty)|customs duties)\b/i,
  usd: /\b(U\.S\. dollar|US dollar|exchange rates?|foreign currency exchange)\b/i,
  "chip-supply": /\b(Taiwan|TSMC|foundr(y|ies))\b/i,
};
// Within a driver, the most specific wording: a Taiwan passage beats a generic foundry one.
const SPECIFIC: Partial<Record<Driver, RegExp>> = {
  "chip-supply": /\b(Taiwan|TSMC)\b/i,
  usd: /\b(strong(er)?|strengthening|appreciation)\b/i,
};

// Words that show the sentence is about an effect on the business, not a definition or a boilerplate cross-reference.
const EFFECT = /\b(adversely|harm|reduce|increase|affect|impact|depend|rely|disrupt|shortages?|constrain|lower|higher|costs?|revenue|margins?)\b/gi;

// Operating companies large index funds hold most; used when the portfolio holds only funds.
const FALLBACK: Record<Driver, string[]> = {
  oil: ["XOM", "AMZN", "UPS"],
  "import-costs": ["AAPL", "NVDA", "AMZN"],
  usd: ["AAPL", "MSFT", "GOOGL"],
  "chip-supply": ["NVDA", "AMD", "AAPL"],
};

function latestAnnual(filings: Filing[]) {
  return filings.find((f) => f.form === "10-K") ?? null;
}

type Passage = { ticker: string; company: string; filing: Filing; text: string; score: number };

async function passageFor(ticker: string, driver: Driver): Promise<Passage | null> {
  const company = await companyFor(ticker);
  if (!company) return null;
  const filing = latestAnnual(await listFilings(company.cik));
  if (!filing) return null;
  const section = extractSection(await filingText(filing), filing.form);
  if (!section.found) return null;
  let best: Passage | null = null;
  for (const s of sentencesOf(section.text)) {
    if (s.text.length > MAX_PASSAGE || !MECHANISM[driver].test(s.text)) continue;
    // Prefer sentences that name the mechanism, say how it hits the business, and sit under a heading about it.
    const named = s.text.match(new RegExp(MECHANISM[driver].source, "gi"))?.length ?? 0;
    const effect = s.text.match(EFFECT)?.length ?? 0;
    const score = named * 3 + effect + (MECHANISM[driver].test(s.heading) ? 2 : 0) + (SPECIFIC[driver]?.test(s.text) ? 3 : 0);
    if (!best || score > best.score) best = { ticker, company: displayName(company.name), filing, text: s.text, score };
  }
  return best;
}

// Up to four passages, from the portfolio's own companies first. Companies without a 10-K (funds, most foreign
// issuers) are skipped. SEC failures for one company don't stop the others.
export async function filingEvidence(driver: Driver, tickers: string[]): Promise<ResearchEvidence[]> {
  const candidates = [...new Set([...tickers, ...FALLBACK[driver]])].slice(0, MAX_COMPANIES * 3);
  const found: Passage[] = [];
  for (const ticker of candidates) {
    if (found.length >= MAX_COMPANIES) break;
    const passage = await memo(`shock:filing:${driver}:${ticker}`, DAY, () => passageFor(ticker, driver)).catch(() => null);
    if (passage && passage.score >= 5) found.push(passage);
  }
  return found.map((p) => ({
    text: `${p.company} (${p.ticker}) in its ${p.filing.form} filed ${p.filing.filedAt}: “${p.text}”`,
    sources: [{ title: `${p.company} Form ${p.filing.form}, Item 1A. Risk Factors (filed ${p.filing.filedAt})`, url: p.filing.url }],
  }));
}
