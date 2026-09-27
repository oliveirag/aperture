import assert from "node:assert/strict";

async function main() {
  process.env.APERTURE_LOCAL_VERIFICATION = "1";
  const { readJson, symbols, safeApiError, ApiError, withDeadline, guardRateLimit } = await import("../src/lib/api-safety");
  const json = (text: string) => new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
  assert.deepEqual(await readJson(json('{"ok":true}')), { ok: true });
  await assert.rejects(readJson(json("{")), /Invalid JSON/);
  await assert.rejects(readJson(json('"not-an-object"')), /JSON object/);
  await assert.rejects(readJson(json('{"value":"abcdef"}'), { maxBytes: 8 }), /too large/);
  await assert.rejects(readJson(new Request("http://localhost", { method: "POST", body: "{}" })), /Content-Type/);
  const endless = new ReadableStream<Uint8Array>({ start() {} });
  const request = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: endless, duplex: "half" } as RequestInit);
  await assert.rejects(readJson(request, { timeoutMs: 10 }), /timed out/);
  assert.deepEqual(symbols("aapl,BRK.B,aapl"), ["AAPL", "BRK.B"]);
  assert.throws(() => symbols("AAPL,,MSFT"));
  assert.throws(() => symbols("AAPL/../../env"));
  assert.throws(() => symbols(Array.from({ length: 101 }, () => "AAPL").join(",")));
  assert.throws(() => symbols(""));
  const hidden = safeApiError(new Error("https://private.invalid?token=secret stack trace"));
  assert.equal(hidden.status, 500);
  assert.deepEqual(await hidden.json(), { error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } });
  assert.equal(safeApiError(new ApiError("INVALID_INPUT")).status, 400);
  assert.equal(safeApiError(new ApiError("PROVIDER_UNAVAILABLE", "sec-edgar")).status, 502);
  await assert.rejects(withDeadline(async () => new Promise<never>(() => {}), 10), /timed out/);
  const client = new Request("http://localhost", { headers: { "x-forwarded-for": "192.0.2.10" } });
  for (let i = 0; i < 20; i++) assert.equal(await guardRateLimit(client, "snap"), null);
  const limited = await guardRateLimit(client, "snap");
  assert.equal(limited?.status, 429);
  assert.equal((await limited!.json()).error.code, "RATE_LIMITED");
  assert.ok(Number(limited?.headers.get("Retry-After")) > 0);
  // A configured production limiter must fail closed, not silently reset into an empty local counter.
  process.env.APERTURE_LOCAL_VERIFICATION = "0";
  process.env.UPSTASH_REDIS_REST_URL = "https://kv.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "trap";
  globalThis.fetch = async () => { throw new Error("offline unit test"); };
  assert.equal((await guardRateLimit(client, "snap"))?.status, 503);
  console.log("API helpers OK: bounded bodies, deadlines, validation, safe errors, verification limits, production fail-closed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
