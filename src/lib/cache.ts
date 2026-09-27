// Server-side memo cache: memory first, then an optional persistent store (Upstash Redis / Vercel KV over REST) so
// serverless cold starts don't refetch. In-flight loads are shared, and failed loads are never cached.
// Every successful load is also kept as a "last known good" copy in memory and on local disk: when a provider later
// fails (SEC down, Finnhub 5xx, Gemini out of quota), that copy is served instead of an error, and warmed results
// survive a server restart. Without a KV store, the disk copy also stands in for it on cold starts.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const store = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
// Keys this instance has loaded; only a key it has never seen is read back from the persistent store.
const seen = new Set<string>();
// The last successful value per key, kept after expiry so a failed reload can fall back to it.
const lastGood = new Map<string, unknown>();

const DISK_DIR = process.env.APERTURE_CACHE_DIR ?? path.join(process.cwd(), ".next", "cache", "aperture");
// On inside the Next server, or wherever APERTURE_CACHE_DIR is set; off in scripts so checks stay hermetic.
// Stops trying after the first write error (read-only filesystems on serverless hosts).
let diskOff = !process.env.NEXT_RUNTIME && !process.env.APERTURE_CACHE_DIR;
const diskPath = (key: string) => path.join(DISK_DIR, `${createHash("sha1").update(key).digest("hex")}.json`);

async function diskGet<T>(key: string): Promise<{ value: T; expires: number } | undefined> {
  if (diskOff) return undefined;
  try {
    const entry = JSON.parse(await readFile(diskPath(key), "utf8")) as { key: string; expires: number; value: T };
    return entry.key === key ? { value: entry.value, expires: entry.expires } : undefined;
  } catch {
    return undefined;
  }
}

function diskSet(key: string, value: unknown, expires: number) {
  if (diskOff || value === undefined) return;
  void (async () => {
    try {
      await mkdir(DISK_DIR, { recursive: true });
      await writeFile(diskPath(key), JSON.stringify({ key, expires, value }));
    } catch (err) {
      diskOff = true;
      console.error("[cache] local disk cache unavailable:", err instanceof Error ? err.message : "unknown");
    }
  })();
}

const KV_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const PREFIX = "lt:";
// Upstash caps a request at 1MB; filing texts and other big values stay in memory only.
const MAX_PERSIST_BYTES = 400_000;

let kvWarned = false;
function kvFailed(err: unknown) {
  if (kvWarned) return;
  kvWarned = true;
  console.error("[cache] persistent store unavailable:", err instanceof Error ? err.message : "unknown");
}

// Runs Redis commands over the REST API. Returns null when the store isn't configured or doesn't answer.
export async function kv(commands: (string | number)[][]): Promise<unknown[] | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`kv ${res.status}`);
    return ((await res.json()) as { result: unknown }[]).map((r) => r.result);
  } catch (err) {
    kvFailed(err);
    return null;
  }
}

async function kvGet<T>(key: string): Promise<{ value: T; ttlMs: number } | undefined> {
  const out = await kv([
    ["GET", PREFIX + key],
    ["PTTL", PREFIX + key],
  ]);
  const [raw, ttl] = out ?? [];
  if (typeof raw !== "string" || typeof ttl !== "number" || ttl <= 0) return undefined;
  try {
    return { value: JSON.parse(raw) as T, ttlMs: ttl };
  } catch {
    return undefined;
  }
}

function kvSet(key: string, value: unknown, ttlMs: number) {
  const json = JSON.stringify(value);
  if (json === undefined || json.length > MAX_PERSIST_BYTES) return;
  void kv([["SET", PREFIX + key, json, "PX", Math.round(ttlMs)]]);
}

export function peek<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires > Date.now()) return hit.value as T;
  store.delete(key);
  return undefined;
}

export function put<T>(key: string, value: T, ttlMs: number, opts: { persist?: boolean } = {}) {
  store.set(key, { expires: Date.now() + ttlMs, value });
  seen.add(key);
  lastGood.set(key, value);
  if (opts.persist) {
    kvSet(key, value, ttlMs);
    diskSet(key, value, Date.now() + ttlMs);
  }
}

// Memory, then (for persisted keys) the persistent store. For values written with put(..., { persist: true }).
export async function recall<T>(key: string): Promise<T | undefined> {
  const hit = peek<T>(key);
  if (hit !== undefined) return hit;
  const stored = (await kvGet<T>(key)) ?? (await freshFromDisk<T>(key));
  if (stored === undefined) return undefined;
  store.set(key, { expires: Date.now() + stored.ttlMs, value: stored.value });
  return stored.value;
}

// The disk copy when it hasn't expired, shaped like a KV hit.
async function freshFromDisk<T>(key: string): Promise<{ value: T; ttlMs: number } | undefined> {
  const d = await diskGet<T>(key);
  return d && d.expires > Date.now() ? { value: d.value, ttlMs: d.expires - Date.now() } : undefined;
}

// Invalidates keys starting with `prefix` on this instance and, for keys it knows, in the persistent store too.
export function forget(prefix: string) {
  const keys = new Set([...store.keys(), ...seen].filter((k) => k.startsWith(prefix)));
  for (const key of keys) {
    store.delete(key);
    seen.delete(key);
    diskSet(key, null, 0);
  }
  if (keys.size) void kv([["DEL", ...[...keys].map((k) => PREFIX + k)]]);
}

// Invalidates exact keys here and in the persistent store, whether or not this instance has seen them.
export function forgetKeys(keys: string[]) {
  for (const key of keys) {
    store.delete(key);
    seen.delete(key);
    // An expired disk entry is still a fallback if the reload fails, so forgetting only expires it.
    void diskGet(key).then((d) => d && diskSet(key, d.value, 0));
  }
  if (keys.length) void kv([["DEL", ...keys.map((k) => PREFIX + k)]]);
}

// A fresh serverless instance: empty memory, persistent store untouched. For tests.
export function coldStart() {
  store.clear();
  inflight.clear();
  seen.clear();
  lastGood.clear();
}

export type MemoOptions = {
  // Also keep the value in the persistent store (JSON-serializable values only), for `persistMs` (default: ttlMs).
  persist?: boolean;
  persistMs?: number;
};

let storeWarned = false;

// Loads through the shared Supabase limiter and cache. If that store is unreachable or its migration is not applied,
// calls the provider directly (the provider still enforces its own rate limit) instead of failing every request.
async function sharedLoad<T>(key: string, ttlMs: number, provider: "finnhub" | "alpha", load: () => Promise<T>): Promise<T> {
  const { cachedProvider, reserve, cooldown, ProviderStoreError } = await import("./imports/provider");
  const attempt: { done: boolean; value?: T; error?: unknown } = { done: false };
  try {
    return await cachedProvider(key, ttlMs, async () => {
      // Reserve both possible Finnhub attempts up front.
      await reserve(provider, provider === "finnhub" && !key.startsWith("finnhub:quote:"));
      if (provider === "finnhub") await reserve(provider, !key.startsWith("finnhub:quote:"));
      try {
        const value = await load();
        Object.assign(attempt, { done: true, value });
        return value;
      } catch (error) {
        Object.assign(attempt, { done: true, error });
        if (error instanceof Error && /429|alphavantage limit/.test(error.message)) await cooldown(provider, provider === "finnhub" ? 60 : 86400);
        throw error;
      }
    });
  } catch (error) {
    if (!(error instanceof ProviderStoreError)) throw error;
    if (!storeWarned) {
      storeWarned = true;
      console.error("[cache] shared provider store unavailable, calling providers directly:", error.message);
    }
    if (!attempt.done) return load();
    if (attempt.error !== undefined) throw attempt.error;
    return attempt.value as T;
  }
}

// Returns the cached value, or runs `load` once (concurrent callers share it) and caches what it returns.
// With `persist`, a key this instance has never loaded is first looked up in the persistent store (a cold start),
// while an expired key on a warm instance is reloaded, so short in-memory TTLs stay fresh.
export async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>, opts: MemoOptions = {}): Promise<T> {
  const hit = peek<T>(key);
  if (hit !== undefined) return hit;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = (async () => {
    if (opts.persist && !seen.has(key)) {
      seen.add(key);
      const stored = (await kvGet<T>(key)) ?? (await freshFromDisk<T>(key));
      if (stored !== undefined) {
        store.set(key, { expires: Date.now() + Math.min(ttlMs, stored.ttlMs), value: stored.value });
        lastGood.set(key, stored.value);
        return stored.value;
      }
    }
    // Keep legacy provider modules unchanged while sharing their cache misses
    // with durable imports.
    const provider = key.startsWith("finnhub:") ? "finnhub" : key.startsWith("etf:") ? "alpha" : null;
    let value: T;
    try {
      value = provider && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? await sharedLoad(key, ttlMs, provider, load)
        : await load();
    } catch (err) {
      // Serve the last value that loaded, however old, rather than fail. Only when there has never been one, throw.
      const fallback = lastGood.has(key) ? { value: lastGood.get(key) as T } : await diskGet<T>(key);
      if (fallback === undefined || fallback.value === null || fallback.value === undefined) throw err;
      console.error(`[cache] ${key.slice(0, 60)}: load failed, serving last known good value:`, err instanceof Error ? err.message.slice(0, 100) : "unknown");
      // Retry the provider after a minute instead of on every request.
      store.set(key, { expires: Date.now() + Math.min(ttlMs, 60_000), value: fallback.value });
      return fallback.value;
    }
    store.set(key, { expires: Date.now() + ttlMs, value });
    seen.add(key);
    lastGood.set(key, value);
    if (opts.persist) kvSet(key, value, opts.persistMs ?? ttlMs);
    diskSet(key, value, Date.now() + (opts.persist ? (opts.persistMs ?? ttlMs) : ttlMs));
    return value;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
