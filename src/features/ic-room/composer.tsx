"use client";

import { useId, useState } from "react";
import { ArrowRight, Info, Loader2, RotateCcw } from "lucide-react";
import { TickerMark } from "@/components/shared/ticker-mark";
import { IC_AMOUNT, IC_THESIS, IC_TICKER } from "@/data/ic-room";
import { cn } from "@/lib/utils";
import { formatUSD } from "./format";
import type { RunStatus } from "./use-ic-run";

const FIELD =
  "rounded-xl border border-border-strong bg-surface-2 transition-[border-color] duration-150 ease-out focus-within:border-accent/60";
const LABEL = "mb-2 block text-[12px] font-medium text-text-subtle";

// Names a query may match and still mean AMD.
function isAmd(query: string) {
  const q = query.trim().toUpperCase();
  return q === "" || "AMD".startsWith(q) || "ADVANCED MICRO DEVICES".startsWith(q);
}

export function Composer({
  status,
  elapsed,
  onRun,
}: {
  status: RunStatus;
  elapsed: number;
  onRun: () => void;
}) {
  const [query, setQuery] = useState("");
  const [thesis, setThesis] = useState(IC_THESIS);
  const tickerId = useId();
  const amountId = useId();
  const thesisId = useId();
  const hintId = useId();
  const unsupported = !isAmd(query);
  const running = status === "running";

  return (
    <div className="flex flex-col gap-5 bg-surface-1 p-5">
      <div>
        <label htmlFor={tickerId} className={LABEL}>
          Ticker
        </label>
        <div className={cn(FIELD, "flex items-center gap-1.5 p-1.5 pr-2")}>
          <span className="flex min-w-0 items-center gap-2 rounded-lg bg-surface-3 py-1 pr-2.5 pl-1">
            <TickerMark ticker={IC_TICKER.ticker} color={IC_TICKER.color} size={24} />
            <span className="truncate text-[13px] font-medium text-text">
              {IC_TICKER.ticker} · {IC_TICKER.name}
            </span>
          </span>
          <input
            id={tickerId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Ticker"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hintId}
            aria-invalid={unsupported || undefined}
            size={1}
            className="h-7 min-w-10 flex-1 bg-transparent text-[14px] text-text uppercase outline-none placeholder:text-text-subtle placeholder:normal-case focus-visible:outline-none"
          />
        </div>
        <p id={hintId} aria-live="polite" className="mt-2 text-[12px] leading-5 text-text-muted">
          {unsupported ? (
            <span className="inline-flex items-start gap-1.5 text-sev-medium">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              This demo build covers AMD. Try it with AMD.
            </span>
          ) : (
            <>Not owned directly · {IC_TICKER.lookthroughNote}</>
          )}
        </p>
      </div>

      <div>
        <label htmlFor={amountId} className={LABEL}>
          Amount
        </label>
        <input
          id={amountId}
          readOnly
          value={formatUSD(IC_AMOUNT)}
          className={cn(FIELD, "h-10 w-full px-3 text-[14px] text-text tabular-nums outline-none focus-visible:outline-none")}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor={thesisId} className="text-[12px] font-medium text-text-subtle">
            Thesis
          </label>
          <button
            type="button"
            onClick={() => setThesis(IC_THESIS)}
            className="inline-flex h-6 items-center gap-1 border border-border bg-surface-2 px-2.5 text-[12px] font-medium text-text-muted transition-[border-color,color,transform] duration-150 ease-out hover:border-border-strong hover:text-text active:scale-[0.97]"
          >
            AMD share-gain thesis
          </button>
        </div>
        <textarea
          id={thesisId}
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          rows={4}
          className={cn(
            FIELD,
            "block w-full resize-none px-3 py-2.5 text-[14px] leading-[22px] text-text outline-none focus-visible:outline-none",
          )}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-text text-[14px] font-medium text-bg transition-[transform,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
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
        <p aria-live="polite" className="h-5 text-center text-[12px] text-text-subtle tabular-nums">
          {status === "running" ? `Running · ${Math.floor(elapsed / 1000)}s` : null}
          {status === "done" ? "Completed · 10s" : null}
        </p>
      </div>
    </div>
  );
}
