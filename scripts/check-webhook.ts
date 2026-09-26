// Proves the Finnhub webhook's auth, parsing and targeting. Run: npx -y tsx scripts/check-webhook.ts
import assert from "node:assert/strict";
import { handleEvent, parseEvent, validSecret } from "../src/lib/webhooks/finnhub";

// Secret: missing, wrong or unconfigured is refused.
assert.equal(validSecret("s3cret", "s3cret"), true);
assert.equal(validSecret("wrong!", "s3cret"), false);
assert.equal(validSecret("s3cre", "s3cret"), false);
assert.equal(validSecret(null, "s3cret"), false);
assert.equal(validSecret("anything", undefined), false);

// Parsing: event kinds and tickers from symbol, ticker or a news item's related list.
assert.deepEqual(parseEvent({ event: "news", data: [{ related: "AAPL,MSFT", headline: "x" }, { symbol: "nvda" }] }), { kind: "news", tickers: ["AAPL", "MSFT", "NVDA"] });
assert.deepEqual(parseEvent({ event: "earnings", data: [{ symbol: "BRK-B" }] }), { kind: "earnings", tickers: ["BRK.B"] });
assert.deepEqual(parseEvent({ event: "filings", data: { symbol: "AAPL", form: "10-Q" } }), { kind: "filings", tickers: ["AAPL"] });
assert.deepEqual(parseEvent(null), { kind: "other", tickers: [] });

(async () => {
  const held = async (tickers: string[]) => new Set(tickers.filter((t) => t === "AAPL"));
  const refreshed: string[] = [];
  const forgotten: string[][] = [];
  const deps = { interested: held, refreshRadar: async (t: string) => refreshed.push(t), forget: (k: string[]) => forgotten.push(k) };
  const day = new Date().toISOString().slice(0, 10);

  // A filing for a held ticker re-checks Radar for that ticker only.
  assert.deepEqual((await handleEvent({ kind: "filings", tickers: ["AAPL", "TSLA"] }, deps)).refreshed, ["AAPL"]);
  assert.deepEqual(refreshed, ["AAPL"]);
  assert.deepEqual(forgotten, [[`ic:facts:AAPL:${day}`]]);

  // News drops the cached headlines and today's IC fact pack; Radar isn't re-run.
  forgotten.length = 0;
  await handleEvent({ kind: "news", tickers: ["AAPL"] }, deps);
  assert.deepEqual(forgotten, [[`ic:facts:AAPL:${day}`, "finnhub:news:AAPL:14"]]);
  assert.deepEqual(refreshed, ["AAPL"]);

  // Nothing happens for tickers nobody holds or follows, or for unknown events.
  forgotten.length = 0;
  assert.deepEqual((await handleEvent({ kind: "earnings", tickers: ["TSLA"] }, deps)).refreshed, []);
  assert.deepEqual((await handleEvent({ kind: "other", tickers: ["AAPL"] }, deps)).refreshed, []);
  assert.deepEqual(forgotten, []);
  console.log("webhook OK");
})();
