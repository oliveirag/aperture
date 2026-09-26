// Server-only: asks Gemini to explain the deterministic diff. Gemini picks and labels the material changes and quotes
// them; every quote is checked against the filing text and anything that isn't verbatim is dropped.
import type { Severity } from "@/data/radar";
import { generateJson } from "@/lib/gemini-json";
import { containsVerbatim, type Candidate } from "./diff";

const MAX_TEXT = 1600; // per paragraph in the prompt
const MAX_CHANGES = 5;

export type ExplainedChange = {
  kind: Candidate["kind"];
  label: string;
  severity: Severity;
  excerpt: string; // verbatim from the filing
  prior?: string; // verbatim prior paragraph for "changed"
  highlight: string[]; // verbatim phrases inside excerpt
};

export type Explanation = { title: string; summary: string; category: string; severity: Severity; changes: ExplainedChange[] };

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    category: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          excerpt: { type: "string" },
          highlight: { type: "string" },
        },
        required: ["id", "label", "severity", "excerpt", "highlight"],
      },
    },
  },
  required: ["title", "summary", "category", "changes"],
};

const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

function prompt(company: string, filedAt: string, priorFiledAt: string, candidates: Candidate[]) {
  const blocks = candidates
    .map((c) =>
      c.kind === "changed"
        ? `[${c.id}] CHANGED\nPRIOR: ${clip(c.prior ?? "")}\nLATEST: ${clip(c.current)}`
        : c.kind === "new"
          ? `[${c.id}] NEW (not in prior filing)\nLATEST: ${clip(c.current)}`
          : `[${c.id}] REMOVED (in prior filing, gone from latest)\nPRIOR: ${clip(c.current)}`,
    )
    .join("\n\n");
  return `You are helping a retail investor understand what changed in ${company}'s Risk Factors (Item 1A) between its 10-K filed ${priorFiledAt} and its 10-K filed ${filedAt}.

Below are paragraphs a text diff flagged as new, changed or removed. Many are routine rewording. Pick at most ${MAX_CHANGES} that matter most to an investor (new risks, broadened or escalated risks, meaningful removals). Skip boilerplate and cosmetic edits. If none matter, return an empty changes array.

For each pick return:
- id: the candidate id, e.g. "C3".
- label: what changed, at most 9 words, plain English (e.g. "Export restrictions now cover more products and regions").
- severity: high (could plausibly move revenue, margins or the business), medium, or low.
- excerpt: one to three consecutive sentences copied EXACTLY, character for character, from the LATEST text (from PRIOR for REMOVED items). Do not paraphrase, fix typos or join separate passages.
- highlight: a short phrase (3-8 words) copied exactly from your excerpt that captures the change.

Also return:
- title: one line naming the most important change (at most 12 words).
- summary: two plain-English sentences on what changed and why it matters. No buy/sell advice.
- category: "Area · Topic", e.g. "Regulatory · Export controls" or "Operations · Data centers".

Candidates:

${blocks}`;
}

export async function explainChanges(company: string, filedAt: string, priorFiledAt: string, candidates: Candidate[]) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return generateJson<Explanation>({
    label: `radar:${company}`,
    parts: [{ text: prompt(company, filedAt, priorFiledAt, candidates) }],
    schema: SCHEMA,
    validate: (raw) => {
      const r = raw as { title?: string; summary?: string; category?: string; changes?: { id: string; label: string; severity: Severity; excerpt: string; highlight: string }[] };
      const changes: ExplainedChange[] = [];
      for (const ch of r.changes ?? []) {
        const c = byId.get(ch.id);
        if (!c || !RANK[ch.severity]) continue;
        // The quote must really be in the filing text the diff produced; otherwise the item is dropped.
        if (!containsVerbatim(c.current, ch.excerpt)) continue;
        const highlight = ch.highlight && containsVerbatim(ch.excerpt, ch.highlight) ? [ch.highlight.trim()] : [];
        changes.push({ kind: c.kind, label: ch.label.trim(), severity: ch.severity, excerpt: ch.excerpt.trim(), prior: c.kind === "changed" ? c.prior : undefined, highlight });
        if (changes.length === MAX_CHANGES) break;
      }
      if ((r.changes?.length ?? 0) > 0 && changes.length === 0) throw new Error("no quoted excerpt matched the filing");
      changes.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
      const severity: Severity = changes[0]?.severity ?? "low";
      return { title: (r.title ?? "").trim(), summary: (r.summary ?? "").trim(), category: (r.category ?? "").trim(), severity, changes };
    },
  });
}
