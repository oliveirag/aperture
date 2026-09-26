"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Building2, Cpu, LoaderCircle, Play, RotateCcw, type LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { PageHeader } from "@/components/shared/page-header";
import { HOLDINGS } from "@/data/portfolio";
import { getScenario, scenarioTotals, SCENARIOS } from "@/data/shock";
import { ShockModelContext, useShockData } from "@/features/shock/model-context";
import { useShock } from "@/features/shock/store";
import { scenarioIn, useShockModel } from "@/features/shock/use-shock-model";
import { formatSignedPct, formatSignedUSD } from "@/lib/format";
import { useLevel } from "@/lib/level";
import { usePortfolio } from "@/lib/portfolio-store";
import { buildShockGraph, isSeededEtf, type GraphHolding } from "@/lib/shock/graph";
import { cn } from "@/lib/utils";
import type { ScenarioId } from "@/types/demo";
import { GraphCanvas } from "./graph-canvas";
import { NotePanel } from "./note-panel";
import { HOP_MS, useGraphUi } from "./settings";
import { SettingsPanel } from "./settings-panel";
import { ShockLog } from "./shock-log";

const ICONS: Record<ScenarioId, LucideIcon> = { cre: Building2, "ai-capex": Cpu };
const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;
const NOTE_W = 420;

// Whether the note sits beside the graph (sm and up) or covers it.
function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

// The Graph tab: the Shock Test as an Obsidian-style knowledge graph of the active portfolio.
export function ShockGraphView() {
  const state = useShockModel();
  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-3 text-[18px] font-light text-text-muted" aria-busy="true">
        <LoaderCircle aria-hidden className="size-5 animate-spin text-accent" />
        Building the graph of your holdings…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <p className="flex items-start gap-3 text-[18px] font-light text-text">
          <AlertTriangle aria-hidden className="mt-1 size-5 shrink-0 text-sev-medium" />
          Couldn&apos;t map the scenarios onto your portfolio ({state.error}).
        </p>
        <button
          type="button"
          onClick={state.retry}
          className="inline-flex h-10 w-fit items-center gap-2 bg-text px-4 text-[14px] font-medium text-bg transition-[background-color,transform,translate,scale] duration-150 ease-out hover:bg-text/85 active:scale-[0.97]"
        >
          <RotateCcw aria-hidden className="size-4" />
          Try again
        </button>
      </div>
    );
  }
  return (
    <ShockModelContext value={state.model}>
      <GraphWorkspace />
    </ShockModelContext>
  );
}

function useGraphHoldings(): GraphHolding[] {
  const model = useShockData();
  const imported = usePortfolio((s) => s.imported);
  return useMemo(() => {
    if (model.mode === "demo" || !imported) {
      return HOLDINGS.map((h) => ({ ticker: h.ticker, name: h.name, kind: h.type, value: h.value, color: h.color }));
    }
    return imported.map((h) => ({
      ticker: h.ticker,
      name: h.name,
      kind: isSeededEtf(h.ticker) ? ("etf" as const) : ("stock" as const),
      value: h.shares * h.price,
      color: model.colors[h.ticker],
    }));
  }, [model, imported]);
}

function GraphWorkspace() {
  const model = useShockData();
  const scenarioId = useShock((s) => s.scenarioId);
  const severity = useShock((s) => s.severity);
  const setScenario = useShock((s) => s.setScenario);
  const setSeverity = useShock((s) => s.setSeverity);
  const level = useLevel((s) => s.level);
  const settings = useGraphUi((s) => s.settings);
  const reduce = useReducedMotion() ?? false;
  const holdings = useGraphHoldings();
  const wide = useWide();

  const scenario = scenarioIn(model, scenarioId);
  const graph = useMemo(() => buildShockGraph(scenario, holdings, model.total), [scenario, holdings, model.total]);
  const totals = useMemo(() => scenarioTotals(scenario, severity, model.total), [scenario, severity, model.total]);

  const [runStart, setRunStart] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(0);

  // Wave leaves the driver a beat after a replay; on first load, once the layout has mostly unfolded.
  const replay = useCallback((delay = 250) => setRunStart(performance.now() + delay), []);
  useEffect(() => {
    // Deep link: /shock/graph?scenario=ai-capex
    const id = new URLSearchParams(window.location.search).get("scenario");
    if (id === "cre" || id === "ai-capex") setScenario(id, getScenario(id).baseSeverity);
    const raf = requestAnimationFrame(() => replay(1300));
    return () => cancelAnimationFrame(raf);
  }, [replay, setScenario]);

  // Coarse clock for the header's hop counter.
  useEffect(() => {
    const end = runStart + (graph.maxDepth + 1) * HOP_MS + 100;
    const id = window.setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t > end) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [runStart, graph.maxDepth]);

  function pick(id: ScenarioId) {
    if (id !== scenarioId) {
      setScenario(id, getScenario(id).baseSeverity);
      setSelectedId(null);
    }
    // A new scenario re-lays the graph out first.
    replay(id !== scenarioId ? 900 : 250);
  }

  const hop = reduce ? graph.maxDepth : Math.max(0, Math.min(graph.maxDepth, Math.floor((now - runStart) / HOP_MS)));
  const settled = reduce || now - runStart > (graph.maxDepth + 1) * HOP_MS;
  const reached = graph.nodes.filter((n) => n.hit).length;
  const cited = graph.nodes.filter((n) => n.kind === "source").length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Shock Test · Graph"
        headline="Watch a shock travel through everything you own."
        subline="Every dot is a note: the shock, the channels it moves through, the companies inside your ETFs, and the filings and data files behind each link. Click any dot to read its evidence."
      />

      <div className="relative flex h-[calc(100dvh-140px)] max-h-[920px] min-h-[620px] flex-col overflow-hidden border border-white/10 bg-[#1e1e1e]">
        {/* Obsidian-style tab strip: one tab per prepared scenario, severity on the right. */}
        <div className="flex shrink-0 flex-wrap items-stretch justify-between gap-x-4 border-b border-white/[0.08] bg-[#161616]">
          <div role="tablist" aria-label="Scenario" className="flex min-w-0 overflow-x-auto">
            {SCENARIOS.map((s) => {
              const Icon = ICONS[s.id];
              const active = s.id === scenarioId;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => pick(s.id)}
                  title={s.description}
                  className={cn(
                    "relative flex h-10 shrink-0 items-center gap-2 border-r border-white/[0.06] px-4 text-[13px] transition-colors duration-150",
                    active ? "bg-[#1e1e1e] text-[#f0f0f0]" : "text-[#8f8f8f] hover:bg-white/[0.03] hover:text-[#dadada]",
                  )}
                >
                  <Icon aria-hidden className={cn("size-3.5", active ? "text-[#ff6b4a]" : "")} />
                  <span className="whitespace-nowrap">{s.label}</span>
                  {active ? <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-[#ff5a45]" /> : null}
                </button>
              );
            })}
          </div>
          <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-[12.5px] text-[#8f8f8f] sm:w-auto sm:flex-nowrap">
            <label htmlFor="graph-severity" className="whitespace-nowrap">
              <span className="font-mono text-[#ff6b4a] tabular-nums">−{severity}%</span> {scenario.severityLabel}
            </label>
            <input
              id="graph-severity"
              type="range"
              min={scenario.minSeverity}
              max={scenario.maxSeverity}
              step={1}
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
              className="h-1 min-w-[120px] flex-1 cursor-pointer accent-[#ff5a45] sm:w-[140px] sm:flex-none"
            />
            <button
              type="button"
              onClick={() => replay()}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 border border-white/10 px-2.5 text-[12px] text-[#dadada] transition-[background-color,transform,translate,scale] duration-150 hover:bg-white/5 active:scale-[0.97]"
            >
              <Play aria-hidden className="size-3" />
              Replay shock
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <GraphCanvas
            graph={graph}
            settings={settings}
            severity={severity}
            baseSeverity={scenario.baseSeverity}
            runStart={runStart}
            reduce={reduce}
            selectedId={selectedId}
            query={query}
            rightInset={selectedId && wide ? NOTE_W : 0}
            onSelect={setSelectedId}
          />

          {/* Readout: what the wave has done so far. */}
          <div className="pointer-events-none absolute top-4 left-4 z-10 max-w-[calc(100%-80px)]">
            <p className="text-[11px] tracking-[0.1em] text-[#8f8f8f] uppercase">
              {settled ? "Settled" : `Propagating · hop ${hop}/${graph.maxDepth}`}
            </p>
            <p className="mt-1 font-serif text-[40px] leading-none sm:text-[52px] font-light text-[#ff5a45] tabular-nums [text-shadow:0_0_24px_rgba(255,70,50,0.35)]">
              {settled ? (
                <AnimatedNumber value={totals.pct} from={0} duration={700} format={(v) => formatSignedPct(v)} />
              ) : (
                <span className="text-[#5c5c5c]">{formatSignedPct(0)}</span>
              )}
            </p>
            <p className="mt-1 text-[14px] text-[#dadada] tabular-nums">
              {settled ? <AnimatedNumber value={totals.dollar} from={0} duration={700} format={(v) => formatSignedUSD(v)} /> : "…"}
              <span className="text-[#8f8f8f]"> at {scenario.shortLabel.split(" −")[0]} −{severity}%</span>
            </p>
            <p className="mt-2 font-mono text-[11px] text-[#8f8f8f] tabular-nums">
              {reached} nodes reached · {cited} sources cited · {graph.links.length} links
            </p>
          </div>

          <div
            className="absolute top-4 right-4 z-20 transition-transform duration-[320ms] ease-drawer"
            style={{ transform: selectedId && wide ? `translateX(-${NOTE_W}px)` : "translateX(0)" }}
          >
            <SettingsPanel query={query} onQuery={setQuery} onReplay={() => replay()} />
          </div>

          <div className="absolute bottom-4 left-4 z-10 hidden sm:block">
            <ShockLog graph={graph} runStart={runStart} reduce={reduce} totals={totals} onOpen={setSelectedId} />
          </div>

          <AnimatePresence>
            {selectedId ? (
              <motion.div
                key="note"
                initial={reduce ? { opacity: 0 } : { x: "100%" }}
                animate={reduce ? { opacity: 1 } : { x: 0 }}
                exit={reduce ? { opacity: 0 } : { x: "100%" }}
                transition={{ duration: 0.32, ease: EASE_DRAWER }}
                className="absolute inset-y-0 right-0 z-30 w-full sm:w-[420px]"
              >
                <NotePanel
                  graph={graph}
                  nodeId={selectedId}
                  severity={severity}
                  baseSeverity={scenario.baseSeverity}
                  onOpen={setSelectedId}
                  onClose={() => setSelectedId(null)}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {level === "beginner" ? (
        <p className="-mt-4 text-[13px] text-text-muted">
          The red dot is the shock. Glowing dots are the companies it reaches; the brighter, the bigger the hit. Purple dots are
          the documents we read to draw each line. This is an estimate, not a prediction.
        </p>
      ) : (
        <p className="-mt-4 text-[13px] text-text-muted">
          Drag to pan, scroll to zoom, drag a dot to pull it. Hover to light its neighbours. The gear opens filters and forces.
        </p>
      )}
    </div>
  );
}
