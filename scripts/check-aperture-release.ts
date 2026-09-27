import assert from "node:assert/strict";
import { utils, write } from "xlsx";
import { readWorkbook } from "../src/features/import/spreadsheet";
import { parsePositionsCsv } from "../src/features/import/csv";
import { DRIVER_IDS, knownPlan, planFromProposal, REFERENCES, researchScenario } from "../src/lib/shock/research-model";
import { buildLiveScenario } from "../src/lib/shock/live";
import { buildShockGraph } from "../src/lib/shock/graph";
import { parseHoldings } from "../src/lib/xray/live";
import { buildOutlook } from "../src/lib/outlook";
import { counts } from "../src/features/import/extract";
import { HOLDINGS, PORTFOLIO_TOTAL } from "../src/data/portfolio";
import type { ApertureInput } from "../src/lib/xray/compute";

async function main() {
  const input: ApertureInput[] = [
    { ticker: "XOM", name: "Exxon", shares: 10, price: 100, kind: "stock", industry: "Oil" },
    { ticker: "DAL", name: "Delta", shares: 10, price: 100, kind: "stock", industry: "Airlines" },
    { ticker: "TEST", name: "Test fund", shares: 10, price: 100, kind: "etf", etf: { asOf: "2026-01-01", holdings: [{ ticker: "XOM", name: "Exxon", weight: 0.2 }], sectors: [{ sector: "Energy", weight: 0.4 }] } },
    { ticker: "ZZZZ", name: "Unknown", shares: 10, price: 100, kind: "opaque" },
  ];
  const plan = knownPlan("What if Iran closes the Strait of Hormuz?");
  assert.equal(plan?.driver, "oil"); assert.equal(plan?.direction, 1); assert.equal(plan?.severity, 20); assert.equal(plan?.basis, "stated");
  const { base, table } = researchScenario(plan!, [REFERENCES.oil!]);
  const a = buildLiveScenario(base, input, [], table);
  assert.deepEqual(a, buildLiveScenario(base, input, [], table), "Identical inputs must be deterministic");
  assert.equal(a.scenario.impacts.find(i => i.ticker === "XOM")?.baseDollar, 100);
  assert.equal(a.scenario.impacts.find(i => i.ticker === "DAL")?.baseDollar, -30);
  assert.equal(a.scenario.impacts.find(i => i.ticker === "TEST")?.baseDollar, 40, "Named company must not double-count sector residual");
  assert.equal(a.modeledShare, 0.6);
  assert.deepEqual(a.notModeled, [{ ticker: "ZZZZ", weight: 0.25 }]);
  const reverse = researchScenario({ ...plan!, direction: -1 }, [REFERENCES.oil!]);
  const b = buildLiveScenario(reverse.base, input, [], reverse.table);
  for (const hit of a.scenario.impacts) assert.equal(b.scenario.impacts.find(i => i.ticker === hit.ticker)?.baseDollar, -hit.baseDollar);
  const graph = buildShockGraph(a.scenario, input.map(p => ({ ticker: p.ticker, name: p.name, value: p.price * p.shares, kind: p.kind === "etf" ? "etf" : "stock" })), 4000, table);
  assert.ok(graph.nodes.some(n => n.kind === "driver"));
  assert.ok(graph.links.every(l => graph.nodes.some(n => n.id === l.source) && graph.nodes.some(n => n.id === l.target)), "No dangling graph links");
  assert.equal(knownPlan("What if Democrats win the election?"), null, "Do not invent policy consequences");
  assert.equal(knownPlan("oil rises 20% and tariffs fall 10%"), null, "Do not collapse multiple drivers");
  assert.equal(knownPlan("tariffs fall 10 percentage points"), null, "Percent points are not percent changes");
  assert.equal(knownPlan("oil rises 1000%"), null);
  const tariff = knownPlan("What if Democrats win and tariffs go down?");
  assert.equal(tariff?.driver, "import-costs"); assert.equal(tariff?.direction, -1); assert.equal(tariff?.magnitudeStated, false);
  assert.equal(knownPlan("What if Taiwan chip supply drops 30%?")?.driver, "chip-supply");
  assert.equal(knownPlan("What if the dollar strengthens 10%?")?.driver, "usd");
  assert.equal(planFromProposal("q", { driver: "banana", direction: 1, severity: 5, rationale: "x" }), null, "Model cannot invent a driver");
  assert.equal(planFromProposal("q", { driver: "oil", direction: 1, severity: 5000, rationale: "x" })?.magnitudeStated, false, "Out-of-range magnitude falls back to the labeled default");
  assert.equal(planFromProposal("q", { driver: "oil", direction: 1, severity: 5, rationale: "" }), null, "Proposal must carry a rationale");
  for (const d of DRIVER_IDS) { // every driver builds a consistent, source-linked table
    const r = researchScenario({ driver: d, direction: 1, severity: 10, basis: "assumed", trigger: "t", magnitudeStated: true, rationale: "r" }, [{ text: "t", sources: [{ title: "t", url: "https://example.com/a" }] }]);
    const out = buildLiveScenario(r.base, input, [], r.table);
    assert.ok(out.modeledShare >= 0 && out.modeledShare <= 1);
  }
  assert.equal(counts({ ticker: "AAPL", name: "Apple", shares: 1, value: 0, price: null, industry: null, status: "unpriced" }), false);
  const demoInputs = HOLDINGS.map(h => ({ ticker: h.ticker, name: h.name, kind: h.type, value: h.value }));
  const residualGraph = buildShockGraph(a.scenario, demoInputs, PORTFOLIO_TOTAL, table);
  assert.ok(residualGraph.nodes.some(n => n.id.startsWith("sector:")), "Exercise real seeded ETF sector residual nodes");
  const ids = new Set(residualGraph.nodes.map(n => n.id));
  assert.ok(residualGraph.links.every(l => ids.has(l.source) && ids.has(l.target)), "Residual graph has no dangling links");
  assert.equal(parseHoldings([{ ticker: "AAPL", shares: Infinity, price: 100 }]).size, 0);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let px = 100; const weekly = Array.from({ length: 520 }, (_, i) => ({ date: `w${String(i).padStart(4, "0")}`, close: (px *= Math.exp((rnd() - 0.5) * 0.06 + 0.002)) }));
  const outlook = buildOutlook("SIM", weekly, 100, "2026-01-01")!;
  assert.ok(outlook.low < outlook.median && outlook.median < outlook.high);
  assert.ok(outlook.backtest.insideShare > 0.55 && outlook.backtest.insideShare < 1, `backtest coverage ${outlook.backtest.insideShare}`);
  assert.deepEqual(outlook, buildOutlook("SIM", weekly, 100, "2026-01-01"));
  assert.equal(buildOutlook("NEW", weekly.slice(0, 60), 100, "2026-01-01"), null, "Short history gives no range");
  const csv = parsePositionsCsv('Symbol,Quantity,Market Value\nAAPL,10,1000\nVOO,5,2000\nCASH,,200\n');
  assert.equal(csv.rows.length, 2);
  assert.equal(csv.skipped.length, 1);
  for (const bookType of ["xlsx", "biff8"] as const) {
    const book = utils.book_new();
    utils.book_append_sheet(book, utils.aoa_to_sheet([["Symbol", "Quantity", "Market Value"], ["AAPL", 10, 1000], ["VOO", 5, 2000]]), "Positions");
    utils.book_append_sheet(book, utils.aoa_to_sheet([["Notes"], ["Not another account"]]), "Notes");
    const buffer = write(book, { type: "array", bookType });
    const sheets = await readWorkbook(buffer);
    assert.equal(sheets.length, 2, "User must choose a sheet");
    assert.deepEqual(sheets[0].result.rows, csv.rows);
    assert.ok(sheets[1].result.error);
  }
  console.log("PASS: oil/tariff parsing, deterministic math, signs, sector residual, graph links, finite inputs, CSV/XLS/XLSX and sheet selection");
}
void main();
