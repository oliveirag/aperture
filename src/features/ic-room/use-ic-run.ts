"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ASSUMPTIONS, BEAR_STATEMENT, BULL_STATEMENT, FACT_PACK_STEPS } from "@/data/ic-room";

// Scripted timeline, in ms from Run. Everything on the stage is derived from the elapsed time.
export const TIMELINE = {
  factStep: 300,
  assumptions: 1200,
  assumptionGap: 400,
  evidence: 3000,
  evidenceGap: 500,
  againstOffset: 250,
  debate: 5000,
  bullTypes: 5400,
  bearEnters: 6400,
  bearTypes: 6900,
  memo: 8500,
  end: 10000,
} as const;

const FRAME_MS = 16;

// Typewriter speed: about 45 characters per 100ms.
const CHARS_PER_MS = 0.45;

export type Phase = "facts" | "assumptions" | "evidence" | "debate" | "memo";
export const PHASES: { id: Phase; label: string; at: number }[] = [
  { id: "facts", label: "Fact pack", at: 0 },
  { id: "assumptions", label: "What must be true", at: TIMELINE.assumptions },
  { id: "evidence", label: "Evidence", at: TIMELINE.evidence },
  { id: "debate", label: "Debate", at: TIMELINE.debate },
  { id: "memo", label: "Memo", at: TIMELINE.memo },
];

export type RunStatus = "idle" | "running" | "done";

function typed(text: string, t: number, start: number) {
  if (t < start) return 0;
  return Math.min(text.length, Math.floor((t - start) * CHARS_PER_MS));
}

// Pure view of the stage at time t.
export function frameAt(t: number) {
  const { factStep, assumptions, assumptionGap, evidence, evidenceGap, againstOffset } = TIMELINE;
  return {
    phase: [...PHASES].reverse().find((p) => t >= p.at)?.id ?? "facts",
    // Steps fully done; the next one (if any) is in progress.
    factsDone: Math.min(FACT_PACK_STEPS.length, Math.floor(t / factStep)),
    assumptionsShown: t < assumptions ? 0 : Math.min(ASSUMPTIONS.length, Math.floor((t - assumptions) / assumptionGap) + 1),
    evidence: ASSUMPTIONS.map((_, i) => ({
      for: t >= evidence + i * evidenceGap,
      against: t >= evidence + i * evidenceGap + againstOffset,
    })),
    debate: t >= TIMELINE.debate,
    bullChars: typed(BULL_STATEMENT, t, TIMELINE.bullTypes),
    bearEntered: t >= TIMELINE.bearEnters,
    bearChars: typed(BEAR_STATEMENT, t, TIMELINE.bearTypes),
    memo: t >= TIMELINE.memo,
  };
}

export type Frame = ReturnType<typeof frameAt>;

// One setTimeout chain (~60fps) drives the run; unlike requestAnimationFrame it still advances in a
// background tab. Cancellable; skip() jumps to the end state.
// `instant` marks a state reached without playback (skip or reduced motion), so nothing animates in.
export function useIcRun() {
  const reduce = useReducedMotion();
  const [state, setState] = useState<{ t: number | null; instant: boolean }>({ t: null, instant: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read at tick time so run() stays stable across the reduced-motion query resolving.
  const reduceRef = useRef(reduce);
  useEffect(() => {
    reduceRef.current = reduce;
  }, [reduce]);

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const skip = useCallback(() => {
    cancel();
    setState({ t: TIMELINE.end, instant: true });
  }, [cancel]);

  const run = useCallback(() => {
    cancel();
    let start: number | null = null;
    const tick = () => {
      if (reduceRef.current) {
        timer.current = null;
        setState({ t: TIMELINE.end, instant: true });
        return;
      }
      const now = performance.now();
      start ??= now;
      const elapsed = Math.min(TIMELINE.end, now - start);
      setState({ t: elapsed, instant: false });
      timer.current = elapsed < TIMELINE.end ? setTimeout(tick, FRAME_MS) : null;
    };
    timer.current = setTimeout(tick, 0);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  const { t, instant } = state;
  const status: RunStatus = t === null ? "idle" : t < TIMELINE.end ? "running" : "done";
  return { t, instant, status, run, skip };
}
