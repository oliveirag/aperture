"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Term } from "@/components/shared/term";
import { TickerMark } from "@/components/shared/ticker-mark";
import type { GlossaryTerm } from "@/data/glossary";
import { formatSignedPct, formatSignedUSD } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ShockNode } from "@/types/demo";
import { DRIVER_R, NODE_SIZE } from "./timeline";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Wraps CRE, REIT and "regional bank" in glossary tooltips (Term is a no-op outside Beginner).
const TERMS: { re: RegExp; term: GlossaryTerm }[] = [
  { re: /regional bank/i, term: "regional bank" },
  { re: /\bREIT\b/, term: "REIT" },
  { re: /\bCRE\b/, term: "CRE" },
];

function withTerms(text: string): ReactNode {
  for (const { re, term } of TERMS) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      return (
        <>
          {withTerms(text.slice(0, m.index))}
          <Term term={term}>{m[0]}</Term>
          {withTerms(text.slice(m.index + m[0].length))}
        </>
      );
    }
  }
  return text;
}

type Common = {
  node: ShockNode;
  lit: boolean;
  dim: boolean;
  hasRun: boolean;
  onHover: (id: string | null) => void;
};

function nodeOpacity(lit: boolean, dim: boolean) {
  if (!lit) return 0.35;
  return dim ? 0.45 : 1;
}

export function DriverNode({
  node,
  lit,
  dim,
  hasRun,
  onHover,
  severity,
  runKey,
  reduce,
}: Common & { severity: number; runKey: number; reduce: boolean }) {
  const sub = (node.sublabel ?? "").replace("{severity}", String(severity));
  return (
    <g
      data-node={node.id}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      style={{ opacity: hasRun ? nodeOpacity(lit, dim) : 0.35, transition: "opacity 200ms ease" }}
    >
      {/* Idle: soft breathing scale. After a run: two expanding rings, then a slow opacity pulse on the ring. */}
      {hasRun && !reduce
        ? [0, 0.3].map((delay) => (
            <motion.circle
              key={`${runKey}-${delay}`}
              cx={node.x}
              cy={node.y}
              fill="none"
              style={{ stroke: "var(--accent)" }}
              strokeWidth={1.5}
              initial={{ r: DRIVER_R, opacity: 0.7 }}
              animate={{ r: DRIVER_R + 30, opacity: 0 }}
              transition={{ duration: 0.3, delay, ease: EASE_OUT }}
            />
          ))
        : null}
      <motion.g
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={!hasRun && !reduce ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={!hasRun && !reduce ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      >
        <circle cx={node.x} cy={node.y} r={DRIVER_R} style={{ fill: "var(--surface-2)" }} />
        <motion.circle
          cx={node.x}
          cy={node.y}
          r={DRIVER_R}
          fill="none"
          strokeWidth={1.5}
          style={{ stroke: "var(--accent)" }}
          animate={hasRun && !reduce ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
          transition={hasRun && !reduce ? { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 2.2 } : { duration: 0 }}
        />
      </motion.g>
      <foreignObject x={node.x - DRIVER_R} y={node.y - 12} width={DRIVER_R * 2} height={24} pointerEvents="none">
        <div className="flex h-full items-center justify-center text-[17px] font-semibold text-accent tabular-nums">{sub}</div>
      </foreignObject>
      <foreignObject x={node.x - 90} y={node.y + DRIVER_R + 8} width={180} height={44}>
        <p className="text-center text-[15px] leading-5 font-medium text-balance text-text">{withTerms(node.label)}</p>
      </foreignObject>
    </g>
  );
}

export function ChannelNode({ node, lit, dim, onHover }: Common) {
  const { w, h } = NODE_SIZE.channel;
  return (
    <foreignObject
      data-node={node.id}
      x={node.x - w / 2}
      y={node.y - h / 2}
      width={w}
      height={h}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      style={{ opacity: nodeOpacity(lit, dim), transition: "opacity 200ms ease" }}
    >
      <div
        className={cn(
          "flex h-full flex-col justify-center rounded-[12px] border bg-surface-2 px-3 transition-[border-color] duration-200",
          lit ? "border-accent/50" : "border-border",
        )}
      >
        <p className="truncate text-[14.5px] leading-5 font-medium text-text">{withTerms(node.label)}</p>
        {node.sublabel ? <p title={node.sublabel} className="truncate text-[12px] leading-4 text-text-muted">{node.sublabel}</p> : null}
      </div>
    </foreignObject>
  );
}

export function HoldingNode({
  node,
  lit,
  dim,
  onHover,
  color,
  selected,
  ret,
  dollar,
  countMs,
  onSelect,
}: Common & {
  color?: string;
  selected: boolean;
  ret: number | null;
  dollar: number | null;
  countMs: number;
  onSelect: (ticker: string) => void;
}) {
  const { w, h } = NODE_SIZE.holding;
  const ticker = node.ticker ?? node.label;
  const sub = node.sublabel?.split(" · ") ?? [];
  return (
    <foreignObject
      data-node={node.id}
      x={node.x - w / 2}
      y={node.y - h / 2}
      width={w}
      height={h}
      style={{ opacity: nodeOpacity(lit, dim), transition: "opacity 200ms ease" }}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${ticker}: show path`}
        onPointerEnter={() => onHover(node.id)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(node.id)}
        onBlur={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(ticker);
        }}
        className={cn(
          "flex h-full w-full items-center gap-2 rounded-[12px] border bg-surface-2 px-2.5 text-left transition-[border-color,background-color,transform] duration-150 ease-out outline-none active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-accent/60",
          selected ? "border-accent bg-surface-3" : lit ? "border-accent/50 hover:bg-surface-3" : "border-border",
        )}
      >
        <TickerMark ticker={ticker} color={color} size={24} />
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] leading-5 font-semibold text-text">{ticker}</span>
          {/* Category only; the portfolio weight is in the title (space is tight once the graph scales). */}
          <span title={sub.join(", ")} className="block truncate text-[12px] leading-4 text-text-muted">
            {withTerms(sub[0] ?? "")}
          </span>
        </span>
        {ret !== null && dollar !== null ? (
          <span className="text-right text-negative tabular-nums">
            <AnimatedNumber value={ret} from={0} duration={countMs} format={(v) => formatSignedPct(v)} className="block text-[16px] leading-5 font-semibold" />
            <AnimatedNumber value={dollar} from={0} duration={countMs} format={(v) => formatSignedUSD(v)} className="block text-[12.5px] leading-4" />
          </span>
        ) : null}
      </button>
    </foreignObject>
  );
}
