// Pure, model-free Filing Radar comparison. Splits both risk sections into sentences, keeps sentences that
// appear in only one filing, pairs near-identical ones as rewordings, and groups them under the filing's own
// risk-factor heading. Every excerpt is copied from the filing text, so it passes the same quote verification
// as a model's answer. Used when Gemini is unavailable, so Radar never depends on model quota.
import type { Severity } from "@/data/radar";
import { normalizeForMatch } from "@/lib/sec";
import type { ProposedChange } from "./verify";

const MIN_SENTENCE = 60;
const MAX_SENTENCE = 700;
const MAX_HEADING = 400;
const MIN_BODY = 250;
const PAIR_SIMILARITY = 0.55;

type Topic = { category: string; weight: 2 | 1; terms: RegExp };

// Ordered by specificity: the first topic a sentence matches names its category.
const TOPICS: Topic[] = [
  { category: "Regulatory · Export controls", weight: 2, terms: /\b(export controls?|export licen[cs]es?|entity list|BIS\b|Bureau of Industry and Security)/i },
  { category: "Trade · Tariffs", weight: 2, terms: /\b(tariffs?|trade (war|restrictions?|polic(y|ies))|retaliatory|customs duties)/i },
  { category: "Geopolitics · Sanctions", weight: 2, terms: /\b(sanctions?|embargo(es)?|OFAC)\b/i },
  { category: "Geopolitics · Taiwan and China", weight: 2, terms: /\b(Taiwan|China|Chinese|PRC|Hong Kong)\b/i },
  { category: "Geopolitics · Conflict", weight: 2, terms: /\b(war|armed conflict|military|hostilities|Israel|Ukraine|Russia|Middle East|Strait of Hormuz)\b/i },
  { category: "Security · Cyber", weight: 2, terms: /\b(cyber[- ]?(security|attacks?|incidents?)|ransomware|data breach(es)?|unauthori[sz]ed access)/i },
  { category: "Legal · Investigations", weight: 2, terms: /\b(subpoenas?|investigations?|Department of Justice|DOJ|FTC|consent decree|antitrust|competition authorit)/i },
  { category: "Financial · Liquidity", weight: 2, terms: /\b(going concern|liquidity|covenants?|refinanc\w*|credit rating|downgrade|default)\b/i },
  { category: "Financial · Impairment", weight: 2, terms: /\b(impairments?|write[- ]?downs?|restatement|material weakness)\b/i },
  { category: "Technology · AI", weight: 1, terms: /\b(artificial intelligence|AI|generative|large language models?|machine learning)\b/ },
  { category: "Operations · Supply chain", weight: 1, terms: /\b(supply chain|suppliers?|foundr(y|ies)|manufactur\w*|shortages?|capacity constraints?|sole[- ]source)/i },
  { category: "Customers · Concentration", weight: 1, terms: /\b(customer concentration|significant customers?|largest customers?|hyperscalers?|data cent(er|re)s?)/i },
  { category: "Regulatory · Policy", weight: 1, terms: /\b(regulat\w+|legislation|government polic(y|ies)|executive orders?|privacy laws?)/i },
  { category: "Legal · Litigation", weight: 1, terms: /\b(litigation|lawsuits?|class actions?|patent infringement|claims against)/i },
  { category: "Macro · Rates and inflation", weight: 1, terms: /\b(interest rates?|inflation|recession|macroeconomic|foreign (currency|exchange))/i },
  { category: "Climate · Environment", weight: 1, terms: /\b(climate|emissions|environmental)\b/i },
  { category: "Workforce · Talent", weight: 1, terms: /\b(key personnel|employees|talent|immigration)\b/i },
];

type Sentence = { text: string; key: string; loose: string; heading: string; headingKey: string; words: Set<string> };

// Abbreviations whose trailing period does not end a sentence.
const ABBREV = /\b(?:U\.S|U\.K|E\.U|Inc|Corp|Co|Ltd|No|Nos|vs|e\.g|i\.e|etc|Mr|Ms|Dr|St|Jr|Sr|approx|Fig|[A-Z])\.$/;

function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  let start = 0;
  const re = /[.!?]["”)]?\s+(?=["“(]?[A-Z0-9])/g;
  for (let m = re.exec(paragraph); m; m = re.exec(paragraph)) {
    const end = m.index + m[0].trimEnd().length;
    if (ABBREV.test(paragraph.slice(Math.max(start, end - 12), end))) continue;
    out.push(paragraph.slice(start, end).trim());
    start = m.index + m[0].length;
  }
  const rest = paragraph.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

// Years, day numbers and month names change every filing; a sentence that differs only in those is not a new risk.
function looseKey(key: string) {
  return key
    .replace(/\b(19|20)\d{2}\b/g, "#y")
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)( \d{1,2},?)?/g, "#m")
    .replace(/\bfiscal (year )?#y\b/g, "#f");
}

function wordsOf(key: string) {
  return new Set(key.match(/[a-z][a-z'-]{2,}/g) ?? []);
}

// Words that only move a sentence in time ("During the third quarter of fiscal year 2023" -> "In August 2022").
const TIME_WORDS = /^(january|february|march|april|may|june|july|august|september|october|november|december|first|second|third|fourth|quarter|quarters|fiscal|year|years|during|the|and|end|ended|ending|month|months|recently|currently|since|beginning|early|late|last|past)$/;

// True when two sentences differ only in dates, numbers or time words.
function onlyTimeChanged(a: Set<string>, b: Set<string>) {
  for (const w of a) if (!b.has(w) && !TIME_WORDS.test(w)) return false;
  for (const w of b) if (!a.has(w) && !TIME_WORDS.test(w)) return false;
  return true;
}

function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

// A heading is a short line directly followed by a long paragraph; risk factors are written that way in 10-Ks and 10-Qs.
function isHeading(line: string, next: string | undefined) {
  if (!next || line.length < 25 || line.length > MAX_HEADING || next.length < MIN_BODY) return false;
  if (/^(item\s+\d|part\s+[iv]+|table of contents)/i.test(line) || !/^["“]?[A-Z]/.test(line)) return false;
  return /[a-z]/.test(line) && next.length > line.length * 1.5;
}

export function sentencesOf(section: string): Sentence[] {
  const lines = section.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: Sentence[] = [];
  let heading = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeading(line, lines[i + 1])) {
      heading = line;
      continue;
    }
    for (const text of splitSentences(line)) {
      if (text.length < MIN_SENTENCE || text.length > MAX_SENTENCE) continue;
      // Tables and page furniture: mostly digits, or no lowercase words.
      if ((text.match(/\d/g)?.length ?? 0) > text.length * 0.25 || !/[a-z]{3,}/.test(text)) continue;
      const key = normalizeForMatch(text);
      out.push({ text, key, loose: looseKey(key), heading, headingKey: normalizeForMatch(heading), words: wordsOf(key) });
    }
  }
  return out;
}

function topicOf(text: string) {
  return TOPICS.find((t) => t.terms.test(text)) ?? null;
}

// Phrases to highlight: the topic terms as they are written in the shown excerpt.
function phrasesIn(text: string) {
  const found: string[] = [];
  for (const t of TOPICS) {
    const m = text.match(new RegExp(t.terms.source, t.terms.flags.replace("g", "")));
    if (m && !found.some((f) => f.toLowerCase() === m[0].toLowerCase())) found.push(m[0]);
    if (found.length === 3) break;
  }
  return found;
}

type Group = {
  heading: string;
  newHeading: boolean;
  added: Sentence[];
  removed: Sentence[];
  pairs: { prior: Sentence; latest: Sentence }[];
};

// How much changed under a heading: each sentence counts, topical ones more, and a whole new risk factor more again.
function scoreOf(g: Group) {
  const texts = [...g.added, ...g.pairs.map((p) => p.latest), ...g.removed].map((s) => s.text);
  const topical = texts.reduce((sum, t) => sum + (topicOf(t)?.weight ?? 0), 0);
  return texts.length + topical + (g.newHeading ? 4 : 0) + (topicOf(g.heading)?.weight ?? 0) * 2;
}

// Calibrated on 2025–26 10-Ks of 14 large issuers: their biggest change scores 15–150, a typical one under 20.
export const SEVERITY_SCORE = { high: 40, medium: 15 };

// "high" needs both a large change and a topic that can hit revenue, liquidity or the licence to operate.
function severityOf(g: Group, score: number): Severity {
  const heavy = [g.heading, ...g.added.map((s) => s.text), ...g.pairs.map((p) => p.latest.text), ...g.removed.map((s) => s.text)].some((t) => topicOf(t)?.weight === 2);
  if (score >= SEVERITY_SCORE.high && heavy) return "high";
  return score >= SEVERITY_SCORE.medium ? "medium" : "low";
}

const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function label(g: Group, kind: ProposedChange["kind"]) {
  const heading = g.heading.replace(/\s+/g, " ").replace(/[.:]$/, "");
  const short = heading.split(" ").length > 12 ? `${heading.split(" ").slice(0, 12).join(" ")}…` : heading;
  if (short) return short;
  return kind === "new" ? "New risk-factor language" : kind === "removed" ? "Risk-factor language removed" : "Risk-factor wording changed";
}

export type TextDiffContext = { form: string; filedAt: string; priorFiledAt: string };

// Proposed changes built only from sentences present in the filings. Caller still runs verifyChanges on them.
export function textDiff(latestSection: string, priorSection: string, ctx: TextDiffContext, max = 6): ProposedChange[] {
  const latest = sentencesOf(latestSection);
  const prior = sentencesOf(priorSection);
  const priorKeys = new Set(prior.map((s) => s.key));
  const latestKeys = new Set(latest.map((s) => s.key));
  const priorLoose = new Set(prior.map((s) => s.loose));
  const latestLoose = new Set(latest.map((s) => s.loose));
  const latestHeadings = new Map(latest.map((s) => [s.headingKey, s.heading]));
  const priorHeadings = new Map(prior.map((s) => [s.headingKey, s.heading]));
  // A heading reworded between filings ("tariffs" -> "import tariffs") is the same risk factor.
  const renamed = new Map<string, string>();
  for (const [key] of priorHeadings) {
    if (!key || latestHeadings.has(key)) continue;
    const words = wordsOf(key);
    let best = "";
    let bestScore = 0.6;
    for (const [latestKey] of latestHeadings) {
      if (!latestKey || priorHeadings.has(latestKey)) continue;
      const score = similarity(words, wordsOf(latestKey));
      if (score > bestScore) [best, bestScore] = [latestKey, score];
    }
    if (best) renamed.set(key, best);
  }
  const renamedTo = new Set(renamed.values());

  // Only-in-one-filing sentences, ignoring ones that differ just by a year or date.
  const added = latest.filter((s) => !priorKeys.has(s.key) && !priorLoose.has(s.loose));
  const removed = prior.filter((s) => !latestKeys.has(s.key) && !latestLoose.has(s.loose));

  const groups = new Map<string, Group>();
  const groupFor = (s: Sentence, side: "latest" | "prior") => {
    const headingKey = side === "prior" ? (renamed.get(s.headingKey) ?? s.headingKey) : s.headingKey;
    const id = `${side === "prior" && !latestHeadings.has(headingKey) ? "gone:" : ""}${headingKey}`;
    let g = groups.get(id);
    if (!g) {
      const heading = latestHeadings.get(headingKey) ?? s.heading;
      const newHeading = !!headingKey && latestHeadings.has(headingKey) && !priorHeadings.has(headingKey) && !renamedTo.has(headingKey);
      g = { heading, newHeading, added: [], removed: [], pairs: [] };
      groups.set(id, g);
    }
    return g;
  };

  const usedPrior = new Set<Sentence>();
  for (const s of added) {
    let best: Sentence | null = null;
    let bestScore = PAIR_SIMILARITY;
    for (const r of removed) {
      if (usedPrior.has(r)) continue;
      const score = similarity(s.words, r.words) + ((renamed.get(r.headingKey) ?? r.headingKey) === s.headingKey ? 0.05 : 0);
      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
    }
    if (best && onlyTimeChanged(s.words, best.words)) {
      usedPrior.add(best);
      continue;
    }
    const g = groupFor(s, "latest");
    if (best) {
      usedPrior.add(best);
      g.pairs.push({ prior: best, latest: s });
    } else g.added.push(s);
  }
  for (const r of removed) if (!usedPrior.has(r)) groupFor(r, "prior").removed.push(r);

  const out: { change: ProposedChange; size: number }[] = [];
  for (const g of groups.values()) {
    if (!g.added.length && !g.pairs.length && !g.removed.length) continue;
    const size = scoreOf(g);
    const severity = severityOf(g, size);
    // The excerpt shown is the most topical sentence, then the longest; a whole new risk factor shows its first new sentence.
    const pick = <T extends { text: string }>(list: T[]) =>
      [...list].sort((a, b) => (topicOf(b.text)?.weight ?? 0) - (topicOf(a.text)?.weight ?? 0) || b.text.length - a.text.length)[0];
    const counts = [g.added.length && `${g.added.length} new`, g.pairs.length && `${g.pairs.length} reworded`, g.removed.length && `${g.removed.length} removed`]
      .filter(Boolean)
      .join(", ");
    const span = `${ctx.form} filed ${ctx.filedAt} vs ${ctx.priorFiledAt}`;
    let change: ProposedChange;
    if (g.added.length && (g.newHeading || g.added.length >= g.pairs.length)) {
      const s = g.newHeading ? g.added[0] : pick(g.added);
      change = {
        kind: "new", severity, label: label(g, "new"), latestExcerpt: s.text, priorExcerpt: null, keyPhrases: phrasesIn(s.text),
        category: (topicOf(g.heading) ?? topicOf(s.text))?.category ?? "Risk factors · Other",
        summary: `${g.newHeading ? "A risk factor that does not appear in the prior filing" : "Sentences added under this risk factor"} (${counts}; ${span}). Excerpt copied from the latest filing.`,
      };
    } else if (g.pairs.length) {
      const p = g.pairs.reduce((a, b) => ((topicOf(b.latest.text)?.weight ?? 0) > (topicOf(a.latest.text)?.weight ?? 0) ? b : a));
      change = {
        kind: "changed", severity, label: label(g, "changed"), latestExcerpt: p.latest.text, priorExcerpt: p.prior.text, keyPhrases: phrasesIn(p.latest.text),
        category: (topicOf(g.heading) ?? topicOf(p.latest.text))?.category ?? "Risk factors · Other",
        summary: `Wording of this risk factor changed (${counts}; ${span}). Both excerpts are copied from the filings.`,
      };
    } else {
      const s = pick(g.removed);
      change = {
        kind: "removed", severity, label: label(g, "removed"), latestExcerpt: null, priorExcerpt: s.text, keyPhrases: phrasesIn(s.text),
        category: (topicOf(g.heading) ?? topicOf(s.text))?.category ?? "Risk factors · Other",
        summary: `Language in the prior filing that no longer appears (${counts}; ${span}). Excerpt copied from the prior filing.`,
      };
    }
    out.push({ change, size });
  }

  // The same sentence can sit under two headings; show it once, under the bigger change.
  const shown = new Set<string>();
  return out
    .sort((a, b) => RANK[a.change.severity] - RANK[b.change.severity] || b.size - a.size)
    .map((o) => o.change)
    .filter((c) => {
      const key = normalizeForMatch(c.latestExcerpt ?? c.priorExcerpt ?? "");
      if (shown.has(key)) return false;
      shown.add(key);
      return true;
    })
    .slice(0, max);
}
