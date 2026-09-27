// Synthetic storage semantics only; never provider parser fixtures or shared real-data entries.
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Provenance } from "../src/lib/provenance";

async function main() {
  if (process.argv.includes("--live")) {
    const { checkCacheLive } = await import("./lib/cache-live");
    return checkCacheLive();
  }
  const dir = await mkdtemp(path.join(tmpdir(), "aperture-cache-check-"));
  process.env.APERTURE_CACHE_DIR = dir;
  process.env.APERTURE_LOCAL_VERIFICATION = "1";
  // Deliberately configured traps: verification must not access either service.
  process.env.UPSTASH_REDIS_REST_URL = "https://remote.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "verification-trap";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://remote.invalid";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "verification-trap";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "verification-trap";
  let network = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { network++; throw new Error("Remote access forbidden"); };
  const cache = await import("../src/lib/cache");
  let failed = 0;
  const test = async (name: string, run: () => Promise<void>) => {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}`, error); }
  };
  const fail = async (): Promise<never> => { throw new Error("provider failed with token=NEVER_LOG_ME"); };
  const diskFile = (key: string) => path.join(dir, `${createHash("sha1").update(key).digest("hex")}.json`);
  try {
    await test("Map survives disk cold start", async () => {
      const value = new Map([["TEST", { id: "unit-test-only" }]]);
      await cache.memo("test:map", 60_000, async () => value);
      await new Promise(resolve => setTimeout(resolve, 50));
      cache.coldStart();
      const restored = await cache.memo<typeof value>("test:map", 60_000, fail, { persist: true });
      assert.ok(restored instanceof Map, "Map must not become {} on disk");
      assert.deepEqual(restored, value);
    });
    await test("verification blocks Redis and Supabase, not authentication", async () => {
      assert.equal(await cache.kv([["SET", "trap", "value"]]), null);
      const server = await import("../src/lib/supabase/server");
      assert.equal(server.configured(), false);
      assert.throws(() => server.admin());
      await assert.rejects(server.requireUser());
      const browser = await import("../src/lib/supabase");
      process.env.NEXT_PUBLIC_ACCOUNTS = "1";
      assert.equal(browser.accountsEnabled(), false);
      assert.equal(browser.supabase(), null);
      process.env.APERTURE_LOCAL_VERIFICATION = "0";
      process.env.NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION = "1";
      assert.equal(server.configured(), false);
      assert.equal(await cache.kv([["SET", "trap", "value"]]), null);
      assert.equal(browser.accountsEnabled(), false);
      process.env.NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION = "";
      process.env.APERTURE_LOCAL_VERIFICATION = "1";
      assert.ok(!JSON.stringify(await server.apiError(new Error("token=NEVER_LOG_ME")).json()).includes("NEVER_LOG_ME"));
      assert.equal(network, 0);
    });
    await test("original timestamps + nested provenance stale on LKG, original unchanged", async () => {
      const provenance: Provenance = { kind: "assumption", rationale: "storage unit test", source: "synthetic fixture", asOf: "2020-01-01" };
      const value = { number: 1, provenance, inputs: [{ provenance }] };
      const fresh = await cache.memoResult("test:stale", 10, async () => value);
      await cache.flushCacheWrites();
      await new Promise(resolve => setTimeout(resolve, 25));
      cache.coldStart();
      const stale = await cache.memoResult<typeof value>("test:stale", 10, fail);
      assert.equal(stale.cache.state, "stale");
      assert.equal(stale.cache.cachedAt, fresh.cache.cachedAt);
      assert.equal(stale.cache.expiresAt, fresh.cache.expiresAt);
      assert.equal(stale.value.provenance.stale, true);
      assert.equal(stale.value.inputs[0].provenance.stale, true);
      assert.equal(stale.value.provenance.asOf, "2020-01-01");
      assert.equal(Object.hasOwn(provenance, "stale"), false);
      assert.ok(!JSON.stringify(stale.cache).includes("NEVER_LOG_ME"));
      const again = await cache.memoResult<typeof value>("test:stale", 10, fail);
      assert.equal(again.cache.state, "stale", "retry backoff must not relabel stale as fresh");
    });
    await test("retention is not freshness after cold start", async () => {
      await cache.memo("test:retention", 5, async () => 1, { persist: true, persistMs: 60_000 });
      await cache.flushCacheWrites();
      await new Promise(resolve => setTimeout(resolve, 15));
      cache.coldStart();
      assert.equal(await cache.memo("test:retention", 5, async () => 2, { persist: true }), 2);
    });
    await test("fresh disk used even without remote persistence option", async () => {
      await cache.memo("test:disk", 60_000, async () => "first");
      await cache.flushCacheWrites();
      cache.coldStart();
      const hit = await cache.memoResult("test:disk", 60_000, fail);
      assert.equal(hit.value, "first"); assert.equal(hit.cache.layer, "disk");
    });
    await test("concurrent loads coalesce, rejection releases inflight", async () => {
      let calls = 0;
      const values = await Promise.all(Array.from({ length: 20 }, () => cache.memo("test:coalesce", 1000, async () => { calls++; return "ok"; })));
      assert.equal(calls, 1); assert.ok(values.every(value => value === "ok"));
      await assert.rejects(cache.memo("test:reject", 1000, fail));
      assert.equal(await cache.memo("test:reject", 1000, async () => "recovered"), "recovered");
    });
    await test("null and undefined never overwrite a last good value", async () => {
      await cache.memo("test:nullable", 1, async () => "known");
      await cache.flushCacheWrites();
      await new Promise(resolve => setTimeout(resolve, 5));
      const result = await cache.memoResult("test:nullable", 1, async () => null);
      assert.equal(result.value, "known"); assert.equal(result.cache.state, "stale");
      assert.equal(await cache.memo("test:no-data", 100, async () => null), null);
    });
    await test("atomic ordered writes + immediate cold start + no temp artifacts", async () => {
      for (let i = 0; i < 30; i++) cache.put("test:ordered", { index: i }, 60_000, { persist: true });
      cache.coldStart();
      assert.deepEqual(await cache.recall("test:ordered"), { index: 29 });
      await cache.flushCacheWrites();
      const files = await readdir(dir);
      assert.ok(files.every(file => file.endsWith(".json")));
      for (const file of files) JSON.parse(await readFile(path.join(dir, file), "utf8"));
    });
    await test("forget removes LKG; exact expiry retains explicitly stale fallback", async () => {
      cache.put("test:forget", "secret", 60_000, { persist: true });
      cache.forget("test:forget");
      await cache.flushCacheWrites(); cache.coldStart();
      await assert.rejects(cache.memo("test:forget", 100, fail));
      cache.put("test:expire", "keep", 60_000, { persist: true });
      cache.forgetKeys(["test:expire"]);
      await cache.flushCacheWrites(); cache.coldStart();
      const result = await cache.memoResult("test:expire", 100, fail);
      assert.equal(result.value, "keep"); assert.equal(result.cache.state, "stale");
    });
    await test("corrupt and old unversioned disk cannot be trusted fresh", async () => {
      await writeFile(diskFile("test:corrupt"), "{bad");
      assert.equal(await cache.memo("test:corrupt", 100, async () => "reloaded"), "reloaded");
      await writeFile(diskFile("test:legacy"), JSON.stringify({ key: "test:legacy", expires: Date.now() + 100000, value: {} }));
      assert.equal(await cache.memo("test:legacy", 100, async () => "reloaded"), "reloaded");
    });
    await test("invalidation during inflight load cannot resurrect forgotten entry", async () => {
      let release!: (value: string) => void;
      const pending = cache.memo("test:race", 60000, () => new Promise<string>(resolve => { release = resolve; }));
      while (!release) await new Promise(resolve => setTimeout(resolve, 1));
      cache.forgetKeys(["test:race"]); release("old"); await pending;
      assert.equal(await cache.memo("test:race", 60000, async () => "new"), "new");
    });
    await test("bounded stale policy refuses over-age LKG", async () => {
      await cache.memo("test:max-age", 1, async () => "old");
      await cache.flushCacheWrites();
      await new Promise(resolve => setTimeout(resolve, 5));
      await assert.rejects(cache.memo("test:max-age", 1, fail, { maxStaleMs: 0 }));
    });
    await test("serialization supports Date/Set/undefined and safe tag-looking objects", async () => {
      const { serializeRecord, deserializeRecord } = await import("../src/lib/cache-codec");
      const record = { version: 2 as const, key: "test:codec", cachedAt: 1, expires: 2, value: { date: new Date("2020-01-01"), set: new Set([1, 2]), missing: undefined, tagged: { type: "map", value: "not a Map" }, integer: BigInt(3) } };
      assert.deepEqual(deserializeRecord(serializeRecord(record), record.key), record);
      assert.equal(deserializeRecord(serializeRecord(record), "wrong-key"), undefined);
      const cycle: Record<string, unknown> = {}; cycle.self = cycle;
      assert.throws(() => serializeRecord({ ...record, value: cycle }), /Unsupported cache value/);
    });
    await test("Redis-only cold start preserves metadata and Map; corrupt commands fail closed", async () => {
      await cache.flushCacheWrites();
      process.env.APERTURE_CACHE_DIR = "";
      process.env.APERTURE_LOCAL_VERIFICATION = "0";
      const remote = new Map<string, string>();
      globalThis.fetch = async (_input, init) => {
        const commands = JSON.parse(String(init?.body)) as (string | number)[][];
        return Response.json(commands.map(([op, key, value]) => {
          if (op === "SET") { remote.set(String(key), String(value)); return { result: "OK" }; }
          if (op === "GET") return { result: remote.get(String(key)) ?? null };
          return { error: "synthetic command failure" };
        }));
      };
      try {
        const original = await cache.memoResult("test:redis", 5000, async () => new Map([["unit", 1]]), { persist: true });
        await cache.flushCacheWrites(); cache.coldStart();
        const restored = await cache.memoResult<Map<string, number>>("test:redis", 5000, fail, { persist: true });
        assert.equal(restored.cache.layer, "redis");
        assert.equal(restored.cache.cachedAt, original.cache.cachedAt);
        assert.equal(restored.cache.expiresAt, original.cache.expiresAt);
        assert.deepEqual(restored.value, new Map([["unit", 1]]));
        assert.equal(await cache.kv([["INVALID"]]), null);
      } finally {
        process.env.APERTURE_CACHE_DIR = dir;
        process.env.APERTURE_LOCAL_VERIFICATION = "1";
        globalThis.fetch = async () => { throw new Error("Remote access forbidden"); };
      }
    });
    await cache.flushCacheWrites();
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
  assert.equal(failed, 0, `${failed} cache checks failed`);
  console.log("cache OK (isolated, no remote mutations)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
