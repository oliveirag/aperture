import { ArrowRight } from "lucide-react";
import { PORTFOLIO_FIT, PORTFOLIO_FIT_NOTE, type FitRow } from "@/data/ic-room";
import { cn } from "@/lib/utils";
import { FIT_TABLE_ID } from "./fact-ref";
import { formatPct, formatPts, formatSignedUSD, formatUSD } from "./format";

function display(row: FitRow, n: number) {
  return row.kind === "usd" ? formatUSD(n) : formatPct(n);
}

function delta(row: FitRow) {
  const d = row.after - row.before;
  return row.kind === "usd" ? formatSignedUSD(d) : formatPts(d);
}

// More concentration reads as caution, a deeper drawdown as negative, anything else as neutral.
function tone(row: FitRow) {
  const d = row.after - row.before;
  if (row.kind === "weight" && d > 0) return "text-sev-medium";
  if (row.kind === "drawdown" && d < 0) return "text-negative";
  return "text-text-subtle";
}

export function FitTable() {
  return (
    <div
      id={FIT_TABLE_ID}
      tabIndex={-1}
      className="scroll-mt-24 bg-surface-1 outline-none transition-[box-shadow] duration-200 focus:shadow-[0_0_0_1px_var(--accent)]"
    >
      <table className="w-full text-[14px]">
        <caption className="sr-only">Portfolio before and after adding the position</caption>
        <thead className="max-sm:sr-only">
          <tr className="text-[11px] font-medium tracking-[0.04em] text-text-subtle uppercase">
            <th scope="col" className="px-4 pt-3 pb-2 text-left font-medium">
              Measure
            </th>
            <th scope="col" className="px-4 pt-3 pb-2 text-right font-medium">
              Before → after
            </th>
            <th scope="col" className="px-4 pt-3 pb-2 text-right font-medium">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {PORTFOLIO_FIT.map((row) => (
            <tr
              key={row.label}
              className="border-t border-border max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:gap-x-3 max-sm:py-2.5 sm:first:border-t-0 max-sm:first:border-t-0"
            >
              <th
                scope="row"
                className="px-4 py-2.5 text-left font-normal text-text-muted max-sm:col-span-2 max-sm:py-0 max-sm:pb-1"
              >
                {row.label}
              </th>
              <td className="px-4 py-2.5 text-right whitespace-nowrap text-text tabular-nums max-sm:py-0 max-sm:text-left">
                <span className="text-text-muted">{display(row, row.before)}</span>
                <ArrowRight className="mx-1.5 inline size-3.5 -translate-y-px text-text-subtle" aria-label="to" />
                <span className="font-medium">{display(row, row.after)}</span>
              </td>
              <td
                className={cn(
                  "px-4 py-2.5 text-right text-[13px] whitespace-nowrap tabular-nums max-sm:py-0",
                  tone(row),
                )}
              >
                {delta(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-4 py-2.5 text-[12px] text-text-subtle">{PORTFOLIO_FIT_NOTE}</p>
    </div>
  );
}
