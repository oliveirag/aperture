// Deterministic paragraph diff of two Risk Factors sections. No LLM: this decides what changed; Gemini only explains it.
// Thresholds were calibrated on AAPL, NVDA, MSFT, KO and BXP 10-K pairs (Dice similarity of word bigrams):
// genuinely new risks score < 0.3, edited paragraphs 0.4-0.9, wording/date churn >= 0.93.

export type Candidate = {
  id: string;
  kind: "new" | "changed" | "removed";
  // Verbatim filing text: the latest paragraph (new, changed) or the dropped one (removed).
  current: string;
  // Verbatim prior paragraph for "changed".
  prior?: string;
  // How much the text moved (0..1, scaled by length); used to rank.
  weight: number;
};

const MIN_PARAGRAPH = 60;
const NEW_BELOW = 0.35;
const TRIVIAL_ABOVE = 0.93;
const MAX_CANDIDATES = 24;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Every 10-K rolls its dates forward ("As of December 31, 2025"); a paragraph that differs only in years is unchanged.
const withoutYears = (s: string) => norm(s).replace(/\b(19|20)\d{2}\b/g, "yyyy");

// Page furniture that survives HTML-to-text: running headers, page numbers, "Table of Contents".
const NOISE = /^(table of contents|\d{1,3}|page \d+)$/i;

// Lines of the section as paragraphs. A line starting lowercase continues the previous one (a page break split it).
export function paragraphs(section: string): string[] {
  const out: string[] = [];
  for (const raw of section.split("\n")) {
    const line = raw.trim();
    if (!line || NOISE.test(line)) continue;
    if (out.length && /^[a-z]/.test(line)) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out.filter((p) => p.length >= MIN_PARAGRAPH);
}

function bigrams(s: string): Set<string> {
  const w = norm(s).split(" ");
  const out = new Set<string>();
  for (let i = 0; i + 1 < w.length; i++) out.add(`${w[i]} ${w[i + 1]}`);
  return out;
}

function dice(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size || 1);
}

const lengthFactor = (s: string) => Math.min(1, s.length / 500);

export function diffSections(prior: string, latest: string): Candidate[] {
  const before = paragraphs(prior);
  const after = paragraphs(latest);
  const beforeSet = new Set(before.map(withoutYears));
  const afterSet = new Set(after.map(withoutYears));

  const oldLeft = before.filter((p) => !afterSet.has(withoutYears(p))).map((text) => ({ text, grams: bigrams(text), best: 0 }));
  const out: Candidate[] = [];

  for (const text of after) {
    if (beforeSet.has(withoutYears(text))) continue;
    const grams = bigrams(text);
    let score = 0;
    let match: (typeof oldLeft)[number] | null = null;
    for (const o of oldLeft) {
      const s = dice(grams, o.grams);
      o.best = Math.max(o.best, s);
      if (s > score) {
        score = s;
        match = o;
      }
    }
    if (score < NEW_BELOW || !match) out.push({ id: "", kind: "new", current: text, weight: lengthFactor(text) });
    else if (score < TRIVIAL_ABOVE) out.push({ id: "", kind: "changed", current: text, prior: match.text, weight: (1 - score) * lengthFactor(text) });
  }

  // A prior paragraph that nothing in the latest filing resembles was dropped.
  for (const o of oldLeft) {
    if (o.best < NEW_BELOW) out.push({ id: "", kind: "removed", current: o.text, weight: 0.8 * lengthFactor(o.text) });
  }

  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_CANDIDATES)
    .map((c, i) => ({ ...c, id: `C${i + 1}` }));
}

// Whitespace- and quote-insensitive text, for checking that a quoted excerpt really is in the filing.
export const looseText = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export const containsVerbatim = (haystack: string, needle: string) =>
  needle.trim().length >= 12 && looseText(haystack).includes(looseText(needle));
