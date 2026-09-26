// Pure: a Shock Test scenario rebuilt as a knowledge graph for the Graph tab. Driver -> channels -> companies -> the
// ETFs and stocks you hold, with every document and data file that backs a link as its own node. Numbers come from
// the scenario and the seeded sensitivities; nothing here is generated, so the same inputs always draw the same graph.
import seed from "@/data/etf-seed.json";
import { formatPct } from "@/lib/format";
import type { ScenarioId, ShockScenario, Source } from "@/types/demo";
import { TABLES } from "./sensitivities";

export type GraphNodeKind = "driver" | "channel" | "holding" | "company" | "source";
export type GraphLinkKind = "shock" | "lookthrough" | "context" | "evidence";

// One piece of evidence shown in a node's note: a quoted document passage, or rows of a data file as pulled.
export type Quote = {
  sourceId: string;
  kind: "document" | "data";
  title: string;
  issuer: string;
  date: string;
  docType: string;
  section?: string;
  text?: string;
  highlight?: string;
  url?: string;
  rows?: { cells: string[]; hit?: boolean }[];
  columns?: string[];
  // What this passage is evidence for, e.g. "Office valuations → BXP".
  supports?: string;
};

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  sublabel: string;
  ticker?: string;
  color?: string;
  // Return at the scenario's base severity (scaled linearly in the view). Null: no modeled sensitivity.
  baseReturn: number | null;
  // Dollars of the portfolio that sit in this node (holding value, or look-through dollars for a company).
  exposure: number;
  baseDollar: number | null;
  hit: boolean;
  // Hops from the driver along lit links; Infinity when the shock never reaches it.
  depth: number;
  radius: number;
  quotes: Quote[];
  pathLabel?: string;
};

export type GraphLink = {
  id: string;
  source: string;
  target: string;
  kind: GraphLinkKind;
  label: string;
  weight: number;
  method?: string;
  sourceId?: string;
  hit: boolean;
};

export type ShockGraph = { nodes: GraphNode[]; links: GraphLink[]; maxDepth: number; total: number };

export type GraphHolding = { ticker: string; name: string; kind: "etf" | "stock"; value: number; color?: string };

type SeedRow = { symbol: string; description: string; weight: string };
type SeedEtf = { last_updated: string; holdings: SeedRow[]; sectors: { sector: string; weight: string }[] };
const SEED = seed as unknown as Record<string, SeedEtf>;

// Look-through companies drawn per ETF: every modeled one up to this cap, plus its biggest unaffected names for context.
const MAX_HIT_PER_ETF = 30;
const CONTEXT_PER_ETF = 28;

const id = {
  driver: (x: string) => `d:${x}`,
  channel: (x: string) => `c:${x}`,
  ticker: (x: string) => `t:${x}`,
  source: (x: string) => `s:${x}`,
};

const seedSourceId = (etf: string) => `seed-${etf.toLowerCase()}`;
const pctOf = (w: number) => `${(w * 100).toFixed(2)}%`;

export function isSeededEtf(ticker: string) {
  return ticker in SEED;
}

export function buildShockGraph(scenario: ShockScenario, holdings: GraphHolding[], total: number): ShockGraph {
  const table = TABLES[scenario.id as ScenarioId];
  const nodes = new Map<string, GraphNode>();
  const links = new Map<string, GraphLink>();
  const sourceById = new Map<string, Source>(scenario.sources.map((s) => [s.id, s]));
  const scenarioNode = new Map(scenario.nodes.map((n) => [n.id, n]));
  const holdingByTicker = new Map(holdings.map((h) => [h.ticker, h]));
  const impactByTicker = new Map(scenario.impacts.map((i) => [i.ticker, i]));

  const gid = (scenarioNodeId: string) => {
    const n = scenarioNode.get(scenarioNodeId);
    if (!n) return null;
    if (n.kind === "driver") return id.driver(n.id);
    if (n.kind === "channel") return id.channel(n.id);
    return n.ticker && n.ticker !== "others" ? id.ticker(n.ticker) : null;
  };

  const addNode = (n: Omit<GraphNode, "hit" | "depth" | "radius" | "quotes"> & { quotes?: Quote[] }) => {
    const existing = nodes.get(n.id);
    if (existing) return existing;
    const node: GraphNode = { hit: false, depth: Infinity, radius: 4, quotes: [], ...n };
    nodes.set(n.id, node);
    return node;
  };
  const addLink = (l: Omit<GraphLink, "id" | "hit"> & { hit?: boolean }) => {
    const key = `${l.source}->${l.target}`;
    const existing = links.get(key);
    if (existing) {
      // Keep the stronger kind: a real shock link beats a context one drawn for the same pair.
      if (existing.kind === "context" && l.kind !== "context") links.set(key, { ...existing, ...l, id: key, hit: l.hit ?? false });
      return;
    }
    links.set(key, { id: key, hit: false, ...l });
  };
  const quoteFromSource = (s: Source, supports?: string): Quote => ({
    sourceId: s.id,
    kind: "document",
    title: s.title,
    issuer: s.issuer,
    date: s.date,
    docType: s.docType,
    section: s.section,
    text: s.excerpt,
    highlight: s.highlight,
    url: s.url,
    supports,
  });
  const addQuote = (nodeId: string, q: Quote) => {
    const n = nodes.get(nodeId);
    if (n && !n.quotes.some((x) => x.sourceId === q.sourceId && x.supports === q.supports)) n.quotes.push(q);
  };

  // 1. Driver and channels, straight from the scenario.
  const driver = scenario.nodes.find((n) => n.kind === "driver")!;
  addNode({
    id: id.driver(driver.id),
    kind: "driver",
    label: driver.label,
    sublabel: scenario.shortLabel,
    baseReturn: -scenario.baseSeverity / 100,
    exposure: 0,
    baseDollar: null,
  });
  for (const c of scenario.nodes.filter((n) => n.kind === "channel")) {
    addNode({ id: id.channel(c.id), kind: "channel", label: c.label, sublabel: c.sublabel ?? "", baseReturn: null, exposure: 0, baseDollar: null });
  }
  // Channels the live scenario dropped (no holding reached them) still exist in the table; draw them if a company needs one.
  const ensureChannel = (channelId: string) => {
    const gidC = id.channel(channelId);
    if (nodes.has(gidC)) return gidC;
    const c = table.channels.find((x) => x.id === channelId);
    if (!c) return null;
    addNode({ id: gidC, kind: "channel", label: c.label, sublabel: c.sublabel, baseReturn: null, exposure: 0, baseDollar: null });
    addLink({ source: id.driver(driver.id), target: gidC, kind: "shock", label: c.label, weight: c.weight, method: c.method, sourceId: c.sourceId, hit: true });
    const s = sourceById.get(c.sourceId);
    if (s) addQuote(gidC, quoteFromSource(s, `${driver.label} → ${c.label}`));
    return gidC;
  };

  // 2. Every holding, modeled or not.
  for (const h of holdings) {
    const impact = impactByTicker.get(h.ticker);
    addNode({
      id: id.ticker(h.ticker),
      kind: "holding",
      ticker: h.ticker,
      label: h.ticker,
      sublabel: `${h.kind === "etf" ? "ETF" : "Stock"} · ${formatPct(total > 0 ? h.value / total : 0)} of portfolio`,
      color: h.color,
      baseReturn: impact ? impact.baseReturn : null,
      exposure: h.value,
      baseDollar: impact ? impact.baseDollar : null,
      pathLabel: impact?.pathLabel,
    });
  }

  // 3. The scenario's own edges (curated labels, weights and sources).
  for (const e of scenario.edges) {
    const from = gid(e.from);
    const to = gid(e.to);
    if (!from || !to || !nodes.has(from) || !nodes.has(to)) continue;
    addLink({ source: from, target: to, kind: "shock", label: e.label, weight: e.weight, method: e.method, sourceId: e.sourceId, hit: true });
    const s = sourceById.get(e.sourceId);
    const label = (x: string) => nodes.get(x)?.label ?? x;
    if (s) addQuote(to, quoteFromSource(s, `${label(from)} → ${label(to)}`));
  }

  // 4. Direct holdings with a sensitivity the scenario folded away (live "+N more").
  for (const h of holdings) {
    if (h.kind === "etf") continue;
    const rule = table.entities[h.ticker];
    const node = nodes.get(id.ticker(h.ticker))!;
    if (!rule) continue;
    if (node.baseReturn === null) {
      node.baseReturn = rule.ret;
      node.baseDollar = h.value * rule.ret;
    }
    const hasShockIn = [...links.values()].some((l) => l.target === node.id && l.kind === "shock");
    if (hasShockIn) continue;
    const ch = ensureChannel(rule.channel);
    if (!ch) continue;
    addLink({ source: ch, target: node.id, kind: "shock", label: rule.kind, weight: Math.abs(rule.ret) * 4, method: "DER-SENSITIVITY", sourceId: rule.sourceId, hit: true });
    const s = sourceById.get(rule.sourceId);
    if (s) addQuote(node.id, quoteFromSource(s, `${nodes.get(ch)!.label} → ${h.ticker}`));
  }

  // 5. Look through each seeded ETF: modeled constituents carry the shock in, the biggest others sit around it as context.
  for (const h of holdings) {
    const etf = SEED[h.ticker];
    if (!etf || h.kind !== "etf") continue;
    const rows = etf.holdings
      .map((r) => ({ symbol: r.symbol.toUpperCase(), name: r.description, weight: Number(r.weight) || 0 }))
      .filter((r) => r.symbol && r.symbol !== "N/A" && r.weight > 0)
      .sort((a, b) => b.weight - a.weight);
    const etfNode = id.ticker(h.ticker);
    const dataSourceId = seedSourceId(h.ticker);
    const hitRows = rows.filter((r) => table.entities[r.symbol]).slice(0, MAX_HIT_PER_ETF);
    const heldRows = rows.filter((r) => holdingByTicker.has(r.symbol) && r.symbol !== h.ticker);
    const contextRows = rows.filter((r) => !table.entities[r.symbol]).slice(0, CONTEXT_PER_ETF);
    const drawn = new Map([...contextRows, ...heldRows, ...hitRows].map((r) => [r.symbol, r]));
    if (drawn.size === 0) continue;

    // The data file itself is a node: the rows we drew, exactly as they came out of the seed.
    const shownRows = [...drawn.values()].sort((a, b) => b.weight - a.weight);
    const dataQuote: Quote = {
      sourceId: dataSourceId,
      kind: "data",
      title: `${h.ticker} constituents`,
      issuer: "Alpha Vantage ETF_PROFILE",
      date: etf.last_updated,
      docType: "ETF holdings",
      columns: ["symbol", "description", "weight"],
      rows: shownRows.map((r) => ({ cells: [r.symbol, r.name, pctOf(r.weight)], hit: !!table.entities[r.symbol] })),
      text: `${rows.length} holdings in the file; ${hitRows.length} have a modeled sensitivity in this scenario.`,
      supports: `Constituents → ${h.ticker}`,
    };
    addNode({
      id: id.source(dataSourceId),
      kind: "source",
      label: `${h.ticker} holdings file`,
      sublabel: `ETF_PROFILE · ${etf.last_updated.slice(0, 10)}`,
      baseReturn: null,
      exposure: 0,
      baseDollar: null,
      quotes: [dataQuote],
    });
    addLink({ source: id.source(dataSourceId), target: etfNode, kind: "evidence", label: "Constituent weights", weight: 0.3, sourceId: dataSourceId });
    // The ETF's own note carries the table too, modeled rows first.
    addQuote(etfNode, { ...dataQuote, rows: [...dataQuote.rows!].sort((a, b) => Number(!!b.hit) - Number(!!a.hit)) });

    for (const r of drawn.values()) {
      const rule = table.entities[r.symbol];
      const held = holdingByTicker.get(r.symbol);
      const nodeId = id.ticker(r.symbol);
      const lookDollars = h.value * r.weight;
      const node =
        nodes.get(nodeId) ??
        addNode({
          id: nodeId,
          kind: "company",
          ticker: r.symbol,
          label: r.symbol,
          sublabel: rule ? rule.kind : titleCase(r.name),
          baseReturn: rule ? rule.ret : null,
          exposure: 0,
          baseDollar: rule ? 0 : null,
        });
      if (!held) {
        node.exposure += lookDollars;
        if (rule) node.baseDollar = (node.baseDollar ?? 0) + lookDollars * rule.ret;
      }
      const rowQuote: Quote = {
        sourceId: dataSourceId,
        kind: "data",
        title: `${h.ticker} constituents`,
        issuer: "Alpha Vantage ETF_PROFILE",
        date: etf.last_updated,
        docType: "ETF holdings",
        columns: ["symbol", "description", "weight"],
        rows: [{ cells: [r.symbol, r.name, pctOf(r.weight)], hit: !!rule }],
        supports: `${r.symbol} → ${h.ticker}`,
      };
      addQuote(nodeId, rowQuote);
      addLink({
        source: nodeId,
        target: etfNode,
        kind: rule || held ? "lookthrough" : "context",
        label: `${r.symbol} is ${pctOf(r.weight)} of ${h.ticker}`,
        weight: r.weight,
        method: "DER-LOOKTHROUGH",
        sourceId: dataSourceId,
      });
      if (rule && !held) {
        const ch = ensureChannel(rule.channel);
        if (ch) {
          addLink({ source: ch, target: nodeId, kind: "shock", label: rule.kind, weight: Math.abs(rule.ret) * 4, method: "DER-SENSITIVITY", sourceId: rule.sourceId, hit: true });
          const s = sourceById.get(rule.sourceId);
          if (s) addQuote(nodeId, quoteFromSource(s, `${nodes.get(ch)!.label} → ${r.symbol}`));
        }
      }
    }
  }

  // 6. Every document the scenario cites becomes a note linked to what it evidences.
  for (const s of scenario.sources) {
    const targets = [...links.values()].filter((l) => l.sourceId === s.id && l.kind === "shock").map((l) => l.target);
    const unique = [...new Set(targets)].filter((t) => nodes.get(t)?.kind !== "company");
    if (unique.length === 0) continue;
    addNode({
      id: id.source(s.id),
      kind: "source",
      label: shortTitle(s),
      sublabel: `${s.docType} · ${s.date}`,
      baseReturn: null,
      exposure: 0,
      baseDollar: null,
      quotes: [quoteFromSource(s)],
    });
    for (const t of unique) addLink({ source: id.source(s.id), target: t, kind: "evidence", label: s.section ?? s.docType, weight: 0.3, sourceId: s.id });
  }

  // 7. Walk the shock: lit links only, from the driver outward. Look-through links light when the company they start at is hit.
  const all = [...links.values()];
  const driverId = id.driver(driver.id);
  const start = nodes.get(driverId)!;
  start.depth = 0;
  let frontier = [driverId];
  while (frontier.length) {
    const next: string[] = [];
    for (const from of frontier) {
      const d = nodes.get(from)!.depth;
      for (const l of all) {
        if (l.source !== from || l.kind === "evidence" || l.kind === "context") continue;
        const target = nodes.get(l.target)!;
        const reaches = l.kind === "shock" || (l.kind === "lookthrough" && nodes.get(from)!.baseReturn !== null);
        if (!reaches) continue;
        l.hit = true;
        if (target.depth > d + 1) {
          target.depth = d + 1;
          next.push(target.id);
        }
      }
    }
    frontier = next;
  }
  for (const l of all) if (l.kind === "lookthrough" && !l.hit) l.kind = "context";
  for (const n of nodes.values()) n.hit = n.kind !== "source" && Number.isFinite(n.depth);
  // A source is "pulled" when the first link it backs lights up.
  for (const l of all) {
    if (l.kind !== "evidence") continue;
    const src = nodes.get(l.source)!;
    const target = nodes.get(l.target)!;
    if (Number.isFinite(target.depth)) {
      l.hit = true;
      src.depth = Math.min(src.depth, target.depth);
    }
  }

  // 8. Sizes: by money for holdings and companies, fixed for the structural nodes.
  for (const n of nodes.values()) {
    const share = total > 0 ? n.exposure / total : 0;
    n.radius =
      n.kind === "driver" ? 15 : n.kind === "channel" ? 9 : n.kind === "source" ? 4.5 : n.kind === "holding" ? 6 + Math.sqrt(share) * 22 : 2.6 + Math.sqrt(share) * 26;
  }

  const maxDepth = Math.max(0, ...[...nodes.values()].map((n) => n.depth).filter(Number.isFinite));
  return { nodes: [...nodes.values()], links: all, maxDepth, total };
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

// "BXP, Inc. Form 10-K (FY2025)" -> "BXP 10-K FY2025"; Fed documents keep a short name.
function shortTitle(s: Source) {
  const tenK = s.title.match(/^(.*?)\s*Form (10-[KQ]|8-K)\s*\((.*?)\)/);
  if (tenK) return `${s.issuer.split(/[ ,]/)[0]} ${tenK[2]} ${tenK[3]}`;
  if (s.docType === "ETF holdings") return s.title.replace(/.*\((\w+)\) holdings/, "$1 holdings page");
  return s.title.split(":")[0];
}
