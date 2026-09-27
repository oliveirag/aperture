// Local SQL + actual route Requests only. No provider/database network access.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { POST } from "../src/app/api/webhooks/finnhub/route";
import { createDurableDeliveryStore } from "../src/lib/webhooks/store";
import { receiveFinnhubWebhook } from "../src/lib/webhooks/receive";

async function main() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(await readFile(new URL("../supabase/migrations/20260927000200_webhook_deliveries.sql", import.meta.url), "utf8"));
  const rpc = async (operation: string, args: Record<string, unknown>): Promise<unknown> => {
    const result = await db.query<{ result: unknown }>("select public.webhook_delivery($1, $2, $3::uuid) as result", [operation, args.p_key, args.p_token ?? null]);
    return result.rows[0].result;
  };
  const first = createDurableDeliveryStore(rpc), second = createDurableDeliveryStore(rpc);
  const key = "a".repeat(64);
  const claims = await Promise.all([first.claim(key), second.claim(key)]);
  assert.equal(claims.filter(c => c.state === "claimed").length, 1);
  assert.equal(claims.filter(c => c.state === "busy").length, 1);
  const claim = claims.find(c => c.state === "claimed")!;
  assert.equal(claim.state, "claimed");
  if (claim.state !== "claimed") throw new Error("missing claim");
  await assert.rejects(first.complete(key, "00000000-0000-4000-8000-000000000000"));
  await second.release(key, "00000000-0000-4000-8000-000000000000");
  assert.equal((await first.claim(key)).state, "busy");
  // Simulate a process crash/lease expiration with SQL, not a substitute store.
  await db.query("update public.webhook_deliveries set expires_at = now() - interval '1 second' where delivery_key=$1", [key]);
  const replacement = await second.claim(key);
  assert.equal(replacement.state, "claimed");
  if (replacement.state !== "claimed") throw new Error("missing replacement");
  assert.notEqual(replacement.token, claim.token);
  await assert.rejects(first.complete(key, claim.token));
  await first.release(key, claim.token);
  await second.complete(key, replacement.token);
  assert.equal((await first.claim(key)).state, "duplicate");
  await db.query("update public.webhook_deliveries set expires_at = now() - interval '1 second' where delivery_key=$1", [key]);
  assert.equal((await second.claim(key)).state, "claimed", "retention expiration allows replay");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from public.webhook_deliveries"));
    await assert.rejects(rpc("claim", { p_key: key }));
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  assert.equal((await first.claim("b".repeat(64))).state, "claimed");
  await db.exec("reset role");
  await assert.rejects(rpc("claim", { p_key: "invalid" }));
  await assert.rejects(rpc("unknown", { p_key: key }));
  // Enforce SQL bounds, not just the memory helper's capacity/TTL.
  const lease = await db.query<{ seconds: number }>("select extract(epoch from (expires_at - now()))::float8 as seconds from public.webhook_deliveries where delivery_key=$1", [key]);
  assert.ok(lease.rows[0].seconds > 0 && lease.rows[0].seconds <= 120);
  await db.exec("truncate public.webhook_deliveries; insert into public.webhook_deliveries select lpad(to_hex(n),64,'0'), gen_random_uuid(), 'done', now() + interval '24 hours' from generate_series(1,100000) n;");
  assert.equal((await first.claim(key)).state, "full");
  await db.exec("update public.webhook_deliveries set expires_at=now()-interval '1 second';");
  assert.equal((await first.claim(key)).state, "claimed");
  const count = await db.query<{ count: number }>("select count(*)::int as count from public.webhook_deliveries");
  assert.equal(count.rows[0].count, 99001, "bounded sweep removes at most 1000 expired receipts per request");
  await db.exec("truncate public.webhook_deliveries");

  const request = (data = { event: "ping", data: [] }) => new Request("https://aperture.example/api/webhooks/finnhub", { method: "POST", headers: { "content-type": "application/json", "x-finnhub-secret": "local-test-only" }, body: JSON.stringify(data) });
  process.env.FINNHUB_WEBHOOK_SECRET = "local-test-only";
  process.env.APERTURE_LOCAL_VERIFICATION = "0";
  process.env.NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION = "0";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  assert.equal((await POST(request())).status, 503, "deployed route fails closed without durable store");
  const originalFetch = globalThis.fetch;
  // Fake credentials route only to the in-memory SQL bridge; never out to a server.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://local-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-only";
  process.env.APERTURE_LOCAL_VERIFICATION = "0";
  process.env.NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION = "0";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://local-test.supabase.co/rest/v1/rpc/webhook_delivery");
    assert.equal(init?.redirect, "error");
    const args = JSON.parse(String(init?.body));
    return Response.json(await rpc(args.p_operation, args));
  };
  try {
    assert.equal((await POST(request())).status, 200);
    assert.equal((await (await POST(request())).json()).duplicate, true);
    const oversize = new Request(request().url, { method: "POST", headers: request().headers, body: "x".repeat(262145) });
    assert.equal((await POST(oversize)).status, 413);
    globalThis.fetch = async () => { throw new Error("DO NOT LEAK CREDENTIALS"); };
    const failed = await POST(request());
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes("DO NOT LEAK"));
    process.env.APERTURE_LOCAL_VERIFICATION = "1";
    assert.equal((await POST(request())).status, 503, "isolation refuses remote store, without implicit memory fallback");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  }
  let resume!: () => void;
  const stuck = new Promise<void>(resolve => { resume = resolve; });
  let signal: AbortSignal | undefined;
  const options = { secret: "local-test-only", store: first, timeoutMs: 100, handle: async (_event: unknown, context: { signal: AbortSignal }) => { signal = context.signal; await stuck; context.signal.throwIfAborted(); } };
  const delivery = () => request({ event: "timeout-test", data: [] });
  assert.equal((await receiveFinnhubWebhook(delivery(), options)).status, 503);
  assert.equal(signal?.aborted, true);
  assert.equal((await receiveFinnhubWebhook(delivery(), options)).status, 503, "uncancelled work keeps its claim busy");
  resume();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await receiveFinnhubWebhook(delivery(), { ...options, handle: async () => {} })).status, 200);
  await db.close();
  console.log("webhook SQL/route OK: actual PGlite migration, atomic claims, busy retries, token fencing, leases/retention, privilege denial, route bounds, fail closed, abort without early release; no remote writes");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
