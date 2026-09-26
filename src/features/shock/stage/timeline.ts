"use client";

import { useEffect, useState } from "react";
import type { ShockEdge, ShockNode, ShockScenario } from "@/types/demo";

// ---- Geometry (viewBox 0 0 1000 560; node x/y are centers) ----

export const DRIVER_R = 34;
export const NODE_SIZE = { channel: { w: 200, h: 56 }, holding: { w: 220, h: 64 } } as const;
const ARROW_GAP = 7;

function halfWidth(n: ShockNode) {
  return n.kind === "driver" ? DRIVER_R : NODE_SIZE[n.kind].w / 2;
}

// Cubic Bézier from the source's right edge to just before the target's left edge (room for the arrowhead).
export function edgeGeometry(from: ShockNode, to: ShockNode) {
  const x1 = from.x + halfWidth(from);
  const y1 = from.y;
  const tip = to.x - halfWidth(to);
  const x2 = tip - ARROW_GAP;
  const y2 = to.y;
  const dx = x2 - x1;
  const d = `M ${x1} ${y1} C ${x1 + dx * 0.5} ${y1}, ${x2 - dx * 0.5} ${y2}, ${x2} ${y2}`;
  // Midpoint of a symmetric cubic at t = 0.5.
  const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const arrow = `${tip},${y2} ${x2 - 1},${y2 - 5} ${x2 - 1},${y2 + 5}`;
  return { d, mid, arrow, span: dx };
}

export function strokeFor(edge: ShockEdge) {
  return 1.5 + 3 * Math.min(edge.weight, 1);
}

// ---- Run timeline ----
// Depth-1 edges start at 400ms, depth-2 at 800ms, depth-3 at 1200ms; each draws in 350ms.
// A node lights when its first incoming edge finishes. Header numbers arrive at 1500ms; the run settles by 2200ms.

export const EDGE_DRAW_MS = 350;
const DEPTH_STEP_MS = 400;
export const HEADLINE_MS = 1500;
export const DONE_MS = 2200;

export function buildTimeline(s: ShockScenario) {
  const driver = s.nodes.find((n) => n.kind === "driver");
  const depth = new Map<string, number>();
  if (driver) depth.set(driver.id, 0);
  let frontier = driver ? [driver.id] : [];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of s.edges) {
        if (e.from === id && !depth.has(e.to)) {
          depth.set(e.to, (depth.get(id) ?? 0) + 1);
          next.push(e.to);
        }
      }
    }
    frontier = next;
  }

  const edgeDelay: Record<string, number> = {};
  const nodeLit: Record<string, number> = driver ? { [driver.id]: 0 } : {};
  for (const e of s.edges) {
    const start = ((depth.get(e.from) ?? 0) + 1) * DEPTH_STEP_MS;
    edgeDelay[e.id] = start;
    const end = start + EDGE_DRAW_MS;
    nodeLit[e.to] = Math.min(nodeLit[e.to] ?? Infinity, end);
  }
  return { edgeDelay, nodeLit };
}

// Every edge on any modeled path that passes through a node.
export function pathsThrough(s: ShockScenario, nodeId: string) {
  const touches = (edgeId: string) => {
    const e = s.edges.find((x) => x.id === edgeId);
    return !!e && (e.from === nodeId || e.to === nodeId);
  };
  const ids = new Set<string>();
  for (const i of s.impacts) if (i.pathEdgeIds.some(touches)) i.pathEdgeIds.forEach((id) => ids.add(id));
  return ids;
}

// Milestones reached so far for the current run. State is keyed by runKey so a new run starts empty
// without a synchronous reset; with reduced motion everything is reached at once.
export function useRunTimeline(s: ShockScenario, runKey: number, reduce: boolean) {
  const [reached, setReached] = useState({ key: -1, ms: -1 });

  useEffect(() => {
    if (runKey === 0 || reduce) return;
    const { nodeLit } = buildTimeline(s);
    const marks = [...new Set([...Object.values(nodeLit), HEADLINE_MS, DONE_MS])].sort((a, b) => a - b);
    const timers = marks.map((ms) => window.setTimeout(() => setReached({ key: runKey, ms }), ms));
    return () => timers.forEach(clearTimeout);
  }, [s, runKey, reduce]);

  const ms = runKey === 0 ? -1 : reduce ? Infinity : reached.key === runKey ? reached.ms : -1;
  return {
    ms,
    headline: ms >= HEADLINE_MS,
    done: ms >= DONE_MS,
  };
}
