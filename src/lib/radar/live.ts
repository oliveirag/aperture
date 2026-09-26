// Server-only: the real Filing Radar. Finds a company's latest filing and the prior one of the same form, cuts out
// the risk sections, asks Gemini what changed, and keeps only changes whose quotes are verbatim in the filings.
import { forget, memo, peek } from "@/lib/cache";
import { generateJson } from "@/lib/gemini";
import { companyFor, displayName, extractSection, filingPair, filingText, listFilings, type Filing } from "@/lib/sec";
import type { RadarFiling } from "./types";
import { parseProposed, verifyChanges } from "./verify";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const MAX_CHANGES = 6;

const SYSTEM =
  "You compare two SEC filings from the same company and report what changed in its risk disclosures, for retail investors. " +
  "Write labels and summaries in plain English. Never give investment advice or say buy or sell.";

const SCHEMA = {
  type: "object",
  properties: {
    changes: {
      type: "array",
      maxItems: MAX_CHANGES,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["new", "changed", "removed"] },
          label: { type: "string", description: "Headline of the change, at most 12 words." },
          summary: { type: "string", description: "One plain-English sentence on what changed and why it could matter." },
          category: { type: "string", description: "Two to four words: area, then topic, e.g. 'Regulatory · Export controls'." },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          latest_excerpt: { type: ["string", "null"], description: "Exact quote from the LATEST filing. Null only for removed." },
          prior_excerpt: { type: ["string", "null"], description: "Exact quote from the PRIOR filing. Null only for new." },
          key_phrases: { type: "array", items: { type: "string" }, description: "One to three short phrases copied from the shown excerpt." },
        },
        required: ["kind", "label", "summary", "category", "severity", "latest_excerpt", "prior_excerpt", "key_phrases"],
      },
    },
  },
  required: ["changes"],
};

function prompt(company: string, latest: Filing, prior: Filing, latestSection: { name: string; text: string; found: boolean }, priorSection: { text: string }) {
  const where = latestSection.found
    ? `Both texts are the "${latestSection.name}" section.`
    : `The section headings could not be located, so these are the whole filings: use only the risk factors${latest.form === "10-Q" ? " and management's discussion" : ""}.`;
  return [
    `Company: ${company}. Compare its ${latest.form} filed ${latest.filedAt} (LATEST) with the ${prior.form} filed ${prior.filedAt} (PRIOR). ${where}`,
    `Report up to ${MAX_CHANGES} material changes, most important first: risks that are new in LATEST, risks removed from PRIOR, and risks whose substance changed (scope, numbers, regions, products, severity). ` +
      "Skip renumbering, date or fiscal-year updates, and rewording that doesn't change meaning. Return an empty list when nothing material changed.",
    "Severity: high = a new or clearly worse risk that could hit revenue, liquidity or the business model; medium = a notable expansion or new specifics; low = a minor update.",
    "Quotes: copy each excerpt character for character from the given text, one or two full sentences (25 to 350 characters), no ellipses, no paraphrase. " +
      "A quote that is not in the text will be discarded. For 'changed', give the PRIOR wording and the LATEST wording of the same risk.",
    `=== PRIOR ${prior.form} (${prior.filedAt}) ===\n${priorSection.text}`,
    `=== LATEST ${latest.form} (${latest.filedAt}) ===\n${latestSection.text}`,
  ].join("\n\n");
}

async function diff(ticker: string, company: string, latest: Filing, prior: Filing, onProgress: (m: string) => void): Promise<RadarFiling> {
  onProgress(`Reading ${company}'s ${latest.form} filed ${latest.filedAt}`);
  const [latestText, priorText] = await Promise.all([filingText(latest), filingText(prior)]);
  const latestSection = extractSection(latestText, latest.form);
  const priorSection = extractSection(priorText, prior.form);

  onProgress(`Comparing with the prior ${prior.form} from ${prior.filedAt}`);
  const answer = await generateJson({
    tag: "radar",
    system: SYSTEM,
    parts: [{ text: prompt(company, latest, prior, latestSection, priorSection) }],
    schema: SCHEMA,
    validate: parseProposed,
    temperature: 0.2,
    waveTimeoutMs: 30000,
    budgetMs: 50000,
  });

  onProgress("Checking every quote against the filings");
  const { kept, dropped } = verifyChanges(answer.value, latestText, priorText);
  const top = kept[0];
  return {
    ticker,
    company,
    filingType: latest.form,
    filedAt: latest.filedAt,
    priorFiledAt: prior.filedAt,
    url: latest.url,
    priorUrl: prior.url,
    section: latestSection.found ? latestSection.name : latest.form === "10-K" ? "Item 1A. Risk Factors" : "Risk factors and MD&A",
    severity: top?.severity ?? null,
    category: top?.category ?? "",
    title: top?.label ?? "No material risk changes",
    summary: top?.summary ?? `${company}'s latest ${latest.form} describes its risks the same way as the prior one.`,
    changes: kept.map(({ kind, label, prior, current, highlight }) => ({ kind, label, prior, current, highlight })),
    dropped,
    model: answer.model,
    checkedAt: new Date().toISOString(),
  };
}

export type RadarOutcome = { status: "ok"; filing: RadarFiling } | { status: "unsupported"; reason: string };

// The latest comparison for a ticker. Each (latest, prior) filing pair is diffed once; `fresh` re-checks SEC for a newer filing.
export async function radarFor(ticker: string, opts: { fresh?: boolean; onProgress?: (m: string) => void } = {}): Promise<RadarOutcome> {
  const onProgress = opts.onProgress ?? (() => {});
  onProgress("Finding the latest filings on SEC EDGAR");
  const company = await companyFor(ticker);
  if (!company) return { status: "unsupported", reason: "No SEC filer for this ticker (funds and most foreign companies don't file 10-Ks)." };
  if (opts.fresh) forget(`sec:filings:${company.cik}`);
  const pair = filingPair(await listFilings(company.cik));
  if (!pair) return { status: "unsupported", reason: "No two recent 10-K or 10-Q filings to compare." };
  const name = displayName(company.name);
  const filing = await memo(`radar:${ticker}:${pair.latest.accession}:${pair.prior.accession}`, WEEK, () =>
    diff(ticker, name, pair.latest, pair.prior, onProgress),
  );
  return { status: "ok", filing };
}

// Last comparison computed for a ticker without touching SEC or Gemini (for the IC Room and Ask).
export async function cachedRadarFor(ticker: string): Promise<RadarFiling | null> {
  const company = await companyFor(ticker).catch(() => null);
  if (!company) return null;
  const filings = peek<Filing[]>(`sec:filings:${company.cik}`);
  const pair = filings ? filingPair(filings) : null;
  if (!pair) return null;
  return peek<RadarFiling>(`radar:${ticker}:${pair.latest.accession}:${pair.prior.accession}`) ?? null;
}
