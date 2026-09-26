// Proves the look-through math on a hand-computed portfolio. Run: npx -y tsx scripts/check-lookthrough.ts
import assert from "node:assert/strict";
import { cleanName, computeXray } from "../src/lib/xray/compute";

// $10k NVDA direct, $10k fund A (50% NVDA, 50% AAPL), $5k fund B (40% NVDA, 40% MSFT, 20% untickered), $5k opaque ZZZ.
const m = computeXray([
  { ticker: "NVDA", name: "NVIDIA Corp", shares: 100, price: 100, kind: "stock", industry: "Semiconductors" },
  { ticker: "AAA", name: "Fund A", shares: 10, price: 1000, kind: "etf", etf: { asOf: "2026-09-25", holdings: [{ ticker: "NVDA", name: "Nvidia", weight: 0.5 }, { ticker: "AAPL", name: "Apple Inc", weight: 0.5 }], sectors: [{ sector: "Technology", weight: 1 }] } },
  { ticker: "BBB", name: "Fund B", shares: 5, price: 1000, kind: "etf", etf: { asOf: "2026-09-25", holdings: [{ ticker: "NVDA", name: "Nvidia", weight: 0.4 }, { ticker: "MSFT", name: "Microsoft", weight: 0.4 }], sectors: [{ sector: "Technology", weight: 0.8 }] } },
  { ticker: "ZZZ", name: "Mystery", shares: 50, price: 100, kind: "opaque" },
]);
assert.equal(m.total, 30000);
const nvda = m.topTen[0];
assert.equal(nvda.ticker, "NVDA");
assert.equal(nvda.name, "NVIDIA"); // direct (Finnhub) name wins, suffix dropped
assert.equal(nvda.value, 10000 + 5000 + 2000);
assert.deepEqual(nvda.sources.map((s) => s.via), ["Direct", "AAA", "BBB"]);
assert.equal(m.topTen.find((e) => e.ticker === "AAPL")!.value, 5000);
assert.equal(m.topTen.find((e) => e.ticker === "ZZZ")!.value, 5000);
assert.deepEqual(m.opaque, ["ZZZ"]);
assert.equal(m.underlyingCompanies, 4); // NVDA AAPL MSFT ZZZ
// Overlap AAA vs BBB = min(.5,.4) NVDA = 0.4, 1 shared.
assert.equal(m.overlaps.length, 1);
assert.equal(m.overlaps[0].a, "AAA");
assert.ok(Math.abs(m.overlaps[0].overlap - 0.4) < 1e-9);
assert.equal(m.overlaps[0].sharedCompanies, 1);
// Sectors: tech = 10k (semis) + 10k + 4k = 24k = 80%; other = 1k (BBB) + 5k (ZZZ) = 20%.
assert.deepEqual(m.sectors.map((s) => [s.sector, +s.weight.toFixed(4)]), [["Technology", 0.8], ["Other", 0.2]]);
assert.deepEqual(m.flags.map((f) => f.id), ["f-nvda", "f-aapl", "f-zzz", "f-technology"]);
assert.equal(m.headline.intermediate, "NVIDIA isn't one position. It's three, and 56.7% of your money.");
// Map: rows sum to total; every connector ends on a row.
const rowSum = m.map.exposures.reduce((s, e) => s + e.value, 0);
assert.ok(Math.abs(rowSum - m.total) < 0.01, `rows ${rowSum}`);
const ids = new Set([...m.map.exposures.map((e) => e.id), ...m.map.positions.map((p) => p.id)]);
for (const c of m.map.connectors) assert.ok(ids.has(c.from) && ids.has(c.to), c.id);
// Each position's outgoing lines add up to its value.
for (const p of m.map.positions) {
  const out = m.map.connectors.filter((c) => c.from === p.id).reduce((s, c) => s + c.value, 0);
  assert.ok(Math.abs(out - p.value) < 0.01, `${p.id} out ${out} vs ${p.value}`);
}
for (const [raw, clean] of [["JPMorgan Chase & Co", "JPMorgan Chase"], ["Alphabet Inc Class A", "Alphabet"], ["Coca-Cola Co", "Coca-Cola"], ["Apple Inc.", "Apple"], ["Co", "Co"]]) {
  assert.equal(cleanName(raw), clean);
}
console.log("compute OK");
