// Server-only: the committee. Bull, bear and an assumptions analyst read the fact pack; the chair writes the memo.
// Every point must cite fact ids from the pack; points citing anything else are dropped here, not in the UI.
import type { Assumption, FitRow, IcLevel, MemoPoint } from "@/data/ic-room";
import { formatPct, formatUSD } from "@/lib/format";
import { generateJson } from "@/lib/gemini";
import type { Fact } from "./facts";
import { STANCES, type IcMemo, type MemoClaim } from "./types";

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

export type Side = { statement: string; points: MemoPoint[]; model?: string };

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
  }).then((a) => ({ ...a.value, model: a.model }));
}

const STATUSES = new Set(["supported", "contested", "unresolved"]);

export function testAssumptions(c: Context): Promise<{ assumptions: Assumption[]; model?: string }> {
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
  }).then((a) => ({ assumptions: a.value, model: a.model }));
}

const LEVELS: IcLevel[] = ["beginner", "intermediate", "advanced"];
const CLAIM_KINDS = new Set(["fact", "calculation", "assumption", "interpretation"]);

// Numbers a summary may use: anything in the facts, the fit table (as displayed), the assumptions or the cited claims.
export function numberCorpus(c: Pick<Context, "facts" | "fit" | "amount" | "thesis">, extra: string[]) {
  const fit = c.fit.flatMap((r) =>
    r.kind === "usd" ? [formatUSD(r.before), formatUSD(r.after)] : [formatPct(r.before), formatPct(r.after), formatPct(r.after - r.before)],
  );
  return [...c.facts.map((f) => f.content), ...fit, formatUSD(c.amount), c.thesis, ...extra].join(" ");
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const toNumbers = (text: string) => (text.match(NUMBER) ?? []).map((n) => Number(n.replace(/,/g, ""))).filter(Number.isFinite);

// True when every figure in `text` appears in the corpus (allowing display rounding). Small counts and years are
// wording ("two risks", "2027"), not figures, so they are not checked.
export function numbersSupported(text: string, corpus: string) {
  const known = toNumbers(corpus);
  return toNumbers(text)
    .filter((n) => !(Number.isInteger(n) && (n < 10 || (n >= 1900 && n <= 2100))))
    .every((n) => known.some((k) => Math.abs(k - n) <= Math.max(0.051, Math.abs(n) * 0.005)));
}

export type ChairMemo = Omit<IcMemo, "bull" | "bear">;

// A deterministic summary built only from the cited material claims, used when a model summary fails a check.
export function templateSummary(stance: string, claims: MemoClaim[]) {
  const material = claims.filter((x) => x.material);
  return [`${stance}.`, ...material.map((x) => x.text)].join(" ");
}

// Checks each level's summary against the shared claims: it must cover every material claim and use only supported
// figures. A failing level gets the template summary instead, so all three always carry the same material points.
export function checkSummaries(raw: Record<IcLevel, { text: string; covers: string[] }>, claims: MemoClaim[], stance: string, corpus: string) {
  const material = claims.filter((x) => x.material).map((x) => x.id);
  const summary = {} as Record<IcLevel, string>;
  const source = {} as Record<IcLevel, "model" | "template">;
  for (const level of LEVELS) {
    const s = raw[level];
    const ok = Boolean(s?.text) && !isAdvice(s.text) && material.every((id) => s.covers.includes(id)) && numbersSupported(s.text, corpus);
    summary[level] = ok ? s.text : templateSummary(stance, claims);
    source[level] = ok ? "model" : "template";
  }
  return { summary, source };
}

export function chair(c: Context, bull: Side, bear: Side, assumptions: Assumption[]): Promise<ChairMemo & { model: string }> {
  const valid = validIds(c.facts);
  const debate = [
    `Bull: ${bull.statement}\n${bull.points.map((p) => `- ${p.text} [${p.refs.join(", ")}]`).join("\n")}`,
    `Bear: ${bear.statement}\n${bear.points.map((p) => `- ${p.text} [${p.refs.join(", ")}]`).join("\n")}`,
    `What must be true:\n${assumptions.map((a) => `- ${a.text} (${a.status})`).join("\n")}`,
  ].join("\n\n");
  const cited = { type: "object", properties: { text: { type: "string" }, refs: REFS }, required: ["text", "refs"] };
  const levelSummary = (d: string) => ({
    type: "object",
    properties: { text: { type: "string", description: d }, covers: { type: "array", items: { type: "string" }, description: "Ids of the claims this summary states." } },
    required: ["text", "covers"],
  });
  return generateJson({
    tag: "ic-chair",
    system: SYSTEM,
    parts: [
      {
        text:
          `You are the chair. Weigh the debate and write the memo.\n\n${brief(c)}\n\n${debate}\n\n` +
          `Stance must be one of: ${STANCES.join(", ")}. ` +
          "First list 3 to 6 claims (they will be numbered C1, C2, ... in order): each one sentence, citing fact ids or FIT, with a kind (fact, calculation, assumption or interpretation) and whether it is material (it would change a careful reader's view, such as the biggest risk or the portfolio-fit change). " +
          "Then write the summary three times, each stating every material claim and listing the claim ids it covers: for a beginner (no jargon, 2 to 3 sentences), " +
          "an intermediate investor (2 to 3 sentences), and an advanced one (dense, cite assumption ids and the fit numbers). Use only numbers that appear in the facts or the fit table. " +
          "Key risks and what to watch each cite fact ids. The chair note is one or two sentences on portfolio fit, using the FIT numbers exactly as given.",
      },
    ],
    schema: {
      type: "object",
      properties: {
        stance: { type: "string", enum: [...STANCES] },
        claims: {
          type: "array",
          minItems: 2,
          maxItems: 6,
          items: {
            type: "object",
            properties: { text: { type: "string" }, refs: REFS, kind: { type: "string", enum: [...CLAIM_KINDS] }, material: { type: "boolean" } },
            required: ["text", "refs", "kind", "material"],
          },
        },
        summary_beginner: levelSummary("No jargon, 2 to 3 sentences."),
        summary_intermediate: levelSummary("2 to 3 sentences."),
        summary_advanced: levelSummary("Dense; cite assumption ids and fit numbers."),
        key_risks: { type: "array", minItems: 2, maxItems: 4, items: cited },
        what_to_watch: { type: "array", minItems: 2, maxItems: 4, items: cited },
        chair_note: { type: "string" },
      },
      required: ["stance", "claims", "summary_beginner", "summary_intermediate", "summary_advanced", "key_risks", "what_to_watch", "chair_note"],
    },
    validate: (v) => parseChair(v, valid, c, assumptions),
    temperature: 0.3,
    waveTimeoutMs: 15000,
    budgetMs: 25000,
  }).then((a) => ({ ...a.value, model: a.model }));
}

// Pure: validates the chair's JSON. Claims, key risks and what-to-watch must cite valid ids; the chair note must use
// supported figures; each level's summary is checked (and replaced by the template if it fails).
export function parseChair(v: unknown, valid: Set<string>, c: Pick<Context, "facts" | "fit" | "amount" | "thesis">, assumptions: Assumption[]): ChairMemo {
  const o = (v ?? {}) as Record<string, unknown>;
  if (!STANCES.includes(o.stance as (typeof STANCES)[number])) throw new Error("bad stance");
  const stance = o.stance as IcMemo["stance"];
  const chairNote = typeof o.chair_note === "string" ? o.chair_note.trim() : "";
  if (!chairNote || isAdvice(chairNote)) throw new Error("bad chair_note");
  // Claim ids are assigned by position in the model's list, so summaries can refer to them.
  const rawClaims = (Array.isArray(o.claims) ? o.claims : []) as { text?: unknown; refs?: unknown; kind?: unknown; material?: unknown }[];
  const claims: MemoClaim[] = rawClaims.flatMap((raw, i) => {
    const [point] = cleanPoints([raw], valid);
    if (!point) return [];
    const kind = CLAIM_KINDS.has(raw.kind as string) ? (raw.kind as MemoClaim["kind"]) : "interpretation";
    return [{ id: `C${i + 1}`, text: point.text, refs: point.refs, kind, material: raw.material === true }];
  });
  if (claims.length === 0) throw new Error("no cited claims");
  if (!claims.some((x) => x.material)) claims[0].material = true;
  const summaries = Object.fromEntries(
    LEVELS.map((l) => {
      const s = o[`summary_${l}`] as { text?: unknown; covers?: unknown } | undefined;
      const covers = Array.isArray(s?.covers) ? s.covers.filter((x): x is string => typeof x === "string").map((x) => x.trim().toUpperCase()) : [];
      return [l, { text: typeof s?.text === "string" ? s.text.trim() : "", covers }];
    }),
  ) as Record<IcLevel, { text: string; covers: string[] }>;
  const corpus = numberCorpus(c, [...claims.map((x) => x.text), ...assumptions.map((a) => a.text)]);
  if (!numbersSupported(chairNote, corpus)) throw new Error("chair note uses unsupported figures");
  const { summary, source } = checkSummaries(summaries, claims, stance, corpus);
  return { stance, summary, summarySource: source, claims, keyRisks: cleanPoints(o.key_risks, valid), watch: cleanPoints(o.what_to_watch, valid), chairNote };
}
