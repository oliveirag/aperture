// Local PostgreSQL only. No URL, credentials, or remote Supabase client is used.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { serializeRecord, deserializeRecord } from "../src/lib/cache-codec";
import { loadFixture } from "./lib/fixtures";
import { warmProviders } from "./lib/warm-providers";

async function main() {
  const fixture = await loadFixture(new URL("./fixtures/sec-edgar/aapl-submissions-2026-09-27.json", import.meta.url).pathname);
  const data = JSON.parse(fixture.body);
  const record = { version: 2 as const, key: "fixture:sec:submissions", cachedAt: Date.parse(fixture.retrievedAt), expires: Date.parse(fixture.retrievedAt) + 86400000,
    value: { filings: new Map([[data.cik, data]]), provenance: { kind: "retrieved", provider: fixture.provider, endpoint: fixture.endpoint, retrievedAt: fixture.retrievedAt } } };
  assert.deepEqual(deserializeRecord(serializeRecord(record), record.key), record);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    for (const name of ["20260926000000_accounts.sql", "20260926000100_imports.sql"]) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
    await db.exec("insert into provider_cache(key,value,expires_at) values ('legacy','{\"result\":{}}',now()+interval '1 day')");
    await db.exec(await readFile(new URL("../supabase/migrations/20260927000100_cache_v2.sql", import.meta.url), "utf8"));
    assert.equal((await db.query<{ fresh: boolean }>("select expires_at > now() as fresh from provider_cache where key='legacy'")).rows[0].fresh, false, "unversioned entries are refreshed, not misrepresented as fresh");
    const a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
    const claim = async (token: string) => (await db.query<{ result: { state: string; value?: { cacheRecord: string } } }>("select claim_provider_cache($1,$2) as result", [record.key, token])).rows[0].result;
    assert.equal((await claim(a)).state, "claimed");
    assert.equal((await claim(b)).state, "waiting");
    const finish = async (token: string) => (await db.query<{ ok: boolean }>("select finish_provider_cache($1,$2,$3,now()+interval '1 minute') as ok", [record.key, token, JSON.stringify({ cacheRecord: serializeRecord(record) })])).rows[0].ok;
    assert.equal(await finish(b), false, "wrong token cannot overwrite");
    assert.equal(await finish(a), true);
    const cached = await claim(b);
    assert.equal(cached.state, "cached");
    assert.deepEqual(deserializeRecord(cached.value!.cacheRecord, record.key), record, "JSONB preserves Map encoding and original provenance");
    await db.exec("update provider_cache set expires_at = now()-interval '1 second'");
    assert.equal((await claim(b)).state, "claimed");
    assert.equal(await finish(a), false, "old token cannot overwrite new lease");
    await db.exec("update provider_cache set lease_until = now()-interval '1 second'");
    assert.equal(await finish(b), false, "expired lease cannot write");
    for (let i = 0; i < 55; i++) assert.equal((await db.query<{ retry: string | null }>("select reserve_provider('finnhub',55,60) as retry")).rows[0].retry, null);
    assert.ok((await db.query<{ retry: string | null }>("select reserve_provider('finnhub',55,60) as retry")).rows[0].retry);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(claim(a), /permission denied/);
      await assert.rejects(finish(a), /permission denied/);
      await assert.rejects(db.query("select reserve_provider('finnhub',55,60)"), /permission denied/);
      await assert.rejects(db.query("update provider_cache set value='{}'"), /permission denied/);
      await db.exec("reset role");
    }
    assert.equal((await db.query<{ enabled: boolean }>("select bool_and(relrowsecurity) as enabled from pg_class where relname in ('provider_cache','provider_windows')")).rows[0].enabled, true);
  } finally { await db.close(); }
  let disabledCalls = 0;
  const table = await warmProviders([
    { provider: "sec-edgar", run: async () => ({ detail: "fixture-only runner check", asOf: "2020-01-01" }) },
    { provider: "finnhub", run: async () => { throw new Error("token=NEVER_LOG_ME"); } },
    { provider: "alpha-vantage", disabledReason: "No quota authorization", run: async () => { disabledCalls++; return { detail: "forbidden" }; } },
  ]);
  assert.deepEqual(table.map(row => row.status), ["PASS", "FAIL", "SKIP"]);
  assert.equal(disabledCalls, 0);
  assert.ok(!JSON.stringify(table).includes("NEVER_LOG_ME"));
  console.log("cache storage OK: real fixture roundtrip, local PGlite migrations/RLS/quota/lease fencing, per-provider warm outcomes");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
