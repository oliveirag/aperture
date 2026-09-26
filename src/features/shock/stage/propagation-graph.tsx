"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HOLDINGS } from "@/data/portfolio";
import { useShock } from "@/features/shock/store";
import { scaleShock } from "@/lib/format";
import type { Level } from "@/lib/level";
import type { ShockEdge, ShockScenario } from "@/types/demo";
import { GraphEdge, type EdgeState } from "./graph-edge";
import { ChannelNode, DriverNode, HoldingNode } from "./graph-node";
import { buildTimeline, edgeGeometry, pathsThrough } from "./timeline";

type PropagationGraphProps = {
  scenario: ShockScenario;
  severity: number;
  hasRun: boolean;
  runKey: number;
  ms: number;
  done: boolean;
  reduce: boolean;
  level: Level;
};

// The shock's path from the macro driver into the user's holdings. Hand-drawn SVG; nodes are HTML in foreignObject.
// The Advanced pill sits on the edge midpoint; short edges only have room for the weight, and the
// shortest none, so the pill never covers a node or the driver caption.
function advancedTag(edge: ShockEdge, span: number) {
  if (span >= 150) return `w ${edge.weight.toFixed(2)} · ${edge.method}`;
  if (span >= 70) return `w ${edge.weight.toFixed(2)}`;
  return null;
}

export function PropagationGraph({ scenario, severity, hasRun, runKey, ms, done, reduce, level }: PropagationGraphProps) {
  const selectedHolding = useShock((s) => s.selectedHolding);
  const selectedEdgeId = useShock((s) => s.selectedEdgeId);
  const selectHolding = useShock((s) => s.selectHolding);
  const selectEdge = useShock((s) => s.selectEdge);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);

  const timeline = useMemo(() => buildTimeline(scenario), [scenario]);
  const byId = useMemo(() => new Map(scenario.nodes.map((n) => [n.id, n])), [scenario]);

  // Selection wins over hover; hover of a node lights every path through it.
  const selectedPath = new Set(
    selectedHolding ? (scenario.impacts.find((i) => i.ticker === selectedHolding)?.pathEdgeIds ?? []) : [],
  );
  const hoverPath = !hasRun
    ? new Set<string>()
    : hoverNode
      ? pathsThrough(scenario, hoverNode)
      : hoverEdge
        ? new Set([hoverEdge])
        : new Set<string>();
  const focus = selectedPath.size ? selectedPath : hoverPath;
  const focusNodes = new Set<string>();
  for (const e of scenario.edges) {
    if (focus.has(e.id)) {
      focusNodes.add(e.from);
      focusNodes.add(e.to);
    }
  }

  function edgeState(id: string): EdgeState {
    if (id === selectedEdgeId) return "selected";
    if (selectedPath.has(id)) return "path";
    if (focus.size && !focus.has(id)) return "dim";
    if (hoverPath.has(id)) return "hover";
    return "normal";
  }

  const lit = (id: string) => hasRun && ms >= (timeline.nodeLit[id] ?? Infinity);
  const dim = (id: string) => focus.size > 0 && !focusNodes.has(id);
  const countMs = done ? 250 : 500;

  return (
    <div className="relative">
      <svg
        viewBox="0 0 1000 560"
        role="group"
        aria-label={`How ${scenario.label.toLowerCase()} reaches your holdings`}
        className="block h-auto w-full select-none"
        onClick={() => selectHolding(null)}
      >
        <AnimatePresence initial={false}>
          <motion.g key={`${scenario.id}-${runKey}`} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
            {hasRun
              ? scenario.edges.map((edge) => {
                  const from = byId.get(edge.from);
                  const to = byId.get(edge.to);
                  if (!from || !to) return null;
                  const geo = edgeGeometry(from, to);
                  return (
                    <GraphEdge
                      key={edge.id}
                      edge={edge}
                      geo={geo}
                      delayMs={timeline.edgeDelay[edge.id]}
                      reduce={reduce}
                      state={edgeState(edge.id)}
                      hovered={hoverEdge === edge.id}
                      advancedTag={level === "advanced" ? advancedTag(edge, geo.span) : null}
                      onHover={setHoverEdge}
                      onSelect={selectEdge}
                    />
                  );
                })
              : null}

            {scenario.nodes.map((node) => {
              const common = { node, lit: lit(node.id), dim: dim(node.id), hasRun, onHover: setHoverNode };
              if (node.kind === "driver") {
                return <DriverNode key={node.id} {...common} severity={severity} runKey={runKey} reduce={reduce} />;
              }
              if (node.kind === "channel") return <ChannelNode key={node.id} {...common} />;
              const impact = scenario.impacts.find((i) => i.ticker === node.ticker);
              const show = common.lit && !!impact;
              return (
                <HoldingNode
                  key={node.id}
                  {...common}
                  color={HOLDINGS.find((h) => h.ticker === node.ticker)?.color}
                  selected={selectedHolding === node.ticker}
                  ret={show && impact ? scaleShock(impact.baseReturn, severity, scenario.baseSeverity) : null}
                  dollar={show && impact ? scaleShock(impact.baseDollar, severity, scenario.baseSeverity) : null}
                  countMs={countMs}
                  onSelect={(t) => {
                    if (!hasRun) return;
                    selectHolding(selectedHolding === t ? null : t);
                  }}
                />
              );
            })}
          </motion.g>
        </AnimatePresence>
      </svg>

      {!hasRun ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="border border-border bg-surface-1/90 px-4 py-2 text-[13px] text-text-muted">
            Pick a scenario to trace it through your holdings
          </p>
        </div>
      ) : null}
    </div>
  );
}
