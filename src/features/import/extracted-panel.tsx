"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, LoaderCircle, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { TickerMark } from "@/components/shared/ticker-mark";
import { HOLDINGS } from "@/data/portfolio";
import { formatUSD } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Phase } from "./drop-zone";
import { MATCH_THRESHOLD, type ExtractedHolding } from "./extract";

const SLOTS = HOLDINGS.length;
const STAGGER_S = 0.14;
const ROW_S = 0.24;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const STEPS = ["Reading positions", "Matching tickers", "Checking prices"];
const COLS = "grid grid-cols-[minmax(0,1fr)_36px_72px_16px] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_44px_76px_72px]";

// Brand tint for the ticker tile. Display only; every number comes from the extracted holding.
const COLOR = Object.fromEntries(HOLDINGS.map((h) => [h.ticker, h.color]));

export function ExtractedPanel({
  phase,
  holdings,
  scanMs,
  reduce,
  onContinue,
  onReset,
}: {
  phase: Phase;
  holdings: ExtractedHolding[];
  scanMs: number;
  reduce: boolean;
  onContinue: () => void;
  onReset: () => void;
}) {
  const extracted = phase === "extracted";

  return (
    <section aria-label="Extracted holdings" className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface-1">
      <header className="flex h-12 items-center justify-between px-5">
        <h2 className="text-[14px] font-medium text-text">Extracted holdings</h2>
        {extracted ? (
          <button
            type="button"
            onClick={onReset}
            className="-mr-2 rounded-md px-2 py-1 text-[13px] text-text-muted transition-colors duration-150 ease-out hover:text-text"
          >
            Start over
          </button>
        ) : null}
      </header>

      <div className={cn(COLS, "h-8 border-y border-border px-5 text-[11px] font-medium tracking-[0.06em] text-text-subtle uppercase")}>
        <span>Ticker</span>
        <span className="text-right">Shares</span>
        <span className="text-right">Value</span>
        <span aria-hidden />
      </div>

      <ul className="px-5 py-1">
        {Array.from({ length: SLOTS }, (_, i) => {
          const h = extracted ? holdings[i] : undefined;
          return (
            <li key={i} className="relative h-11">
              <motion.div
                aria-hidden
                initial={false}
                animate={{ opacity: h ? 0 : 1 }}
                transition={{ duration: 0.2, delay: h && !reduce ? i * STAGGER_S : 0, ease: "easeOut" }}
                className={cn(COLS, "absolute inset-0")}
              >
                <span className="flex items-center gap-3">
                  <span className={cn("size-8 shrink-0 rounded-[8px] bg-surface-2", phase === "scanning" && "animate-pulse")} />
                  <span className={cn("h-2.5 w-24 rounded-full bg-surface-2", phase === "scanning" && "animate-pulse")} />
                </span>
                <span className="ml-auto h-2.5 w-8 rounded-full bg-surface-2" />
                <span className="ml-auto h-2.5 w-14 rounded-full bg-surface-2" />
                <span aria-hidden />
              </motion.div>
              {h ? <HoldingRow holding={h} index={i} reduce={reduce} /> : null}
            </li>
          );
        })}
      </ul>

      <footer aria-live="polite" className="mt-auto flex h-[128px] flex-col justify-center border-t border-border px-5">
        {phase === "idle" ? (
          <p className="text-[13px] text-text-subtle">Holdings appear here once the screenshot is read.</p>
        ) : phase === "scanning" ? (
          <ScanSteps stepMs={scanMs / STEPS.length} />
        ) : (
          <Summary holdings={holdings} reduce={reduce} onContinue={onContinue} />
        )}
      </footer>
    </section>
  );
}

function HoldingRow({ holding: h, index, reduce }: { holding: ExtractedHolding; index: number; reduce: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ROW_S, delay: reduce ? 0 : index * STAGGER_S, ease: EASE_OUT }}
      className={cn(COLS, "absolute inset-0 text-[14px]")}
    >
      <span className="flex min-w-0 items-center gap-3">
        <TickerMark ticker={h.ticker} color={COLOR[h.ticker]} />
        <span className="font-semibold text-text">{h.ticker}</span>
        <span className="hidden truncate text-[13px] text-text-muted sm:inline">{h.name}</span>
      </span>
      <span className="text-right text-text tabular-nums">{h.shares}</span>
      <span className="text-right text-text tabular-nums">{formatUSD(h.value)}</span>
      <span className="flex items-center justify-end gap-1 text-[12px] text-positive">
        <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
        <span className="sr-only sm:not-sr-only">Matched</span>
      </span>
    </motion.div>
  );
}

// Spinner then check for each step, advancing every stepMs. Mounted only while scanning.
function ScanSteps({ stepMs }: { stepMs: number }) {
  const [done, setDone] = useState(0);

  useEffect(() => {
    const timers = STEPS.map((_, i) => setTimeout(() => setDone(i + 1), (i + 1) * stepMs));
    return () => timers.forEach(clearTimeout);
  }, [stepMs]);

  return (
    <ol className="flex flex-col gap-2">
      {STEPS.map((label, i) => {
        const complete = i < done;
        const active = i === done;
        return (
          <li key={label} className={cn("flex items-center gap-2.5 text-[13px] transition-colors duration-200", complete || active ? "text-text" : "text-text-subtle")}>
            <span className="flex size-4 items-center justify-center">
              {complete ? (
                <Check aria-hidden className="size-4 text-positive" strokeWidth={2.5} />
              ) : active ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin text-accent" />
              ) : (
                <span className="size-1.5 rounded-full bg-border-strong" />
              )}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

// Appears once the last row has landed, then counts the total up.
function Summary({ holdings, reduce, onContinue }: { holdings: ExtractedHolding[]; reduce: boolean; onContinue: () => void }) {
  const [shown, setShown] = useState(reduce);
  const total = holdings.reduce((sum, h) => sum + h.value, 0);
  const matched = holdings.filter((h) => h.confidence >= MATCH_THRESHOLD).length;

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setShown(true), ((holdings.length - 1) * STAGGER_S + ROW_S) * 1000);
    return () => clearTimeout(t);
  }, [reduce, holdings.length]);

  return (
    <motion.div
      initial={false}
      animate={{ opacity: shown ? 1 : 0, y: shown || reduce ? 0 : 4 }}
      transition={{ duration: 0.24, ease: EASE_OUT }}
      className="flex flex-col gap-3"
    >
      <p className="text-[14px] text-text-muted">
        {holdings.length} holdings ·{" "}
        {shown ? (
          <AnimatedNumber value={total} from={reduce ? total : 0} format={formatUSD} duration={700} className="text-[20px] font-semibold text-text" />
        ) : (
          <span className="text-[20px] font-semibold text-text tabular-nums">{formatUSD(0)}</span>
        )}{" "}
        · {matched} of {holdings.length} matched
      </p>
      {holdings[0]?.source === "live" ? (
        <p className="-mt-2 flex items-center gap-1.5 text-[12px] text-text-muted">
          <Sparkles aria-hidden className="size-3.5" />
          Extracted by Gemini
        </p>
      ) : null}
      <button
        type="button"
        onClick={onContinue}
        disabled={!shown}
        className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-text text-[15px] font-medium text-bg transition-[transform,background-color] duration-150 ease-out hover:bg-white active:scale-[0.97]"
      >
        Look through my portfolio
        <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
      </button>
    </motion.div>
  );
}
