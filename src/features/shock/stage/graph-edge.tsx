"use client";

import { motion } from "motion/react";
import type { KeyboardEvent } from "react";
import type { ShockEdge } from "@/types/demo";
import { EDGE_DRAW_MS, strokeFor } from "./timeline";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export type EdgeState = "normal" | "hover" | "path" | "selected" | "dim";

type GraphEdgeProps = {
  edge: ShockEdge;
  geo: { d: string; mid: { x: number; y: number }; arrow: string };
  delayMs: number;
  reduce: boolean;
  state: EdgeState;
  hovered: boolean;
  advancedTag: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
};

const STROKE: Record<EdgeState, string> = {
  normal: "var(--border-strong)",
  dim: "var(--border-strong)",
  hover: "var(--text-muted)",
  path: "var(--accent)",
  selected: "var(--accent)",
};

export function GraphEdge({ edge, geo, delayMs, reduce, state, hovered, advancedTag, onHover, onSelect }: GraphEdgeProps) {
  const base = strokeFor(edge);
  const width = state === "selected" ? Math.max(3, base) : hovered ? base + 1.5 : base;
  const opacity = state === "dim" ? 0.25 : 1;
  const draw = { duration: reduce ? 0 : EDGE_DRAW_MS / 1000, delay: reduce ? 0 : delayMs / 1000, ease: EASE_OUT };
  const tag = hovered ? edge.label : advancedTag;

  function onKeyDown(e: KeyboardEvent<SVGGElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(edge.id);
    }
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${edge.label}. Show evidence`}
      data-edge={edge.id}
      data-state={state}
      className="cursor-pointer outline-none [&:focus-visible_.hit]:stroke-accent/30"
      onPointerEnter={() => onHover(edge.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(edge.id)}
      onBlur={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(edge.id);
      }}
      onKeyDown={onKeyDown}
    >
      <g style={{ opacity, transition: "opacity 150ms ease" }}>
        <motion.path
          d={geo.d}
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={draw}
          style={{ stroke: STROKE[state], strokeWidth: width, transition: "stroke 150ms ease, stroke-width 150ms ease" }}
        />
        {state === "path" && !reduce ? (
          <motion.path
            d={geo.d}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="4 10"
            initial={{ strokeDashoffset: 0 }}
            animate={{ strokeDashoffset: -28 }}
            transition={{ duration: 1.2, ease: "linear", repeat: Infinity }}
            style={{ stroke: "var(--text)", strokeWidth: Math.max(1.5, width - 1.5), opacity: 0.55 }}
          />
        ) : null}
        <motion.polygon
          points={geo.arrow}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.15, delay: reduce ? 0 : (delayMs + EDGE_DRAW_MS - 60) / 1000 }}
          style={{ fill: STROKE[state], transition: "fill 150ms ease" }}
        />
      </g>
      {/* Invisible 14px hit area so thin edges are easy to click. */}
      <path className="hit" d={geo.d} fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke" />
      {tag ? (
        <foreignObject x={geo.mid.x - 130} y={geo.mid.y - 13} width={260} height={26} pointerEvents="none">
          <div className="flex h-full items-center justify-center">
            <span className="rounded-full border border-border-strong bg-surface-3 px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap text-text tabular-nums">
              {tag}
            </span>
          </div>
        </foreignObject>
      ) : null}
    </g>
  );
}
