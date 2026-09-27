import assert from "node:assert/strict";
import seed from "../src/data/etf-seed.json";
import { validateSeed } from "../src/lib/nport/contract";
import { buildShockGraph, isSeededEtf } from "../src/lib/shock/graph";
import { buildLiveScenario } from "../src/lib/shock/live";
import { DRIVER_IDS, knownPlan, REFERENCES, researchScenario } from "../src/lib/shock/research-model";
import type { ScenarioTable } from "../src/lib/shock/sensitivities";

const profiles = validateSeed(seed).profiles;
const near = (actual: number, expected: number, label: string) => assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: ${actual} != ${expected}`);
const oil = researchScenario(knownPlan("oil rises 20%")!, [REFERENCES.oil!]);
const voo = profiles.VOO;
const sector = voo.sectors.find(s => s.sector === "Consumer Discretionary")!;
const oldSubtraction = voo.holdings.filter(h => oil.table.entities[h.ticker]?.sector === sector.sector).reduce((sum, h) => sum + h.weight, 0);
const intersection = voo.holdings.filter(h => h.sector === sector.sector && oil.table.entities[h.ticker]).reduce((sum, h) => sum + h.weight, 0);
near(sector.weight, 0.00297773611055, "real VOO MCD sector weight");
near(oldSubtraction, 0.06074825438133, "old erroneous named subtraction");
assert.equal(intersection, 0);
console.log({ sectorWeight: sector.weight, oldSubtraction, intersection, correctResidual: sector.weight - intersection });
const graphFor = (ticker: string, table: ScenarioTable, base = oil.base) => buildShockGraph(base, [{ ticker, name: ticker, kind: "etf", value: 1000 }], 1000, table);
assert.ok(graphFor("VOO", oil.table).nodes.some(n => n.id === "sector:VOO:Consumer Discretionary"), "Real VOO MCD residual must survive unrelated unclassified named companies");
assert.equal(isSeededEtf("_meta"), false);

for (const driver of DRIVER_IDS) {
  const { base, table } = researchScenario({ driver, direction: 1, severity: 10, basis: "assumed", trigger: "regression", magnitudeStated: false, rationale: "Regression assumption, not provider data" }, [{ text: "Test-only scenario assumption; not retrieved evidence", sources: [{ title: "Regression assumption", url: "https://example.com/regression-assumption" }] }]);
  for (const [ticker, profile] of Object.entries(profiles)) {
    const graph = graphFor(ticker, table, base);
    const live = buildLiveScenario(base, [{ ticker, name: ticker, kind: "etf", shares: 1, price: 1000, etf: profile }], [], table);
    // Independent constituent-level oracle: a named rule takes priority, otherwise
    // only a genuinely classified constituent can receive a sector assumption.
    let expectedReturn = 0;
    let expectedShare = 0;
    for (const h of profile.holdings) {
      const rule = table.entities[h.ticker] ?? (h.sector ? table.sectors[h.sector] : undefined);
      if (rule) { expectedReturn += h.weight * rule.ret; expectedShare += h.weight; }
    }
    near(live.scenario.impacts[0]?.baseDollar ?? 0, 1000 * expectedReturn, `${driver}/${ticker} live dollars`);
    near(live.modeledShare, expectedShare, `${driver}/${ticker} modeled share`);
    for (const s of profile.sectors) {
      const expected = profile.holdings.filter(h => h.sector === s.sector && !table.entities[h.ticker]).reduce((sum, h) => sum + h.weight, 0);
      const node = graph.nodes.find(n => n.id === `sector:${ticker}:${s.sector}`);
      if (table.sectors[s.sector] && expected > 1e-12) {
        assert.ok(node, `${driver}/${ticker}/${s.sector} missing residual`);
        near(node.exposure, 1000 * expected, "graph residual exposure");
        near(node.baseDollar!, 1000 * expected * table.sectors[s.sector].ret, "graph residual dollars");
      } else assert.equal(node, undefined);
    }
    const quotes = graph.nodes.flatMap(n => n.quotes).filter(q => q.kind === "data");
    assert.ok(quotes.length);
    for (const q of quotes) {
      assert.equal(q.url, profile.holdingsSource.endpoint);
      assert.equal(q.date, profile.holdingsSource.asOf);
      assert.equal(q.issuer, `SEC ${profile.holdingsSource.filing!.form}`);
    }
    for (const n of graph.nodes.filter(n => n.kind === "company" && n.ticker && !table.entities[n.ticker])) {
      assert.equal(n.baseReturn, null, "Absent modeled company sensitivity stays unknown, not zero risk");
      assert.equal(n.baseDollar, null);
    }
    assert.ok(profile.sectorCoverage.unclassifiedWeight > 0);
  }
}
// A scenario's own sector label is NOT the membership of a sourced aggregate.
const mismatched: ScenarioTable = { ...oil.table, entities: { ...oil.table.entities, MCD: { channel: oil.table.sectors[sector.sector].channel, ret: -0.1, sector: "Technology", sourceId: "regression-assumption", kind: "Explicit test assumption" } } };
assert.equal(graphFor("VOO", mismatched).nodes.some(n => n.id === "sector:VOO:Consumer Discretionary"), false, "Named MCD must be subtracted by its sourced classification, even when rule label differs");
const mismatchedLive = buildLiveScenario(oil.base, [{ ticker: "VOO", name: "VOO", kind: "etf", shares: 1, price: 1000, etf: voo }], [], mismatched);
const expectedMismatch = voo.holdings.reduce((sum, h) => sum + h.weight * (mismatched.entities[h.ticker]?.ret ?? (h.sector ? mismatched.sectors[h.sector]?.ret : undefined) ?? 0), 0);
near(mismatchedLive.scenario.impacts[0].baseDollar, 1000 * expectedMismatch, "live uses sourced membership even when scenario label differs");
const absent = buildLiveScenario(oil.base, [{ ticker: "VOO", name: "VOO", kind: "etf", shares: 1, price: 1000, etf: voo }], [], { channels: [], entities: {}, sectors: {} });
assert.deepEqual(absent.scenario.impacts, []);
assert.deepEqual(absent.notModeled, [{ ticker: "VOO", weight: 1 }]);
assert.equal(absent.modeledShare, 0);
assert.match(absent.scenario.headline.advanced, /empty, not zero risk/);
for (const ticker of ["VOO", "QQQ", "SPY", "DIA"]) console.log(ticker, profiles[ticker].sectorCoverage);
console.log("PASS: all sourced funds/drivers reconcile graph residuals and legacy live math; SEC quote provenance and unknown coverage preserved");
