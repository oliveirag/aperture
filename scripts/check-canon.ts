// Proves the demo numbers agree. Run: npx -y tsx scripts/check-canon.ts
import assert from "node:assert/strict";
import { formatPct, formatSignedPct, formatSignedUSD, formatUSD } from "../src/lib/format";
import { HOLDINGS, PORTFOLIO_TOTAL, weightOf } from "../src/data/portfolio";
import { PERFORMANCE, returnOver } from "../src/data/performance";
import { SCENARIOS, getScenario, scenarioTotals } from "../src/data/shock";
import {
  AMD_Aperture,
  ETF_Aperture,
  EXPOSURES,
  FLAGS,
  SECTORS,
  exposureTotal,
} from "../src/data/xray";

const pct = (v: number) => formatPct(weightOf(v));
const byTicker = (t: string) => {
  const e = EXPOSURES.find((x) => x.ticker === t);
  assert.ok(e, `exposure ${t}`);
  return e;
};

// Formatters
assert.equal(formatUSD(148420), "$148,420");
assert.equal(formatUSD(-6027.5), "−$6,028");
assert.equal(formatSignedUSD(612.4), "+$612");
assert.equal(formatSignedUSD(0), "$0");
assert.equal(formatPct(0.175923), "17.6%");
assert.equal(formatPct(-0.0406), "−4.1%");
assert.equal(formatSignedPct(0.0041), "+0.4%");

// Holdings
assert.equal(HOLDINGS.reduce((s, h) => s + h.value, 0), PORTFOLIO_TOTAL);
for (const h of HOLDINGS) assert.equal(h.value, h.shares * h.price, `${h.ticker} value`);

// Exposures
const nvda = byTicker("NVDA");
assert.equal(exposureTotal(nvda), nvda.value);
assert.equal(pct(exposureTotal(nvda)), "17.6%");
assert.deepEqual(nvda.sources.map((s) => pct(s.value)), ["13.3%", "2.2%", "2.1%"]);
assert.equal(pct(exposureTotal(byTicker("AAPL"))), "12.9%");
assert.equal(pct(exposureTotal(byTicker("MSFT"))), "11.4%");
assert.equal(pct(exposureTotal(byTicker("BXP"))), "8.6%");
for (const e of EXPOSURES) {
  assert.ok(Math.abs(exposureTotal(e) - e.value) < 0.01, `${e.ticker} total`);
  for (const s of e.sources) {
    if (s.via === "Direct" || (e.ticker === "BXP" && s.via === "VOO")) continue;
    const etf = ETF_Aperture.find((x) => x.ticker === s.via);
    const holding = HOLDINGS.find((h) => h.ticker === s.via);
    const w = etf?.top.find((c) => c.ticker === e.ticker)?.weight;
    assert.ok(etf && holding && w !== undefined, `${e.ticker} via ${s.via} lookup`);
    assert.ok(Math.abs(holding.value * w - s.value) < 0.01, `${e.ticker} via ${s.via} value`);
  }
}
assert.deepEqual(FLAGS.map((f) => f.id), ["f-nvda", "f-aapl", "f-msft", "f-tech"]);

// Sectors
assert.ok(Math.abs(SECTORS.reduce((s, x) => s + x.weight, 0) - 1) < 0.0005, "sectors sum");

// AI-linked
const aiLinked =
  exposureTotal(byTicker("NVDA")) + exposureTotal(byTicker("MSFT")) + exposureTotal(byTicker("AVGO")) + AMD_Aperture.value;
assert.equal(pct(aiLinked), "31.2%");

// Shock: CRE
const cre = getScenario("cre");
assert.equal(scenarioTotals(cre, 20).dollar, -6027.5);
assert.equal(formatSignedPct(scenarioTotals(cre, 20).pct), "−4.1%");
assert.equal(formatSignedUSD(scenarioTotals(cre, 20).dollar), "−$6,028");
assert.equal(formatSignedPct(scenarioTotals(cre, 30).pct), "−6.1%");
assert.equal(formatSignedUSD(scenarioTotals(cre, 30).dollar), "−$9,041");
assert.equal(formatSignedPct(scenarioTotals(cre, 40).pct), "−8.1%");
assert.equal(formatSignedPct(scenarioTotals(cre, 10).pct), "−2.0%");
assert.equal(formatSignedPct(scenarioTotals(cre, 5).pct), "−1.0%");

// Shock: AI capex
const ai = getScenario("ai-capex");
assert.equal(scenarioTotals(ai, 30).dollar, -8170.5);
assert.equal(formatSignedPct(scenarioTotals(ai, 30).pct), "−5.5%");
assert.equal(formatSignedPct(scenarioTotals(ai, 50).pct), "−9.2%");
assert.equal(formatSignedPct(scenarioTotals(ai, 10).pct), "−1.8%");

// Shock graph integrity
const allTickers = HOLDINGS.map((h) => h.ticker).sort();
for (const s of SCENARIOS) {
  const nodes = new Set(s.nodes.map((n) => n.id));
  const edges = new Set(s.edges.map((e) => e.id));
  const sources = new Set(s.sources.map((x) => x.id));
  for (const e of s.edges) {
    assert.ok(nodes.has(e.from) && nodes.has(e.to), `${s.id} ${e.id} endpoints`);
    assert.ok(sources.has(e.sourceId), `${s.id} ${e.id} source`);
  }
  for (const i of s.impacts) {
    for (const id of i.pathEdgeIds) assert.ok(edges.has(id), `${s.id} ${i.ticker} path ${id}`);
    assert.ok(s.nodes.some((n) => n.kind === "holding" && n.ticker === i.ticker), `${s.id} ${i.ticker} node`);
  }
  const covered = [...s.impacts.map((i) => i.ticker), ...s.notModeled].sort();
  assert.deepEqual(covered, allTickers, `${s.id} covers every holding exactly once`);
}

// Performance
assert.equal(PERFORMANCE.length, 53);
assert.deepEqual(PERFORMANCE[0], { date: "2025-09-26", value: 121300 });
assert.deepEqual(PERFORMANCE[52], { date: "2026-09-25", value: 148420 });
assert.equal(formatSignedPct(returnOver(52)), "+22.4%");

console.log("canon OK");
