// Proves every path that keeps Aperture working without Gemini. Run: npx -y tsx scripts/check-fallbacks.ts
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// The cache's local disk layer writes here, never into the repo.
process.env.APERTURE_CACHE_DIR = mkdtempSync(path.join(os.tmpdir(), "aperture-check-"));

(async () => {
  const { textDiff } = await import("../src/lib/radar/text-diff");
  const { verifyChanges } = await import("../src/lib/radar/verify");
  const { parseRows } = await import("../src/lib/imports/ocr");
  const { evaluate, rulesMemo, rulesSide, RULES_NOTE } = await import("../src/lib/ic/rules");
  const { answerFromData } = await import("../src/lib/ask/offline");
  const { memo, coldStart } = await import("../src/lib/cache");

  // Filing Radar text diff: new, reworded and removed risk sentences under their headings; date-only edits skipped.
  const body = (s: string) => `${s} ${"Our results could be adversely affected by many other factors described in this report. ".repeat(4)}`;
  const prior = [
    "We depend on third-party foundries to manufacture our products.",
    body("We rely on a limited number of foundries in Asia to make our chips, and any disruption could reduce our supply. During fiscal year 2024, we expanded our supplier base across several regions."),
    "Our business is subject to cybersecurity risks.",
    body("A breach of our systems could expose customer data and harm our reputation. We maintain a legacy mainframe that is costly to operate and difficult to replace."),
  ].join("\n");
  const latest = [
    "We depend on third-party foundries to manufacture our products.",
    body("We rely on a limited number of foundries in Taiwan to make our chips, and any disruption could reduce our supply. During fiscal year 2025, we expanded our supplier base across several regions."),
    "Export controls could prevent us from selling products to certain customers.",
    body("New export controls and licensing requirements restrict sales of our data center products to China, and additional restrictions could be imposed without notice."),
    "Our business is subject to cybersecurity risks.",
    body("A breach of our systems could expose customer data and harm our reputation."),
  ].join("\n");
  const proposed = textDiff(latest, prior, { form: "10-K", filedAt: "2026-02-25", priorFiledAt: "2025-02-26" });
  const kinds = proposed.map((c) => `${c.kind}:${c.label.slice(0, 20)}`);
  assert.ok(kinds.some((k) => k.startsWith("new:Export controls")), `new risk factor found: ${kinds}`);
  assert.ok(kinds.some((k) => k.startsWith("changed:We depend on third")), `rewording found: ${kinds}`);
  assert.ok(kinds.some((k) => k.startsWith("removed:Our business is sub")), `removal found: ${kinds}`);
  assert.ok(!proposed.some((c) => /fiscal year 2025/.test(c.latestExcerpt ?? "")), "year-only update skipped");
  assert.equal(proposed.find((c) => c.kind === "new")?.category, "Regulatory · Export controls");
  const { kept, dropped } = verifyChanges(proposed, latest, prior);
  assert.equal(dropped, 0, "every excerpt is verbatim");
  assert.equal(kept.length, proposed.length);

  // OCR row parsing: phone layout (value on the ticker line, shares below) and a table layout.
  const phone = parseRows("Symbol Market value\nvVOO $42,000.00\n75 shares +0.38%\nNVDA $19,800.00\n110 shares +1.84%");
  assert.deepEqual(phone.map((r) => [r.ticker, r.shares, r.marketValue]), [["VOO", 75, 42000], ["NVDA", 110, 19800]]);
  const table = parseRows("Symbol Qty Price Market Value\nAAPL Apple Inc 50 $284.00 $14,200.00 +0.27%\nUSD Cash $1,203.44\nBRK.B 10 $480.00 $4,800.00");
  assert.deepEqual(table.map((r) => [r.ticker, r.shares, r.marketValue]), [["AAPL", 50, null], ["USD", null, 1203.44], ["BRK.B", 10, null]]);
  assert.ok(table.every(r => r.reviewState === "required"), "Every OCR row requires review, including cash");
  assert.equal(table[1].rowType, "cash", "Cash is retained, never discarded from the denominator");
  assert.ok(table[0].rawText.includes("$14,200.00") && table[2].rawText.includes("$4,800.00"), "Ambiguous source values remain visible for review rather than guessing max(price, value)");
  assert.ok(table[0].reviewWarnings.some(w => /Ambiguous/.test(w)));

  // Rules committee: every point cites a fact that exists, and the memo says it came from rules.
  const facts = [
    { id: "F1", title: "Revenue", docType: "10-Q", issuer: "X", date: "2026-06-30", excerpt: "", url: "https://sec.gov", content: "", signal: { kind: "revenue" as const, latest: 15e9, yearAgo: 10e9, end: "2026-06-30" } },
    { id: "F2", title: "Valuation", docType: "Market data", issuer: "Finnhub", date: "2026-09-26", excerpt: "", url: "https://finnhub.io", content: "", signal: { kind: "market" as const, price: 95, pe: 80, low: 40, high: 100, beta: 1.8, margin: 25 } },
  ];
  const fit = [
    { label: "Portfolio value", kind: "usd" as const, before: 100000, after: 110000 },
    { label: "Example look-through", kind: "weight" as const, before: 0, after: 0.09 },
    { label: "Technology sector", kind: "weight" as const, before: 0.4, after: 0.45 },
  ];
  const e = evaluate("Example", facts as never, fit);
  const ids = new Set(["F1", "F2", "FIT"]);
  for (const p of [...e.bull, ...e.bear]) assert.ok(p.refs.every((r) => ids.has(r)), `cited: ${p.text}`);
  assert.ok(e.bull.some((p) => /Revenue grew 50\.0%/.test(p.text)), "revenue growth point");
  assert.ok(e.bear.some((p) => /80\.0× trailing earnings/.test(p.text)), "valuation point");
  assert.ok(e.bear.some((p) => /Technology sector would be 45\.0%/.test(p.text)), "sector concentration point");
  const memoOut = rulesMemo("Example", e, rulesSide("bull", "Example", e), rulesSide("bear", "Example", e), e.assumptions);
  assert.ok(memoOut.chairNote.endsWith(RULES_NOTE));
  assert.ok(!/\b(buy|sell)\b/i.test(JSON.stringify(memoOut)), "no advice words");

  // Ask without a model: a named company, a definition, and an unknown question.
  const ctx = {
    portfolio: { totalValueUsd: 148420, positionsCount: 2, underlyingCompanies: 504, positions: [{ ticker: "VOO", name: "Vanguard S&P 500 ETF", valueUsd: 42000, weight: 0.5 }] },
    apertureTop10: [{ ticker: "NVDA", name: "NVIDIA", valueUsd: 26111, weight: 0.176, paths: [{ via: "Direct", weight: 0.133 }, { via: "VOO", weight: 0.022 }] }],
  };
  assert.match(answerFromData("How much nvidia do I own?", ctx), /NVIDIA \(NVDA\) is 17\.6% of your money, \$26,111: held directly 13\.3%, through VOO 2\.2%/);
  assert.match(answerFromData("What is an ETF?", ctx), /basket of many companies[\s\S]*In your portfolio: VOO/);
  assert.match(answerFromData("Tell me a joke", ctx), /Without the AI assistant I can answer/);
  const scenario = answerFromData("What if Iran closes the Strait of Hormuz?", {
    portfolio: ctx,
    scenario: { question: "q", assumption: "Assume a 20% increase in oil price.", impacts: [{ ticker: "UPS", returnFraction: -0.03, dollar: -300, path: "Fuel costs" }, { ticker: "XOM", returnFraction: 0.1, dollar: 500 }], notModeled: ["KRE"], evidence: [{ text: "EIA: Hormuz is a chokepoint." }] },
  });
  assert.match(scenario, /Calculated effect: \+\$200 \(0\.1% of your portfolio\)[\s\S]*- XOM: 10\.0%[\s\S]*Not modeled: KRE/);

  // Cache: after a provider failure, the last value that loaded is served; with no history the error surfaces.
  const key = `check:lkg:${Date.now()}`;
  assert.deepEqual(await memo(key, 30, async () => ({ price: 123 })), { price: 123 });
  await new Promise((r) => setTimeout(r, 100));
  coldStart();
  assert.deepEqual(await memo(key, 30, async () => { throw new Error("sec 503"); }), { price: 123 });
  await assert.rejects(memo(`check:none:${Date.now()}`, 30, async () => { throw new Error("boom"); }), /boom/);

  // Shipped scenario sources: every filing quote links to the filing document itself, never a search page.
  const { SCENARIOS } = await import("../src/data/shock");
  for (const src of SCENARIOS.flatMap((sc) => sc.sources)) {
    if (src.docType !== "10-K") continue;
    assert.match(src.url, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//, `${src.id} links to the filing`);
    if (src.highlight) assert.ok(src.excerpt.includes(src.highlight), `${src.id} highlight is in its excerpt`);
  }

  console.log("fallbacks OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
