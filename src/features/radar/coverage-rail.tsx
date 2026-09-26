"use client";

import { RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { Severity } from "@/data/radar";
import { cn } from "@/lib/utils";
import { formatPct } from "./format";

const ROWS: { severity: Severity; label: string; color: string }[] = [
  { severity: "high", label: "High", color: "var(--sev-high)" },
  { severity: "medium", label: "Medium", color: "var(--sev-medium)" },
  { severity: "low", label: "Low", color: "var(--sev-low)" },
];

export function CoverageRail({
  counts,
  filings,
  checking,
  checked,
  onRecheck,
  highExposure,
  lastChecked,
  checkedMessage = "No new filings since the last check.",
  children,
}: {
  counts: Partial<Record<Severity, number>>;
  filings: number;
  checking: boolean;
  checked: boolean;
  onRecheck: () => void;
  // Share of the portfolio in companies with a high-severity change.
  highExposure: number;
  lastChecked: string;
  checkedMessage?: string;
  // Extra notes under the counts (companies the live Radar couldn't cover).
  children?: ReactNode;
}) {
  const pct = formatPct(highExposure);

  return (
    <aside className="flex flex-col gap-5 bg-surface-1 p-5 xl:sticky xl:top-[88px]">
      <div>
        <p className="text-[13px] text-text-muted">Coverage</p>
        <p className="mt-1 text-[20px] font-medium tracking-[-0.01em] text-text">{filings} filings reviewed</p>
      </div>

      <ul className="flex flex-col gap-2 text-[13px]">
        {ROWS.filter((r) => counts[r.severity] !== undefined).map((r) => (
          <li key={r.severity} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-text-muted">
              <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: r.color }} />
              {r.label}
            </span>
            <span className="font-medium text-text tabular-nums">{counts[r.severity]}</span>
          </li>
        ))}
      </ul>

      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-sev-high" style={{ width: pct }} />
        </div>
        <p className="mt-2 text-[13px] leading-5 text-text-muted">
          <span className="font-medium text-text tabular-nums">{pct}</span> of your money is in companies with
          high-severity changes
        </p>
      </div>

      {children}

      <p className="text-[12px] text-text-subtle">Last checked {lastChecked}</p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onRecheck}
          disabled={checking}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border-strong text-[13px] font-medium text-text transition-[background-color,transform,opacity] duration-150 ease-out hover:bg-surface-2 active:scale-[0.97] disabled:opacity-60"
        >
          <RefreshCw aria-hidden className={cn("size-3.5", checking && "animate-spin")} />
          {checking ? "Checking filings" : "Re-check filings"}
        </button>
        <AnimatePresence>
          {checked && !checking ? (
            <motion.p
              role="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-center text-[12px] text-text-muted"
            >
              {checkedMessage}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </aside>
  );
}
