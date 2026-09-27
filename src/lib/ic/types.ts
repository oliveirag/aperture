import type { Assumption, FitRow, IcLevel, MemoPoint } from "@/data/ic-room";
import type { Source } from "@/types/demo";

export const STANCES = ["Worth deeper research", "Neutral", "Proceed with caution"] as const;
export type Stance = (typeof STANCES)[number];

// One cited statement the chair relies on. Every level's summary must state all material claims, so a Beginner and an
// Advanced reader see the same material points at different depth.
export type MemoClaim = { id: string; text: string; refs: string[]; kind: "fact" | "calculation" | "assumption" | "interpretation"; material: boolean };

export interface IcMemo {
  stance: Stance;
  summary: Record<IcLevel, string>;
  // "template": the model's summary for that level failed a check and was replaced by the cited claims.
  // "rules": the AI committee was unavailable and the memo was computed from the facts by fixed rules.
  summarySource?: Record<IcLevel, "model" | "template" | "rules">;
  claims?: MemoClaim[];
  bull: MemoPoint[];
  bear: MemoPoint[];
  keyRisks: MemoPoint[];
  watch: MemoPoint[];
  chairNote: string;
}

// Which model produced each step of a run (models are raced, so this varies between runs).
export type RunModels = Partial<Record<"assumptions" | "bull" | "bear" | "chair", string>>;

// Everything the IC Room stage and memo draw. The scripted AMD demo and a live run share this shape.
export interface IcRunData {
  ticker: { ticker: string; name: string; color: string; apertureNote: string };
  thesis: string;
  amount: number;
  date: string;
  factSteps: string[];
  facts: Source[];
  assumptions: Assumption[];
  bullStatement: string;
  bearStatement: string;
  memo: IcMemo;
  fit: FitRow[];
  fitNote: string;
  // Live runs only: the run's id (inputs hashed with the day) and the models used.
  runId?: string;
  models?: RunModels;
}

// NDJSON lines streamed by POST /api/ic/run, in order: steps, facts, assumptions, bull, bear, memo.
export type IcEvent =
  | { type: "step"; index: number; label: string; done: boolean }
  | { type: "facts"; ticker: IcRunData["ticker"]; facts: Source[]; fit: FitRow[]; fitNote: string; date: string }
  | { type: "assumptions"; assumptions: Assumption[] }
  | { type: "bull"; statement: string; points: MemoPoint[] }
  | { type: "bear"; statement: string; points: MemoPoint[] }
  | { type: "memo"; memo: Omit<IcMemo, "bull" | "bear">; runId: string; models?: RunModels }
  | { type: "error"; error: string };
