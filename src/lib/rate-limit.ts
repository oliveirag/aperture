// Per-client request limits for the routes that spend Gemini, Finnhub or Alpha Vantage quota. Fixed one-hour windows,
// counted in the persistent store when it's configured (shared by every instance), in memory otherwise.
import { kv } from "@/lib/cache";

const HOUR = 60 * 60 * 1000;

// Gemini-backed routes get tight limits (PRD: about 20 an hour); data routes get soft ones.
export const LIMITS = {
  snap: { max: 20, what: "screenshot reads" },
  ic: { max: 20, what: "IC Room runs" },
  ask: { max: 30, what: "questions" },
  radar: { max: 60, what: "filing checks" },
  data: { max: 300, what: "portfolio refreshes" },
  market: { max: 1200, what: "price updates" },
  search: { max: 1200, what: "searches" },
} as const;
export type LimitName = keyof typeof LIMITS;

const memory = new Map<string, number>();

// The first address in X-Forwarded-For is the client on Vercel and most proxies.
export function clientId(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

async function count(key: string, windowEnd: number): Promise<number> {
  const out = await kv([
    ["INCR", key],
    ["PEXPIREAT", key, windowEnd],
  ]);
  if (out && typeof out[0] === "number") return out[0];
  // Memory fallback: drop other windows' counters as we go.
  const window = key.slice(key.lastIndexOf(":") + 1);
  for (const k of memory.keys()) if (!k.endsWith(`:${window}`)) memory.delete(k);
  const n = (memory.get(key) ?? 0) + 1;
  memory.set(key, n);
  return n;
}

// Null when the request may go ahead; otherwise a 429 the UI shows as-is ({ error }), with Retry-After.
export async function rateLimit(request: Request, name: LimitName, now = Date.now()): Promise<Response | null> {
  const { max, what } = LIMITS[name];
  const window = Math.floor(now / HOUR);
  const windowEnd = (window + 1) * HOUR;
  const n = await count(`lt:rl:${name}:${clientId(request)}:${window}`, windowEnd);
  if (n <= max) return null;
  const minutes = Math.max(1, Math.ceil((windowEnd - now) / 60000));
  return Response.json(
    { error: `That's the limit of ${max} ${what} an hour from this device. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` },
    { status: 429, headers: { "Retry-After": String(Math.ceil((windowEnd - now) / 1000)) } },
  );
}
