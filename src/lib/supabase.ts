import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Browser client with the PKCE OAuth flow; the session lives in localStorage. Every table is protected by
// Row Level Security, so the anon key is safe to ship. Null when accounts aren't configured: the app then runs
// exactly as before (demo, session-only portfolios) with no sign-in UI.
export const supabase: SupabaseClient | null =
  url && anonKey && typeof window !== "undefined"
    ? createClient(url, anonKey, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true, autoRefreshToken: true } })
    : null;

export const accountsConfigured = Boolean(url && anonKey);
