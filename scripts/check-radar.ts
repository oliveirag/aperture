// Proves the deterministic half of Filing Radar (no network, no Gemini). Run: npx -y tsx scripts/check-radar.ts
import assert from "node:assert/strict";
import { containsVerbatim, diffSections, paragraphs } from "../src/lib/radar/diff";
import { extractRiskFactors, htmlToText } from "../src/lib/sec";

const filler = (n: number) => Array.from({ length: n }, (_, i) => `Routine risk paragraph number ${i} describing competition, suppliers, currency moves and general economic conditions in detail.`).join("\n");

// The table of contents and a later cross-reference also mention Item 1A; only the real section (heading line
// through the next item heading) is extracted.
const doc = [
  "Table of Contents",
  "Item 1A.",
  "Risk Factors",
  "Item 1B.",
  "Unresolved Staff Comments",
  "ITEM 1A. RISK FACTORS",
  filler(30),
  "ITEM 1B. UNRESOLVED STAFF COMMENTS",
  "None.",
  "ITEM 2. PROPERTIES",
  "As discussed in Item 1A. Risk Factors in Part I of this report, results may vary.",
  filler(80),
].join("\n");
const section = extractRiskFactors(doc);
assert.ok(section, "section found");
assert.ok(section.startsWith("Routine risk paragraph number 0"), "starts after the real heading");
assert.ok(!section.includes("UNRESOLVED"), "stops at Item 1B");
assert.equal(paragraphs(section).length, 30);

// HTML: hidden inline XBRL header dropped, entities decoded, block tags become lines.
assert.equal(htmlToText("<ix:header>secret facts</ix:header><p>Risk&#160;one &amp; two</p><div>Next&rsquo;s</div>"), "Risk one & two\nNext's");

// A paragraph split by a page break (next line starts lowercase) is joined back.
assert.deepEqual(paragraphs("We depend on a small number of suppliers for components and"
  + "\nmanufacturing, and any disruption could harm us materially over time.\n12\nTable of Contents"), [
  "We depend on a small number of suppliers for components and manufacturing, and any disruption could harm us materially over time.",
]);

// Classification: identical -> ignored, light edit -> changed, unrelated -> new, dropped -> removed.
const kept = "Our business is subject to intense competition from companies with greater resources than ours in every market we serve.";
const before = `${kept}
We may be subject to export restrictions on certain of our products to certain customers in China, which could reduce demand.
Our operations in the region could be disrupted by the pandemic and related government restrictions on travel and work.`;
const after = `${kept}
We may be subject to export restrictions on certain of our products to customers in China and additional regions, which could reduce demand.
The availability of data centers, energy and capital to support the buildout of customer AI infrastructure is crucial to our growth.`;
const d = diffSections(before, after);
const kind = (needle: string) => d.find((c) => c.current.includes(needle))?.kind;
assert.equal(kind("intense competition"), undefined, "identical paragraph ignored");
assert.equal(kind("additional regions"), "changed");
assert.ok(d.find((c) => c.kind === "changed")?.prior?.includes("certain customers in China"), "changed keeps the prior wording");
assert.equal(kind("data centers, energy"), "new");
assert.equal(kind("pandemic"), "removed");
assert.deepEqual(d.map((c) => c.id), d.map((_, i) => `C${i + 1}`));

// Pure wording churn (a date bump) is not a change.
assert.equal(diffSections(
  "As of December 31, 2024, we had approximately 29,600 employees working across our offices, labs and data centers worldwide.",
  "As of December 31, 2025, we had approximately 29,600 employees working across our offices, labs and data centers worldwide.",
).length, 0);

// The verbatim guard: quotes and whitespace are normalized, paraphrase is not accepted.
const para = "Customers affected by licensing requirements may shift to competing products that aren’t subject to the same restrictions.";
assert.ok(containsVerbatim(para, "may shift to competing products that aren't subject"));
assert.ok(containsVerbatim(para, "shift  to\ncompeting products"));
assert.ok(!containsVerbatim(para, "may move to rival products"), "paraphrase rejected");
assert.ok(!containsVerbatim(para, "shift"), "too-short quote rejected");

console.log("radar OK");
