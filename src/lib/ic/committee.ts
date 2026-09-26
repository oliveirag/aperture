// Server-only: the committee. Bull, bear and an assumptions analyst read the fact pack; the chair writes the memo.
// Every point must cite fact ids from the pack; points citing anything else are dropped here, not in the UI.
import type { Assumption, FitRow, IcLevel, MemoPoint } from "@/data/ic-room";
import { formatPct, formatUSD } from "@/lib/format";
import { generateJson } from "@/lib/gemini";
import type { Fact } from "./facts";
import { STANCES, type IcMemo } from "./types";

export const FIT_REF = "FIT";

const SYSTEM =
  "You are part of an investment committee that helps retail investors research an idea before acting. " +
  "Use only the numbered facts you are given and cite them by id (F1, F2, ... or FIT for the portfolio-fit table). " +
  "Never say buy, sell, hold or give a price target, and never tell the reader what to do with their money. " +
  "Write in plain English, short sentences, no hype.";

// Advice phrasing that must never reach the user, whatever the prompt said.
const ADVICE = /\b(you|investors?|we|i)\s+(should|must|ought to)\s+(buy|sell|short|purchase|dump|load up)\b|\b(strong\s+)?(buy|sell|hold)\s+(rating|recommendation|signal)\b|\brecommend(s|ed|ing)?\s+(buying|selling|shorting)\b|\bprice target\b/i;
export const isAdvice = (text: string) => ADVICE.test(text);

export type Context = { ticker: string; name: string; thesis: string; amount: number; facts: Fact[]; fit: FitRow[] };

function factList(facts: Fact[]) {
  return facts.map((f) => `[${f.id}] ${f.title}${f.section ? `, ${f.section}` : ""} (${f.docType}, ${f.date}): ${f.content}`).join("\n\n");
}

function fitList(fit: FitRow[]) {
  const show = (r: FitRow, n: number) => (r.kind === "usd" ? formatUSD(n) : formatPct(n));
  return fit.map((r) => `- ${r.label}: ${show(r, r.before)} before, ${show(r, r.after)} after`).join("\n");
}

function brief(c: Context) {
  return [
    `Idea under review: ${c.name} (${c.ticker}), a hypothetical ${formatUSD(c.amount)} position.`,
    `Thesis: ${c.thesis}`,
    `Facts:\n${factList(c.facts)}`,
    `[FIT] Portfolio fit, computed from the reader's own portfolio with and without the position:\n${fitList(c.fit)}`,
  ].join("\n\n");
}

const REFS = { type: "array", items: { type: "string" }, description: "Fact ids this point relies on, e.g. [\"F2\", \"F5\"] or [\"FIT\"]." };
const POINTS = {
  type: "array",
  minItems: 2,
  maxItems: 4,
  items: { type: "object", properties: { text: { type: "string", description: "One sentence, at most 25 words." }, refs: REFS }, required: ["text", "refs"] },
};

// Keeps refs that exist; drops points left with none, or that read as advice.
export function cleanPoints(raw: unknown, valid: Set<string>): MemoPoint[] {
  if (!Array.isArray(raw)) throw new Error("points not an array");
  const out: MemoPoint[] = [];
  for (const p of raw as { text?: unknown; refs?: unknown }[]) {
    const text = typeof p?.text === "string" ? p.text.trim() : "";
    const refs = Array.isArray(p?.refs) ? [...new Set(p.refs.filter((r): r is string => typeof r === "string").map((r) => r.trim().toUpperCase()))] : [];
    if (!text || isAdvice(text) || refs.length === 0 || !refs.every((r) => valid.has(r))) continue;
    out.push({ text, refs });
  }
  return out;
}

const validIds = (facts: Fact[]) => new Set([...facts.map((f) => f.id), FIT_REF]);

function statement(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || isAdvice(s)) throw new Error("bad statement");
  return s;
}

export type Side = { statement: string; points: MemoPoint[] };

export function argue(side: "bull" | "bear", c: Context): Promise<Side> {
  const valid = validIds(c.facts);
  const role =
    side === "bull"
      ? "You are the bull analyst. Make the strongest honest case that the thesis is right."
      : "You are the bear analyst. Make the strongest honest case that the thesis is wrong or that the position is a poor fit for this portfolio. Use [FIT] when the portfolio numbers matter.";
  return generateJson({
    tag: `ic-${side}`,
    system: SYSTEM,
    parts: [{ text: `${role}\n\n${brief(c)}\n\nReturn a spoken statement of 2 to 3 sentences (at most 70 words) and 3 memo points, each citing fact ids.` }],
    schema: {
      type: "object",
      properties: { statement: { type: "string" }, points: POINTS },
      required: ["statement", "points"],
    },
    validate: (v) => {
      const o = v as { statement?: unknown; points?: unknown };
      const points = cleanPoints(o.points, valid);
      if (points.length === 0) throw new Error("no cited points");
      return { statement: statement(o.statement), points };
    },
    temperature: 0.4,
    waveTimeoutMs: 15000,
    budgetMs: 25000,
  }).then((a) => a.value);
}

const STATUSES = new Set(["supported", "contested", "unresolved"]);

export function testAssumptions(c: Context): Promise<Assumption[]> {
  const valid = validIds(c.facts);
  const line = { type: "object", properties: { text: { type: "string" }, fact_id: { type: "string" } }, required: ["text", "fact_id"] };
  return generateJson({
    tag: "ic-assumptions",
    system: SYSTEM,
    parts: [
      {
        text:
          `${brief(c)}\n\nList the 3 or 4 things that would have to be true for the thesis to work. For each, give evidence for and against from the facts ` +
          "(one short sentence each, citing one fact id), and a status: supported (evidence for clearly outweighs), contested (real evidence both ways), or unresolved (the facts don't settle it).",
      },
    ],
    schema: {
      type: "object",
      properties: {
        assumptions: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "At most 15 words." },
              status: { type: "string", enum: ["supported", "contested", "unresolved"] },
              for: { type: "array", items: line },
              against: { type: "array", items: line },
            },
            required: ["text", "status", "for", "against"],
          },
        },
      },
      required: ["assumptions"],
    },
    validate: (v) => {
      const list = (v as { assumptions?: unknown }).assumptions;
      if (!Array.isArray(list)) throw new Error("no assumptions");
      const lines = (raw: unknown) =>
        (Array.isArray(raw) ? raw : [])
          .map((l: { text?: unknown; fact_id?: unknown }) => ({ text: typeof l?.text === "string" ? l.text.trim() : "", factId: String(l?.fact_id ?? "").trim().toUpperCase() }))
          .filter((l) => l.text && valid.has(l.factId) && !isAdvice(l.text))
          .slice(0, 2);
      const out: Assumption[] = list
        .map((a: { text?: unknown; status?: unknown; for?: unknown; against?: unknown }, i: number) => ({
          id: `A${i + 1}`,
          text: typeof a?.text === "string" ? a.text.trim() : "",
          status: (STATUSES.has(a?.status as string) ? a.status : "unresolved") as Assumption["status"],
          for: lines(a?.for),
          against: lines(a?.against),
        }))
        .filter((a) => a.text && a.for.length + a.against.length > 0)
        .map((a, i) => ({ ...a, id: `A${i + 1}` }));
      if (out.length === 0) throw new Error("no cited assumptions");
      return out;
    },
    temperature: 0.3,
    waveTimeoutMs: 15000,
    budgetMs: 25000,
  }).then((a) => a.value);
}

const LEVELS: IcLevel[] = ["beginner", "intermediate", "advanced"];

export function chair(c: Context, bull: Side, bear: Side, assumptions: Assumption[]): Promise<Omit<IcMemo, "bull" | "bear">> {
  const debate = [
    `Bull: ${bull.statement}\n${bull.points.map((p) => `- ${p.text} [${p.refs.join(", ")}]`).join("\n")}`,
    `Bear: ${bear.statement}\n${bear.points.map((p) => `- ${p.text} [${p.refs.join(", ")}]`).join("\n")}`,
    `What must be true:\n${assumptions.map((a) => `- ${a.text} (${a.status})`).join("\n")}`,
  ].join("\n\n");
  return generateJson({
    tag: "ic-chair",
    system: SYSTEM,
    parts: [
      {
        text:
          `You are the chair. Weigh the debate and write the memo.\n\n${brief(c)}\n\n${debate}\n\n` +
          `Stance must be one of: ${STANCES.join(", ")}. Write the summary three times: for a beginner (no jargon, 2 sentences), ` +
          "an intermediate investor (2 to 3 sentences), and an advanced one (dense, cite assumption ids and the fit numbers). " +
          "The chair note is one or two sentences on portfolio fit, using the FIT numbers exactly as given.",
      },
    ],
    schema: {
      type: "object",
      properties: {
        stance: { type: "string", enum: [...STANCES] },
        summary_beginner: { type: "string" },
        summary_intermediate: { type: "string" },
        summary_advanced: { type: "string" },
        key_risks: { type: "array", minItems: 2, maxItems: 4, items: { type: "string", description: "At most 8 words." } },
        what_to_watch: { type: "array", minItems: 2, maxItems: 4, items: { type: "string", description: "At most 12 words." } },
        chair_note: { type: "string" },
      },
      required: ["stance", "summary_beginner", "summary_intermediate", "summary_advanced", "key_risks", "what_to_watch", "chair_note"],
    },
    validate: (v) => {
      const o = v as Record<string, unknown>;
      if (!STANCES.includes(o.stance as (typeof STANCES)[number])) throw new Error("bad stance");
      const text = (k: string) => {
        const s = typeof o[k] === "string" ? (o[k] as string).trim() : "";
        if (!s || isAdvice(s)) throw new Error(`bad ${k}`);
        return s;
      };
      const list = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]) : []).filter((x): x is string => typeof x === "string" && !!x.trim() && !isAdvice(x)).map((x) => x.trim());
      const summary = Object.fromEntries(LEVELS.map((l) => [l, text(`summary_${l}`)])) as Record<IcLevel, string>;
      return { stance: o.stance as IcMemo["stance"], summary, keyRisks: list("key_risks"), watch: list("what_to_watch"), chairNote: text("chair_note") };
    },
    temperature: 0.3,
    waveTimeoutMs: 15000,
    budgetMs: 25000,
  }).then((a) => a.value);
}
