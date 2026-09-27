// Pure checks on Gemini's proposed filing changes. Nothing reaches the user unless its quotes are in the filings.
import type { RadarChange, Severity } from "@/data/radar";
import { normalizeForMatch } from "@/lib/sec";

export type ProposedChange = {
  kind: "new" | "changed" | "removed";
  label: string;
  summary: string;
  category: string;
  severity: Severity;
  latestExcerpt: string | null;
  priorExcerpt: string | null;
  keyPhrases: string[];
};

export type VerifiedChange = RadarChange & { summary: string; category: string; severity: Severity };

const MIN_EXCERPT = 25;
const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const KINDS = new Set(["new", "changed", "removed"]);
const SEVERITIES = new Set(["low", "medium", "high"]);

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Shape check for the model's JSON; throws so the Gemini race moves on to another answer.
export function parseProposed(value: unknown): ProposedChange[] {
  const list = (value as { changes?: unknown })?.changes;
  if (!Array.isArray(list)) throw new Error("no changes array");
  return list.map((c: Record<string, unknown>) => {
    if (!KINDS.has(c?.kind as string)) throw new Error("bad kind");
    if (!SEVERITIES.has(c?.severity as string)) throw new Error("bad severity");
    const label = str(c.label);
    if (!label) throw new Error("missing label");
    // Models may select numeric source quotes, but must not author new numeric claims.
    // The deterministic text-diff fallback is unaffected by this model-response guard.
    if (/\d/.test([label, str(c.summary), str(c.category)].join(" "))) throw new Error("generated numeric claim");
    return {
      kind: c.kind as ProposedChange["kind"],
      label,
      summary: str(c.summary),
      category: str(c.category),
      severity: c.severity as Severity,
      latestExcerpt: strOrNull(c.latest_excerpt),
      priorExcerpt: strOrNull(c.prior_excerpt),
      keyPhrases: Array.isArray(c.key_phrases) ? c.key_phrases.filter((p): p is string => typeof p === "string" && p.trim().length > 0) : [],
    };
  });
}

// A quote counts when it is in the filing ignoring only spacing, curly quotes, dash style and case.
export function appearsIn(excerpt: string, normalizedText: string) {
  const n = normalizeForMatch(excerpt.replace(/^["“]|["”]$/g, ""));
  return n.length >= MIN_EXCERPT && normalizedText.includes(n);
}

// Match tolerant formatting, but return ONLY the original source slice. The displayed quote
// must not inherit model-modified case, punctuation or whitespace, even when the match is valid.
export function sourceQuote(excerpt: string, text: string): string | null {
  const n = normalizeForMatch(excerpt.replace(/^["“]|["”]$/g, ""));
  if (n.length < MIN_EXCERPT || n.length > 4000) return null;
  const pattern = [...n].map(char => {
    if (char === " ") return "\\s+";
    if (char === "'") return "['‘’‛′]";
    if (char === '"') return '["“”‟″]';
    if (char === "-") return "[-‐‑‒–—−]";
    return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
  return new RegExp(pattern, "i").exec(text)?.[0] ?? null;
}

// Keeps only changes whose excerpts are verbatim in the right filing and whose kind the text supports:
// a "new" quote must be absent from the prior filing, a "removed" one absent from the latest.
export function verifyChanges(proposed: ProposedChange[], latestText: string, priorText: string) {
  const latest = normalizeForMatch(latestText);
  const prior = normalizeForMatch(priorText);
  const kept: VerifiedChange[] = [];
  for (const c of proposed) {
    const cur = c.latestExcerpt ? sourceQuote(c.latestExcerpt, latestText) : null;
    const old = c.priorExcerpt ? sourceQuote(c.priorExcerpt, priorText) : null;
    let ok = false;
    if (c.kind === "new") ok = !!cur && appearsIn(cur, latest) && !appearsIn(cur, prior);
    else if (c.kind === "removed") ok = !!old && appearsIn(old, prior) && !appearsIn(old, latest);
    else ok = !!cur && !!old && appearsIn(cur, latest) && appearsIn(old, prior) && normalizeForMatch(cur) !== normalizeForMatch(old);
    if (!ok) continue;
    const shown = c.kind === "removed" ? old! : cur!;
    kept.push({
      kind: c.kind,
      label: c.label,
      summary: c.summary,
      category: c.category,
      severity: c.severity,
      current: c.kind === "removed" ? "" : cur!,
      prior: c.kind === "new" ? undefined : old!,
      // Highlights must match the shown text exactly, or highlightPhrases can't mark them.
      highlight: c.keyPhrases.filter((p) => shown.includes(p)).slice(0, 3),
    });
  }
  kept.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return { kept, dropped: proposed.length - kept.length };
}
