// Proves rate limits, the Finnhub token bucket and the persistent cache. Run: npx -y tsx scripts/check-limits.ts
import assert from "node:assert/strict";

// A fake Upstash REST endpoint (pipeline of GET, SET PX, PTTL, INCR, PEXPIREAT, DEL) and a fake Finnhub.
const kvData = new Map<string, { value: string; expiresAt: number }>();
let finnhubCalls = 0;
const run = (cmd: (string | number)[]) => {
  const [op, key, ...rest] = cmd as [string, string, ...(string | number)[]];
  const e = kvData.get(key);
  const live = e && e.expiresAt > Date.now() ? e : undefined;
  switch (op) {
    case "GET":
      return live?.value ?? null;
    case "SET":
      kvData.set(key, { value: String(rest[0]), expiresAt: Date.now() + Number(rest[2]) });
      return "OK";
    case "PTTL":
      return live ? live.expiresAt - Date.now() : -2;
    case "INCR": {
      const n = Number(live?.value ?? 0) + 1;
      kvData.set(key, { value: String(n), expiresAt: live?.expiresAt ?? Infinity });
      return n;
    }
    case "PEXPIREAT":
      if (live) live.expiresAt = Number(rest[0]);
      return 1;
    case "DEL":
      [key, ...rest].forEach((k) => kvData.delete(String(k)));
      return 1;
  }
  throw new Error(`unexpected ${op}`);
};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://kv.test")) {
    const cmds = JSON.parse(String(init?.body)) as (string | number)[][];
    return Response.json(cmds.map((c) => ({ result: run(c) })));
  }
  if (url.startsWith("https://finnhub.io")) {
    finnhubCalls++;
    return Response.json({ c: 100, d: 1, dp: 1, pc: 99, t: 1758900000 });
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;
process.env.UPSTASH_REDIS_REST_URL = "https://kv.test";
process.env.UPSTASH_REDIS_REST_TOKEN = "t";
process.env.FINNHUB_API_KEY = "test";

(async () => {
  const { coldStart } = await import("../src/lib/cache");
  const { getQuote, takeToken } = await import("../src/lib/finnhub");
  const { rateLimit, LIMITS } = await import("../src/lib/rate-limit");

  // Persistent cache: a cold instance with a warm store makes no Finnhub call.
  assert.equal((await getQuote("AAPL"))?.price, 100);
  assert.equal(finnhubCalls, 1);
  await new Promise((r) => setTimeout(r, 20)); // the store write is fire-and-forget
  coldStart();
  assert.equal((await getQuote("AAPL"))?.price, 100);
  assert.equal(finnhubCalls, 1, "cold start read the persistent cache");
  assert.equal((await getQuote("AAPL"))?.price, 100);
  assert.equal(finnhubCalls, 1, "warm instance read memory");

  // Rate limit: the 21st screenshot read in an hour from one client is refused; another client is not.
  const req = (ip: string) => new Request("http://x/api/snap", { method: "POST", headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });
  const t = Date.now();
  const windowEnd = (Math.floor(t / 3600000) + 1) * 3600000;
  const minutes = Math.max(1, Math.ceil((windowEnd - t) / 60000));
  for (let i = 0; i < LIMITS.snap.max; i++) assert.equal(await rateLimit(req("1.1.1.1"), "snap", t), null, `read ${i + 1}`);
  const refused = await rateLimit(req("1.1.1.1"), "snap", t);
  assert.equal(refused?.status, 429);
  assert.equal(refused?.headers.get("Retry-After"), String(Math.ceil((windowEnd - t) / 1000)));
  assert.equal(
    (await refused!.json()).error,
    `That's the limit of 20 screenshot reads an hour from this device. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
  );
  assert.equal(await rateLimit(req("2.2.2.2"), "snap", t), null);
  // The next hour starts a new window.
  assert.equal(await rateLimit(req("1.1.1.1"), "snap", windowEnd + 1000), null);

  // Token bucket: 50 calls go straight through, the next one waits for a refill instead of failing.
  const start = Date.now();
  for (let i = 0; i < 49; i++) await takeToken(); // one token was spent on the quote above
  assert.ok(Date.now() - start < 100, "burst is immediate");
  await takeToken();
  const waited = Date.now() - start;
  assert.ok(waited >= 900 && waited < 3000, `queued ${waited}ms`);
  console.log("limits OK");
})();
