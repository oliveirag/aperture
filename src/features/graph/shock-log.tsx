"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatSignedPct, formatSignedUSD } from "@/lib/format";
import type { GraphNode, ShockGraph } from "@/lib/shock/graph";
import { cn } from "@/lib/utils";
import { HOP_MS } from "./settings";

type Entry = { key: string; at: number; verb: "SHOCK" | "PULL" | "LOOK" | "DONE"; text: string; quote?: string; cite?: string; nodeId?: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One line per hop the wave makes, with the passage or data file that hop rests on, in the order they land.
function entriesOf(graph: ShockGraph, totals: { pct: number; dollar: number }): Entry[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: Entry[] = [];
  const groups = new Map<string, { from: GraphNode; targets: GraphNode[]; sourceId?: string; kind: string }>();
  for (const l of graph.links) {
    if (!l.hit || l.kind === "context" || l.kind === "evidence") continue;
    const from = byId.get(l.source)!;
    const to = byId.get(l.target)!;
    const key = l.kind === "aperture" ? `look-${to.id}` : `${from.id}-${l.sourceId}`;
    const g = groups.get(key) ?? { from: l.kind === "aperture" ? to : from, targets: [], sourceId: l.sourceId, kind: l.kind };
    g.targets.push(l.kind === "aperture" ? from : to);
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const srcNode = g.sourceId ? byId.get(`s:${g.sourceId}`) : undefined;
    const quote = srcNode?.quotes[0] ?? g.targets.flatMap((t) => t.quotes).find((q) => q.sourceId === g.sourceId);
    if (g.kind === "aperture") {
      const names = g.targets.map((t) => t.label);
      out.push({
        key,
        at: (Math.max(...g.targets.map((t) => t.depth)) + 1) * HOP_MS,
        verb: "LOOK",
        text: `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""} → ${g.from.label}`,
        cite: quote ? `${quote.issuer} · ${quote.date.slice(0, 10)}` : undefined,
        nodeId: g.from.id,
      });
      continue;
    }
    const kinds = new Set(g.targets.map((t) => t.kind));
    const what = g.targets.length === 1 ? g.targets[0].label : plural(g.targets.length, kinds.has("company") ? "company" : "node", kinds.has("company") ? "companies" : "nodes");
    out.push({
      key,
      at: (g.from.depth + 1) * HOP_MS,
      verb: g.from.kind === "driver" ? "SHOCK" : "PULL",
      text: `${g.from.label} → ${what}`,
      // Holdings pages are cited by name; their highlight is about a different company.
      quote: quote?.docType === "ETF holdings" ? undefined : quote?.highlight,
      cite: quote ? `${quote.title.replace(/ Form /, " ")}${quote.section ? ` · ${quote.section.replace(/^Item 1A\. /, "")}` : ""}` : undefined,
      nodeId: g.targets.length === 1 ? g.targets[0].id : srcNode?.id,
    });
  }
  out.sort((a, b) => a.at - b.at || a.text.localeCompare(b.text));
  out.push({ key: "done", at: (graph.maxDepth + 1) * HOP_MS, verb: "DONE", text: `Portfolio ${formatSignedPct(totals.pct)} (${formatSignedUSD(totals.dollar)})` });
  return out;
}

const VERB_COLOR: Record<Entry["verb"], string> = {
  SHOCK: "text-[#ff5a45]",
  PULL: "text-[#a882ff]",
  LOOK: "text-[#4fb3ff]",
  DONE: "text-[#7ee0a1]",
};

// The wave, narrated: a terminal-style log that fills in as each hop lands, citing what it pulled.
export function ShockLog({
  graph,
  runStart,
  reduce,
  totals,
  onOpen,
}: {
  graph: ShockGraph;
  runStart: number;
  reduce: boolean;
  totals: { pct: number; dollar: number };
  onOpen: (id: string) => void;
}) {
  const entries = useMemo(() => entriesOf(graph, totals), [graph, totals]);
  const last = entries[entries.length - 1]?.at ?? 0;
  const [elapsed, setElapsed] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      const t = performance.now() - runStart;
      setElapsed(t);
      if (t > last + 200) window.clearInterval(id);
    }, 80);
    return () => window.clearInterval(id);
  }, [runStart, last, reduce]);

  const shown = reduce ? entries : entries.filter((e) => e.at <= elapsed);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [shown.length]);

  return (
    <div className="w-[min(440px,calc(100vw-64px))] border border-white/10 bg-[#1a1a1a]/90 font-mono text-[11.5px] leading-[1.5] shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5 text-[10.5px] tracking-[0.08em] text-[#8f8f8f] uppercase">
        <span className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full", shown.length < entries.length ? "animate-pulse bg-[#ff5a45]" : "bg-[#7ee0a1]")} />
          Propagation log
        </span>
        <span className="tabular-nums">
          {shown.length}/{entries.length}
        </span>
      </div>
      <ol ref={listRef} className="max-h-[172px] overflow-y-auto px-3 py-2">
        {shown.map((e) => (
          <li key={e.key} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
            <button
              type="button"
              disabled={!e.nodeId}
              onClick={() => e.nodeId && onOpen(e.nodeId)}
              className="w-full py-0.5 text-left enabled:hover:bg-white/[0.04]"
            >
              <span className="text-[#5c5c5c] tabular-nums">{(e.at / 1000).toFixed(2).padStart(5, "0")}s </span>
              <span className={cn("inline-block w-[44px]", VERB_COLOR[e.verb])}>{e.verb}</span>
              <span className="text-[#dadada]">{e.text}</span>
              {e.quote ? <span className="block pl-[92px] text-[#c9b6ff]/90">Summary: {e.quote}</span> : null}
              {e.cite ? <span className="block truncate pl-[92px] text-[#8f8f8f]">↳ {e.cite}</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
