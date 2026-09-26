"use client";

import { Fragment } from "react";
import { ChevronDown, RefreshCw, Target } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { SourceChip } from "@/components/shared/source-chip";
import { formatSourceDate } from "@/components/shared/source-drawer";
import { TickerMark } from "@/components/shared/ticker-mark";
import type { RadarCard as RadarCardData } from "@/data/radar";
import { cn } from "@/lib/utils";
import { ChangeItem } from "./change-item";
import { formatPct } from "./format";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Puts the exposure figure in the sentence in the accent color, the one number the reader should carry away.
function WhyText({ text, pct }: { text: string; pct: string }) {
  const parts = text.split(pct);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 ? <span className="font-medium text-accent">{pct}</span> : null}
        </Fragment>
      ))}
    </>
  );
}

export function RadarCard({
  card,
  expanded,
  onToggle,
  index,
  onRefresh,
  refreshing = false,
}: {
  card: RadarCardData;
  expanded: boolean;
  onToggle: () => void;
  index: number;
  // Live cards only: re-check SEC for a newer filing of this company.
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const reduce = useReducedMotion();
  const panelId = `radar-${card.id}-changes`;
  const pct = formatPct(card.exposureWeight);

  return (
    <motion.article
      initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(6px)" }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: EASE_OUT }}
      className="relative bg-surface-1 transition-[border-color] duration-150 ease-out hover:border-border-strong"
    >
      {card.severity === "high" ? (
        <span aria-hidden className="absolute top-5 bottom-5 -left-px w-0.5 rounded-full bg-sev-high" />
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="block w-full rounded-t-2xl px-5 pt-5 pb-4 text-left"
      >
        <div className="flex items-center gap-3">
          <TickerMark ticker={card.ticker} color={card.color} size={32} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2">
              <span className="text-[15px] font-medium text-text">{card.company}</span>
              <span className="text-[13px] text-text-muted">{card.ticker}</span>
            </p>
            <p className="text-[12px] text-text-subtle tabular-nums">
              {card.filingType} · filed {formatSourceDate(card.filedAt)} · vs {formatSourceDate(card.priorFiledAt)}
            </p>
          </div>
          <SeverityBadge severity={card.severity} />
        </div>

        <p className="mt-4 text-[12px] font-medium text-text-subtle">{card.category}</p>
        <h3 className="mt-1 text-[17px] leading-6 font-medium tracking-[-0.01em] text-balance text-text">
          {card.title}
        </h3>
        <p className={cn("mt-1.5 text-[14px] leading-[22px] text-text-muted", !expanded && "line-clamp-2")}>
          {card.summary}
        </p>
      </button>

      <div className="mx-5 flex items-start gap-3 bg-surface-2 px-4 py-3">
        <Target className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <p className="text-[13px] leading-5 text-text-muted">
          <span className="font-medium text-text">Why this matters to you. </span>
          <WhyText text={card.whyItMatters} pct={pct} />
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <SourceChip payload={{ source: card.source }} label={`${card.filingType} · ${card.company}`} />
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label={`Refresh ${card.company} filings`}
              className="inline-flex h-6 items-center gap-1.5 px-2 text-[12px] font-medium text-text-muted transition-[color,opacity] duration-150 ease-out hover:text-text disabled:opacity-60"
            >
              <RefreshCw aria-hidden className={cn("size-3", refreshing && "animate-spin")} />
              {refreshing ? "Checking" : "Refresh"}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-text-muted transition-[color,background-color] duration-150 ease-out hover:bg-surface-2 hover:text-text"
        >
          {expanded ? "Hide changes" : `Show changes (${card.changes.length})`}
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform duration-200 ease-out", expanded && "rotate-180")}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={panelId}
            key="changes"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
            transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <ul className="flex flex-col gap-5 border-t border-border px-5 py-5">
              {card.changes.map((change) => (
                <ChangeItem key={change.label} card={card} change={change} />
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}
