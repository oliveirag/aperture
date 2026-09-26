import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
export async function userClient() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: values => values.forEach(({ name, value, options }) => jar.set(name,value,options)) },
  });
}
export function admin() {
  if (!configured()) throw new Error("Configure Supabase before importing portfolios.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function requireUser() {
  if (!configured()) throw new Error("Configure Supabase before importing portfolios.");
  const client = await userClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in to import and save your portfolio.");
  return data.user;
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new Error("Invalid request origin.");
}
export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  return Response.json({ error: message }, { status: message.startsWith("Sign in") ? 401 : 400, headers: { "Cache-Control": "no-store" } });
}
