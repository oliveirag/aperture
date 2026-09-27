// Proves the Finnhub webhook's auth, parsing and targeting. Run: npx -y tsx scripts/check-webhook.ts
import assert from "node:assert/strict";
import { handleEvent, parseEvent, validSecret } from "../src/lib/webhooks/finnhub";
import { createMemoryDeliveryStore, receiveFinnhubWebhook } from "../src/lib/webhooks/receive";
import { loadFixture } from "./lib/fixtures";

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
  assert.throws(() => parseEvent({ event: "news", data: Array(101).fill({ related: "AAPL" }) }), /limit/i);
  assert.deepEqual(parseEvent({ event: "newsletter", data: [{ related: "AAPL" }] }), { kind: "other", tickers: ["AAPL"] });
  const limited = await handleEvent({ kind: "filings", tickers: ["AAPL"] }, { ...deps, interested: async () => new Set(["AAPL", "MSFT"]) });
  assert.deepEqual(limited.refreshed, ["AAPL"], "interested callback cannot widen event targets");
  await assert.rejects(handleEvent({ kind: "filings", tickers: ["AAPL"] }, { ...deps, refreshRadar: async () => { throw new Error("failed"); } }));

  // These are in-process Request tests, never real webhook delivery or registration.
  const fixture = await loadFixture("scripts/fixtures/finnhub/news-aapl.json");
  const data = JSON.parse(fixture.body).slice(0, 2);
  const payload = { event: "news", data };
  const store = createMemoryDeliveryStore();
  let calls = 0;
  const options = { secret: "test-webhook-secret", store, handle: async () => { calls++; } };
  const request = (body = JSON.stringify(payload), secret = "test-webhook-secret", headers: Record<string, string> = {}) => new Request("https://aperture.example/api/webhooks/finnhub", { method: "POST", headers: { "content-type": "application/json", "x-finnhub-secret": secret, ...headers }, body });
  assert.equal((await receiveFinnhubWebhook(request(undefined, "wrong"), options)).status, 401);
  assert.equal(calls, 0);
  assert.equal((await receiveFinnhubWebhook(request(), { ...options, secret: undefined })).status, 503);
  assert.equal((await receiveFinnhubWebhook(request("{broken"), options)).status, 400);
  assert.equal((await receiveFinnhubWebhook(request(undefined, undefined, { "content-type": "text/plain" }), options)).status, 415);
  assert.equal((await receiveFinnhubWebhook(request("x".repeat(262145)), options)).status, 413);
  assert.equal((await receiveFinnhubWebhook(request("{}", undefined, { "content-length": "9999999" }), options)).status, 413);
  assert.equal(calls, 0);
  const concurrent = await Promise.all([receiveFinnhubWebhook(request(), options), receiveFinnhubWebhook(request(), options)]);
  assert.ok(concurrent.every(r => r.ok));
  assert.equal(calls, 1, "atomic claim prevents concurrent duplicate effects");
  assert.equal((await receiveFinnhubWebhook(request(JSON.stringify({ data, event: "news" })), options)).status, 200);
  assert.equal(calls, 1, "JSON key order is not delivery identity");
  await receiveFinnhubWebhook(request(JSON.stringify({ event: "news", data: [...data].reverse() })), options);
  assert.equal(calls, 1, "batch order is not delivery identity");
  await receiveFinnhubWebhook(request(JSON.stringify({ event: "news", data: [{ ...data[0], headline: data[0].headline + " corrected" }] })), options);
  assert.equal(calls, 2, "different event for same ticker is not swallowed");
  const retryStore = createMemoryDeliveryStore();
  assert.equal((await receiveFinnhubWebhook(request(), { ...options, store: retryStore, handle: async () => { throw new Error("private provider error"); } })).status, 503);
  assert.equal((await receiveFinnhubWebhook(request(), { ...options, store: retryStore })).status, 200, "failed processing releases the claim");
  const tinyStore = createMemoryDeliveryStore({ capacity: 1 });
  assert.equal((await receiveFinnhubWebhook(request(), { ...options, store: tinyStore })).status, 200);
  assert.equal((await receiveFinnhubWebhook(request(JSON.stringify({ event: "news", data: [data[0]] })), { ...options, store: tinyStore })).status, 503, "no eviction of unexpired claims");
  let clock = 0;
  const expiring = createMemoryDeliveryStore({ ttlMs: 1000, now: () => clock });
  await receiveFinnhubWebhook(request(), { ...options, store: expiring });
  const before = calls;
  clock = 1001;
  await receiveFinnhubWebhook(request(), { ...options, store: expiring });
  assert.equal(calls, before + 1);
  assert.equal(validSecret("x".repeat(1025), "x".repeat(1025)), false);
  assert.equal((await receiveFinnhubWebhook(request(JSON.stringify({ event: "news", data: [null] })), options)).status, 400);
  assert.equal((await receiveFinnhubWebhook(request(JSON.stringify({ event: "", data: [] })), options)).status, 400);
  assert.equal((await receiveFinnhubWebhook(request(JSON.stringify({ event: "news", data: Array(101).fill(data[0]) })), options)).status, 400);
  let nested: unknown = { value: true };
  for (let i = 0; i < 25; i++) nested = { nested };
  assert.equal((await receiveFinnhubWebhook(request(JSON.stringify({ event: "news", data: [nested] })), options)).status, 400);
  const failure = await receiveFinnhubWebhook(request(), { ...options, store: createMemoryDeliveryStore(), handle: async () => { throw new Error("DO NOT LEAK"); } });
  assert.equal(failure.status, 503);
  assert.ok(!(await failure.text()).includes("DO NOT LEAK"));
  await assert.rejects(handleEvent({ kind: "news", tickers: ["AAPL"] }, { ...deps, forget: async () => { throw new Error("failed invalidation"); } }));
  if (process.argv.includes("--live")) console.log("Webhook --live is intentionally LOCAL Request verification only: no provider registration/delivery or database calls.");
  console.log("webhook OK: existing targeting checks plus authenticated, bounded, concurrent/reordered replay, retry, capacity and TTL checks (local Requests only)");
})().catch(error => { console.error(error); process.exitCode = 1; });
