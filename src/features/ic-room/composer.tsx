"use client";

import { useId } from "react";
import { ArrowRight, Info, Loader2, RotateCcw } from "lucide-react";
import { TickerCombobox } from "@/components/shared/ticker-combobox";
import { TickerMark } from "@/components/shared/ticker-mark";
import { IC_THESIS, IC_TICKER } from "@/data/ic-room";
import { cn } from "@/lib/utils";
import { formatUSD } from "./format";
import type { RunStatus } from "./use-ic-run";

const FIELD =
  "rounded-xl border border-border-strong bg-surface-2 transition-[border-color] duration-150 ease-out focus-within:border-accent/60";
const LABEL = "mb-2 block text-[12px] font-medium text-text-subtle";

export const TICKER_PATTERN = /^[A-Z][A-Z.]{0,5}$/;
export const MIN_AMOUNT = 100;
export const MAX_AMOUNT = 10_000_000;

export type IdeaForm = { ticker: string; thesis: string; amount: number };

export function formProblem(form: IdeaForm): string | null {
  if (!TICKER_PATTERN.test(form.ticker)) return "Enter a US ticker, like AMD or MSFT.";
  if (!form.thesis.trim()) return "Write the thesis the committee should test.";
  if (!(form.amount >= MIN_AMOUNT && form.amount <= MAX_AMOUNT)) return `Pick an amount between ${formatUSD(MIN_AMOUNT)} and ${formatUSD(MAX_AMOUNT)}.`;
  return null;
}

export function Composer({
  form,
  onChange,
  note,
  status,
  elapsed,
  onRun,
}: {
  form: IdeaForm;
  onChange: (form: IdeaForm) => void;
  // How the ticker already reaches the portfolio, once known.
  note: string;
  status: RunStatus;
  elapsed: number;
  onRun: () => void;
}) {
  const tickerId = useId();
  const amountId = useId();
  const thesisId = useId();
  const hintId = useId();
  const running = status === "running";
  const problem = formProblem(form);
  const valid = TICKER_PATTERN.test(form.ticker);

  return (
    <form
      className="flex flex-col gap-5 bg-surface-1 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem && !running) onRun();
      }}
    >
      <div>
        <label htmlFor={tickerId} className={LABEL}>
          Ticker
        </label>
        <div className={cn(FIELD, "flex items-center gap-2 p-1.5 pr-2")}>
          {valid ? <TickerMark ticker={form.ticker} color={form.ticker === IC_TICKER.ticker ? IC_TICKER.color : undefined} size={24} /> : null}
          <TickerCombobox
            id={tickerId}
            value={form.ticker}
            onChange={(value) => {
              const ticker = value.toUpperCase().replace(/[^A-Z. &'-]/g, "").slice(0, 40);
              // The preset thesis is about AMD; don't let it ride along to another company.
              const thesis = ticker !== IC_TICKER.ticker && form.thesis === IC_THESIS ? "" : form.thesis;
              onChange({ ...form, ticker, thesis });
            }}
            placeholder="Ticker or company, e.g. AMD"
            aria-describedby={hintId}
            aria-invalid={(form.ticker !== "" && !valid) || undefined}
            className="h-7 w-full min-w-10 bg-transparent px-1 text-[14px] font-medium text-text uppercase outline-none placeholder:font-normal placeholder:text-text-subtle placeholder:normal-case focus-visible:outline-none"
          />
        </div>
        <p id={hintId} aria-live="polite" className="mt-2 min-h-5 text-[12px] leading-5 text-text-muted">
          {note}
        </p>
      </div>

      <div>
        <label htmlFor={amountId} className={LABEL}>
          Amount
        </label>
        <div className={cn(FIELD, "flex h-10 items-center px-3")}>
          <span aria-hidden className="text-[14px] text-text-subtle">
            $
          </span>
          <input
            id={amountId}
            inputMode="numeric"
            value={form.amount ? form.amount.toLocaleString("en-US") : ""}
            onChange={(e) => onChange({ ...form, amount: Number(e.target.value.replace(/\D/g, "").slice(0, 8)) })}
            className="h-full w-full bg-transparent pl-1 text-[14px] text-text tabular-nums outline-none focus-visible:outline-none"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor={thesisId} className="text-[12px] font-medium text-text-subtle">
            Thesis
          </label>
          {form.ticker === IC_TICKER.ticker ? (
            <button
              type="button"
              onClick={() => onChange({ ...form, thesis: IC_THESIS })}
              className="inline-flex h-6 items-center gap-1 border border-border bg-surface-2 px-2.5 text-[12px] font-medium text-text-muted transition-[border-color,color,transform,translate,scale] duration-150 ease-out hover:border-border-strong hover:text-text active:scale-[0.97]"
            >
              AMD share-gain thesis
            </button>
          ) : null}
        </div>
        <textarea
          id={thesisId}
          value={form.thesis}
          onChange={(e) => onChange({ ...form, thesis: e.target.value.slice(0, 600) })}
          rows={4}
          placeholder="What do you believe will happen, and over what time?"
          className={cn(
            FIELD,
            "block w-full resize-none px-3 py-2.5 text-[14px] leading-[22px] text-text outline-none placeholder:text-text-subtle focus-visible:outline-none",
          )}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="submit"
          disabled={running || problem !== null}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-text text-[14px] font-medium text-bg transition-[transform,translate,scale,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
        >
          {running ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Committee in session
            </>
          ) : status === "done" ? (
            <>
              <RotateCcw className="size-4" aria-hidden />
              Run again
            </>
          ) : (
            <>
              Run pre-mortem
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </button>
        <p aria-live="polite" className="min-h-5 text-center text-[12px] text-text-subtle tabular-nums">
          {problem && form.ticker ? (
            <span className="inline-flex items-start gap-1.5 text-sev-medium">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {problem}
            </span>
          ) : status === "running" ? (
            `Running · ${Math.floor(elapsed / 1000)}s`
          ) : status === "done" ? (
            `Completed · ${Math.max(1, Math.round(elapsed / 1000))}s`
          ) : null}
        </p>
      </div>
    </form>
  );
}
