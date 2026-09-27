// Proves the live Shock Test math. Run: npx -y tsx scripts/check-shock.ts
import assert from "node:assert/strict";
import { getScenario, scenarioTotals } from "../src/data/shock";
import { parseProfile } from "../src/lib/etf";
import { etfInput } from "../src/lib/imports/quotes";
import { scaleShock } from "../src/lib/format";
import { buildLiveScenario } from "../src/lib/shock/live";
import { computeXray, type ApertureInput } from "../src/lib/xray/compute";
import seed from "../src/data/etf-seed.json";

const SEED = seed as unknown as Record<string, Parameters<typeof parseProfile>[1]>;
const etf = (ticker: string) => {
  const p = parseProfile(ticker, SEED[ticker], "seed")!;
  const input = etfInput(p);
  assert.ok(input, "Use the same validated, sourced ETF adapter as production");
  return input;
};

// $10k BXP direct, $5k KRE held without look-through, $20k VOO (seed), $10k AAPL, $5k a mystery fund.
const inputs: ApertureInput[] = [
  { ticker: "BXP", name: "BXP Inc", shares: 100, price: 100, kind: "stock", industry: "Real Estate" },
  { ticker: "KRE", name: "SPDR S&P Regional Banking ETF", shares: 100, price: 50, kind: "opaque" },
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", shares: 40, price: 500, kind: "etf", etf: etf("VOO") },
  { ticker: "AAPL", name: "Apple Inc", shares: 50, price: 200, kind: "stock", industry: "Technology" },
  { ticker: "ZZZ", name: "Mystery fund", shares: 50, price: 100, kind: "opaque" },
];
const model = computeXray(inputs);
const cre = buildLiveScenario(getScenario("cre"), inputs, model.sources);
const s = cre.scenario;
const bxp = s.impacts.find((i) => i.ticker === "BXP")!;
const kre = s.impacts.find((i) => i.ticker === "KRE")!;
const voo = s.impacts.find((i) => i.ticker === "VOO")!;
assert.equal(bxp.baseDollar, 10000 * -0.225);
assert.equal(bxp.baseReturn, -0.225);
assert.equal(kre.baseDollar, 5000 * -0.155);
assert.ok(voo.baseDollar < 0 && voo.baseReturn > -0.05, `VOO ${voo.baseReturn}`);
// VOO: its Financials and Real Estate slices at the sector rate (named banks and REITs at their own rate).
const vooEtf = etf("VOO");
const finRe = vooEtf.sectors.filter((x) => x.sector === "Financials" || x.sector === "Real Estate").reduce((a, x) => a + x.weight, 0);
assert.ok(Math.abs(voo.baseDollar) >= 20000 * finRe * 0.085 * 0.99, "VOO covers its financials");
// Nothing else is modeled, and "Not modeled" carries each holding's weight.
assert.deepEqual(cre.notModeled.map((x) => x.ticker), ["AAPL", "ZZZ"]);
assert.deepEqual(cre.notModeled.map((x) => x.weight), [10000 / 50000, 5000 / 50000]);
// Deterministic and linear in severity.
const again = buildLiveScenario(getScenario("cre"), inputs, model.sources);
assert.deepEqual(again, cre);
const at20 = scenarioTotals(s, 20, 50000).dollar;
const at40 = scenarioTotals(s, 40, 50000).dollar;
assert.ok(Math.abs(at40 - 2 * at20) < 1e-9);
assert.equal(scaleShock(bxp.baseDollar, 30, 20), 10000 * -0.225 * 1.5);
// Every edge opens a real source, and every impact's path exists.
const ids = new Set(s.sources.map((x) => x.id));
for (const e of s.edges) assert.ok(ids.has(e.sourceId), `${e.id} -> ${e.sourceId}`);
const edgeIds = new Set(s.edges.map((e) => e.id));
for (const i of s.impacts) for (const id of i.pathEdgeIds) assert.ok(edgeIds.has(id), `${i.ticker} path ${id}`);
const nodeIds = new Set(s.nodes.map((n) => n.id));
for (const e of s.edges) assert.ok(nodeIds.has(e.from) && nodeIds.has(e.to), e.id);
const vooSource = s.sources.find((x) => x.id === "s-voo-holdings")!;
assert.equal(vooSource.issuer, "sec-nport", "Actual filing provider wins over the old demo attribution");
assert.equal(vooSource.url, vooEtf.holdingsSource?.url);
assert.match(vooSource.url!, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
assert.equal(vooSource.date, vooEtf.asOf);
assert.match(s.headline.advanced, /3 modeled holdings.*2 holdings have no modeled path/);

// AI capex: NVDA inside VOO and QQQ, MSFT direct.
const ai = buildLiveScenario(getScenario("ai-capex"), [...inputs, { ticker: "MSFT", name: "Microsoft", shares: 10, price: 500, kind: "stock", industry: "Software" }], model.sources);
const msft = ai.scenario.impacts.find((i) => i.ticker === "MSFT")!;
assert.equal(msft.baseDollar, 5000 * -0.06);
const nvdaW = vooEtf.holdings.find((h) => h.ticker === "NVDA")!.weight;
assert.ok(Math.abs(ai.scenario.impacts.find((i) => i.ticker === "VOO")!.baseDollar) >= 20000 * nvdaW * 0.24);
assert.ok(!ai.scenario.impacts.some((i) => i.ticker === "BXP"));

// A portfolio with nothing modeled says so instead of showing zero.
const none = buildLiveScenario(getScenario("cre"), [inputs[3]], []);
assert.equal(none.scenario.impacts.length, 0);
assert.match(none.scenario.headline.intermediate, /No modeled path/);

console.log("shock OK");
