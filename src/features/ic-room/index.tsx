"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { PageHeader } from "@/components/shared/page-header";
import { HOLDINGS } from "@/data/portfolio";
import { IC_AMOUNT, IC_THESIS, IC_TICKER } from "@/data/ic-room";
import { useHydratePortfolio, usePortfolio } from "@/lib/portfolio-store";
import { Composer, type IdeaForm } from "./composer";
import { InstantContext } from "./enter";
import { DEMO_RUN, IcDataContext } from "./run-data";
import { DEBATE_ID, Stage } from "./stage";
import { frameAt, useIcRun } from "./use-ic-run";
import { useLiveIc } from "./use-live-ic";

const DEMO_FORM: IdeaForm = { ticker: IC_TICKER.ticker, thesis: IC_THESIS, amount: IC_AMOUNT };

// The scripted AMD run is only honest for the demo portfolio and the thesis it was written for.
function isDemoRun(form: IdeaForm, demoPortfolio: boolean) {
  return demoPortfolio && form.ticker === DEMO_FORM.ticker && form.thesis.trim() === DEMO_FORM.thesis && form.amount === DEMO_FORM.amount;
}

export function IcRoom() {
  useHydratePortfolio();
  const imported = usePortfolio((s) => s.imported);
  const demo = useIcRun();
  const live = useLiveIc();
  const [form, setForm] = useState<IdeaForm>(DEMO_FORM);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const reduce = useReducedMotion();
  const memoRef = useRef<HTMLElement>(null);

  const active =
    mode === "demo"
      ? { data: DEMO_RUN, frame: demo.t === null ? null : frameAt(demo.t), status: demo.status, instant: demo.instant, elapsed: demo.t ?? 0, skip: demo.skip }
      : { data: live.state?.data ?? DEMO_RUN, frame: live.frame, status: live.status, instant: live.instant, elapsed: live.elapsed, skip: live.skip };
  const failed = mode === "live" && live.state?.status === "error" ? live.state.error : null;
  const memoShown = active.frame?.memo ?? false;
  const debateShown = active.frame?.debate ?? false;

  function run() {
    setMode("live");
    const holdings = (imported ?? HOLDINGS).map(({ ticker, shares, price, name }) => ({ ticker, shares, price, name }));
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
    mode === "live" && live.state?.data.ticker.ticker === form.ticker && live.state.data.ticker.apertureNote
      ? live.state.data.ticker.apertureNote
      : isDemoRun({ ...DEMO_FORM, ticker: form.ticker }, imported === null)
        ? `Not owned directly · ${IC_TICKER.apertureNote}`
        : "Any US-listed company. The committee reads its filings, fundamentals and recent news.";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="IC Room"
        headline="Pressure-test an idea before you buy it."
        subline="IC means investment committee. Research a thesis with a bull case, a bear case, source evidence, and the effect on your portfolio."
      />
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-text-muted"><span>{mode === "demo" && active.status !== "idle" ? "Illustrative AMD replay. Sample claims are not current research." : "New runs retrieve source facts for your thesis. Bull and bear arguments are interpretations, not verified facts or predictions."}</span><button type="button" className="underline underline-offset-4" onClick={() => { live.reset(); setMode("demo"); demo.run(); }}>Replay labeled AMD example</button></div>

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
