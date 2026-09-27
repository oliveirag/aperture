import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { localVerification } from "@/lib/storage-mode";

export function configured() {
  return !localVerification() && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
export function admin() {
  if (!configured()) throw new Error("Configure Supabase before importing portfolios.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      if (localVerification()) throw new Error("Remote storage is disabled for local verification.");
      return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
    } },
  });
}
export async function requireUser() {
  if (!configured()) throw new Error("Configure Supabase before importing portfolios.");
  const authorization = (await headers()).get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Sign in to import and save your portfolio.");
  const { data, error } = await admin().auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new Error("Sign in to import and save your portfolio.");
  return data.user;
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new Error("Invalid request origin.");
}
// Legacy import routes expect a string error. Route owners can migrate to api-safety.safeApiError
// together with their clients; never return arbitrary upstream error.message (it may contain a key).
export function apiError(error: unknown) {
  const signIn = error instanceof Error && error.message.startsWith("Sign in");
  const message = signIn ? "Sign in to import and save your portfolio." : "Request failed. Check your input or try again shortly.";
  return Response.json({ error: message }, { status: signIn ? 401 : 400, headers: { "Cache-Control": "no-store" } });
}
