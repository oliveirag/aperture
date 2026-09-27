"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { PageHeader } from "@/components/shared/page-header";
import { IC_AMOUNT, IC_THESIS, IC_TICKER } from "@/data/ic-room";
import { MAX_POSITIONS, tooManyPositionsMessage } from "@/lib/limits";
import { DEMO_HOLDINGS, useHydratePortfolio, usePortfolio } from "@/lib/portfolio-store";
import { Composer, type IdeaForm } from "./composer";
import { InstantContext } from "./enter";
import { DEMO_RUN, IcDataContext } from "./run-data";
import { DEBATE_ID, Stage } from "./stage";
import { useLiveIc } from "./use-live-ic";

const DEMO_FORM: IdeaForm = { ticker: IC_TICKER.ticker, thesis: IC_THESIS, amount: IC_AMOUNT };

export function IcRoom() {
  useHydratePortfolio();
  const imported = usePortfolio((s) => s.imported);
  const live = useLiveIc();
  const [form, setForm] = useState<IdeaForm>(DEMO_FORM);
  const [blocked, setBlocked] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const memoRef = useRef<HTMLElement>(null);

  // Every run is live. DEMO_RUN only fills the stage's shape before the first run; none of it is shown as research.
  const active = { data: live.state?.data ?? DEMO_RUN, frame: live.frame, status: live.status, instant: live.instant, elapsed: live.elapsed, skip: live.skip };
  const failed = blocked ?? (live.state?.status === "error" ? live.state.error : null);
  const memoShown = active.frame?.memo ?? false;
  const debateShown = active.frame?.debate ?? false;

  function run() {
    const holdings = imported ?? DEMO_HOLDINGS;
    // The portfolio-fit step prices every position; say so up front instead of failing mid-run.
    if (holdings.length > MAX_POSITIONS) {
      live.reset();
      setBlocked(tooManyPositionsMessage(holdings.length, "The IC Room's portfolio fit"));
      return;
    }
    setBlocked(null);
    live.run({ ticker: form.ticker, thesis: form.thesis.trim(), amount: form.amount, holdings });
  }

  // Follow the meeting: keep the debate on screen while the analysts speak.
  useEffect(() => {
    if (!debateShown || active.instant) return;
    document.getElementById(DEBATE_ID)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, [debateShown, active.instant, reduce]);

  // Bring the memo into view the moment the chair starts writing (or on skip).
  useEffect(() => {
    if (!memoShown) return;
    memoRef.current?.scrollIntoView({ behavior: active.instant || reduce ? "auto" : "smooth", block: "start" });
  }, [memoShown, active.instant, reduce]);

  const note =
    live.state?.data.ticker.ticker === form.ticker && live.state.data.ticker.apertureNote
      ? live.state.data.ticker.apertureNote
      : "Any US-listed company. The committee reads its filings, fundamentals and recent news.";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="IC Room"
        headline="Pressure-test an idea before you buy it."
        subline="IC means investment committee. Research a thesis with a bull case, a bear case, source evidence, and the effect on your portfolio."
      />
      <p className="text-[13px] text-text-muted">Each run retrieves source facts for your thesis. Bull and bear arguments are interpretations, not verified facts or predictions.</p>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside aria-label="Idea" className="min-w-0 lg:sticky lg:top-24">
          <Composer form={form} onChange={setForm} note={note} status={failed ? "idle" : active.status} elapsed={active.elapsed} onRun={run} />
        </aside>
        <IcDataContext value={active.data}>
          <InstantContext value={active.instant}>
            <Stage
              status={active.status}
              frame={active.frame}
              onSkip={active.skip}
              memoRef={memoRef}
              error={failed}
              onRetry={run}
            />
          </InstantContext>
        </IcDataContext>
      </div>
    </div>
  );
}
