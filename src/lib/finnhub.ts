// Server-only Finnhub client. Import it from route handlers only: it reads FINNHUB_API_KEY.
import { memo, type MemoOptions } from "@/lib/cache";

const BASE = "https://finnhub.io/api/v1";
const TIMEOUT_MS = 4000;
const QUOTE_TTL_MS = 60 * 1000;
// A cold instance may reuse a quote up to this old from the persistent cache instead of calling Finnhub.
const QUOTE_PERSIST_MS = 15 * 60 * 1000;
// Finnhub's free plan allows 60 calls a minute; stay a little under it and queue the rest.
const CALLS_PER_MINUTE = 50;
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

export function finnhubConfigured() {
  return Boolean(process.env.FINNHUB_API_KEY);
}

// Every Finnhub response is cached; profiles, metrics and quotes also persist across cold starts.
function cached<T>(key: string, ttl: number, load: () => Promise<T>, opts: MemoOptions = { persist: true }): Promise<T> {
  return memo(`finnhub:${key}`, ttl, load, opts);
}

// Token bucket shared by every request on this instance: a call waits for a token instead of failing with a 429,
// so a 50-row import finishes a little slower rather than erroring.
let tokens = CALLS_PER_MINUTE;
let refilledAt = Date.now();
export async function takeToken() {
  for (;;) {
    const now = Date.now();
    tokens = Math.min(CALLS_PER_MINUTE, tokens + ((now - refilledAt) * CALLS_PER_MINUTE) / 60000);
    refilledAt = now;
    if (tokens >= 1) {
      tokens -= 1;
      return;
    }
    await new Promise((r) => setTimeout(r, Math.ceil(((1 - tokens) * 60000) / CALLS_PER_MINUTE)));
  }
}

async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("FINNHUB_API_KEY is not set");
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Header auth keeps the key out of any logged URL.
  for (let attempt = 0; ; attempt++) {
    await takeToken();
    const res = await fetch(url, {
      headers: { "X-Finnhub-Token": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    // Another instance may have used the shared quota: back off once before giving up.
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (!res.ok) throw new Error(`finnhub ${path} ${res.status}`);
    return res.json();
  }
}

// Returns null when Finnhub has no price for the symbol (it answers unknown tickers with all zeros).
export function getQuote(symbol: string): Promise<Quote | null> {
  return cached(`quote:${symbol}`, QUOTE_TTL_MS, async () => {
    const q = (await get("/quote", { symbol })) as Record<string, number | null>;
    if (!q.c || !q.t) return null;
    return { price: q.c, change: q.d ?? 0, changePct: (q.dp ?? 0) / 100, prevClose: q.pc ?? q.c, time: q.t };
  }, { persist: true, persistMs: QUOTE_PERSIST_MS });
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

export interface Metrics {
  peTTM: number | null;
  week52High: number | null;
  week52Low: number | null;
  beta: number | null;
  revenueGrowthTTMYoy: number | null;
  netMarginTTM: number | null;
}

export function getMetrics(symbol: string): Promise<Metrics | null> {
  return cached(`metric:${symbol}`, PROFILE_TTL_MS, async () => {
    const m = ((await get("/stock/metric", { symbol, metric: "all" })) as { metric?: Record<string, number | null> }).metric;
    if (!m || Object.keys(m).length === 0) return null;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      peTTM: n(m.peTTM ?? m.peBasicExclExtraTTM),
      week52High: n(m["52WeekHigh"]),
      week52Low: n(m["52WeekLow"]),
      beta: n(m.beta),
      revenueGrowthTTMYoy: n(m.revenueGrowthTTMYoy),
      netMarginTTM: n(m.netProfitMarginTTM),
    };
  });
}

// Latest month of analyst ratings, as counts.
export interface Recommendation {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export function getRecommendation(symbol: string): Promise<Recommendation | null> {
  return cached(`reco:${symbol}`, PROFILE_TTL_MS, async () => {
    const list = (await get("/stock/recommendation", { symbol })) as Recommendation[];
    return Array.isArray(list) && list.length > 0 ? list[0] : null;
  });
}

export interface Earnings {
  date: string;
  epsEstimate: number | null;
  revenueEstimate: number | null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// The next scheduled earnings report within four months.
export function getNextEarnings(symbol: string): Promise<Earnings | null> {
  return cached(`earnings:${symbol}`, PROFILE_TTL_MS, async () => {
    const now = new Date();
    const to = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
    const data = (await get("/calendar/earnings", { symbol, from: isoDay(now), to: isoDay(to) })) as { earningsCalendar?: Earnings[] };
    const list = (data.earningsCalendar ?? []).filter((e) => e.date).sort((a, b) => a.date.localeCompare(b.date));
    return list[0] ?? null;
  });
}

export interface NewsItem {
  headline: string;
  summary: string;
  url: string;
  source: string;
  // Unix seconds.
  datetime: number;
}

export function getCompanyNews(symbol: string, days = 14): Promise<NewsItem[]> {
  return cached(`news:${symbol}:${days}`, 60 * 60 * 1000, async () => {
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const list = (await get("/company-news", { symbol, from: isoDay(from), to: isoDay(now) })) as NewsItem[];
    return Array.isArray(list) ? list.filter((n) => n.headline && n.url).sort((a, b) => b.datetime - a.datetime) : [];
  });
}
