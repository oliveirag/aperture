// Sanity check for the Graph tab builder: node and link counts, depth, and that every lit link has evidence.
import { HOLDINGS, PORTFOLIO_TOTAL } from "../src/data/portfolio";
import { SCENARIOS } from "../src/data/shock";
import { buildShockGraph } from "../src/lib/shock/graph";

for (const s of SCENARIOS) {
  const g = buildShockGraph(
    s,
    HOLDINGS.map((h) => ({ ticker: h.ticker, name: h.name, kind: h.type, value: h.value, color: h.color })),
    PORTFOLIO_TOTAL,
  );
  const by = (k: string) => g.nodes.filter((n) => n.kind === k).length;
  const lk = (k: string) => g.links.filter((l) => l.kind === k).length;
  console.log(s.id, { nodes: g.nodes.length, driver: by("driver"), channel: by("channel"), holding: by("holding"), company: by("company"), source: by("source") });
  console.log("  links", { shock: lk("shock"), lookthrough: lk("lookthrough"), context: lk("context"), evidence: lk("evidence"), maxDepth: g.maxDepth });
  console.log("  holdings", g.nodes.filter((n) => n.kind === "holding").map((n) => `${n.label} d=${n.depth} r=${n.baseReturn}`).join(", "));
  const noQuote = g.nodes.filter((n) => n.hit && n.kind !== "driver" && n.quotes.length === 0).map((n) => n.id);
  console.log("  hit without quotes:", noQuote);
}
