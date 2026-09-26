// Proves the performance series math. Run: npx -y tsx scripts/check-performance.ts
import assert from "node:assert/strict";
import { parseWeekly, type Weekly } from "../src/lib/history";
import { buildPerformance, seriesReturn } from "../src/lib/performance";
import { PERFORMANCE, returnOver } from "../src/data/performance";

const weeks = (n: number, start: number, step: number, first = "2025-09-05"): Weekly =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(`${first}T00:00:00Z`) + i * 7 * 864e5).toISOString().slice(0, 10), close: start + i * step }));

const histories = { AAA: weeks(60, 100, 1), BBB: weeks(60, 50, 0) };
const out = buildPerformance(
  [
    { ticker: "AAA", shares: 10, price: 170 },
    { ticker: "BBB", shares: 20, price: 50 },
    { ticker: "ZZZ", shares: 5, price: 100 },
  ],
  { ...histories, ZZZ: null },
  "2026-10-30",
);
// 52 weekly points plus today's value; today's value is shares x current price for the included positions.
assert.equal(out.series.length, 53);
assert.equal(out.series[out.series.length - 1].value, 10 * 170 + 20 * 50);
assert.equal(out.series[0].value, 10 * (100 + 8) + 20 * 50);
assert.deepEqual(out.excluded, ["ZZZ"]);
assert.equal(out.coverage, 2700 / 3200);
const aaa = out.holdings.find((h) => h.ticker === "AAA")!;
assert.equal(aaa.returns["1Y"], 170 / (100 + 8) - 1);
assert.equal(out.holdings.find((h) => h.ticker === "BBB")!.returns["1M"], 0);
// No history at all: empty series, everything named.
assert.deepEqual(buildPerformance([{ ticker: "ZZZ", shares: 1, price: 1 }], { ZZZ: null }, "2026-10-30").series, []);
// A position with a short history starts the chart when it starts.
const short = buildPerformance([{ ticker: "AAA", shares: 1, price: 170 }, { ticker: "NEW", shares: 1, price: 10 }], { AAA: histories.AAA, NEW: weeks(10, 10, 0, "2026-08-21") }, "2026-10-30");
assert.equal(short.series[0].date, "2026-08-21");
// Parsing prefers the adjusted close and sorts oldest first.
assert.deepEqual(parseWeekly({ "Weekly Adjusted Time Series": { "2026-09-25": { "4. close": "10", "5. adjusted close": "9.5" }, "2026-09-18": { "4. close": "11", "5. adjusted close": "10.4" } } }), [
  { date: "2026-09-18", close: 10.4 },
  { date: "2026-09-25", close: 9.5 },
]);
assert.equal(parseWeekly({ Information: "limit" } as never), null);
// The demo chart's returns are unchanged by the refactor.
for (const w of [4, 26, 52] as const) assert.equal(seriesReturn(PERFORMANCE, w), returnOver(w));
console.log("performance OK");
