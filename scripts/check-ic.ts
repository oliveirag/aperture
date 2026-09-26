// Proves the IC Room's deterministic parts. Run: npx -y tsx scripts/check-ic.ts
import assert from "node:assert/strict";
import { liveFrame } from "../src/features/ic-room/use-live-ic";
import { DEMO_RUN } from "../src/features/ic-room/run-data";
import { frameAt, TIMELINE } from "../src/features/ic-room/use-ic-run";
import { MEMO, PORTFOLIO_FIT } from "../src/data/ic-room";
import { cleanPoints, isAdvice } from "../src/lib/ic/committee";
import { fundamentalFacts } from "../src/lib/ic/facts";
import { computeFit, exposureNote, exposureValue, withPosition } from "../src/lib/ic/fit";
import { computeXray, type LookthroughInput } from "../src/lib/xray/compute";

// Portfolio fit equals the X-Ray of the portfolio with and without the position.
const before: LookthroughInput[] = [
  { ticker: "NVDA", name: "NVIDIA Corp", shares: 100, price: 100, kind: "stock", industry: "Semiconductors" },
  { ticker: "AAA", name: "Fund A", shares: 10, price: 1000, kind: "etf", etf: { asOf: "2026-09-25", holdings: [{ ticker: "NVDA", name: "Nvidia", weight: 0.5 }, { ticker: "AMD", name: "Advanced Micro Devices", weight: 0.1 }, { ticker: "KO", name: "Coca-Cola", weight: 0.4 }], sectors: [{ sector: "Technology", weight: 0.6 }, { sector: "Consumer Staples", weight: 0.4 }] } },
];
const amd: LookthroughInput = { ticker: "AMD", name: "Advanced Micro Devices Inc", shares: 50, price: 200, kind: "stock", industry: "Semiconductors" };
const after = withPosition(before, amd);
const mBefore = computeXray(before);
const mAfter = computeXray(after);
const fit = computeFit(amd, { inputs: before, model: mBefore }, { inputs: after, model: mAfter });
assert.deepEqual(fit.map((r) => r.label), ["Portfolio value", "Advanced Micro Devices look-through", "NVIDIA look-through (your largest)", "Technology sector"]);
assert.equal(fit[0].before, 20000);
assert.equal(fit[0].after, 30000);
const xAmd = mAfter.topTen.find((e) => e.ticker === "AMD")!;
assert.equal(fit[1].before, 1000 / 20000);
assert.equal(fit[1].after, xAmd.value / mAfter.total);
assert.equal(fit[2].before, mBefore.topTen[0].value / mBefore.total);
assert.equal(fit[2].after, mAfter.topTen.find((e) => e.ticker === "NVDA")!.value / mAfter.total);
assert.equal(fit[3].before, mBefore.sectors.find((s) => s.sector === "Technology")!.weight);
assert.equal(fit[3].after, mAfter.sectors.find((s) => s.sector === "Technology")!.weight);
assert.equal(exposureValue(after, "AMD"), 11000);
assert.equal(exposureNote(before, "AMD", 20000), "5.0% of your money today, through AAA");
assert.equal(exposureNote(before, "MSFT", 20000), "Not in your portfolio today");
// Adding to a held position merges shares at the held price.
const more = withPosition(after, { ...amd, shares: 25, price: 400 });
assert.equal(more.find((p) => p.ticker === "AMD")!.shares, 100);

// Points citing a fact id that isn't in the pack are dropped; advice is dropped.
const valid = new Set(["F1", "F2", "FIT"]);
const points = cleanPoints(
  [
    { text: "Data center revenue grew.", refs: ["F1"] },
    { text: "Invented citation.", refs: ["F9"] },
    { text: "Mixed citation.", refs: ["F2", "F7"] },
    { text: "Uncited claim.", refs: [] },
    { text: "You should buy AMD now.", refs: ["F1"] },
    { text: "Adds to your largest exposure.", refs: ["fit"] },
  ],
  valid,
);
assert.deepEqual(points.map((p) => p.refs), [["F1"], ["FIT"]]);
assert.ok(isAdvice("We recommend buying the stock"));
assert.ok(isAdvice("Analysts carry a strong buy rating"));
assert.ok(!isAdvice("Hyperscalers buy GPUs from two suppliers"));
assert.ok(!isAdvice("AMD sells accelerators to cloud providers"));
for (const p of [...MEMO.bull, ...MEMO.bear]) assert.ok(!isAdvice(p.text), p.text);

// XBRL facts are plain sentences from the numbers, sourced to the filing.
const q = (end: string, value: number) => ({ period: end, value, end, accn: "0000002488-26-000123", form: "10-Q" });
const facts = fundamentalFacts({ cik: "0000002488", name: "ADVANCED MICRO DEVICES INC", ticker: "AMD" }, "AMD", {
  revenue: ["2025-03-29", "2025-06-28", "2025-09-27", "2025-12-27", "2026-03-28"].map((d, i) => q(d, (10 + i) * 1e9)),
  netIncome: [],
  operatingCashFlow: [],
  debt: q("2026-03-28", 3.2e9),
});
assert.equal(facts.length, 2);
assert.match(facts[0].content, /Latest \(quarter ended Mar 2026\): \$14\.00B\. That is 40\.0% vs the same quarter a year earlier\./);
assert.equal(facts[0].url, "https://www.sec.gov/Archives/edgar/data/2488/000000248826000123/0000002488-26-000123-index.htm");
assert.equal(facts[1].content, "Total debt as of Mar 2026: $3.20B.");

// Live stage: bull speaks first, bear waits for the bull to finish, the memo waits for the bear.
const data = { ...DEMO_RUN, bullStatement: "b".repeat(90), bearStatement: "r".repeat(45) };
const state = { status: "running" as const, steps: [{ label: "x", done: true }], data, at: { assumptions: 0, bull: 1000, bear: 1100, memo: 1200 }, startedAt: 0, error: null };
let f = liveFrame(state, 1100);
assert.equal(f.phase, "debate");
assert.equal(f.bullChars, 45);
assert.equal(f.bearChars, 0);
f = liveFrame(state, 1000 + 200 + 300 + 50);
assert.equal(f.bullChars, 90);
assert.equal(f.bearChars, 22);
assert.equal(f.memo, false);
f = liveFrame(state, 1000 + 200 + 300 + 100);
assert.equal(f.memo, true);
assert.equal(liveFrame({ ...state, at: { assumptions: 0 } }, Infinity).bullChars, 0);

// The scripted AMD demo is unchanged.
const end = frameAt(TIMELINE.end);
assert.equal(end.memo, true);
assert.equal(end.assumptionsShown, 4);
assert.equal(DEMO_RUN.fit, PORTFOLIO_FIT);

console.log("ic OK");
