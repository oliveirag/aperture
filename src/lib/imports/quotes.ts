import type { Quote, Profile } from "@/lib/finnhub";
import { cachedProvider, reserve, cooldown } from "./provider";

async function request(path: string, symbol: string, optional = false) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("Finnhub is not configured.");
  await reserve("finnhub", optional);
  const url = new URL(`https://finnhub.io/api/v1${path}`);
  url.searchParams.set("symbol", symbol);
  const response = await fetch(url, { headers: { "X-Finnhub-Token": key }, cache: "no-store", signal: AbortSignal.timeout(4000) });
  if (response.status === 429) await cooldown("finnhub", 60);
  if (!response.ok) throw new Error(`Finnhub HTTP ${response.status}`);
  return response.json();
}

export function getQuote(symbol: string): Promise<(Quote & { retrievedAt?: string }) | null> {
  return cachedProvider(`finnhub:quote:${symbol}`, 60000, async () => {
    const q = await request("/quote", symbol);
    if (!Number.isFinite(q.c) || q.c <= 0 || !Number.isFinite(q.t) || q.t <= 0) return null;
    return { price:q.c, change:q.d ?? 0, changePct:(q.dp ?? 0)/100, prevClose:q.pc ?? q.c, time:q.t, retrievedAt:new Date().toISOString() };
  });
}

export function getProfile(symbol: string): Promise<Profile | null> {
  return cachedProvider(`finnhub:profile:${symbol}`, 86400000, async () => {
    const p = await request("/stock/profile2", symbol, true);
    if (!p.name) return null;
    return { name:String(p.name), industry:String(p.finnhubIndustry ?? ""), logo:String(p.logo ?? ""), weburl:String(p.weburl ?? ""), marketCap:Number(p.marketCapitalization ?? 0) };
  });
}
