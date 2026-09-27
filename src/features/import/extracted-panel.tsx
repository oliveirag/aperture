"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { TickerMark } from "@/components/shared/ticker-mark";
import { HOLDINGS } from "@/data/portfolio";
import { formatUSD } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Phase } from "./drop-zone";
import { counts, type ExtractedHolding } from "./extract";

// Skeleton rows shown while reading; the result can have any number of rows.
const SKELETON_SLOTS = HOLDINGS.length;
const STAGGER_S = 0.14;
// Long imports land within this, however many rows.
const MAX_STAGGER_TOTAL_S = 1.4;
const ROW_S = 0.24;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const STEPS = ["Reading positions", "Matching tickers", "Checking prices"];
const COLS = "grid grid-cols-[minmax(0,1fr)_36px_72px_16px] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_44px_76px_72px]";

// Brand tint for the ticker tile. Display only; every number comes from the extracted holding.
const COLOR: Record<string, string> = Object.fromEntries(HOLDINGS.map((h) => [h.ticker, h.color]));

const staggerFor = (n: number) => Math.min(STAGGER_S, MAX_STAGGER_TOTAL_S / Math.max(1, n));
const formatShares = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

export function ExtractedPanel({
  phase,
  holdings,
  error,
  scanMs,
  reduce,
  onContinue,
  onRetry,
  onSample,
  onReset,
}: {
  phase: Phase;
  holdings: ExtractedHolding[];
  error: string | null;
  scanMs: number;
  reduce: boolean;
  onContinue: () => void;
  onRetry: () => void;
  onSample: () => void;
  onReset: () => void;
}) {
  const extracted = phase === "extracted";
  const slots = extracted ? holdings.length : SKELETON_SLOTS;
  const stagger = staggerFor(slots);

  return (
    <section aria-label="Extracted holdings" className="flex min-w-0 flex-col bg-surface-1">
      <header className="flex h-12 items-center justify-between px-5">
        <h2 className="text-[14px] font-medium text-text">Extracted holdings</h2>
        {extracted || phase === "error" ? (
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

      <ul className="max-h-[440px] overflow-y-auto px-5 py-1">
        {Array.from({ length: slots }, (_, i) => {
          const h = extracted ? holdings[i] : undefined;
          return (
            <li key={i} className="relative h-11">
              <motion.div
                aria-hidden
                initial={false}
                animate={{ opacity: h ? 0 : 1 }}
                transition={{ duration: 0.2, delay: h && !reduce ? i * stagger : 0, ease: "easeOut" }}
                className={cn(COLS, "absolute inset-0")}
              >
                <span className="flex items-center gap-3">
                  <span className={cn("size-8 shrink-0 bg-surface-2", phase === "scanning" && "animate-pulse")} />
                  <span className={cn("h-2.5 w-24 rounded-full bg-surface-2", phase === "scanning" && "animate-pulse")} />
                </span>
                <span className="ml-auto h-2.5 w-8 rounded-full bg-surface-2" />
                <span className="ml-auto h-2.5 w-14 rounded-full bg-surface-2" />
                <span aria-hidden />
              </motion.div>
              {h ? <HoldingRow holding={h} delay={reduce ? 0 : i * stagger} reduce={reduce} /> : null}
            </li>
          );
        })}
      </ul>

      <footer aria-live="polite" className="mt-auto flex min-h-[128px] flex-col justify-center border-t border-border px-5 py-4">
        {phase === "idle" ? (
          <p className="text-[13px] text-text-subtle">Holdings appear here once your positions are read.</p>
        ) : phase === "scanning" ? (
          <ScanSteps stepMs={scanMs / STEPS.length} />
        ) : phase === "error" ? (
          <ReadError message={error ?? "Couldn't read the screenshot."} onRetry={onRetry} onSample={onSample} />
        ) : (
          <Summary holdings={holdings} landMs={((slots - 1) * stagger + ROW_S) * 1000} reduce={reduce} onContinue={onContinue} />
        )}
      </footer>
    </section>
  );
}

function RowStatus({ status }: { status: ExtractedHolding["status"] }) {
  if (status === "matched") {
    return (
      <span className="flex items-center justify-end gap-1 text-[12px] text-positive">
        <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
        <span className="sr-only sm:not-sr-only">Matched</span>
      </span>
    );
  }
  const label = status === "unpriced" ? "No quote" : "Not found";
  return (
    <span
      title={status === "unpriced" ? "No live price; using the supplied value" : "Unknown ticker; left out of the total"}
      className="flex items-center justify-end gap-1 text-[12px] text-sev-medium"
    >
      <AlertTriangle aria-hidden className="size-3.5" />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}

function HoldingRow({ holding: h, delay, reduce }: { holding: ExtractedHolding; delay: number; reduce: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ROW_S, delay, ease: EASE_OUT }}
      className={cn(COLS, "absolute inset-0 text-[14px]")}
    >
      <span className="flex min-w-0 items-center gap-3">
        <TickerMark ticker={h.ticker} color={COLOR[h.ticker]} />
        <span className="font-medium text-text">{h.ticker}</span>
        <span className="hidden truncate text-[13px] text-text-muted sm:inline">{h.name}</span>
      </span>
      <span className="text-right text-text tabular-nums">{formatShares(h.shares)}</span>
      <span className={cn("text-right tabular-nums", counts(h) ? "text-text" : "text-text-subtle")}>
        {counts(h) ? formatUSD(h.value) : "–"}
      </span>
      <RowStatus status={h.status} />
    </motion.div>
  );
}

// Spinner then check for each step, advancing every stepMs. Mounted only while scanning.
function ScanSteps({ stepMs }: { stepMs: number }) {
  const [done, setDone] = useState(0);

  // The last step stays active until the read actually returns.
  useEffect(() => {
    const timers = STEPS.slice(0, -1).map((_, i) => setTimeout(() => setDone(i + 1), (i + 1) * stepMs));
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
function Summary({
  holdings,
  landMs,
  reduce,
  onContinue,
}: {
  holdings: ExtractedHolding[];
  landMs: number;
  reduce: boolean;
  onContinue: () => void;
}) {
  const [shown, setShown] = useState(reduce);
  const [reviewed, setReviewed] = useState(false);
  const counted = holdings.filter(counts);
  const total = counted.reduce((sum, h) => sum + h.value, 0);
  const matched = holdings.filter((h) => h.status === "matched").length;

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setShown(true), landMs);
    return () => clearTimeout(t);
  }, [reduce, landMs]);

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
          <AnimatedNumber value={total} from={reduce ? total : 0} format={formatUSD} duration={700} className="text-[20px] font-medium text-text" />
        ) : (
          <span className="text-[20px] font-medium text-text tabular-nums">{formatUSD(0)}</span>
        )}{" "}
        · {matched} of {holdings.length} matched
      </p>
      {holdings[0]?.source ? (
        <p className="-mt-2 flex items-center gap-1.5 text-[12px] text-text-muted">
          <Sparkles aria-hidden className="size-3.5" />
          {holdings[0].source === "gemini" ? "Read by Gemini · verify every row" : holdings[0].source === "ocr" ? "Read by text recognition · verify every row" : "Parsed from your entries"} · {matched === holdings.length ? "Finnhub quotes" : "Some quotes unavailable; supplied values are labeled"}
        </p>
      ) : null}
      {!holdings[0]?.source && <p className="text-[12px] text-text-muted">Illustrative demo snapshot; no screenshot extraction or live pricing was performed.</p>}
      <label className="flex items-start gap-2 text-[12px] text-text-muted"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-1" />I checked the tickers, share counts and values against my source.</label>
      {counted.length < holdings.length && <p role="alert" className="text-[12px] text-sev-medium">Some positions have no valuation. Correct the input and retry so your portfolio is not silently understated.</p>}
      <button
        type="button"
        onClick={onContinue}
        disabled={!shown || !reviewed || counted.length === 0 || counted.length !== holdings.length}
        className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-text text-[15px] font-medium text-bg transition-[transform,translate,scale,background-color] duration-150 ease-out hover:bg-text/85 active:scale-[0.97]"
      >
        Look through my portfolio
        <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
      </button>
    </motion.div>
  );
}

function ReadError({ message, onRetry, onSample }: { message: string; onRetry: () => void; onSample: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-[14px] text-text">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-sev-medium" />
        {message}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-text text-[14px] font-medium text-bg transition-[transform,translate,scale,background-color] duration-150 ease-out hover:bg-text/85 active:scale-[0.97]"
        >
          <RotateCcw aria-hidden className="size-4" />
          Try again
        </button>
        <button
          type="button"
          onClick={onSample}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-[14px] font-medium text-text transition-[background-color,transform,translate,scale] duration-150 ease-out hover:bg-surface-3 active:scale-[0.97]"
        >
          Use sample instead
        </button>
      </div>
    </div>
  );
}
