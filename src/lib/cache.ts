// Server-side cache. Storage time is not provider retrieval time: evidence stays in the value.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { deserializeRecord, serializeRecord, staleValue, type CacheRecord } from "./cache-codec";
import { localVerification } from "./storage-mode";

export const CACHE_TTL = { quote: 60_000, profile: 86_400_000, filings: 86_400_000, nport: 86_400_000, fred: 86_400_000, news: 900_000 } as const;
export type CacheMetadata = {
  state: "fresh" | "stale";
  layer: "load" | "memory" | "disk" | "redis" | "supabase";
  cachedAt: string;
  expiresAt: string;
  servedAt: string;
  reason?: "provider-error" | "provider-empty" | "expired";
};
export type CacheResult<T> = { value: T; cache: CacheMetadata };
export type MemoOptions = {
  persist?: boolean;
  // Retention for Redis only, NEVER an extension of the freshness TTL.
  persistMs?: number;
  // A caller may reject LKG older than this (measured from original cache time).
  maxStaleMs?: number;
};
type MemoryEntry = { record: CacheRecord; retryAt?: number; reason?: CacheMetadata["reason"] };
const store = new Map<string, MemoryEntry>();
const lastGood = new Map<string, CacheRecord>();
const inflight = new Map<string, Promise<CacheResult<unknown>>>();
const versions = new Map<string, number>();
const writes = new Map<string, Promise<void>>();
let epoch = 0;
const PREFIX = "lt:v2:";
const MAX_PERSIST_BYTES = 400_000;
const MAX_DISK_BYTES = 32 * 1024 * 1024;

export function cacheDirectory() { return process.env.APERTURE_CACHE_DIR || path.join(homedir(), ".cache", "aperture-shared"); }
// Scripts must opt into a directory; otherwise existing fixture checks cannot pollute the real shared cache.
const diskEnabled = () => Boolean(process.env.NEXT_RUNTIME || process.env.APERTURE_CACHE_DIR);
const diskPath = (key: string) => path.join(cacheDirectory(), `${createHash("sha1").update(key).digest("hex")}.json`);
const warned = new Set<string>();
function warn(code: string) {
  if (!warned.has(code)) { warned.add(code); console.error(`[cache] ${code}`); }
}
function queue(key: string, work: () => Promise<void>) {
  const pending = (writes.get(key) ?? Promise.resolve()).then(work).catch(() => warn("persistence-unavailable"));
  writes.set(key, pending);
  void pending.then(() => { if (writes.get(key) === pending) writes.delete(key); });
}
export async function flushCacheWrites() { while (writes.size) await Promise.all([...writes.values()]); }
async function readDisk<T>(key: string): Promise<CacheRecord<T> | undefined> {
  if (!diskEnabled()) return undefined;
  try {
    const filename = diskPath(key);
    if ((await stat(filename)).size > MAX_DISK_BYTES) { warn("disk-entry-too-large"); return undefined; }
    const raw = await readFile(filename, "utf8");
    if (Buffer.byteLength(raw) > MAX_DISK_BYTES) return undefined;
    const record = deserializeRecord<T>(raw, key);
    if (!record) warn("disk-entry-invalid-or-legacy");
    return record;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") warn("disk-read-unavailable");
    return undefined;
  }
}
async function diskGet<T>(key: string) { await writes.get(key); return readDisk<T>(key); }
async function writeDisk(key: string, json: string) {
  if (!diskEnabled()) return;
  if (Buffer.byteLength(json) > MAX_DISK_BYTES) { warn("disk-entry-too-large"); return; }
  const filename = diskPath(key);
  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
    await writeFile(temporary, json, { flag: "wx", mode: 0o600 });
    await rename(temporary, filename);
  } finally { await unlink(temporary).catch(() => undefined); }
}

export function kvConfigured() {
  return !localVerification() && Boolean((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN));
}
// All remote commands (including rate-limit writes) pass this guard at invocation time.
export async function kv(commands: (string | number)[][]): Promise<unknown[] | null> {
  if (!kvConfigured()) return null;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands), signal: AbortSignal.timeout(1500), cache: "no-store", redirect: "error",
    });
    if (!res.ok) throw new Error("KV HTTP failure");
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length !== commands.length || data.some(item => !item || typeof item !== "object" || item.error || !("result" in item))) throw new Error("KV command failure");
    return data.map(item => item.result);
  } catch { warn("redis-unavailable"); return null; }
}
async function kvGet<T>(key: string): Promise<CacheRecord<T> | undefined> {
  const out = await kv([["GET", PREFIX + key]]);
  return typeof out?.[0] === "string" ? deserializeRecord<T>(out[0], key) : undefined;
}
function persist(record: CacheRecord, opts: MemoOptions, disk = true) {
  let json: string;
  try { json = serializeRecord(record); } catch { warn("serialization-unavailable"); return; }
  queue(record.key, async () => {
    if (disk) await writeDisk(record.key, json).catch(() => warn("disk-write-unavailable"));
    const ttl = Math.max(1, Math.round((opts.persistMs ?? record.expires - record.cachedAt) - (Date.now() - record.cachedAt)));
    if (opts.persist && Buffer.byteLength(json) <= MAX_PERSIST_BYTES) await kv([["SET", PREFIX + record.key, json, "PX", ttl]]);
  });
}
function validateTtl(ttl: number) { if (!Number.isFinite(ttl) || ttl <= 0 || !Number.isFinite(new Date(Date.now() + ttl).getTime())) throw new Error("Cache TTL must be positive and finite"); }
function makeRecord<T>(key: string, value: T, ttl: number): CacheRecord<T> {
  const now = Date.now();
  return { version: 2, key, value, cachedAt: now, expires: now + ttl };
}
function result<T>(record: CacheRecord<T>, layer: CacheMetadata["layer"], reason?: CacheMetadata["reason"]): CacheResult<T> {
  const stale = Boolean(reason) || record.expires <= Date.now();
  return { value: stale ? staleValue(record.value) : record.value, cache: {
    state: stale ? "stale" : "fresh", layer, cachedAt: new Date(record.cachedAt).toISOString(),
    expiresAt: new Date(record.expires).toISOString(), servedAt: new Date().toISOString(),
    ...(stale ? { reason: reason ?? "expired" } : {}),
  } };
}
function remember(record: CacheRecord) {
  store.set(record.key, { record });
  if (record.value !== undefined && record.value !== null) lastGood.set(record.key, record);
}
export function inspectCache<T>(key: string): CacheResult<T> | undefined {
  const entry = store.get(key);
  return entry ? result(entry.record as CacheRecord<T>, "memory", entry.reason) : undefined;
}
export function peek<T>(key: string): T | undefined {
  const entry = store.get(key);
  return entry && (entry.retryAt ?? entry.record.expires) > Date.now() ? result(entry.record as CacheRecord<T>, "memory", entry.reason).value : undefined;
}
export function put<T>(key: string, value: T, ttlMs: number, opts: { persist?: boolean } = {}) {
  validateTtl(ttlMs);
  versions.set(key, (versions.get(key) ?? 0) + 1);
  const record = makeRecord(key, value, ttlMs);
  remember(record);
  if (opts.persist && value !== undefined && value !== null) persist(record, opts);
}
export async function recall<T>(key: string): Promise<T | undefined> {
  const hit = peek<T>(key);
  if (hit !== undefined) return hit;
  const disk = await diskGet<T>(key);
  const record = disk && disk.expires > Date.now() ? disk : await kvGet<T>(key);
  if (!record || record.expires <= Date.now()) return undefined;
  remember(record);
  return record.value;
}

// Prefix invalidation erases all known copies; exact-key invalidation deliberately preserves LKG.
function invalidate(key: string, keepGood: boolean) {
  versions.set(key, (versions.get(key) ?? 0) + 1);
  store.delete(key); inflight.delete(key);
  const good = lastGood.get(key);
  if (!keepGood) lastGood.delete(key);
  else if (good) lastGood.set(key, { ...good, expires: 0 });
  queue(key, async () => {
    if (diskEnabled()) {
      if (!keepGood) await unlink(diskPath(key)).catch(() => undefined);
      else {
        const record = good ?? await readDisk(key);
        if (record) await writeDisk(key, serializeRecord({ ...record, expires: 0 }));
      }
    }
    await kv([["DEL", PREFIX + key]]);
  });
}
export function forget(prefix: string) {
  for (const key of new Set([...store.keys(), ...lastGood.keys(), ...inflight.keys(), ...writes.keys(), ...versions.keys()])) if (key.startsWith(prefix)) invalidate(key, false);
}
export function forgetKeys(keys: string[]) { for (const key of keys) invalidate(key, true); }
// Outstanding writes still drain; old in-flight loads may answer their caller but cannot resurrect cache state.
export function coldStart() { epoch++; store.clear(); inflight.clear(); lastGood.clear(); versions.clear(); }

async function sharedLoad<T>(key: string, ttlMs: number, provider: "finnhub" | "alpha", load: () => Promise<T>): Promise<CacheRecord<T>> {
  const { cachedProviderRecord, reserve, cooldown, ProviderStoreError } = await import("./imports/provider");
  let loaded: CacheRecord<T> | undefined;
  try {
    return await cachedProviderRecord(key, ttlMs, async () => {
      await reserve(provider, provider === "finnhub" && !key.startsWith("finnhub:quote:"));
      if (provider === "finnhub") await reserve(provider, !key.startsWith("finnhub:quote:"));
      try { const value = await load(); loaded = makeRecord(key, value, ttlMs); return value; }
      catch (error) {
        if (error instanceof Error && /429|alphavantage limit/.test(error.message)) await cooldown(provider, provider === "finnhub" ? 60 : 86400);
        throw error;
      }
    });
  } catch (error) {
    // A successful fetch is usable if only saving failed. Never bypass a failed shared quota reservation.
    if (loaded && error instanceof ProviderStoreError) return loaded;
    throw error;
  }
}

export async function memoResult<T>(key: string, ttlMs: number, load: () => Promise<T>, opts: MemoOptions = {}): Promise<CacheResult<T>> {
  validateTtl(ttlMs);
  if (opts.persistMs !== undefined) validateTtl(opts.persistMs);
  if (opts.maxStaleMs !== undefined && (!Number.isFinite(opts.maxStaleMs) || opts.maxStaleMs < 0)) throw new Error("Invalid maximum stale age");
  const acceptable = (record: CacheRecord) => opts.maxStaleMs === undefined || Date.now() - record.cachedAt <= opts.maxStaleMs;
  const hit = store.get(key);
  if (hit && (hit.retryAt ?? hit.record.expires) > Date.now() && (!hit.reason || acceptable(hit.record))) return result(hit.record as CacheRecord<T>, "memory", hit.reason);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<CacheResult<T>>;
  const version = versions.get(key) ?? 0;
  const startEpoch = epoch;
  const current = () => startEpoch === epoch && version === (versions.get(key) ?? 0);
  const p = (async (): Promise<CacheResult<T>> => {
    const disk = await diskGet<T>(key);
    let cached = disk;
    let layer: CacheMetadata["layer"] = "disk";
    if ((!cached || cached.expires <= Date.now()) && opts.persist) {
      const remote = await kvGet<T>(key);
      if (remote && (!cached || remote.cachedAt > cached.cachedAt)) { cached = remote; layer = "redis"; }
    }
    if (cached && cached.expires > Date.now()) {
      if (current()) remember(cached);
      return result(cached, layer);
    }
    const good = lastGood.get(key) as CacheRecord<T> | undefined;
    const fallback = !good || (cached && cached.cachedAt > good.cachedAt) ? cached : good;
    const useFallback = (reason: CacheMetadata["reason"]) => {
      if (!fallback || fallback.value === null || fallback.value === undefined || !acceptable(fallback)) return undefined;
      warn("last-known-good-served");
      if (current()) {
        lastGood.set(key, fallback);
        store.set(key, { record: fallback, retryAt: Date.now() + Math.min(ttlMs, 60_000), reason });
      }
      return result(fallback, good === fallback ? "memory" : layer, reason);
    };
    let record: CacheRecord<T>;
    let loadedLayer: CacheMetadata["layer"] = "load";
    try {
      const provider = key.startsWith("finnhub:") ? "finnhub" : key.startsWith("etf:") ? "alpha" : null;
      if (provider && !localVerification() && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        record = await sharedLoad(key, ttlMs, provider, load); loadedLayer = "supabase";
      } else record = makeRecord(key, await load(), ttlMs);
      if (record.value === null || record.value === undefined) {
        const stale = useFallback("provider-empty");
        if (stale) return stale;
      }
    } catch (error) {
      const prefix = key.split(":", 1)[0];
      const provider = ["sec", "finnhub", "fred", "fdic", "stooq", "gdelt", "etf", "nport"].includes(prefix) ? prefix : "unknown-provider";
      const status = error instanceof Error ? error.message.match(/^(?:sec|finnhub) \/[^\s?]+ ([45]\d{2})$/)?.[1] : undefined;
      warn(`${provider}:load-failed${status ? `:http-${status}` : ""}`);
      const stale = useFallback("provider-error");
      if (stale) return stale;
      throw error;
    }
    if (current()) {
      remember(record);
      if (record.value !== undefined && record.value !== null) persist(record, opts);
    }
    return result(record, loadedLayer);
  })();
  inflight.set(key, p);
  try { return await p; } finally { if (inflight.get(key) === p) inflight.delete(key); }
}
export async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>, opts: MemoOptions = {}): Promise<T> {
  return (await memoResult(key, ttlMs, load, opts)).value;
}
