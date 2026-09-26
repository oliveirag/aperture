import type { Assumption, FitRow, IcLevel, MemoPoint } from "@/data/ic-room";
import type { Source } from "@/types/demo";

export const STANCES = ["Worth deeper research", "Neutral", "Proceed with caution"] as const;
export type Stance = (typeof STANCES)[number];

export interface IcMemo {
  stance: Stance;
  summary: Record<IcLevel, string>;
  bull: MemoPoint[];
  bear: MemoPoint[];
  keyRisks: string[];
  watch: string[];
  chairNote: string;
}

// Everything the IC Room stage and memo draw. The scripted AMD demo and a live run share this shape.
export interface IcRunData {
  ticker: { ticker: string; name: string; color: string; lookthroughNote: string };
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
}

// NDJSON lines streamed by POST /api/ic/run, in order: steps, facts, assumptions, bull, bear, memo.
export type IcEvent =
  | { type: "step"; index: number; label: string; done: boolean }
  | { type: "facts"; ticker: IcRunData["ticker"]; facts: Source[]; fit: FitRow[]; fitNote: string; date: string }
  | { type: "assumptions"; assumptions: Assumption[] }
  | { type: "bull"; statement: string; points: MemoPoint[] }
  | { type: "bear"; statement: string; points: MemoPoint[] }
  | { type: "memo"; memo: Omit<IcMemo, "bull" | "bear">; runId: string }
  | { type: "error"; error: string };
