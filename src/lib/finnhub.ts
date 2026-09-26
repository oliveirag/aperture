// Server-only Finnhub client. Import it from route handlers only: it reads FINNHUB_API_KEY.
const BASE = "https://finnhub.io/api/v1";
const TIMEOUT_MS = 4000;
const QUOTE_TTL_MS = 60 * 1000;
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export interface Quote {
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
  // Unix seconds of the last trade.
  time: number;
}

export interface Profile {
  name: string;
  industry: string;
  logo: string;
  weburl: string;
  // Millions of USD, as Finnhub reports it.
  marketCap: number;
}

// Body of GET /api/market.
export interface MarketResponse {
  quotes: Record<string, Quote>;
  profiles: Record<string, Profile>;
}

// Survives across requests while the server instance is warm. Keeps us far under the 60 calls/min free limit.
const cache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function finnhubConfigured() {
  return Boolean(process.env.FINNHUB_API_KEY);
}

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = load()
    .then((value) => {
      cache.set(key, { expires: Date.now() + ttl, value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("FINNHUB_API_KEY is not set");
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Header auth keeps the key out of any logged URL.
  const res = await fetch(url, {
    headers: { "X-Finnhub-Token": apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`finnhub ${path} ${res.status}`);
  return res.json();
}

// Returns null when Finnhub has no price for the symbol (it answers unknown tickers with all zeros).
export function getQuote(symbol: string): Promise<Quote | null> {
  return cached(`quote:${symbol}`, QUOTE_TTL_MS, async () => {
    const q = (await get("/quote", { symbol })) as Record<string, number | null>;
    if (!q.c || !q.t) return null;
    return { price: q.c, change: q.d ?? 0, changePct: (q.dp ?? 0) / 100, prevClose: q.pc ?? q.c, time: q.t };
  });
}

// Returns null for symbols without a company profile. ETFs always land here on the free plan.
export function getProfile(symbol: string): Promise<Profile | null> {
  return cached(`profile:${symbol}`, PROFILE_TTL_MS, async () => {
    const p = (await get("/stock/profile2", { symbol })) as Record<string, string | number | undefined>;
    if (!p.name) return null;
    return {
      name: String(p.name),
      industry: String(p.finnhubIndustry ?? ""),
      logo: String(p.logo ?? ""),
      weburl: String(p.weburl ?? ""),
      marketCap: Number(p.marketCapitalization ?? 0),
    };
  });
}
