import { admin, configured } from "@/lib/supabase/server";

export class QuotaWait extends Error {
  constructor(readonly retryAt: string, message?:string) { super(message ?? `Provider quota resumes after ${retryAt}`); }
}
export async function reserve(provider: "finnhub" | "alpha", optional=false) {
  if (!configured()) throw new Error("Shared provider limiter requires Supabase configuration.");
  const { data, error } = await admin().rpc("reserve_provider", { p_provider: provider, p_limit: provider === "finnhub" ? optional ? 45 : 55 : 25, p_seconds: provider === "finnhub" ? 60 : 86400 });
  if (error) throw new Error("Unable to reserve provider quota.");
  if (data) throw new QuotaWait(data);
}
export async function cooldown(provider: string, seconds: number) {
  const retryAt = new Date(Date.now()+seconds*1000).toISOString();
  const { error } = await admin().from("provider_windows").update({ blocked_until: retryAt }).eq("provider",provider);
  if (error) throw new Error("Unable to save provider cooldown.");
  throw new QuotaWait(retryAt);
}
export async function cachedProvider<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  if (!configured()) return fetcher();
  const db = admin();
  const { data, error } = await db.from("provider_cache").select("value").eq("key",key).gt("expires_at",new Date().toISOString()).maybeSingle();
  if (error) throw new Error("Unable to read provider cache.");
  if (data) return data.value.result as T;
  const token=crypto.randomUUID();
  const claim=await db.rpc("claim_provider_cache",{p_key:key,p_token:token});
  if(claim.error)throw new Error("Unable to claim shared provider request.");
  if(claim.data.state==="cached")return claim.data.value.result as T;
  if(claim.data.state==="waiting")throw new QuotaWait(claim.data.retryAt,"Another worker is retrieving this security; its result will be reused.");
  try {
    const value = await fetcher();
    const saved = await db.rpc("finish_provider_cache",{p_key:key,p_token:token,p_value:{result:value},p_expires:new Date(Date.now()+ttl).toISOString()});
    if (saved.error || !saved.data) throw new Error("Unable to persist provider result.");
    return value;
  } catch(error) {
    await db.from("provider_cache").update({lease_token:null,lease_until:null}).eq("key",key).eq("lease_token",token);
    throw error;
  }
}
