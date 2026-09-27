import type { Claim, DeliveryStore } from "./receive";

type Rpc = (operation: string, args: Record<string, unknown>) => Promise<unknown>;
const unavailable = () => new Error("Webhook delivery store unavailable");

// The SQL function is the atomic boundary; this adapter never emulates claims
// with SELECT followed by INSERT. Inject RPC only for local SQL verification.
export function createDurableDeliveryStore(rpc: Rpc = remoteRpc): DeliveryStore {
  return {
    async claim(key): Promise<Claim> {
      const value = await rpc("claim", { p_key: key });
      if (!value || typeof value !== "object" || !("state" in value)) throw unavailable();
      if (value.state === "claimed" && "token" in value && typeof value.token === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.token)) return { state: "claimed", token: value.token };
      if (value.state === "duplicate" || value.state === "busy" || value.state === "full") return { state: value.state };
      throw unavailable();
    },
    async complete(key, token) {
      const value = await rpc("complete", { p_key: key, p_token: token });
      if (!value || typeof value !== "object" || !("ok" in value) || value.ok !== true) throw unavailable();
    },
    async release(key, token) {
      const value = await rpc("release", { p_key: key, p_token: token });
      if (!value || typeof value !== "object" || !("ok" in value) || value.ok !== true) throw unavailable();
    },
  };
}

async function remoteRpc(operation: string, args: Record<string, unknown>): Promise<unknown> {
  // Mirrors main's storage-mode API without importing an unmerged module.
  // No implicit memory fallback, including local mode: tests inject their store.
  if (process.env.APERTURE_LOCAL_VERIFICATION === "1" || process.env.NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION === "1") throw unavailable();
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) throw unavailable();
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw unavailable();
  try {
    const res = await fetch(`${url.origin}/rest/v1/rpc/webhook_delivery`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_operation: operation, ...args }),
      signal: AbortSignal.timeout(3000), cache: "no-store", redirect: "error",
    });
    if (!res.ok) throw unavailable();
    return await res.json();
  } catch { throw unavailable(); }
}
