// Proves the Finnhub webhook's auth, parsing and targeting. Run: npx -y tsx scripts/check-webhook.ts
import assert from "node:assert/strict";
import { handleEvent, heldAmong, parseEvent, validSecret } from "../src/lib/webhooks/finnhub";
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
assert.deepEqual(parseEvent({ event: "news", data: { related: "A1,BRK-B,BRK/B,ABCDEFGHI1,ABCDEFGHIJK" } }).tickers, ["A1", "BRK.B", "ABCDEFGHI1"]);

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

  assert.deepEqual((await handleEvent({ kind: "news", tickers: ["A1", "BRK.B", "ABCDEFGHI1"] }, { ...deps, interested: async () => new Set(["A1", "BRK-B", "ABCDEFGHI1"]) })).refreshed, ["A1", "BRK.B", "ABCDEFGHI1"]);
  await assert.rejects(handleEvent({ kind: "news", tickers: ["ABCDEFGHIJK"] }, deps));
  const fetchBefore = globalThis.fetch;
  const savedEnv = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, local: process.env.APERTURE_LOCAL_VERIFICATION, publicLocal: process.env.NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION };
  try {
    process.env.APERTURE_LOCAL_VERIFICATION = "0";
    process.env.NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION = "0";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    globalThis.fetch = async () => { throw new Error("No network allowed"); };
    assert.equal((await heldAmong(["A1"])).size, 0, "explicit no-account mode");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://local-test.supabase.co";
    await assert.rejects(heldAmong(["A1"]), /configured/);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-only";
    await assert.rejects(heldAmong(["A1"]), /unavailable/);
    for (const response of [new Response("denied", { status: 403 }), Response.json({ invalid: true })]) {
      globalThis.fetch = async () => response;
      await assert.rejects(heldAmong(["A1"]));
    }
    globalThis.fetch = async (input, init) => {
      assert.ok(String(input).includes("A1,BRK.B,BRK-B,BRK%2FB"));
      assert.equal(init?.redirect, "error");
      return Response.json([{ ticker: "A1" }, { ticker: "BRK-B" }]);
    };
    assert.deepEqual([...(await heldAmong(["A1", "BRK.B"]))], ["A1", "BRK.B"]);
  } finally {
    globalThis.fetch = fetchBefore;
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url ?? "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key ?? "";
    process.env.APERTURE_LOCAL_VERIFICATION = savedEnv.local ?? "";
    process.env.NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION = savedEnv.publicLocal ?? "";
  }
  // A pending read may ignore cancellation, but resuming it must not invalidate.
  let finishRead!: (value: Set<string>) => void;
  const controller = new AbortController();
  let effects = 0;
  const aborted = handleEvent({ kind: "news", tickers: ["A1"] }, {
    interested: () => new Promise(resolve => { finishRead = resolve; }),
    forget: () => { effects++; },
    context: { signal: controller.signal, checkpoint: () => controller.signal.throwIfAborted() },
  });
  controller.abort(); finishRead(new Set(["A1"]));
  await assert.rejects(aborted);
  assert.equal(effects, 0);

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
  const slowOptions = { ...options, handle: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 15)); } };
  const concurrent = await Promise.all([receiveFinnhubWebhook(request(), slowOptions), receiveFinnhubWebhook(request(), slowOptions)]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 503], "in-flight is retryable, never an acknowledged receipt");
  assert.equal(calls, 1, "atomic claim prevents concurrent duplicate effects");
  assert.equal((await receiveFinnhubWebhook(request(JSON.stringify({ data, event: "news" })), options)).status, 200);
  assert.equal(calls, 1, "JSON key order is not delivery identity");
  await receiveFinnhubWebhook(request(JSON.stringify({ event: "news", data: [...data].reverse() })), options);
  assert.equal(calls, 1, "batch order is not delivery identity");
  await receiveFinnhubWebhook(request(JSON.stringify({ event: "news", data: [{ ...data[0], headline: data[0].headline + " corrected" }] })), options);
  assert.equal(calls, 2, "different event for same ticker is not swallowed");
  const delayedStore = createMemoryDeliveryStore();
  let delayedEffects = 0;
  assert.equal((await receiveFinnhubWebhook(request(), { ...options, timeoutMs: 5, store: {
    ...delayedStore,
    claim: async key => { const claim = await delayedStore.claim(key); await new Promise(resolve => setTimeout(resolve, 15)); return claim; },
  }, handle: async () => { delayedEffects++; } })).status, 503, "work budget starts before the claim round trip, not after a possibly paused response");
  assert.equal(delayedEffects, 0);
  const retryStore = createMemoryDeliveryStore();
  assert.equal((await receiveFinnhubWebhook(request(), { ...options, store: retryStore, handle: async () => { throw new Error("private provider error"); } })).status, 503);
  assert.equal((await receiveFinnhubWebhook(request(), { ...options, store: retryStore })).status, 200, "failed processing releases the claim");
  const partialStore = createMemoryDeliveryStore();
  const partialEffects: string[] = [];
  let failSecond = true;
  const partial = { ...options, store: partialStore, handle: async () => handleEvent({ kind: "news", tickers: ["A1", "BRK.B"] }, {
    interested: async tickers => new Set(tickers),
    forget: keys => {
      if (keys[0].includes("BRK.B") && failSecond) { failSecond = false; throw new Error("partial failure"); }
      partialEffects.push(keys[0]);
    },
  }) };
  assert.equal((await receiveFinnhubWebhook(request(), partial)).status, 503);
  assert.equal((await receiveFinnhubWebhook(request(), partial)).status, 200);
  assert.equal(partialEffects.filter(key => key.includes("A1")).length, 2, "partial effects safely rerun; this is not generalized exactly-once");
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
