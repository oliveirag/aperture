"use client";

import { Fragment, type ReactNode } from "react";
import { ArrowUpRight, Database, FileText, Hash, Link2, Sigma, Waypoints, X, Zap } from "lucide-react";
import { formatPct, formatSignedPct, formatSignedUSD, formatUSD, scaleShock } from "@/lib/format";
import type { GraphNode, Quote, ShockGraph } from "@/lib/shock/graph";
import { cn } from "@/lib/utils";
import { HOP_MS } from "./settings";

const KIND_LABEL: Record<GraphNode["kind"], string> = {
  driver: "Shock",
  channel: "Channel",
  holding: "Your holding",
  company: "Look-through company",
  source: "Source",
};

// Shortest lit path from the driver to a node (the route the wave took).
function pathTo(graph: ShockGraph, id: string): GraphNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const target = byId.get(id);
  if (!target || !Number.isFinite(target.depth)) return [];
  const path = [target];
  let cur = target;
  while (cur.depth > 0) {
    const prev = graph.links
      .filter((l) => l.hit && l.kind !== "evidence" && l.target === cur.id)
      .map((l) => byId.get(l.source)!)
      .find((n) => n.depth === cur.depth - 1);
    if (!prev) break;
    path.unshift(prev);
    cur = prev;
  }
  return path;
}

function Highlighted({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight) return <>{text}</>;
  const i = text.indexOf(highlight);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-[#a882ff]/25 px-0.5 text-[#e8e0ff]">{highlight}</mark>
      {text.slice(i + highlight.length)}
    </>
  );
}

function WikiLink({ node, onOpen }: { node: GraphNode; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(node.id)}
      className="text-[#a882ff] underline decoration-[#a882ff]/40 underline-offset-2 transition-colors duration-150 hover:text-[#c9b6ff] hover:decoration-[#c9b6ff]"
    >
      {node.label}
    </button>
  );
}

function Property({ icon: Icon, name, children }: { icon: typeof Hash; name: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] items-baseline gap-2 py-1 text-[13px]">
      <span className="flex items-center gap-1.5 text-[#8f8f8f]">
        <Icon aria-hidden className="size-3.5 shrink-0 translate-y-[2px]" />
        {name}
      </span>
      <span className="min-w-0 text-[#dadada] tabular-nums">{children}</span>
    </div>
  );
}

function QuoteCallout({ q }: { q: Quote }) {
  const isData = q.kind === "data";
  return (
    <figure className={cn("border-l-2 bg-white/[0.03] py-2.5 pr-3 pl-3", isData ? "border-[#4fb3ff]" : "border-[#a882ff]")}>
      <figcaption className="flex items-start gap-2 text-[12px] leading-4">
        {isData ? (
          <Database aria-hidden className="mt-px size-3.5 shrink-0 text-[#4fb3ff]" />
        ) : (
          <FileText aria-hidden className="mt-px size-3.5 shrink-0 text-[#a882ff]" />
        )}
        <span className="min-w-0">
          <span className="block font-medium text-[#dadada]">{q.title}</span>
          <span className="block text-[#8f8f8f]">
            {q.issuer}
            {q.section ? ` · ${q.section}` : ""} · {q.date}
          </span>
        </span>
      </figcaption>

      {q.rows ? (
        <div className="mt-2 max-h-[220px] overflow-auto border border-white/[0.06]">
          <table className="w-full font-mono text-[11.5px] leading-4">
            <thead className="sticky top-0 bg-[#262626] text-left text-[#8f8f8f]">
              <tr>
                {q.columns?.map((c) => (
                  <th key={c} className={cn("px-2 py-1 font-normal", c === "weight" && "text-right")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.rows.map((r, i) => (
                <tr key={i} className="border-t border-white/[0.04]">
                  {r.cells.map((c, j) => (
                    <td
                      key={j}
                      className={cn(
                        "px-2 py-0.5 whitespace-nowrap",
                        j === 1 && "max-w-[150px] truncate",
                        j === r.cells.length - 1 && "text-right tabular-nums",
                        r.hit ? "text-[#ff8a6b]" : "text-[#bdbdbd]",
                      )}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {q.text ? (
        <blockquote className={cn("mt-2 text-[13px] leading-[1.55] text-[#cfcfcf]", !isData && "italic")}>
          {isData ? q.text : <>&ldquo;<Highlighted text={q.text} highlight={q.highlight} />&rdquo;</>}
        </blockquote>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11.5px]">
        {q.supports ? <span className="text-[#8f8f8f]">Backs: {q.supports}</span> : <span />}
        {q.url ? (
          <a
            href={q.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-[#a882ff] transition-colors duration-150 hover:text-[#c9b6ff]"
          >
            Open source
            <ArrowUpRight aria-hidden className="size-3" />
          </a>
        ) : isData ? (
          <span className="font-mono text-[#4fb3ff]/80">etf-seed.json</span>
        ) : null}
      </div>
    </figure>
  );
}

// A node's note, laid out like an Obsidian page: inline title, properties, the path in, quoted evidence, backlinks.
export function NotePanel({
  graph,
  nodeId,
  severity,
  baseSeverity,
  onOpen,
  onClose,
}: {
  graph: ShockGraph;
  nodeId: string;
  severity: number;
  baseSeverity: number;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node) return null;
  const path = pathTo(graph, node.id);
  const incoming = graph.links.filter((l) => l.target === node.id);
  const outgoing = graph.links.filter((l) => l.source === node.id);
  const ret = node.baseReturn !== null ? scaleShock(node.baseReturn, severity, baseSeverity) : null;
  const dollar = node.baseDollar !== null ? scaleShock(node.baseDollar, severity, baseSeverity) : null;
  // Evidence: the node's own quotes; a source note shows its document, a driver shows what each first hop rests on.
  const quotes =
    node.kind === "driver"
      ? outgoing.flatMap((l) => byId.get(l.target)?.quotes.filter((q) => q.supports?.startsWith(node.label)) ?? [])
      : node.quotes;

  return (
    <aside
      aria-label={`Note: ${node.label}`}
      className="flex h-full w-full flex-col border-l border-white/10 bg-[#202020]/[0.97] text-[#dadada] shadow-[-12px_0_32px_rgba(0,0,0,0.45)] backdrop-blur"
    >
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-3 text-[12px] text-[#8f8f8f]">
        <span className="min-w-0 truncate">
          Shock graph <span className="text-[#5c5c5c]">/</span> {KIND_LABEL[node.kind]}{" "}
          <span className="text-[#5c5c5c]">/</span> <span className="text-[#dadada]">{node.label}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close note"
          className="flex size-7 items-center justify-center text-[#8f8f8f] transition-colors duration-150 hover:bg-white/5 hover:text-[#dadada]"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
        <h2 className="text-[26px] leading-tight font-semibold tracking-[-0.01em] text-[#f0f0f0]">{node.label}</h2>
        <p className="mt-1 text-[13px] text-[#8f8f8f]">{node.sublabel}</p>

        <section className="mt-4 border-y border-white/[0.06] py-2">
          <Property icon={Hash} name="type">
            <span className="bg-[#a882ff]/15 px-1.5 py-0.5 text-[12px] text-[#c9b6ff]">#{KIND_LABEL[node.kind].toLowerCase().replace(/ /g, "-")}</span>
          </Property>
          {node.kind === "driver" ? (
            <Property icon={Zap} name="severity">
              <span className="text-[#ff6b4a]">−{severity}%</span>
            </Property>
          ) : null}
          {ret !== null && node.kind !== "driver" ? (
            <Property icon={Zap} name="shock return">
              <span className="font-mono text-[#ff6b4a]">{formatSignedPct(ret)}</span>
              <span className="text-[#8f8f8f]"> at −{severity}%</span>
            </Property>
          ) : null}
          {dollar !== null && node.exposure > 0 ? (
            <Property icon={Sigma} name="your dollars">
              <span className="font-mono text-[#ff6b4a]">{formatSignedUSD(dollar)}</span>
              <span className="text-[#8f8f8f]"> on {formatUSD(node.exposure)}</span>
            </Property>
          ) : node.exposure > 0 ? (
            <Property icon={Sigma} name="your dollars">
              <span className="font-mono">{formatUSD(node.exposure)}</span>
              <span className="text-[#8f8f8f]"> · {formatPct(node.exposure / graph.total)} of portfolio</span>
            </Property>
          ) : null}
          <Property icon={Waypoints} name="hops from shock">
            {Number.isFinite(node.depth) ? (
              <span className="font-mono">
                {node.depth} <span className="text-[#8f8f8f]">· lands at {((node.depth * HOP_MS) / 1000).toFixed(2)}s</span>
              </span>
            ) : (
              <span className="text-[#8f8f8f]">not reached, no modeled path</span>
            )}
          </Property>
          <Property icon={Link2} name="links">
            <span className="font-mono">
              {incoming.length} in · {outgoing.length} out
            </span>
          </Property>
        </section>

        {path.length > 1 ? (
          <section className="mt-5">
            <h3 className="text-[15px] font-semibold text-[#f0f0f0]">How the shock gets here</h3>
            <p className="mt-2 text-[13.5px] leading-6">
              {path.map((n, i) => (
                <Fragment key={n.id}>
                  {i > 0 ? <span className="px-1 text-[#5c5c5c]">→</span> : null}
                  <span className="text-[#5c5c5c]">[[</span>
                  {n.id === node.id ? <span className="text-[#f0f0f0]">{n.label}</span> : <WikiLink node={n} onOpen={onOpen} />}
                  <span className="text-[#5c5c5c]">]]</span>
                </Fragment>
              ))}
            </p>
            {node.pathLabel ? <p className="mt-1 text-[12px] text-[#8f8f8f]">Modeled path: {node.pathLabel}</p> : null}
          </section>
        ) : null}

        <section className="mt-6">
          <h3 className="text-[15px] font-semibold text-[#f0f0f0]">
            Evidence <span className="font-normal text-[#8f8f8f]">({quotes.length})</span>
          </h3>
          {quotes.length ? (
            <div className="mt-3 flex flex-col gap-3">
              {quotes.map((q, i) => (
                <QuoteCallout key={`${q.sourceId}-${i}`} q={q} />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-[#8f8f8f]">
              Nothing cites this node in this scenario. It sits in the graph because you hold it, or an ETF you hold does.
            </p>
          )}
        </section>

        <section className="mt-6">
          <h3 className="text-[15px] font-semibold text-[#f0f0f0]">Linked mentions</h3>
          <ul className="mt-2 flex flex-col">
            {[...incoming.map((l) => ({ l, other: byId.get(l.source)!, dir: "from" as const })), ...outgoing.map((l) => ({ l, other: byId.get(l.target)!, dir: "to" as const }))]
              .sort((a, b) => Number(b.l.hit) - Number(a.l.hit))
              .map(({ l, other, dir }) => (
                <li key={`${l.id}-${dir}`} className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] py-1.5 text-[13px]">
                  <span className="min-w-0">
                    <span className="mr-1.5 font-mono text-[11px] text-[#5c5c5c]">{dir === "from" ? "←" : "→"}</span>
                    <WikiLink node={other} onOpen={onOpen} />
                    <span className="block truncate text-[12px] text-[#8f8f8f]" title={l.label}>
                      {l.label}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[11px]",
                      l.kind === "evidence" ? "text-[#a882ff]" : l.hit ? "text-[#ff8a6b]" : "text-[#5c5c5c]",
                    )}
                  >
                    {l.kind === "evidence" ? "cites" : l.kind}
                    {l.method ? ` · ${l.method}` : ""}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
