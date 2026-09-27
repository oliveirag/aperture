// Server-only: the real Filing Radar. Finds a company's latest filing and the prior one of the same form, cuts out
// the risk sections, asks Gemini what changed, and keeps only changes whose quotes are verbatim in the filings.
// When Gemini is out of quota or fails, a sentence-level text comparison of the same sections takes over, so a
// working SEC connection is all Radar needs.
import { forgetKeys, memo, recall } from "@/lib/cache";
import { geminiAvailable, generateJson } from "@/lib/gemini";
import { companyFor, displayName, extractSection, filingPair, filingText, listFilings, type Filing, type Section } from "@/lib/sec";
import { textDiff } from "./text-diff";
import { track } from "./tracked";
import type { RadarFiling } from "./types";
import { parseProposed, verifyChanges } from "./verify";

const WEEK = 7 * 24 * 60 * 60 * 1000;
// A text comparison is final for its filing pair, but Gemini is retried after this long for a richer summary.
const TEXT_TTL = 6 * 60 * 60 * 1000;
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

type Texts = { latestText: string; priorText: string; latestSection: Section; priorSection: Section };

async function readPair(company: string, latest: Filing, prior: Filing, onProgress: (m: string) => void): Promise<Texts> {
  onProgress(`Reading ${company}'s ${latest.form} filed ${latest.filedAt}`);
  const [latestText, priorText] = await Promise.all([filingText(latest), filingText(prior)]);
  return { latestText, priorText, latestSection: extractSection(latestText, latest.form), priorSection: extractSection(priorText, prior.form) };
}

async function modelChanges(company: string, latest: Filing, prior: Filing, t: Texts, onProgress: (m: string) => void) {
  onProgress(`Comparing with the prior ${prior.form} from ${prior.filedAt}`);
  const answer = await generateJson({
    tag: "radar",
    system: SYSTEM,
    parts: [{ text: prompt(company, latest, prior, t.latestSection, t.priorSection) }],
    schema: SCHEMA,
    validate: parseProposed,
    temperature: 0.2,
    waveTimeoutMs: 30000,
    budgetMs: 50000,
  });
  return { proposed: answer.value, model: answer.model, method: "model" as const };
}

function textChanges(latest: Filing, prior: Filing, t: Texts, onProgress: (m: string) => void) {
  onProgress(`Comparing every risk-factor sentence with the prior ${prior.form} from ${prior.filedAt}`);
  const proposed = textDiff(t.latestSection.text, t.priorSection.text, { form: latest.form, filedAt: latest.filedAt, priorFiledAt: prior.filedAt }, MAX_CHANGES);
  return { proposed, model: "Sentence comparison", method: "text" as const };
}

function toFiling(ticker: string, company: string, latest: Filing, prior: Filing, t: Texts, found: Awaited<ReturnType<typeof modelChanges>> | ReturnType<typeof textChanges>, onProgress: (m: string) => void): RadarFiling {
  onProgress("Checking every quote against the filings");
  const { kept, dropped } = verifyChanges(found.proposed, t.latestText, t.priorText);
  const top = kept[0];
  return {
    ticker,
    company,
    filingType: latest.form,
    filedAt: latest.filedAt,
    priorFiledAt: prior.filedAt,
    url: latest.url,
    priorUrl: prior.url,
    section: t.latestSection.found ? t.latestSection.name : latest.form === "10-K" ? "Item 1A. Risk Factors" : "Risk factors and MD&A",
    severity: top?.severity ?? null,
    category: top?.category ?? "",
    title: top?.label ?? (dropped ? "Could not verify the proposed changes" : "No verified material changes found"),
    summary: top?.summary ?? (dropped ? `${dropped} proposed changes failed quote verification. Read the filings before drawing a conclusion.` : `The comparison found no verified material changes in the text reviewed. This does not establish that the filings are identical.`),
    changes: kept.map(({ kind, label, prior, current, highlight }) => ({ kind, label, prior, current, highlight })),
    dropped,
    model: found.model,
    method: found.method,
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
  if (opts.fresh) forgetKeys([`sec:filings:${company.cik}`]);
  const pair = filingPair(await listFilings(company.cik));
  if (!pair) return { status: "unsupported", reason: "No two recent 10-K or 10-Q filings to compare." };
  const name = displayName(company.name);
  const { latest, prior } = pair;
  const id = `${ticker}:${latest.accession}:${prior.accession}`;
  const cachedModel = await recall<RadarFiling>(`radar:${id}`);
  if (cachedModel) {
    track(ticker);
    return { status: "ok", filing: cachedModel };
  }
  // SEC errors propagate: without both filings there is nothing honest to show.
  const texts = await readPair(name, latest, prior, onProgress);
  let filing: RadarFiling | null = null;
  if (geminiAvailable()) {
    try {
      filing = await memo(`radar:${id}`, WEEK, async () => toFiling(ticker, name, latest, prior, texts, await modelChanges(name, latest, prior, texts, onProgress), onProgress), { persist: true });
    } catch (err) {
      console.error(`[radar] ${ticker}: Gemini comparison unavailable, using sentence comparison:`, err instanceof Error ? err.message.slice(0, 120) : "unknown");
    }
  }
  filing ??= await memo(`radar-text:${id}`, TEXT_TTL, async () => toFiling(ticker, name, latest, prior, texts, textChanges(latest, prior, texts, onProgress), onProgress), { persist: true });
  track(ticker);
  return { status: "ok", filing };
}

// Last comparison computed for a ticker without touching SEC or Gemini (for the IC Room and Ask).
export async function cachedRadarFor(ticker: string): Promise<RadarFiling | null> {
  const company = await companyFor(ticker).catch(() => null);
  if (!company) return null;
  const filings = await recall<Filing[]>(`sec:filings:${company.cik}`);
  const pair = filings ? filingPair(filings) : null;
  if (!pair) return null;
  const id = `${ticker}:${pair.latest.accession}:${pair.prior.accession}`;
  return (await recall<RadarFiling>(`radar:${id}`)) ?? (await recall<RadarFiling>(`radar-text:${id}`)) ?? null;
}
