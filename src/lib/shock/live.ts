// Pure: a Shock Test scenario rebuilt for any portfolio. Impact = sum over look-through exposures of value x sensitivity
// (the company's own, else its sector's). No model in the math: the same inputs always give the same numbers.
import { formatPct } from "@/lib/format";
import { sectorFromIndustry } from "@/lib/sectors";
import type { ApertureInput } from "@/lib/xray/compute";
import type { ShockEdge, ShockImpact, ShockNode, ShockScenario, Source } from "@/types/demo";
import { TABLES, type ScenarioTable } from "./sensitivities";

// Holding nodes the graph has room for; smaller hits fold into one "other holdings" node.
const MAX_HOLDING_NODES = 6;
const OTHERS = "others";

export type NotModeled = { ticker: string; weight: number };
export type LiveScenario = {
  scenario: ShockScenario;
  // Holdings with no modeled path, with their share of the portfolio.
  notModeled: NotModeled[];
  // Share of the portfolio's look-through value that has a sensitivity in this scenario.
  modeledShare: number;
};

type Hit = { channel: string; exposed: number; dollar: number; names: Set<string>; sourceId: string };

const valueOf = (p: ApertureInput) => p.shares * p.price;
const spread = (n: number, from: number, to: number) => (n <= 1 ? [(from + to) / 2] : Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1)));

// Every channel one position reaches, with the dollars exposed and lost at base severity.
function hitsFor(p: ApertureInput, table: ScenarioTable): Hit[] {
  const value = valueOf(p);
  const hits = new Map<string, Hit>();
  const add = (channel: string, exposed: number, ret: number, name: string, sourceId: string) => {
    if (exposed <= 0) return;
    const h = hits.get(channel) ?? { channel, exposed: 0, dollar: 0, names: new Set<string>(), sourceId };
    h.exposed += exposed;
    h.dollar += exposed * ret;
    h.names.add(name);
    hits.set(channel, h);
  };
  if (p.kind === "etf" && p.etf) {
    const named = new Map<string, number>();
    for (const h of p.etf.holdings) {
      const rule = table.entities[h.ticker];
      if (!rule) continue;
      add(rule.channel, value * h.weight, rule.ret, h.ticker, `s-${p.ticker.toLowerCase()}-holdings`);
      named.set(rule.sector, (named.get(rule.sector) ?? 0) + h.weight);
    }
    for (const s of p.etf.sectors) {
      const rule = table.sectors[s.sector];
      if (!rule) continue;
      const rest = Math.max(0, s.weight - (named.get(s.sector) ?? 0));
      add(rule.channel, value * rest, rule.ret, `${s.sector.toLowerCase()} stocks`, `s-${p.ticker.toLowerCase()}-holdings`);
    }
  } else {
    const rule = table.entities[p.ticker];
    if (rule) add(rule.channel, value, rule.ret, p.ticker, rule.sourceId);
    else {
      const sector = sectorFromIndustry(p.industry);
      const fallback = table.sectors[sector];
      if (fallback) add(fallback.channel, value, fallback.ret, `${sector} company`, fallback.sourceId);
    }
  }
  return [...hits.values()];
}

function edgeLabel(p: ApertureInput, hit: Hit, table: ScenarioTable) {
  const names = [...hit.names];
  if (p.kind === "etf") {
    const share = formatPct(hit.exposed / valueOf(p));
    const shown = names.slice(0, 2).join(", ");
    return `${shown}${names.length > 2 ? ` +${names.length - 2}` : ""}: ${share} of ${p.ticker}`;
  }
  return table.entities[p.ticker]?.kind ?? names[0];
}

export function buildLiveScenario(base: ShockScenario, inputs: ApertureInput[], etfSources: Source[], override?: ScenarioTable): LiveScenario {
  const table = override ?? (base.id === "researched" ? null : TABLES[base.id]);
  if (!table) throw new Error("Scenario has no sensitivity assumptions");
  const rows = inputs.filter((p) => p.shares > 0 && p.price > 0);
  const total = rows.reduce((s, p) => s + valueOf(p), 0);
  const driver = base.nodes.find((n) => n.kind === "driver")!;
  const driverShort = base.shortLabel.split(" −")[0];

  const affected = rows
    .map((p) => ({ p, hits: hitsFor(p, table) }))
    .filter((x) => x.hits.length > 0)
    .map((x) => ({ ...x, dollar: x.hits.reduce((s, h) => s + h.dollar, 0), exposed: x.hits.reduce((s, h) => s + h.exposed, 0) }))
    .sort((a, b) => Math.abs(b.dollar) - Math.abs(a.dollar));
  const notModeled: NotModeled[] = rows
    .filter((p) => !affected.some((a) => a.p.ticker === p.ticker))
    .map((p) => ({ ticker: p.ticker, weight: valueOf(p) / total }))
    .sort((a, b) => b.weight - a.weight);

  const shown = affected.length > MAX_HOLDING_NODES ? affected.slice(0, MAX_HOLDING_NODES - 1) : affected;
  const folded = affected.slice(shown.length);
  const usedChannels = table.channels.filter((c) => affected.some((a) => a.hits.some((h) => h.channel === c.id)));

  const nodes: ShockNode[] = [{ ...driver, x: 110, y: 280 }];
  const channelY = spread(usedChannels.length, 150, 410);
  usedChannels.forEach((c, i) => nodes.push({ id: c.id, kind: "channel", label: c.label, sublabel: c.sublabel, x: 390, y: channelY[i] }));
  const holdingY = spread(shown.length + (folded.length ? 1 : 0), 80, 490);
  shown.forEach(({ p }, i) =>
    nodes.push({
      id: p.ticker,
      kind: "holding",
      ticker: p.ticker,
      label: p.ticker,
      sublabel: `${p.kind === "etf" ? "ETF" : "Direct"} · ${formatPct(valueOf(p) / total)}`,
      x: 880,
      y: holdingY[i],
    }),
  );
  if (folded.length) {
    const weight = folded.reduce((s, a) => s + valueOf(a.p), 0) / total;
    nodes.push({ id: OTHERS, kind: "holding", ticker: OTHERS, label: `+${folded.length} more`, sublabel: `Smaller hits · ${formatPct(weight)}`, x: 880, y: holdingY[holdingY.length - 1] });
  }

  const edges: ShockEdge[] = usedChannels.map((c) => ({
    id: `e-${driver.id}-${c.id}`,
    from: driver.id,
    to: c.id,
    label: c.label,
    weight: c.weight,
    method: c.method,
    sourceId: c.sourceId,
  }));
  const impacts: ShockImpact[] = [];
  for (const a of affected) {
    const nodeId = shown.includes(a) ? a.p.ticker : OTHERS;
    for (const h of a.hits) {
      const id = `e-${h.channel}-${nodeId}`;
      const existing = edges.find((e) => e.id === id);
      const weight = h.exposed / valueOf(a.p);
      if (existing) existing.weight = Math.max(existing.weight, weight);
      else
        edges.push({
          id,
          from: h.channel,
          to: nodeId,
          label: nodeId === OTHERS ? "Smaller exposures" : edgeLabel(a.p, h, table),
          weight,
          method: a.p.kind === "etf" ? "DER-Aperture" : "DER-SENSITIVITY",
          sourceId: h.sourceId,
        });
    }
    // The path shown for a holding follows its biggest channel.
    const main = [...a.hits].sort((x, y) => Math.abs(y.dollar) - Math.abs(x.dollar))[0];
    const channel = table.channels.find((c) => c.id === main.channel)!;
    impacts.push({
      ticker: a.p.ticker,
      baseReturn: a.dollar / valueOf(a.p),
      baseDollar: a.dollar,
      pathEdgeIds: [`e-${driver.id}-${main.channel}`, `e-${main.channel}-${nodeId}`],
      pathLabel: `${driverShort} → ${channel.label.charAt(0).toLowerCase()}${channel.label.slice(1)} → ${a.p.ticker}`,
    });
  }

  const modeledShare = total > 0 ? affected.reduce((s, a) => s + a.exposed, 0) / total : 0;
  const n = affected.length;
  const m = notModeled.length;
  const covered = formatPct(modeledShare);
  const headline =
    n === 0
      ? {
          beginner: `None of your holdings has a modeled link to this scenario, so we can't estimate an impact.`,
          intermediate: `No modeled path from this scenario into your portfolio.`,
          advanced: `0 of ${rows.length} holdings have a modeled path; the impact estimate is empty, not zero risk.`,
        }
      : {
          ...base.headline,
          advanced: `${base.headline.intermediate} ${n} modeled ${n === 1 ? "holding" : "holdings"}; ${covered} of value has a sensitivity. ${m} ${m === 1 ? "holding has" : "holdings have"} no modeled path.`,
        };

  const usedSources = new Set(edges.map((e) => e.sourceId));
  const sources = [...etfSources, ...base.sources].filter((s, i, all) => usedSources.has(s.id) && all.findIndex((x) => x.id === s.id) === i);

  return {
    scenario: { ...base, nodes, edges, impacts, notModeled: notModeled.map((x) => x.ticker), sources, headline },
    notModeled,
    modeledShare,
  };
}
