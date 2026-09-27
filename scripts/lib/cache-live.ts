import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import { withLiveLock } from "./fixtures";
import type { Provenance } from "../../src/lib/provenance";

export async function checkCacheLive() {
  const forbidden = ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "GEMINI_API_KEY", "GEMINI_API_KEYS"];
  if (forbidden.some(name => Boolean(process.env[name])) || process.env.APERTURE_LOCAL_VERIFICATION !== "1" || process.env.APERTURE_CACHE_DIR !== path.join(homedir(), ".cache", "aperture-shared")) throw new Error("Live cache check requires explicit shared real-data cache, local verification, and blank remote storage/Gemini credentials");
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("Live cache check blocked: FINNHUB_API_KEY missing");
  await withLiveLock(async () => {
    const { memoResult, coldStart, flushCacheWrites } = await import("../../src/lib/cache");
    const endpoint = "https://finnhub.io/api/v1/quote?symbol=AAPL";
    let response: Response;
    try { response = await fetch(endpoint, { headers: { "X-Finnhub-Token": token }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) }); }
    catch { throw new Error("Live cache check blocked: Finnhub transport failure"); }
    if (!response.ok) throw new Error(`Live cache check blocked: Finnhub HTTP ${response.status}`);
    const raw = await response.json();
    const retrievedAt = new Date().toISOString();
    if (!Number.isFinite(raw.c) || raw.c <= 0 || !Number.isFinite(raw.t) || raw.t <= 0) throw new Error("Live cache check blocked: Finnhub quote unavailable");
    const asOf = new Date(raw.t * 1000).toISOString();
    const provenance: Provenance = { kind: "retrieved", provider: "finnhub", endpoint, retrievedAt, asOf };
    const value = { quotes: new Map([["AAPL", raw]]), provenance };
    const key = `verification:cache:live:finnhub:AAPL:${retrievedAt}`;
    const loaded = await memoResult(key, 100, async () => value);
    await flushCacheWrites(); coldStart();
    const disk = await memoResult<typeof value>(key, 100, async () => { throw new Error("Cold-start cache missed"); });
    assert.equal(disk.cache.layer, "disk");
    assert.ok(disk.value.quotes instanceof Map);
    assert.equal(disk.value.quotes.get("AAPL").c, raw.c);
    assert.equal(disk.value.provenance.retrievedAt, retrievedAt);
    await new Promise(resolve => setTimeout(resolve, 130)); coldStart();
    const stale = await memoResult<typeof value>(key, 100, async () => { throw new Error("Deliberate offline provider failure after verified live retrieval"); });
    assert.equal(stale.cache.state, "stale");
    assert.equal(stale.cache.cachedAt, loaded.cache.cachedAt);
    assert.equal(stale.cache.expiresAt, loaded.cache.expiresAt);
    assert.equal(stale.value.provenance.stale, true);
    assert.equal(stale.value.provenance.retrievedAt, retrievedAt);
    assert.equal(stale.value.provenance.asOf, asOf);
    console.log(JSON.stringify({ status: "PASS", provider: "finnhub", symbol: "AAPL", price: raw.c, endpoint, retrievedAt, asOf, verified: ["live retrieval", "atomic disk cold start", "Map roundtrip", "LKG labeled stale", "original dates preserved"], remoteStorage: "disabled" }, null, 2));
  });
}
