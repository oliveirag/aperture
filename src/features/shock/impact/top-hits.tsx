"use client";

import { FileText } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { TickerMark } from "@/components/shared/ticker-mark";
import { HOLDINGS } from "@/data/portfolio";
import { useShock } from "@/features/shock/store";
import { formatSignedPct, formatSignedUSD, scaleShock } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ShockScenario } from "@/types/demo";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function TopHits({ scenario, severity }: { scenario: ShockScenario; severity: number }) {
  const selectedHolding = useShock((s) => s.selectedHolding);
  const selectedEdgeId = useShock((s) => s.selectedEdgeId);
  const selectHolding = useShock((s) => s.selectHolding);
  const selectEdge = useShock((s) => s.selectEdge);

  const rows = scenario.impacts
    .map((i) => ({
      ...i,
      ret: scaleShock(i.baseReturn, severity, scenario.baseSeverity),
      dollar: scaleShock(i.baseDollar, severity, scenario.baseSeverity),
      color: HOLDINGS.find((h) => h.ticker === i.ticker)?.color,
    }))
    .sort((a, b) => a.dollar - b.dollar);
  const nodeLabel = (id: string) => scenario.nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <ul className="-mx-2 flex flex-col gap-1">
      {rows.map((r) => {
        const open = selectedHolding === r.ticker;
        return (
          <motion.li
            key={r.ticker}
            layout
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className={cn("relative rounded-xl transition-colors duration-150", open && "bg-surface-2")}
          >
            {open ? <span aria-hidden className="absolute top-3 bottom-3 left-0 w-0.5 rounded-full bg-accent" /> : null}
            <button
              type="button"
              aria-expanded={open}
              onClick={() => selectHolding(open ? null : r.ticker)}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2"
            >
              <TickerMark ticker={r.ticker} color={r.color} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-text">{r.ticker}</span>
                <span className="block text-[12px] leading-4 text-text-muted">{r.pathLabel}</span>
              </span>
              <span className="text-right tabular-nums">
                <span className="block text-[14px] font-medium text-negative">{formatSignedPct(r.ret)}</span>
                <span className="block text-[12px] text-negative">{formatSignedUSD(r.dollar)}</span>
              </span>
            </button>

            <AnimatePresence initial={false}>
              {open ? (
                <motion.ol
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <div className="ml-7 flex flex-col gap-3 border-l border-border-strong pt-1 pb-4 pl-4">
                    {r.pathEdgeIds.map((id) => {
                      const edge = scenario.edges.find((e) => e.id === id);
                      if (!edge) return null;
                      const active = selectedEdgeId === id;
                      return (
                        <li key={id} className="relative">
                          <span
                            aria-hidden
                            className={cn(
                              "absolute top-1.5 -left-[19.5px] size-1.5 rounded-full",
                              active ? "bg-accent" : "bg-border-strong",
                            )}
                          />
                          <p className="text-[13px] text-text">
                            {nodeLabel(edge.from)} → {nodeLabel(edge.to)}
                          </p>
                          <p className="text-[12px] text-text-muted">{edge.label}</p>
                          <button
                            type="button"
                            onClick={() => selectEdge(id)}
                            className={cn(
                              "mt-1.5 inline-flex h-6 items-center gap-1.5 border px-2.5 text-[12px] font-medium transition-[border-color,color,transform] duration-150 ease-out active:scale-[0.97]",
                              active
                                ? "border-accent/60 text-text"
                                : "border-border text-text-muted hover:border-border-strong hover:text-text",
                            )}
                          >
                            <FileText aria-hidden className="size-3" />
                            Evidence
                          </button>
                        </li>
                      );
                    })}
                  </div>
                </motion.ol>
              ) : null}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ul>
  );
}
