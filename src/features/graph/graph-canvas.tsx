"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Maximize2, Minus, Plus } from "lucide-react";
import { formatSignedPct, formatSignedUSD, scaleShock } from "@/lib/format";
import type { GraphLink, GraphNode, ShockGraph } from "@/lib/shock/graph";
import { HOP_MS, PALETTE, type GraphSettings } from "./settings";

type SimNode = SimulationNodeDatum & { id: string; data: GraphNode };
type SimLink = SimulationLinkDatum<SimNode> & { data: GraphLink };
type Camera = { x: number; y: number; k: number };

const ZOOM_BUTTONS = [
  { id: "in", label: "Zoom in", icon: Plus },
  { id: "out", label: "Zoom out", icon: Minus },
  { id: "fit", label: "Fit to view", icon: Maximize2 },
] as const;

type GraphCanvasProps = {
  graph: ShockGraph;
  settings: GraphSettings;
  severity: number;
  baseSeverity: number;
  // performance.now() when the current shock wave left the driver.
  runStart: number;
  reduce: boolean;
  selectedId: string | null;
  query: string;
  // Width covered on the right (the open note), kept clear when fitting.
  rightInset: number;
  onSelect: (id: string | null) => void;
};

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function heatOf(n: GraphNode, severity: number, base: number) {
  if (n.kind === "driver") return 1;
  if (n.kind === "channel") return 0.75;
  if (n.baseReturn === null) return 0;
  return clamp(Math.abs(scaleShock(n.baseReturn, severity, base)) / 0.22) ** 0.6;
}

function heatRgb(h: number) {
  const [a, b] = [PALETTE.hotLow, PALETTE.hotHigh];
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * h)) as [number, number, number];
}

function mixRgb(from: [number, number, number], to: [number, number, number], t: number) {
  return [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * t)) as [number, number, number];
}

const rgba = ([r, g, b]: [number, number, number], a = 1) => `rgba(${r},${g},${b},${a})`;
const GREY: [number, number, number] = [143, 143, 143];
const DIM: [number, number, number] = [92, 92, 92];
const PURPLE: [number, number, number] = [168, 130, 255];

// Seeded PRNG so the first layout is the same on every visit.
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function visibleOf(graph: ShockGraph, s: GraphSettings) {
  const nodes = graph.nodes.filter((n) => {
    if (n.kind === "source") return s.showSources;
    if (n.kind === "company" && !n.hit) return s.showContext;
    if (n.kind === "holding" && !n.hit) return s.showUnaffected;
    return true;
  });
  const ids = new Set(nodes.map((n) => n.id));
  const links = graph.links.filter((l) => ids.has(l.source) && ids.has(l.target));
  return { nodes, links };
}

// Obsidian's graph view, drawn on a canvas: d3-force physics, hover to light a node's neighbours, drag, wheel zoom.
// On top of it the shock travels hop by hop from the driver, heating every node it reaches.
export function GraphCanvas({ graph, settings, severity, baseSeverity, runStart, reduce, selectedId, query, rightInset, onSelect }: GraphCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const positions = useRef(new Map<string, { x: number; y: number; vx: number; vy: number }>());
  const cam = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const autoFit = useRef(true);
  const size = useRef({ w: 0, h: 0 });
  const hoverRef = useRef<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number; w: number } | null>(null);

  // Everything the draw loop reads, kept in one ref so the loop never restarts.
  const live = useRef({ settings, severity, baseSeverity, runStart, reduce, selectedId, query, rightInset });
  useEffect(() => {
    live.current = { settings, severity, baseSeverity, runStart, reduce, selectedId, query, rightInset };
  });

  const visible = useMemo(
    () => visibleOf(graph, settings),
    // Only the filters change what's drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, settings.showSources, settings.showContext, settings.showUnaffected],
  );

  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of visible.links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    }
    return m;
  }, [visible]);
  const neighboursRef = useRef(neighbours);
  useEffect(() => {
    neighboursRef.current = neighbours;
  }, [neighbours]);

  // (Re)build the simulation when the drawn set changes; nodes that were already on screen keep their place.
  useEffect(() => {
    const rand = prng(7);
    const prev = positions.current;
    const byId = new Map<string, SimNode>();
    const nodes: SimNode[] = visible.nodes.map((n) => {
      const p = prev.get(n.id);
      let x: number, y: number;
      if (p) ({ x, y } = p);
      else {
        // Seed by hop count so the layout unfolds outward from the driver.
        const ring = Number.isFinite(n.depth) ? n.depth * 70 : 260;
        const a = rand() * Math.PI * 2;
        x = Math.cos(a) * (ring + rand() * 40);
        y = Math.sin(a) * (ring + rand() * 40);
      }
      const sn: SimNode = { id: n.id, data: n, x, y, vx: p?.vx ?? 0, vy: p?.vy ?? 0 };
      byId.set(n.id, sn);
      return sn;
    });
    const links: SimLink[] = visible.links.map((l) => ({ source: byId.get(l.source)!, target: byId.get(l.target)!, data: l }));
    nodesRef.current = nodes;
    linksRef.current = links;

    const sim = forceSimulation<SimNode, SimLink>(nodes).alphaDecay(0.02).velocityDecay(0.38);
    sim.on("tick", () => {
      for (const n of nodes) positions.current.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, vx: n.vx ?? 0, vy: n.vy ?? 0 });
    });
    simRef.current = sim;
    applyForces(sim, links, live.current.settings);
    sim.alpha(prev.size ? 0.5 : 1).restart();
    return () => {
      sim.stop();
    };
  }, [visible]);

  // Forces follow the sliders live, like Obsidian.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    applyForces(sim, linksRef.current, settings);
    sim.alpha(Math.max(sim.alpha(), 0.35)).restart();
  }, [settings.center, settings.repel, settings.linkForce, settings.linkDistance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Canvas size tracks its box, at device resolution.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // First measure: put the world origin (where the layout blooms from) in the middle of the frame.
      if (size.current.w === 0) cam.current = { x: width >= 1000 ? 190 + width / 2 : width / 2, y: height / 2, k: 0.9 };
      size.current = { w: width, h: height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // A new scenario refits the camera.
  useEffect(() => {
    autoFit.current = true;
  }, [graph]);

  // The draw loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { settings: s, severity: sev, baseSeverity: base, runStart: run, reduce: rm, selectedId: sel, query: q, rightInset: right } = live.current;
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const { w, h } = size.current;
      if (!w || !h) return;
      const dpr = canvas.width / Math.max(1, w);
      const now = performance.now();
      const elapsed = rm ? Infinity : now - run;
      const arrive = (depth: number) => (Number.isFinite(depth) ? depth * HOP_MS : Infinity);

      // Wide frames keep the left column for the readout and the log.
      if (autoFit.current && nodes.length) fitCamera(nodes, w - right, h, cam.current, 0.12, w - right >= 1000 ? 380 : 0);
      const { x: cx, y: cy, k } = cam.current;

      // Focus: hovered node (else selected) and its neighbours; search dims what doesn't match.
      const focusId = hoverRef.current ?? sel;
      const focus = focusId ? new Set([focusId, ...(neighboursRef.current.get(focusId) ?? [])]) : null;
      const needle = q.trim().toLowerCase();
      const matches = (n: GraphNode) => !needle || n.label.toLowerCase().includes(needle) || n.sublabel.toLowerCase().includes(needle);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = PALETTE.bg;
      ctx.fillRect(0, 0, w, h);
      const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
      vignette.addColorStop(0, "rgba(255,255,255,0.025)");
      vignette.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * cx, dpr * cy);

      // The shock itself: rings rolling out of the driver.
      const driver = nodes.find((n) => n.data.kind === "driver");
      if (driver && !rm && elapsed > 0) {
        const reach = Math.max(
          200,
          ...nodes.filter((n) => n.data.hit).map((n) => Math.hypot((n.x ?? 0) - (driver.x ?? 0), (n.y ?? 0) - (driver.y ?? 0))),
        );
        const period = 2600;
        for (let i = 0; i < 2; i++) {
          const t = ((elapsed + i * (period / 2)) % period) / period;
          const r = driver.data.radius + easeOut(t) * reach;
          ctx.beginPath();
          ctx.arc(driver.x ?? 0, driver.y ?? 0, r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,70,50,${(1 - t) * 0.22})`;
          ctx.lineWidth = (2.2 * (1 - t) + 0.4) / k;
          ctx.stroke();
        }
      }

      // Links.
      for (const l of links) {
        const a = l.source as SimNode;
        const b = l.target as SimNode;
        const ax = a.x ?? 0, ay = a.y ?? 0, bx = b.x ?? 0, by = b.y ?? 0;
        const d = l.data;
        const inFocus = focus ? focus.has(a.id) && focus.has(b.id) && (a.id === focusId || b.id === focusId) : false;
        const dimmed = (focus && !inFocus) || (needle && !matches(a.data) && !matches(b.data));
        const baseW = (d.kind === "shock" ? 0.6 + Math.min(1.4, d.weight) : d.kind === "lookthrough" ? 0.5 + d.weight * 12 : 0.5) * s.linkThickness;

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.setLineDash(d.kind === "evidence" ? [3 / k, 3 / k] : []);
        ctx.strokeStyle = inFocus ? PALETTE.accent : d.kind === "context" ? "rgba(255,255,255,0.07)" : PALETTE.line;
        ctx.globalAlpha = dimmed ? 0.18 : 1;
        ctx.lineWidth = (inFocus ? baseW + 0.6 : baseW) / Math.max(0.6, k);
        ctx.stroke();
        ctx.setLineDash([]);

        // The shock travelling along a lit link: a hot trace growing from source to target, then a steady flow.
        if (d.hit && Number.isFinite(a.data.depth)) {
          const t0 = arrive(a.data.depth);
          const p = clamp((elapsed - t0) / HOP_MS);
          if (p > 0) {
            const evidence = d.kind === "evidence";
            const heat = evidence ? 0 : heatOf(b.data, sev, base);
            const col: [number, number, number] = evidence ? PURPLE : heatRgb(heat);
            const ep = easeOut(p);
            const ex = ax + (bx - ax) * ep, ey = ay + (by - ay) * ep;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = rgba(col, dimmed ? 0.12 : evidence ? 0.4 : 0.35 + 0.35 * heat);
            ctx.lineWidth = (baseW + (evidence ? 0 : 0.8)) / Math.max(0.6, k);
            ctx.stroke();
            if (p < 1 && !dimmed) {
              ctx.beginPath();
              ctx.arc(ex, ey, 2.6 / Math.sqrt(k), 0, Math.PI * 2);
              ctx.fillStyle = rgba(col, 1);
              ctx.shadowColor = rgba(col, 1);
              ctx.shadowBlur = 14;
              ctx.fill();
              ctx.shadowBlur = 0;
            } else if (p >= 1 && s.flow && !rm && !dimmed) {
              const len = Math.hypot(bx - ax, by - ay);
              const count = evidence ? 1 : Math.max(1, Math.min(3, Math.round(len / 60)));
              const speed = evidence ? 2600 : 1500 - heat * 600;
              for (let i = 0; i < count; i++) {
                const f = ((elapsed / speed + i / count) % 1 + 1) % 1;
                ctx.beginPath();
                ctx.arc(ax + (bx - ax) * f, ay + (by - ay) * f, 1.5 / Math.sqrt(k), 0, Math.PI * 2);
                ctx.fillStyle = rgba(col, 0.55 + 0.45 * Math.sin(f * Math.PI));
                ctx.fill();
              }
            }
          }
        }

        if (s.arrows && d.kind !== "context") {
          const ang = Math.atan2(by - ay, bx - ax);
          const r = b.data.radius * s.nodeSize + 1.5;
          const tx = bx - Math.cos(ang) * r, ty = by - Math.sin(ang) * r;
          const al = 5 / Math.max(0.6, k);
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - Math.cos(ang - 0.45) * al, ty - Math.sin(ang - 0.45) * al);
          ctx.lineTo(tx - Math.cos(ang + 0.45) * al, ty - Math.sin(ang + 0.45) * al);
          ctx.closePath();
          ctx.fillStyle = inFocus ? PALETTE.accent : "rgba(255,255,255,0.3)";
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Nodes.
      for (const n of nodes) {
        const g = n.data;
        const x = n.x ?? 0, y = n.y ?? 0;
        const t0 = arrive(g.depth);
        const p = clamp((elapsed - t0) / 380);
        const dimmed = (focus && !focus.has(n.id)) || (needle && !matches(g));
        let r = g.radius * s.nodeSize;
        if (g.kind === "driver" && !rm) r *= 1 + 0.07 * Math.sin(now / 280);

        let col: [number, number, number] = g.hit || g.kind === "source" ? GREY : DIM;
        let glow = 0;
        if (g.kind === "source" && Number.isFinite(g.depth)) {
          col = mixRgb(GREY, PURPLE, p);
          glow = 8 * p;
        } else if (g.hit) {
          const heat = heatOf(g, sev, base);
          col = mixRgb(GREY, g.kind === "channel" ? [255, 162, 76] : heatRgb(heat), p);
          glow = (6 + 16 * heat) * p;
        }
        if (focusId === n.id) col = mixRgb(col, PURPLE, 0.35);

        ctx.globalAlpha = dimmed ? 0.14 : 1;
        // Ignition ring as the shock lands.
        const since = elapsed - t0;
        if (g.hit && since > 0 && since < 1100 && !rm) {
          const e = easeOut(since / 1100);
          ctx.beginPath();
          ctx.arc(x, y, r + 4 + e * (14 + r), 0, Math.PI * 2);
          ctx.strokeStyle = rgba(g.kind === "channel" ? [255, 162, 76] : heatRgb(heatOf(g, sev, base)), (1 - e) * 0.9);
          ctx.lineWidth = 1.6 / k;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = rgba(col);
        if (glow > 0 && !dimmed) {
          ctx.shadowColor = rgba(col, 0.9);
          ctx.shadowBlur = glow;
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        // Your holdings carry their colour as a thin ring; the selected note gets a white one.
        if (g.kind === "holding" && g.color) {
          ctx.beginPath();
          ctx.arc(x, y, r + 2.2 / k, 0, Math.PI * 2);
          ctx.strokeStyle = g.color;
          ctx.lineWidth = 1.4 / k;
          ctx.stroke();
        }
        if (sel === n.id) {
          ctx.beginPath();
          ctx.arc(x, y, r + 5 / k, 0, Math.PI * 2);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5 / k;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Labels, in screen space so text stays crisp. Minor nodes fade in as you zoom, like Obsidian's text fade.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const fs = 11.5 * clamp(Math.sqrt(k), 0.85, 1.35);
      for (const n of nodes) {
        const g = n.data;
        const major = g.kind === "driver" || g.kind === "channel" || g.kind === "holding";
        const inFocus = focus?.has(n.id) ?? false;
        let a = major ? 1 : clamp((k - s.textFade) / 0.35);
        if (inFocus || sel === n.id || (needle && matches(g))) a = 1;
        if (focus && !inFocus) a *= 0.15;
        if (needle && !matches(g)) a *= 0.2;
        if (a <= 0.02) continue;
        const sx = (n.x ?? 0) * k + cx;
        const sy = (n.y ?? 0) * k + cy + g.radius * s.nodeSize * k + 4;
        if (sx < -100 || sx > w + 100 || sy < -40 || sy > h + 40) continue;
        ctx.globalAlpha = a;
        ctx.font = `${g.kind === "driver" ? 600 : major ? 500 : 400} ${g.kind === "driver" ? fs + 1.5 : fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = g.kind === "source" ? "#c9b6ff" : PALETTE.text;
        ctx.fillText(g.label, sx, sy);
        // Once the shock lands, the hit shows under the name.
        const landed = g.hit && g.baseReturn !== null && g.kind !== "driver" && elapsed - arrive(g.depth) > 0;
        if (landed && (major || k > s.textFade || inFocus)) {
          const ret = scaleShock(g.baseReturn!, sev, base);
          ctx.font = `500 ${fs - 1}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.fillStyle = rgba(heatRgb(heatOf(g, sev, base)));
          ctx.fillText(formatSignedPct(ret), sx, sy + fs + 2);
        }
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- Pointer: drag nodes, pan the background, wheel to zoom, click to open a note ----
  const drag = useRef<{ node: SimNode | null; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null);

  function toWorld(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { x, y, k } = cam.current;
    return { x: (clientX - rect.left - x) / k, y: (clientY - rect.top - y) / k, sx: clientX - rect.left, sy: clientY - rect.top };
  }

  function nodeAt(wx: number, wy: number) {
    const k = cam.current.k;
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of nodesRef.current) {
      const d = Math.hypot((n.x ?? 0) - wx, (n.y ?? 0) - wy);
      const r = n.data.radius * settings.nodeSize + 5 / k;
      if (d < r && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = toWorld(e.clientX, e.clientY);
    const node = nodeAt(p.x, p.y);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { node, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
      simRef.current?.alphaTarget(0.25).restart();
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = toWorld(e.clientX, e.clientY);
    const d = drag.current;
    if (d) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 3) d.moved = true;
      if (d.node) {
        d.node.fx = p.x;
        d.node.fy = p.y;
        if (d.moved) autoFit.current = false;
      } else if (d.moved) {
        cam.current.x += e.clientX - d.lastX;
        cam.current.y += e.clientY - d.lastY;
        autoFit.current = false;
      }
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      return;
    }
    const node = nodeAt(p.x, p.y);
    const id = node?.id ?? null;
    hoverRef.current = id;
    setHover(id ? { id, x: p.sx, y: p.sy, w: size.current.w } : null);
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.node) {
      d.node.fx = null;
      d.node.fy = null;
      simRef.current?.alphaTarget(0);
      if (!d.moved) onSelect(d.node.id);
    } else if (!d.moved) onSelect(null);
  }

  function onPointerLeave() {
    hoverRef.current = null;
    setHover(null);
  }

  // Wheel zoom around the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(cam.current, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - rect.left, e.clientY - rect.top);
      autoFit.current = false;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  function onZoom(id: (typeof ZOOM_BUTTONS)[number]["id"]) {
    const { w, h } = size.current;
    if (id === "fit") autoFit.current = true;
    else {
      autoFit.current = false;
      zoomAt(cam.current, id === "in" ? 1.3 : 1 / 1.3, w / 2, h / 2);
    }
  }

  const hoverNode = hover ? graph.nodes.find((n) => n.id === hover.id) : null;

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Graph of how the shock reaches your holdings. Select a node to read its note."
        className="block touch-none"
        style={{ cursor: hover ? "pointer" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
      />

      {hoverNode && hover ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[260px] border border-white/10 bg-[#262626]/95 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur"
          style={{ left: Math.min(hover.x + 14, hover.w - 270), top: hover.y + 14 }}
        >
          <p className="text-[13px] leading-5 font-medium text-[#dadada]">{hoverNode.label}</p>
          <p className="text-[11.5px] leading-4 text-[#8f8f8f]">{hoverNode.sublabel}</p>
          {hoverNode.hit && hoverNode.baseReturn !== null && hoverNode.kind !== "driver" ? (
            <p className="mt-1 font-mono text-[12px] text-[#ff6b4a] tabular-nums">
              {formatSignedPct(scaleShock(hoverNode.baseReturn, severity, baseSeverity))}
              {hoverNode.baseDollar !== null && hoverNode.exposure > 0
                ? ` · ${formatSignedUSD(scaleShock(hoverNode.baseDollar, severity, baseSeverity))}`
                : ""}
            </p>
          ) : null}
          {hoverNode.quotes.length ? (
            <p className="mt-1 text-[11px] text-[#a882ff]">
              {hoverNode.quotes.length} source{hoverNode.quotes.length === 1 ? "" : "s"} · click to open note
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="absolute right-3 bottom-3 z-10 flex flex-col border border-white/10 bg-[#262626]/90 backdrop-blur">
        {ZOOM_BUTTONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => onZoom(id)}
            className="flex size-8 items-center justify-center text-[#8f8f8f] transition-[color,background-color,border-color,scale] duration-150 hover:bg-white/5 active:scale-[0.95] hover:text-[#dadada]"
          >
            <Icon aria-hidden className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

function applyForces(sim: Simulation<SimNode, SimLink>, links: SimLink[], s: GraphSettings) {
  const factor: Record<GraphLink["kind"], number> = { shock: 1.25, lookthrough: 0.9, context: 0.8, evidence: 0.7 };
  sim
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((l) => s.linkDistance * factor[l.data.kind] + (l.source as SimNode).data.radius + (l.target as SimNode).data.radius)
        .strength((l) => {
          const a = l.source as SimNode;
          const b = l.target as SimNode;
          const deg = (n: SimNode) => links.filter((x) => x.source === n || x.target === n).length;
          return (s.linkForce * 0.9) / Math.min(deg(a), deg(b));
        }),
    )
    .force("charge", forceManyBody<SimNode>().strength((n) => -s.repel * (n.data.kind === "driver" ? 30 : n.data.kind === "channel" ? 20 : 11)).distanceMax(420))
    .force("x", forceX<SimNode>(0).strength(s.center * 0.12))
    .force("y", forceY<SimNode>(0).strength(s.center * 0.12))
    .force("collide", forceCollide<SimNode>((n) => n.data.radius * s.nodeSize + 3));
}

function zoomAt(c: Camera, factor: number, sx: number, sy: number) {
  const k = clamp(c.k * factor, 0.15, 6);
  const f = k / c.k;
  c.x = sx - (sx - c.x) * f;
  c.y = sy - (sy - c.y) * f;
  c.k = k;
}

// Eases the camera toward a view that holds every node, with room for the overlays.
function fitCamera(nodes: SimNode[], w: number, h: number, c: Camera, ease: number, left: number) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    const r = n.data.radius + 20;
    x0 = Math.min(x0, (n.x ?? 0) - r);
    y0 = Math.min(y0, (n.y ?? 0) - r);
    x1 = Math.max(x1, (n.x ?? 0) + r);
    y1 = Math.max(y1, (n.y ?? 0) + r);
  }
  const pad = 50;
  const k = clamp(Math.min((w - left - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0)), 0.2, 1.3);
  const tx = left + (w - left) / 2 - ((x0 + x1) / 2) * k;
  const ty = h / 2 - ((y0 + y1) / 2) * k;
  c.k += (k - c.k) * ease;
  c.x += (tx - c.x) * ease;
  c.y += (ty - c.y) * ease;
}
