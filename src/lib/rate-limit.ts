// Per-client request limits for the routes that spend Gemini, Finnhub or Alpha Vantage quota. Fixed one-hour windows,
// counted in the persistent store when it's configured (shared by every instance), in memory otherwise.
import { kv, kvConfigured } from "@/lib/cache";
import { createHash } from "node:crypto";
import { isIP } from "node:net";

const HOUR = 60 * 60 * 1000;

// Gemini-backed routes get tight limits (PRD: about 20 an hour); data routes get soft ones.
export const LIMITS = {
  snap: { max: 20, what: "screenshot reads" },
  ic: { max: 20, what: "IC Room runs" },
  ask: { max: 30, what: "questions" },
  listen: { max: 40, what: "read-alouds" },
  radar: { max: 60, what: "filing checks" },
  data: { max: 300, what: "portfolio refreshes" },
  market: { max: 1200, what: "price updates" },
  search: { max: 1200, what: "searches" },
} as const;
export type LimitName = keyof typeof LIMITS;

const memory = new Map<string, number>();

// Deploy only behind a proxy that overwrites these headers; direct clients can otherwise spoof them.
// Invalid/unbounded identities share the anonymous bucket; raw addresses are not persisted.
export function clientId(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.slice(0, 256).split(",")[0]?.trim();
  const candidate = forwarded || request.headers.get("x-real-ip") || "";
  return isIP(candidate) ? createHash("sha256").update(candidate).digest("hex").slice(0, 32) : "local";
}

async function count(key: string, windowEnd: number): Promise<number> {
  const out = await kv([
    ["INCR", key],
    ["PEXPIREAT", key, windowEnd],
  ]);
  if (out && Number.isSafeInteger(out[0]) && Number(out[0]) > 0 && out[1] === 1) return Number(out[0]);
  if (kvConfigured()) throw new Error("Shared rate limiter unavailable");
  // Unconfigured/local verification mode still enforces the same limits in memory.
  const window = key.slice(key.lastIndexOf(":") + 1);
  for (const k of memory.keys()) if (!k.endsWith(`:${window}`)) memory.delete(k);
  if (!memory.has(key) && memory.size >= 10_000) throw new Error("Local rate limiter capacity reached");
  const n = (memory.get(key) ?? 0) + 1;
  memory.set(key, n);
  return n;
}

// Null when the request may go ahead; otherwise a 429 the UI shows as-is ({ error }), with Retry-After.
export async function rateLimit(request: Request, name: LimitName, now = Date.now()): Promise<Response | null> {
  const { max, what } = LIMITS[name];
  const window = Math.floor(now / HOUR);
  const windowEnd = (window + 1) * HOUR;
  let n: number;
  try { n = await count(`lt:rl:${name}:${clientId(request)}:${window}`, windowEnd); }
  catch { return Response.json({ error: "Request limiter unavailable. Try again shortly." }, { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } }); }
  if (n <= max) return null;
  const minutes = Math.max(1, Math.ceil((windowEnd - now) / 60000));
  return Response.json(
    { error: `That's the limit of ${max} ${what} an hour from this device. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` },
    { status: 429, headers: { "Retry-After": String(Math.ceil((windowEnd - now) / 1000)) } },
  );
}
