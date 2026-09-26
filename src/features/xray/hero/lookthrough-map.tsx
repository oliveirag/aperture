"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { Layers } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { SourceChip } from "@/components/shared/source-chip";
import { TickerMark } from "@/components/shared/ticker-mark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PORTFOLIO_TOTAL } from "@/data/portfolio";
import { XRAY_SOURCES } from "@/data/xray";
import { formatPct, formatUSD } from "@/lib/format";
import { useLevel } from "@/lib/level";
import { cn } from "@/lib/utils";
import { buildMap, type MapExposure } from "./build-map";

const MAP = buildMap();
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const INSTANT = { duration: 0 } as const;

type Selection = { kind: "position" | "exposure"; id: string };
const NVIDIA_PIN: Selection = { kind: "exposure", id: "NVDA" };

type Geo = { width: number; height: number; left: Record<string, number>; right: Record<string, number> };

const ROW =
  "relative flex h-12 w-full items-center gap-3 border border-transparent px-3 text-left transition-[background-color,border-color] duration-150 ease-out [@media(max-height:800px)]:h-10";

function sourceLine(e: MapExposure, advanced: boolean) {
  if (advanced) return e.sources.map((s) => `${s.via} ${formatPct(s.value / PORTFOLIO_TOTAL)}`).join(" · ");
  if (e.note) return e.note;
  return e.sources.map((s) => s.via).join(" · ");
}

// The X-Ray hero: 7 positions open up into what they actually hold. Hand-drawn SVG, positions measured from the DOM.
export function LookthroughMap() {
  const level = useLevel((s) => s.level);
  const advanced = level === "advanced";
  const still = Boolean(useReducedMotion());
  const [phase, setPhase] = useState(0); // 0: reveal, 1: weights counted, 2: NVIDIA pinned
  const [pinned, setPinned] = useState<Selection>(NVIDIA_PIN);
  const [hover, setHover] = useState<Selection | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), still ? 0 : 900);
    const t2 = setTimeout(() => setPhase(2), still ? 0 : 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [still]);

  useLayoutEffect(() => {
    const mid = midRef.current;
    if (!mid) return;
    const measure = () => {
      const box = mid.getBoundingClientRect();
      if (box.width === 0) return setGeo(null); // stacked layout: no connectors
      const left: Record<string, number> = {};
      const right: Record<string, number> = {};
      rows.current.forEach((el, key) => {
        const r = el.getBoundingClientRect();
        (key.startsWith("p:") ? left : right)[key.slice(2)] = r.top + r.height / 2 - box.top;
      });
      setGeo({ width: box.width, height: box.height, left, right });
    };
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(mid);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const active = hover ?? (phase >= 2 ? pinned : null);
  const isLit = (from: string, to: string) =>
    active !== null && (active.kind === "exposure" ? to === active.id : from === active.id);
  const nvidia = MAP.exposures[0];
  const showCallout = phase >= 2 && active?.kind === "exposure" && active.id === nvidia.id;

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(key, el);
    else rows.current.delete(key);
  };
  const interact = (sel: Selection) => ({
    onPointerEnter: () => setHover(sel),
    onPointerLeave: () => setHover(null),
    onFocus: () => setHover(sel),
    onBlur: () => setHover(null),
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      setPinned(sel);
    },
  });

  return (
    <div
      onClick={() => setPinned(NVIDIA_PIN)}
      className="bg-surface-1 p-6 [@media(max-height:800px)]:p-4"
    >
      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)_340px] lg:gap-0">
        {/* Your positions */}
        <div>
          <h2 className="mb-3 px-3 text-[13px] font-medium text-text-muted">Your positions</h2>
          <ul className="flex flex-col gap-2 [@media(max-height:800px)]:gap-1">
            {MAP.positions.map((p, i) => {
              const lit = active?.kind === "position" && active.id === p.id;
              return (
                <motion.li
                  key={p.id}
                  initial={{ opacity: 0, transform: "translateY(6px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={still ? INSTANT : { duration: 0.3, delay: i * 0.06, ease: EASE_OUT }}
                >
                  <button
                    type="button"
                    ref={register(`p:${p.id}`)}
                    {...interact({ kind: "position", id: p.id })}
                    className={cn(ROW, lit ? "border-border-strong bg-surface-2" : "hover:bg-surface-2")}
                  >
                    <TickerMark ticker={p.ticker} color={p.color} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-text">{p.ticker}</span>
                      <span className="block truncate text-[12px] text-text-muted">{p.category}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[14px] text-text tabular-nums">{formatUSD(p.value)}</span>
                      <span className="block text-[12px] text-text-muted tabular-nums">{formatPct(p.weight)}</span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </div>

        {/* Connectors */}
        <div ref={midRef} aria-hidden className="relative hidden lg:block">
          {geo ? (
            <svg width={geo.width} height={geo.height} className="absolute inset-0 overflow-visible">
              {MAP.drawOrder.map((id, order) => {
                const c = MAP.connectors.find((x) => x.id === id)!;
                const y1 = geo.left[c.from];
                const y2 = geo.right[c.to];
                if (y1 === undefined || y2 === undefined) return null;
                const w = geo.width;
                const lit = isLit(c.from, c.to);
                return (
                  <motion.path
                    key={c.id}
                    data-connector={c.id}
                    data-lit={lit ? "true" : "false"}
                    d={`M0,${y1} C${w * 0.45},${y1} ${w * 0.55},${y2} ${w},${y2}`}
                    fill="none"
                    strokeLinecap="round"
                    strokeWidth={1 + (9 * c.value) / 42000}
                    stroke={lit ? "var(--accent)" : "var(--border-strong)"}
                    style={{ opacity: active === null || lit ? 1 : 0.12, transition: "stroke 150ms ease-out, opacity 150ms ease-out" }}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={still ? INSTANT : { duration: 0.5, delay: 0.3 + order * 0.04, ease: EASE_OUT }}
                  />
                );
              })}
            </svg>
          ) : null}
          {geo && showCallout ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={still ? INSTANT : { duration: 0.2 }}
              className="absolute right-3 inline-flex items-center gap-2 rounded-full bg-surface-3 px-2.5 py-1 text-[12px] text-text tabular-nums"
              style={{ top: Math.max(0, geo.right[nvidia.id] - 36) }}
            >
              <span className="size-1.5 rounded-full bg-accent" />
              {nvidia.sources.length} paths · {formatUSD(nvidia.value)} · {formatPct(nvidia.weight)}
            </motion.div>
          ) : null}
        </div>

        {/* What you actually own */}
        <div className="lg:self-center">
          <h2 className="mb-3 px-3 text-[13px] font-medium text-text-muted">What you actually own</h2>
          <ul className="flex flex-col gap-2 [@media(max-height:800px)]:gap-1">
            {MAP.exposures.map((e, i) => {
              const lit = active?.kind === "exposure" && active.id === e.id;
              return (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={still ? INSTANT : { duration: 0.3, delay: 0.9 + i * 0.05, ease: EASE_OUT }}
                >
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          ref={register(`e:${e.id}`)}
                          {...interact({ kind: "exposure", id: e.id })}
                          className={cn(ROW, lit ? "border-accent/50 bg-surface-2" : "hover:bg-surface-2")}
                        />
                      }
                    >
                      {e.ticker ? (
                        <TickerMark ticker={e.ticker} color={e.color} size={32} />
                      ) : (
                        <span className="inline-flex size-8 shrink-0 items-center justify-center border border-border-strong text-text-muted">
                          <Layers aria-hidden className="size-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium text-text">{e.name}</span>
                        <span className="block truncate text-[12px] text-text-muted tabular-nums">
                          {sourceLine(e, advanced)}
                        </span>
                      </span>
                      <span className={cn("text-[18px] font-medium tabular-nums", lit ? "text-accent" : "text-text")}>
                        <AnimatedNumber value={phase >= 1 ? e.weight : 0} format={(v) => formatPct(v)} duration={500} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="flex-col items-stretch gap-1 border border-border-strong bg-surface-3 px-3 py-2 text-[12px] text-text [&_[data-slot=tooltip-arrow]]:hidden"
                    >
                      {e.sources.map((s) => (
                        <span key={s.via} className="flex justify-between gap-4 tabular-nums">
                          <span className="text-text-muted">{s.via === "Direct" ? "Direct" : `via ${s.via}`}</span>
                          <span>
                            {formatUSD(s.value, advanced ? 2 : 0)} · {formatPct(s.value / PORTFOLIO_TOTAL)}
                          </span>
                        </span>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                </motion.li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center gap-1.5 px-3" onClick={(e) => e.stopPropagation()}>
            <span className="mr-1 text-[12px] text-text-subtle">Holdings data</span>
            {XRAY_SOURCES.map((s) => (
              <SourceChip key={s.id} payload={{ source: s }} label={s.title.match(/\((\w+)\)/)?.[1] ?? s.issuer} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
