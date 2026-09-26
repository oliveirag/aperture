// Proves overlapping screenshots don't double count. Run: npx -y tsx scripts/check-snap.ts
import assert from "node:assert/strict";
import { dedupeOverlap, type RawHolding } from "../src/lib/price-holdings";

// Two overlapping screenshots of one account: MSFT and NVDA are visible on both.
const screen1: RawHolding[] = [
  { ticker: "AAPL", shares: 50, marketValue: 14200, name: "Apple Inc." },
  { ticker: "MSFT", shares: 20, marketValue: 11300, name: "Microsoft" },
  { ticker: "NVDA", shares: 110, marketValue: null, name: null },
];
const screen2: RawHolding[] = [
  // The partly visible row read without its share count.
  { ticker: "msft", shares: null, marketValue: 11300, name: null },
  { ticker: "NVDA", shares: 110, marketValue: 19800, name: "NVIDIA" },
  { ticker: "BRK/B", shares: 5, marketValue: 2400, name: null },
];
const rows = dedupeOverlap([...screen1, ...screen2]);
const by = (t: string) => rows.find((r) => r.ticker === t)!;
assert.deepEqual(rows.map((r) => r.ticker), ["AAPL", "MSFT", "NVDA", "BRK.B"]);
assert.equal(by("MSFT").shares, 20);
assert.equal(by("MSFT").marketValue, 11300);
assert.equal(by("NVDA").shares, 110);
assert.equal(by("NVDA").marketValue, 19800);
assert.equal(by("NVDA").name, "NVIDIA");
// Value-only rows keep the larger value, never the sum.
assert.equal(dedupeOverlap([{ ticker: "VOO", shares: null, marketValue: 1000, name: null }, { ticker: "VOO", shares: null, marketValue: 1200, name: null }])[0].marketValue, 1200);
console.log("snap OK");
