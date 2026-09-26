"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { PageHeader } from "@/components/shared/page-header";
import { Composer } from "./composer";
import { InstantContext } from "./enter";
import { DEBATE_ID, Stage } from "./stage";
import { frameAt, useIcRun } from "./use-ic-run";

export function IcRoom() {
  const { t, instant, status, run, skip } = useIcRun();
  const reduce = useReducedMotion();
  const memoRef = useRef<HTMLElement>(null);
  const frame = t === null ? null : frameAt(t);
  const memoShown = frame?.memo ?? false;
  const debateShown = frame?.debate ?? false;

  // Demo runbook: /ic?run=1 starts the committee on load. run() is stable, so this fires once per mount.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("run") === "1") run();
  }, [run]);

  // Follow the meeting: keep the debate on screen while the analysts speak.
  useEffect(() => {
    if (!debateShown || instant) return;
    document.getElementById(DEBATE_ID)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, [debateShown, instant, reduce]);

  // Bring the memo into view the moment the chair starts writing (or on skip).
  useEffect(() => {
    if (!memoShown) return;
    memoRef.current?.scrollIntoView({ behavior: instant || reduce ? "auto" : "smooth", block: "start" });
  }, [memoShown, instant, reduce]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="IC Room"
        headline="Pressure-test an idea before you buy it."
        subline="What would have to be true, the evidence both ways, and how it fits what you already own."
      />

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside aria-label="Idea" className="min-w-0 lg:sticky lg:top-24">
          <Composer status={status} elapsed={t ?? 0} onRun={run} />
        </aside>
        <InstantContext value={instant}>
          <Stage status={status} frame={frame} onSkip={skip} memoRef={memoRef} />
        </InstantContext>
      </div>
    </div>
  );
}
