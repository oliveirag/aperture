// Proves the live Filing Radar's deterministic parts. Run: npx -y tsx scripts/check-radar.ts
import assert from "node:assert/strict";
import { coveredCompanies, liveHeadline, sortCards, toCard } from "../src/features/radar/live-model";
import { formatPct } from "../src/lib/format";
import { parseProposed, verifyChanges } from "../src/lib/radar/verify";
import type { RadarFiling } from "../src/lib/radar/types";
import { extractSection, filingPair, htmlToText, normalizeForMatch, type Filing } from "../src/lib/sec";
import { computeXray } from "../src/lib/xray/compute";

// HTML to text: hidden XBRL header dropped, entities decoded, blocks on their own lines.
const text = htmlToText(
  `<html><head><title>x</title></head><body><ix:header><div>hidden 123</div></ix:header>` +
    `<p>Item&#160;1A. Risk Factors</p><p>We rely on &ldquo;third parties&rdquo; &amp; suppliers.</p></body></html>`,
);
assert.equal(text, "Item 1A. Risk Factors\nWe rely on “third parties” & suppliers.");
assert.equal(normalizeForMatch("It’s  a “test” — ok"), `it's a "test" - ok`);

// Section extraction: the body wins over the table of contents and in-text cross-references.
const filler = "Our business faces many risks. ".repeat(120);
const doc = [
  "Table of Contents",
  "Item 1A. Risk Factors 12",
  "Item 1B. Unresolved Staff Comments 30",
  "Part I",
  "Item 1. Business",
  'See "Item 1A. Risk Factors," for more. Also Item 1A. Risk Factors” discusses this.',
  "Item 1A. Risk Factors",
  `Export controls may hurt sales. ${filler}`,
  "Item 1B. Unresolved Staff Comments",
  "None.",
].join("\n");
const section = extractSection(doc, "10-K");
assert.ok(section.found);
assert.ok(section.text.startsWith("Item 1A. Risk Factors\nExport controls may hurt sales."), section.text.slice(0, 60));
assert.ok(!section.text.includes("Unresolved"));
assert.equal(extractSection("no headings here", "10-K").found, false);

// Pairs: 10-K vs 10-K preferred, 10-Q pair as the fallback.
const f = (form: "10-K" | "10-Q", filedAt: string): Filing => ({ form, accession: filedAt, filedAt, reportDate: filedAt, url: "", indexUrl: "" });
assert.deepEqual(
  Object.values(filingPair([f("10-Q", "2026-07-31"), f("10-K", "2025-10-31"), f("10-Q", "2025-08-01"), f("10-K", "2024-11-01")])!).map((x) => x.filedAt),
  ["2025-10-31", "2024-11-01"],
);
assert.deepEqual(Object.values(filingPair([f("10-Q", "2026-07-31"), f("10-Q", "2026-05-01"), f("10-K", "2025-10-31")])!).map((x) => x.filedAt), ["2026-07-31", "2026-05-01"]);
assert.equal(filingPair([f("10-K", "2025-10-31")]), null);

// Verification: only verbatim quotes survive, and the kind must match the texts.
const prior = "We may be subject to export restrictions on certain of our products to certain customers in China. Hybrid work may affect demand for office space.";
const latest =
  "U.S. export controls now require licenses for our data center products to China and additional regions, and we may be unable to replace lost revenue. " +
  "Customers may shift to competing products that are not subject to the same restrictions.";
const proposed = parseProposed({
  changes: [
    { kind: "changed", label: "Export rules widen", summary: "s", category: "Regulatory · Export", severity: "high", latest_excerpt: "U.S. export controls now require licenses for our data center products to China and additional regions", prior_excerpt: "We may be subject to export restrictions on certain of our products to certain customers in China.", key_phrases: ["additional regions", "not in text"] },
    { kind: "new", label: "Competitors", summary: "s", category: "Competition", severity: "medium", latest_excerpt: "Customers may shift to competing products that are not subject to the same restrictions.", prior_excerpt: null, key_phrases: [] },
    { kind: "removed", label: "Hybrid work", summary: "s", category: "Demand", severity: "low", latest_excerpt: null, prior_excerpt: "Hybrid work may affect demand for office space.", key_phrases: [] },
    // Paraphrase: not verbatim, dropped.
    { kind: "new", label: "Made up", summary: "s", category: "x", severity: "high", latest_excerpt: "Export controls could reduce our revenue from China significantly.", prior_excerpt: null, key_phrases: [] },
    // "New" but already in the prior filing: dropped.
    { kind: "new", label: "Not new", summary: "s", category: "x", severity: "high", latest_excerpt: "Hybrid work may affect demand for office space.", prior_excerpt: null, key_phrases: [] },
    // Too short to prove anything: dropped.
    { kind: "new", label: "Short", summary: "s", category: "x", severity: "high", latest_excerpt: "export controls", prior_excerpt: null, key_phrases: [] },
  ],
});
const { kept, dropped } = verifyChanges(proposed, latest, prior);
assert.deepEqual(kept.map((c) => c.label), ["Export rules widen", "Competitors", "Hybrid work"]);
assert.equal(dropped, 3);
assert.deepEqual(kept[0].highlight, ["additional regions"]);
assert.equal(kept[2].current, "");
assert.throws(() => parseProposed({ changes: [{ kind: "moved", label: "x", severity: "high" }] }));
assert.throws(() => parseProposed({}));

// "Why this matters" uses the X-Ray's numbers for the same portfolio.
const model = computeXray([
  { ticker: "NVDA", name: "NVIDIA Corp", shares: 100, price: 100, kind: "stock", industry: "Semiconductors" },
  { ticker: "AAA", name: "Fund A", shares: 10, price: 1000, kind: "etf", etf: { asOf: "2026-09-25", holdings: [{ ticker: "NVDA", name: "Nvidia", weight: 0.5 }, { ticker: "AAPL", name: "Apple Inc", weight: 0.5 }], sectors: [{ sector: "Technology", weight: 1 }] } },
  { ticker: "KO", name: "Coca-Cola Co", shares: 50, price: 100, kind: "stock", industry: "Beverages" },
]);
const holdings = [
  { ticker: "NVDA", name: "NVIDIA Corp", industry: "Semiconductors", shares: 100, price: 100 },
  { ticker: "AAA", name: "Fund A", industry: null, shares: 10, price: 1000 },
  { ticker: "KO", name: "Coca-Cola Co", industry: "Beverages", shares: 50, price: 100 },
];
const covered = coveredCompanies(model, holdings);
assert.deepEqual(covered.map((c) => c.ticker), ["NVDA", "KO", "AAPL"]);
const nvda = covered[0];
const xrayNvda = model.topTen.find((e) => e.ticker === "NVDA")!;
assert.equal(nvda.weight, xrayNvda.value / model.total);
assert.equal(nvda.whyItMatters, `NVIDIA is ${formatPct(xrayNvda.value / model.total)} of your money across NVDA and AAA. A hit here moves 2 of your positions at once.`);
assert.equal(covered[2].whyItMatters, "Apple is 20.0% of your money, all of it through AAA.");

// Cards sort by severity, then exposure.
const filing = (ticker: string, severity: RadarFiling["severity"]): RadarFiling => ({
  ticker, company: ticker, filingType: "10-K", filedAt: "2026-02-25", priorFiledAt: "2025-02-26", url: "https://www.sec.gov/x", priorUrl: "", section: "Item 1A. Risk Factors",
  severity, category: "c", title: "t", summary: "s", changes: kept.map(({ kind, label, prior, current, highlight }) => ({ kind, label, prior, current, highlight })), dropped: 0, model: "m", checkedAt: "2026-09-26T00:00:00Z",
});
const cards = sortCards([toCard(filing("KO", "high"), covered[1]), toCard(filing("AAPL", "medium"), covered[2]), toCard(filing("NVDA", "high"), covered[0])]);
assert.deepEqual(cards.map((c) => c.ticker), ["NVDA", "KO", "AAPL"]);
assert.equal(cards[0].source.url, "https://www.sec.gov/x");
const head = liveHeadline(cards, 3, false);
assert.equal(head.intermediate, `2 high-severity changes in companies that make up ${formatPct(nvda.weight + covered[1].weight)} of your money.`);

console.log("radar OK");
