// Browser Supabase client for accounts. Null unless NEXT_PUBLIC_ACCOUNTS=1 and NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are
// set: the demo and session-only portfolios keep working without accounts. Turn accounts on only after the project
// has the supabase/migrations applied, or sign-in succeeds and saving then fails.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function accountsEnabled() {
  return process.env.NEXT_PUBLIC_ACCOUNTS === "1" && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = accountsEnabled() && url && key && typeof window !== "undefined" ? createClient(url, key, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } }) : null;
  return client;
}
