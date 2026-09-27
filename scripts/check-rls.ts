// Proves the accounts schema's Row Level Security on a real Postgres (PGlite, in-process). Run: npx -y tsx scripts/check-rls.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { samePositions } from "../src/lib/accounts";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

(async () => {
  const db = new PGlite();
  // The slice of Supabase the migration relies on: auth.users, auth.uid() from the JWT claim, the authenticated role.
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated nologin;
    grant usage on schema public, auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(readFileSync("supabase/migrations/20260926000000_accounts.sql", "utf8"));
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');`);

  // Acts as a signed-in user for one statement batch.
  const as = async <T>(user: string, sql: string, params: unknown[] = []) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
    try {
      return (await db.query<T>(sql, params)).rows;
    } finally {
      await db.exec("reset role;");
    }
  };

  // Sign-up created both profiles.
  assert.equal((await db.query<{ n: number }>("select count(*)::int as n from public.profiles")).rows[0].n, 2);

  // A saves a portfolio with two holdings.
  const [pa] = await as<{ id: string }>(A, "insert into public.portfolios (name, kind) values ('My brokerage', 'real') returning id");
  await as(A, "insert into public.holdings (portfolio_id, ticker, name, shares, price) values ($1, 'NVDA', 'NVIDIA', 110, 180), ($1, 'VOO', 'Vanguard S&P 500 ETF', 75, 560)", [pa.id]);
  await as(A, "update public.profiles set experience_level = 'beginner' where id = auth.uid()");

  // A sees its own rows.
  assert.equal((await as(A, "select * from public.holdings")).length, 2);
  assert.equal((await as<{ experience_level: string }>(A, "select experience_level from public.profiles")).map((r) => r.experience_level).join(), "beginner");

  // B sees none of A's rows, even by id, and can't change or delete them.
  assert.equal((await as(B, "select * from public.holdings")).length, 0);
  assert.equal((await as(B, "select * from public.portfolios where id = $1", [pa.id])).length, 0);
  assert.equal((await as(B, "select * from public.profiles")).length, 1);
  assert.equal((await as(B, "update public.holdings set shares = 1 returning id")).length, 0);
  assert.equal((await as(B, "delete from public.portfolios returning id")).length, 0);
  // B can't slip a holding into A's portfolio, or write a row owned by A.
  await assert.rejects(as(B, "insert into public.holdings (portfolio_id, ticker, shares, price) values ($1, 'AAPL', 1, 1)", [pa.id]), /row-level security/);
  await assert.rejects(as(B, `insert into public.portfolios (user_id, name, kind) values ('${A}', 'x', 'real')`), /row-level security/);
  // Anonymous (no JWT) sees nothing.
  assert.equal((await as("", "select * from public.holdings")).length, 0);

  // A's data is intact.
  assert.deepEqual((await as<{ ticker: string; shares: string }>(A, "select ticker, shares::text from public.holdings order by ticker")).map((r) => `${r.ticker} ${r.shares}`), ["NVDA 110", "VOO 75"]);
  // Deleting a portfolio removes its holdings.
  await as(A, "delete from public.portfolios where id = $1", [pa.id]);
  assert.equal((await as(A, "select * from public.holdings")).length, 0);

  // Experience migration: a late write carrying an older choice can't overwrite a newer one (the app's upsert path).
  await db.exec(readFileSync("supabase/migrations/20260927000000_experience.sql", "utf8"));
  const upsertLevel = (level: string, at: string) =>
    as(A, `insert into public.profiles (id, experience_level, experience_level_updated_at) values (auth.uid(), '${level}', '${at}')
      on conflict (id) do update set experience_level = excluded.experience_level, experience_level_updated_at = excluded.experience_level_updated_at`);
  const levelOfA = async () => (await as<{ experience_level: string }>(A, "select experience_level from public.profiles"))[0].experience_level;
  await upsertLevel("advanced", "2026-09-27T10:00:00Z");
  assert.equal(await levelOfA(), "advanced");
  await upsertLevel("beginner", "2026-09-27T09:00:00Z");
  assert.equal(await levelOfA(), "advanced", "an older choice arriving late is ignored");
  await upsertLevel("intermediate", "2026-09-27T11:00:00Z");
  assert.equal(await levelOfA(), "intermediate", "a newer choice wins");
  assert.equal((await as(B, "update public.profiles set experience_level = 'beginner' where id <> auth.uid() returning id")).length, 0, "B can't change A's level");

  // The offer to save compares positions, not order or prices.
  const h = (ticker: string, shares: number, price = 1) => ({ ticker, name: ticker, industry: null, shares, price });
  assert.ok(samePositions([h("VOO", 75), h("NVDA", 110)], [h("NVDA", 110, 180), h("VOO", 75, 560)]));
  assert.ok(!samePositions([h("VOO", 75)], [h("VOO", 76)]));
  console.log("rls OK");
})();
