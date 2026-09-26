// Server-side memo cache: memory first, then an optional persistent store (Upstash Redis / Vercel KV over REST) so
// serverless cold starts don't refetch. In-flight loads are shared, and failed loads are never cached.
const store = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
// Keys this instance has loaded; only a key it has never seen is read back from the persistent store.
const seen = new Set<string>();

const KV_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const PREFIX = "lt:";
// Upstash caps a request at 1MB; filing texts and other big values stay in memory only.
const MAX_PERSIST_BYTES = 400_000;

export function persistentCacheConfigured() {
  return Boolean(KV_URL && KV_TOKEN);
}

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
  if (opts.persist) kvSet(key, value, ttlMs);
}

// Memory, then (for persisted keys) the persistent store. For values written with put(..., { persist: true }).
export async function recall<T>(key: string): Promise<T | undefined> {
  const hit = peek<T>(key);
  if (hit !== undefined) return hit;
  const stored = await kvGet<T>(key);
  if (stored === undefined) return undefined;
  store.set(key, { expires: Date.now() + stored.ttlMs, value: stored.value });
  return stored.value;
}

// Invalidates keys starting with `prefix` on this instance and, for keys it knows, in the persistent store too.
export function forget(prefix: string) {
  const keys = new Set([...store.keys(), ...seen].filter((k) => k.startsWith(prefix)));
  for (const key of keys) {
    store.delete(key);
    seen.delete(key);
  }
  if (keys.size) void kv([["DEL", ...[...keys].map((k) => PREFIX + k)]]);
}

// Invalidates exact keys here and in the persistent store, whether or not this instance has seen them.
export function forgetKeys(keys: string[]) {
  for (const key of keys) {
    store.delete(key);
    seen.delete(key);
  }
  if (keys.length) void kv([["DEL", ...keys.map((k) => PREFIX + k)]]);
}

// A fresh serverless instance: empty memory, persistent store untouched. For tests.
export function coldStart() {
  store.clear();
  inflight.clear();
  seen.clear();
}

export type MemoOptions = {
  // Also keep the value in the persistent store (JSON-serializable values only), for `persistMs` (default: ttlMs).
  persist?: boolean;
  persistMs?: number;
};

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
      const stored = await kvGet<T>(key);
      if (stored !== undefined) {
        store.set(key, { expires: Date.now() + Math.min(ttlMs, stored.ttlMs), value: stored.value });
        return stored.value;
      }
    }
    // Keep legacy provider modules unchanged while sharing their cache misses
    // with durable imports. Reserve both possible Finnhub attempts up front.
    const provider = key.startsWith("finnhub:") ? "finnhub" : key.startsWith("etf:") ? "alpha" : null;
    const value = provider && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? await (await import("./imports/provider")).cachedProvider(key, ttlMs, async () => {
          const { reserve, cooldown } = await import("./imports/provider");
          await reserve(provider, provider === "finnhub" && !key.startsWith("finnhub:quote:"));
          if (provider === "finnhub") await reserve(provider, !key.startsWith("finnhub:quote:"));
          try { return await load(); }
          catch (error) {
            if (error instanceof Error && /429|alphavantage limit/.test(error.message)) await cooldown(provider, provider === "finnhub" ? 60 : 86400);
            throw error;
          }
        })
      : await load();
    store.set(key, { expires: Date.now() + ttlMs, value });
    seen.add(key);
    if (opts.persist) kvSet(key, value, opts.persistMs ?? ttlMs);
    return value;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
