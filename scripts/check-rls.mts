// Proves Row Level Security on the accounts tables against a real Supabase project (GUI-60 acceptance criterion).
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (from .env) and the
// migration in supabase/migrations applied. Creates two throwaway users, checks isolation, then deletes them.
// Run: node --env-file=.env --import tsx scripts/check-rls.mts   (or: npx -y tsx --env-file=.env scripts/check-rls.mts)
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, service, opts);
const ids: string[] = [];

async function user(label: string): Promise<{ client: SupabaseClient; id: string }> {
  const email = `rls-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `RLS ${label}` } });
  if (error) throw error;
  ids.push(data.user.id);
  const client = createClient(url!, anon!, opts);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { client, id: data.user.id };
}

try {
  const a = await user("a");
  const b = await user("b");

  // The signup trigger created both profiles.
  const profileA = await a.client.from("profiles").select("id, display_name").eq("id", a.id).single();
  assert.equal(profileA.data?.display_name, "RLS a");

  // A saves a portfolio through the RPC and can read it back.
  const saved = await a.client.rpc("save_portfolio", {
    p_kind: "real",
    p_holdings: [
      { ticker: "AAPL", name: "Apple", industry: "Technology", shares: 10, price: 340 },
      { ticker: "VOO", name: "Vanguard S&P 500 ETF", industry: null, shares: 2.5, price: 710 },
    ],
  });
  assert.equal(saved.error, null, saved.error?.message);
  const portfolioA = saved.data as string;
  const ownRead = await a.client.from("holdings").select("ticker, shares").eq("portfolio_id", portfolioA).order("position");
  assert.deepEqual(ownRead.data?.map((h) => h.ticker), ["AAPL", "VOO"]);

  // Saving again replaces the holdings rather than appending.
  await a.client.rpc("save_portfolio", { p_kind: "real", p_holdings: [{ ticker: "MSFT", name: "Microsoft", industry: null, shares: 1, price: 500 }] });
  const replaced = await a.client.from("holdings").select("ticker").eq("portfolio_id", portfolioA);
  assert.deepEqual(replaced.data?.map((h) => h.ticker), ["MSFT"]);

  // B sees none of A's rows.
  for (const table of ["portfolios", "holdings"] as const) {
    const r = await b.client.from(table).select("*");
    assert.equal(r.error, null);
    assert.equal(r.data?.length, 0, `B read A's ${table}`);
  }
  const otherProfile = await b.client.from("profiles").select("*").eq("id", a.id);
  assert.equal(otherProfile.data?.length, 0, "B read A's profile");

  // B can't change, delete or attach to A's data.
  const upd = await b.client.from("holdings").update({ shares: 999 }).eq("portfolio_id", portfolioA).select();
  assert.equal(upd.data?.length ?? 0, 0, "B updated A's holdings");
  const del = await b.client.from("portfolios").delete().eq("id", portfolioA).select();
  assert.equal(del.data?.length ?? 0, 0, "B deleted A's portfolio");
  const ins = await b.client.from("holdings").insert({ portfolio_id: portfolioA, ticker: "EVIL", name: "x", shares: 1, price: 1 });
  assert.ok(ins.error, "B inserted into A's portfolio");
  const spoof = await b.client.from("holdings").insert({ portfolio_id: portfolioA, user_id: a.id, ticker: "EVIL", name: "x", shares: 1, price: 1 });
  assert.ok(spoof.error, "B inserted as A");
  const stillMine = await a.client.from("holdings").select("ticker, shares").eq("portfolio_id", portfolioA);
  assert.deepEqual(stillMine.data, [{ ticker: "MSFT", shares: 1 }]);

  // Anonymous visitors (the demo) can't read anything.
  const guest = createClient(url, anon, opts);
  const guestRead = await guest.from("holdings").select("*");
  assert.ok(guestRead.error || guestRead.data?.length === 0, "anon read holdings");
  const guestSave = await guest.rpc("save_portfolio", { p_kind: "real", p_holdings: [{ ticker: "AAPL", name: "A", shares: 1, price: 1 }] });
  assert.ok(guestSave.error, "anon saved a portfolio");

  // Level round-trips on your own profile only.
  await a.client.from("profiles").update({ experience_level: "advanced" }).eq("id", a.id);
  const lvl = await a.client.from("profiles").select("experience_level").eq("id", a.id).single();
  assert.equal(lvl.data?.experience_level, "advanced");
  const foreign = await b.client.from("profiles").update({ experience_level: "beginner" }).eq("id", a.id).select();
  assert.equal(foreign.data?.length ?? 0, 0, "B changed A's level");

  console.log("rls OK");
} finally {
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}
