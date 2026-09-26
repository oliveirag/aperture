// Server-side memo cache with a TTL and in-flight de-duplication. Survives across requests while the instance is warm.
const store = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function peek<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires > Date.now()) return hit.value as T;
  store.delete(key);
  return undefined;
}

export function put<T>(key: string, value: T, ttlMs: number) {
  store.set(key, { expires: Date.now() + ttlMs, value });
}

export function forget(prefix: string) {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

// Returns the cached value, or runs `load` once (concurrent callers share it) and caches what it returns.
// A rejected load is not cached.
export async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = peek<T>(key);
  if (hit !== undefined) return hit;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = load()
    .then((value) => {
      put(key, value, ttlMs);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
