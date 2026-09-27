import { admin, configured } from "@/lib/supabase/server";
import { deserializeRecord, serializeRecord, type CacheRecord } from "@/lib/cache-codec";

// Storage failures are distinct from provider failures and quota denials; never log credential-bearing URLs.
export class ProviderStoreError extends Error {}
export class QuotaWait extends Error {
  constructor(readonly retryAt: string, message?: string) { super(message ?? `Provider quota resumes after ${retryAt}`); }
}
export async function reserve(provider: "finnhub" | "alpha", optional = false) {
  if (!configured()) throw new ProviderStoreError("Shared provider limiter requires Supabase configuration.");
  const { data, error } = await admin().rpc("reserve_provider", { p_provider: provider, p_limit: provider === "finnhub" ? optional ? 45 : 55 : 25, p_seconds: provider === "finnhub" ? 60 : 86400 });
  if (error) throw new ProviderStoreError("Unable to reserve provider quota.");
  if (data) throw new QuotaWait(data);
}
export async function cooldown(provider: string, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Invalid provider cooldown");
  const retryAt = new Date(Date.now() + seconds * 1000).toISOString();
  const { error } = await admin().from("provider_windows").update({ blocked_until: retryAt }).eq("provider", provider);
  if (error) throw new ProviderStoreError("Unable to save provider cooldown.");
  throw new QuotaWait(retryAt);
}
function unpack<T>(value: unknown, key: string): CacheRecord<T> {
  const raw = value && typeof value === "object" && "cacheRecord" in value ? value.cacheRecord : undefined;
  const record = typeof raw === "string" ? deserializeRecord<T>(raw, key) : undefined;
  if (!record || record.expires <= Date.now()) throw new ProviderStoreError("Shared cache entry needs refresh; freshness metadata unavailable.");
  return record;
}
const pending = new Map<string, Promise<CacheRecord<unknown>>>();
export async function cachedProviderRecord<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<CacheRecord<T>> {
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error("Invalid provider TTL");
  const hit = pending.get(key);
  if (hit) return hit as Promise<CacheRecord<T>>;
  const promise = loadRecord(key, ttl, fetcher);
  pending.set(key, promise);
  try { return await promise; } finally { if (pending.get(key) === promise) pending.delete(key); }
}
async function loadRecord<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<CacheRecord<T>> {
  const load = async (): Promise<CacheRecord<T>> => {
    const value = await fetcher();
    const now = Date.now();
    return { version: 2, key, value, cachedAt: now, expires: now + ttl };
  };
  if (!configured()) return load();
  const db = admin();
  const { data, error } = await db.from("provider_cache").select("value").eq("key", key).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw new ProviderStoreError("Unable to read provider cache.");
  if (data) return unpack<T>(data.value, key);
  const token = crypto.randomUUID();
  const claim = await db.rpc("claim_provider_cache", { p_key: key, p_token: token });
  if (claim.error || !claim.data || typeof claim.data !== "object") throw new ProviderStoreError("Unable to claim shared provider request.");
  if (claim.data.state === "cached") return unpack<T>(claim.data.value, key);
  if (claim.data.state === "waiting") throw new QuotaWait(claim.data.retryAt, "Another worker is retrieving this security; its result will be reused.");
  if (claim.data.state !== "claimed") throw new ProviderStoreError("Invalid shared provider lease.");
  try {
    const record = await load();
    if (record.value === null || record.value === undefined) return record;
    const saved = await db.rpc("finish_provider_cache", { p_key: key, p_token: token, p_value: { cacheRecord: serializeRecord(record) }, p_expires: new Date(record.expires).toISOString() });
    if (saved.error || !saved.data) throw new ProviderStoreError("Unable to persist provider result.");
    return record;
  } finally {
    // Token fencing prevents this request from releasing another worker's lease; cleanup cannot mask the primary result.
    try {
      const release = await db.from("provider_cache").update({ lease_token: null, lease_until: null }).eq("key", key).eq("lease_token", token);
      if (release.error) console.error("[cache] supabase-lease-release-unavailable");
    } catch { console.error("[cache] supabase-lease-release-unavailable"); }
  }
}
export async function cachedProvider<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  return (await cachedProviderRecord(key, ttl, fetcher)).value;
}
