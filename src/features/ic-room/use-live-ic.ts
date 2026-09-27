"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { IcEvent, IcRunData } from "@/lib/ic/types";
import { readNdjson } from "@/lib/ndjson";
import { useIcMemos } from "./memos";
import { CHARS_PER_MS, typed, type Frame, type RunStatus } from "./use-ic-run";

const FRAME_MS = 16;
const ASSUMPTION_GAP = 400;
const EVIDENCE_START = 800;
const EVIDENCE_GAP = 500;
const AGAINST_OFFSET = 250;
const TURN_GAP = 300;

export type LiveInput = {
  ticker: string;
  thesis: string;
  amount: number;
  holdings: { ticker: string; shares: number; price: number; name: string }[];
};

type Arrivals = Partial<Record<"assumptions" | "bull" | "bear" | "memo", number>>;

type LiveState = {
  status: "idle" | "running" | "error" | "done";
  steps: { label: string; done: boolean }[];
  data: IcRunData;
  at: Arrivals;
  startedAt: number;
  error: string | null;
};

const EMPTY_MEMO: IcRunData["memo"] = {
  stance: "Neutral",
  summary: { beginner: "", intermediate: "", advanced: "" },
  bull: [],
  bear: [],
  keyRisks: [],
  watch: [],
  chairNote: "",
};

function emptyData(input: LiveInput): IcRunData {
  return {
    ticker: { ticker: input.ticker, name: input.ticker, color: "#E5484D", apertureNote: "" },
    thesis: input.thesis,
    amount: input.amount,
    date: new Date().toISOString().slice(0, 10),
    factSteps: [],
    facts: [],
    assumptions: [],
    bullStatement: "",
    bearStatement: "",
    memo: EMPTY_MEMO,
    fit: [],
    fitNote: "",
  };
}

// Characters typed so far; nothing before the speaker's turn (start may be Infinity while they wait).
const chars = (text: string, now: number, start: number) => (start === Infinity ? 0 : typed(text, now, start));

// Where the stage is at `now`: data reveals as it streams in, and the analysts type in turn (bull, then bear, then the chair).
export function liveFrame(s: LiveState, now: number): Frame {
  const { at, data } = s;
  const assumptionsShown = at.assumptions === undefined ? 0 : Math.min(data.assumptions.length, Math.floor((now - at.assumptions) / ASSUMPTION_GAP) + 1);
  const evidence = data.assumptions.map((_, i) => {
    const t = (at.assumptions ?? Infinity) + EVIDENCE_START + i * EVIDENCE_GAP;
    return { for: now >= t, against: now >= t + AGAINST_OFFSET };
  });
  const bullStart = at.bull ?? Infinity;
  const bullDone = bullStart + data.bullStatement.length / CHARS_PER_MS;
  const bearStart = at.bear === undefined ? Infinity : Math.max(at.bear, bullDone + TURN_GAP);
  const bearDone = bearStart + data.bearStatement.length / CHARS_PER_MS;
  const memo = at.memo !== undefined && now >= Math.max(at.memo, bearDone);
  const debate = at.bull !== undefined;
  return {
    phase: memo ? "memo" : debate ? "debate" : evidence.some((e) => e.for) ? "evidence" : assumptionsShown > 0 ? "assumptions" : "facts",
    factsDone: s.steps.filter((x) => x.done).length,
    assumptionsShown,
    evidence,
    debate,
    bullChars: chars(data.bullStatement, now, bullStart),
    bearEntered: at.bear !== undefined,
    bearChars: chars(data.bearStatement, now, bearStart),
    memo,
  };
}

// A live committee run streamed from /api/ic/run, exposed in the same shape as the scripted demo run.
export function useLiveIc() {
  const reduce = useReducedMotion();
  const [state, setState] = useState<LiveState | null>(null);
  const [now, setNow] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopClock = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const startClock = useCallback(() => {
    stopClock();
    const tick = () => {
      setNow(performance.now());
      timer.current = setTimeout(tick, FRAME_MS);
    };
    tick();
  }, [stopClock]);

  const run = useCallback(
    async (input: LiveInput) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setSkipped(false);
      setState({ status: "running", steps: [], data: emptyData(input), at: {}, startedAt: performance.now(), error: null });
      startClock();
      const update = (fn: (s: LiveState) => LiveState) => {
        if (!controller.signal.aborted) setState((s) => (s ? fn(s) : s));
      };
      const arrived = (key: keyof Arrivals) => ({ [key]: performance.now() });
      try {
        const res = await fetch("/api/ic/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: controller.signal,
        });
        let finished = false;
        await readNdjson<IcEvent>(res, (e) => {
          if (e.type === "step") {
            update((s) => {
              const steps = [...s.steps];
              steps[e.index] = { label: e.label, done: e.done || (steps[e.index]?.done ?? false) };
              for (let i = 0; i < steps.length; i++) steps[i] ??= { label: "", done: false };
              return { ...s, steps, data: { ...s.data, factSteps: steps.map((x) => x.label) } };
            });
          } else if (e.type === "facts") {
            update((s) => ({ ...s, data: { ...s.data, ticker: e.ticker, facts: e.facts, fit: e.fit, fitNote: e.fitNote, date: e.date } }));
          } else if (e.type === "assumptions") {
            update((s) => ({ ...s, data: { ...s.data, assumptions: e.assumptions }, at: { ...s.at, ...arrived("assumptions") } }));
          } else if (e.type === "bull") {
            update((s) => ({ ...s, data: { ...s.data, bullStatement: e.statement, memo: { ...s.data.memo, bull: e.points } }, at: { ...s.at, ...arrived("bull") } }));
          } else if (e.type === "bear") {
            update((s) => ({ ...s, data: { ...s.data, bearStatement: e.statement, memo: { ...s.data.memo, bear: e.points } }, at: { ...s.at, ...arrived("bear") } }));
          } else if (e.type === "memo") {
            finished = true;
            update((s) => {
              const data = { ...s.data, memo: { ...s.data.memo, ...e.memo } };
              useIcMemos.getState().add({ ticker: data.ticker.ticker, date: data.date, memo: data.memo });
              return { ...s, status: "done", data, at: { ...s.at, ...arrived("memo") } };
            });
          } else {
            finished = true;
            update((s) => ({ ...s, status: "error", error: e.error }));
          }
        });
        if (!finished) throw new Error("The connection closed before the memo was written. Try again.");
      } catch (err) {
        if (controller.signal.aborted) return;
        update((s) => ({ ...s, status: "error", error: err instanceof Error ? err.message : "The committee couldn't meet right now." }));
      }
    },
    [startClock],
  );

  const skip = useCallback(() => setSkipped(true), []);

  const instant = skipped || !!reduce;
  const frame = state ? liveFrame(state, instant ? Infinity : now) : null;
  // "done" once the memo is on screen; the clock stops then (and on errors).
  const status: RunStatus = !state ? "idle" : frame?.memo ? "done" : state.status === "error" ? "done" : "running";
  const settled = status === "done";
  useEffect(() => {
    if (settled) stopClock();
  }, [settled, stopClock]);
  useEffect(
    () => () => {
      stopClock();
      abort.current?.abort();
    },
    [stopClock],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    stopClock();
    setState(null);
  }, [stopClock]);

  return {
    state,
    frame,
    status,
    instant,
    elapsed: state ? Math.max(0, now - state.startedAt) : 0,
    run,
    skip,
    reset,
  };
}
