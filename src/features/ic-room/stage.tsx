"use client";

import type { ReactNode, Ref } from "react";
import { Check, FastForward, Users } from "lucide-react";
import { motion } from "motion/react";
import { ASSUMPTIONS, BEAR_STATEMENT, BULL_STATEMENT } from "@/data/ic-room";
import { cn } from "@/lib/utils";
import { AssumptionCard } from "./assumption-card";
import { useEnter } from "./enter";
import { FactPack } from "./fact-pack";
import { MemoCard } from "./memo-card";
import { SpeakerPanel } from "./speaker-panel";
import { PHASES, type Frame, type RunStatus } from "./use-ic-run";

function EmptyStage() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface-1/50 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-text-muted">
        <Users className="size-5" aria-hidden />
      </span>
      <h2 className="text-[17px] font-medium text-text">Your investment committee</h2>
      <p className="max-w-[44ch] text-[14px] leading-[22px] text-pretty text-text-muted">
        Bull analyst, bear analyst and a chair review your idea against filings, news and what you already own.
      </p>
    </div>
  );
}

function Progress({ frame, status, onSkip }: { frame: Frame; status: RunStatus; onSkip: () => void }) {
  const current = PHASES.findIndex((p) => p.id === frame.phase);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <ol aria-label="Committee progress" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-medium">
        {PHASES.map((p, i) => {
          const done = status === "done" || i < current;
          const active = status === "running" && i === current;
          return (
            <li
              key={p.id}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 transition-colors duration-200",
                active ? "text-accent" : done ? "text-text-muted" : "text-text-subtle",
              )}
            >
              {done ? (
                <Check className="size-3 text-positive" aria-hidden />
              ) : (
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", active ? "bg-accent" : "bg-border-strong")}
                />
              )}
              {p.label}
            </li>
          );
        })}
      </ol>
      {status === "running" ? (
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-text-muted transition-[color,background-color] duration-150 ease-out hover:bg-surface-2 hover:text-text"
        >
          <FastForward className="size-3.5" aria-hidden />
          Skip to memo
        </button>
      ) : null}
    </div>
  );
}

export const DEBATE_ID = "ic-debate";

function Step({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  const enter = useEnter();
  return (
    <motion.section {...enter} id={id} aria-label={title} className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="text-[12px] font-medium tracking-[0.04em] text-text-subtle uppercase">{title}</h2>
      {children}
    </motion.section>
  );
}

// A meeting that turns into a document: compact, muted process steps, then the memo.
export function Stage({
  status,
  frame,
  onSkip,
  memoRef,
}: {
  status: RunStatus;
  frame: Frame | null;
  onSkip: () => void;
  memoRef: Ref<HTMLElement>;
}) {
  if (status === "idle" || !frame) return <EmptyStage />;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <Progress frame={frame} status={status} onSkip={onSkip} />

      <Step title="Fact pack">
        <FactPack done={frame.factsDone} />
      </Step>

      {frame.assumptionsShown > 0 ? (
        <Step title="What must be true">
          <div className="flex flex-col gap-3">
            {ASSUMPTIONS.slice(0, frame.assumptionsShown).map((a, i) => (
              <AssumptionCard
                key={a.id}
                assumption={a}
                showFor={frame.evidence[i].for}
                showAgainst={frame.evidence[i].against}
              />
            ))}
          </div>
        </Step>
      ) : null}

      {frame.debate ? (
        <Step id={DEBATE_ID} title="Debate">
          <div className="grid gap-3 xl:grid-cols-2">
            <SpeakerPanel side="bull" text={BULL_STATEMENT} chars={frame.bullChars} entered />
            <SpeakerPanel side="bear" text={BEAR_STATEMENT} chars={frame.bearChars} entered={frame.bearEntered} />
          </div>
        </Step>
      ) : null}

      {frame.memo ? <MemoCard ref={memoRef} /> : null}
    </div>
  );
}
