// Server-only: one IC Room run end to end, emitted as events. Runs are cached per (ticker, thesis, amount, portfolio, day)
// together with the exact fact pack and fit they were built from (the audit trail).
import { createHash } from "node:crypto";
import { memo, put, recall } from "@/lib/cache";
import { cleanName, type ApertureInput } from "@/lib/xray/compute";
import { apertureInputs, modelFor, type PositionInput } from "@/lib/xray/live";
import { geminiAvailable } from "@/lib/gemini";
import { argue, chair, testAssumptions, type Context, type Side } from "./committee";
import { buildFactPack, factSteps, type Fact } from "./facts";
import { computeFit, exposureNote, FIT_NOTE, withPosition } from "./fit";
import { CHAIR_ONLY_NOTE, evaluate, rulesMemo, rulesSide } from "./rules";
import type { IcEvent, RunModels } from "./types";

const HOUR = 60 * 60 * 1000;
const RUN_TTL = 24 * HOUR;
const COLOR = "#E5484D";
export const FIT_STEP = "Checking your look-through exposure";

export type RunInput = { ticker: string; thesis: string; amount: number; holdings: Map<string, PositionInput> };
// The portfolio itself is not stored: the run id hashes it, and the fit rows in `events` carry what the memo used.
// Records are server-side only (replayed for an identical run the same day); there is no unauthenticated read route.
export type AuditRecord = { runId: string; createdAt: string; input: { ticker: string; thesis: string; amount: number }; facts: Fact[]; events: IcEvent[] };

export function runIdFor(input: RunInput) {
  const day = new Date().toISOString().slice(0, 10);
  const holdings = [...input.holdings].sort(([a], [b]) => a.localeCompare(b)).map(([t, h]) => [t, h.shares, h.price, h.marketValue, h.kind, h.name, h.industry, h.provenance]);
  return createHash("sha256").update(JSON.stringify([input.ticker, input.thesis.trim(), input.amount, day, holdings])).digest("hex").slice(0, 16);
}

async function portfolioFit(input: RunInput, name: string) {
  const before = await apertureInputs(input.holdings);
  // Classify the candidate the same way as a held position (stock, ETF with holdings, or opaque).
  const [probe] = await apertureInputs(new Map([[input.ticker, { shares: 1, price: null, name }]]));
  const priced = probe.price > 0;
  const candidate: ApertureInput = { ...probe, price: priced ? probe.price : 0, shares: priced ? input.amount / probe.price : 0, marketValue: priced ? undefined : input.amount };
  const after = withPosition(before, candidate);
  const [beforeModel, afterModel] = await Promise.all([modelFor(before), modelFor(after)]);
  if (!afterModel) throw new Error("no prices for the fit");
  return {
    fit: computeFit(candidate, { inputs: before, model: beforeModel }, { inputs: after, model: afterModel }),
    note: exposureNote(before, input.ticker, beforeModel?.total ?? 0),
  };
}

export class RunError extends Error {}

// What the browser gets: the source without the long context the analysts read.
function toSource(f: Fact) {
  const source: Partial<Fact> = { ...f };
  delete source.content;
  delete source.signal;
  return source as Omit<Fact, "content" | "signal">;
}

// Streams a run. A cached run replays its events at once, so the AMD-style instant replay works for any ticker.
export async function runCommittee(input: RunInput, send: (e: IcEvent) => void): Promise<void> {
  const runId = runIdFor(input);
  const cached = await recall<AuditRecord>(`ic:audit:v2:${runId}`);
  if (cached) {
    cached.events.forEach(send);
    return;
  }
  const events: IcEvent[] = [];
  const emit = (e: IcEvent) => {
    events.push(e);
    send(e);
  };

  const steps = [...factSteps(input.ticker), FIT_STEP];
  steps.forEach((label, index) => send({ type: "step", index, label, done: false }));
  const done = new Set<number>();
  const finishStep = (index: number) => {
    if (done.has(index)) return;
    done.add(index);
    emit({ type: "step", index, label: steps[index], done: true });
  };

  let pack;
  try {
    pack = await buildFactPack(input.ticker, finishStep);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("unknown ticker")) throw new RunError(`Couldn't find ${input.ticker}. Check the ticker and try again.`);
    throw new RunError("Couldn't gather the facts for this company right now. Try again in a moment.");
  }
  // A cached fact pack finishes without step callbacks.
  factSteps(input.ticker).forEach((_, i) => finishStep(i));

  const fit = await memo(`ic:fit:${runId}`, RUN_TTL, () => portfolioFit(input, pack.name), { persist: true }).catch(() => {
    throw new RunError("Couldn't price the portfolio fit right now. Try again in a moment.");
  });
  finishStep(steps.length - 1);

  const name = cleanName(pack.name);
  emit({
    type: "facts",
    ticker: { ticker: input.ticker, name, color: COLOR, apertureNote: fit.note },
    facts: pack.facts.map(toSource),
    fit: fit.fit,
    fitNote: FIT_NOTE,
    date: new Date().toISOString().slice(0, 10),
  });

  const ctx: Context = { ticker: input.ticker, name, thesis: input.thesis.trim(), amount: input.amount, facts: pack.facts, fit: fit.fit };
  // Rules-based stand-ins, computed from the same facts. Each AI step that fails is replaced by its rules version,
  // so a run always completes with cited points; the memo says which parts came from rules. The run record names
  // which model (or "rules") produced each step, since models are raced.
  const rules = evaluate(name, pack.facts, fit.fit);
  const ai = geminiAvailable();
  let usedRules = !ai;
  const fallback = <T,>(label: string, p: Promise<T>, alt: () => T) =>
    p.catch((err) => {
      console.error(`[ic] ${label} failed, using rules:`, err instanceof Error ? err.message.slice(0, 120) : "unknown");
      usedRules = true;
      return alt();
    });
  const RULES = "rules";
  const rulesAssumptions = () => ({ assumptions: rules.assumptions, model: RULES });
  const rulesArgument = (side: "bull" | "bear") => (): Side => ({ ...rulesSide(side, name, rules), model: RULES });
  const assumptions = ai ? fallback("assumptions", testAssumptions(ctx), rulesAssumptions) : Promise.resolve(rulesAssumptions());
  const bull: Promise<Side> = ai ? fallback("bull", argue("bull", ctx), rulesArgument("bull")) : Promise.resolve(rulesArgument("bull")());
  const bear: Promise<Side> = ai ? fallback("bear", argue("bear", ctx), rulesArgument("bear")) : Promise.resolve(rulesArgument("bear")());

  const a = await assumptions;
  emit({ type: "assumptions", assumptions: a.assumptions });
  const b = await bull;
  emit({ type: "bull", statement: b.statement, points: b.points });
  const r = await bear;
  emit({ type: "bear", statement: r.statement, points: r.points });
  const sidesFromRules = usedRules;
  const { model: chairModel, ...m } =
    ai && !sidesFromRules
      ? await fallback("chair", chair(ctx, b, r, a.assumptions), () => ({ ...rulesMemo(name, rules, b, r, a.assumptions, CHAIR_ONLY_NOTE), model: RULES }))
      : { ...rulesMemo(name, rules, b, r, a.assumptions), model: RULES };
  const models: RunModels = { assumptions: a.model, bull: b.model, bear: r.model, chair: chairModel };
  emit({ type: "memo", memo: m, runId, models });

  put<AuditRecord>(
    `ic:audit:v2:${runId}`,
    {
      runId,
      createdAt: new Date().toISOString(),
      input: { ticker: input.ticker, thesis: input.thesis, amount: input.amount },
      facts: pack.facts,
      events,
    },
    RUN_TTL,
    { persist: true },
  );
}
