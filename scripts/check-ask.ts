// Proves Ask's deterministic parts. Run: npx -y tsx scripts/check-ask.ts
import assert from "node:assert/strict";
import { RADAR_CARDS } from "../src/data/radar";
import { askContext } from "../src/features/ask/context";
import { DECLINE, DISCLAIMER, isBuySellQuestion, systemPrompt } from "../src/lib/ask/prompt";
import { DEMO_XRAY } from "../src/lib/xray/demo";

// Buy/sell questions are declined before any model sees them; research questions are not.
for (const q of ["Should I buy NVDA?", "should i sell my apple shares now", "Is it a good time to buy QQQ?", "Buy or sell TSLA?", "What stocks should I buy?", "what's the price target for AMD", "Do you think I should dump BXP?"]) {
  assert.ok(isBuySellQuestion(q), q);
}
for (const q of ["What's my biggest risk?", "How much of my money is in AI?", "What changed in Apple's latest filing?", "What is an ETF?", "How do I research a stock before buying?", "Why do hyperscalers buy so many GPUs?"]) {
  assert.ok(!isBuySellQuestion(q), q);
}
assert.match(DECLINE, /IC Room/);

// Rules and tone per level.
const prompt = systemPrompt("beginner");
assert.match(prompt, /I don't have data on that/);
assert.match(prompt, /Never tell the user to buy, sell or hold/);
assert.ok(prompt.includes(DISCLAIMER));
assert.notEqual(systemPrompt("advanced"), prompt);

// The context carries the X-Ray's numbers exactly (weights as fractions).
const ctx = askContext({ kind: "demo", model: DEMO_XRAY, names: {}, radar: RADAR_CARDS, memos: [] });
const nvda = ctx.lookThroughTop10.find((e) => e.ticker === "NVDA")!;
assert.equal(nvda.weight, Math.round((DEMO_XRAY.topTen.find((e) => e.ticker === "NVDA")!.value / DEMO_XRAY.total) * 1e4) / 1e4);
assert.equal(nvda.weight, 0.1759);
assert.equal(ctx.portfolio.totalValueUsd, 148420);
assert.equal(ctx.filingRadar.length, 4);
assert.ok(JSON.stringify(ctx).length < 60_000);

console.log("ask OK");
