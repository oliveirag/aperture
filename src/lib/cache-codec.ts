// Tagged tree, not a JSON replacer: user objects cannot collide with Map/Date tags.
// No provider timestamps are invented here. cachedAt is storage time, not retrievedAt.
export type CacheRecord<T = unknown> = { version: 2; key: string; cachedAt: number; expires: number; value: T };
type Node = null | boolean | number | string | { type: "undefined" } | { type: "date" | "bigint"; value: string } | { type: "array" | "set"; value: Node[] } | { type: "map"; value: [Node, Node][] } | { type: "object"; value: [string, Node][] };

function encode(value: unknown, parents = new Set<object>()): Node {
  if (value === undefined) return { type: "undefined" };
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return { type: "bigint", value: String(value) };
  if (typeof value !== "object" || !value || parents.has(value) || parents.size > 100) throw new Error("Unsupported cache value");
  const next = new Set([...parents, value]);
  const child = (item: unknown) => encode(item, next);
  if (value instanceof Date) return { type: "date", value: value.toISOString() };
  if (value instanceof Map) return { type: "map", value: [...value].map(([key, item]) => [child(key), child(item)]) };
  if (value instanceof Set) return { type: "set", value: [...value].map(child) };
  if (Array.isArray(value)) return { type: "array", value: value.map(child) };
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error("Unsupported cache object");
  return { type: "object", value: Object.entries(value).map(([key, item]) => [key, child(item)]) };
}
function decode(node: Node, depth = 0): unknown {
  if (depth > 100) throw new Error("Excessive cache nesting");
  if (node === null || typeof node === "string" || typeof node === "boolean" || typeof node === "number") return node;
  const child = (item: Node) => decode(item, depth + 1);
  switch (node.type) {
    case "undefined": return undefined;
    case "date": { const date = new Date(node.value); if (!Number.isFinite(date.getTime())) throw new Error("Invalid cache date"); return date; }
    case "bigint": return BigInt(node.value);
    case "array": return node.value.map(child);
    case "set": return new Set(node.value.map(child));
    case "map": return new Map(node.value.map(([key, item]) => [child(key), child(item)]));
    case "object": return Object.fromEntries(node.value.map(([key, item]) => [key, child(item)]));
    default: throw new Error("Invalid cache encoding");
  }
}
export function serializeRecord(record: CacheRecord): string {
  return JSON.stringify({ ...record, value: encode(record.value) });
}
export function deserializeRecord<T>(raw: string, key: string): CacheRecord<T> | undefined {
  try {
    const record = JSON.parse(raw);
    // Old unversioned Map entries are irreversibly {}; do not guess original types or retrieval dates.
    if (record.version !== 2 || record.key !== key || typeof record.cachedAt !== "number" || typeof record.expires !== "number" || !Number.isFinite(new Date(record.cachedAt).getTime()) || !Number.isFinite(new Date(record.expires).getTime()) || record.cachedAt < 0 || record.expires < 0) return undefined;
    return { version: 2, key, cachedAt: record.cachedAt, expires: record.expires, value: decode(record.value) as T };
  } catch { return undefined; }
}

// Mark only evidence nodes, recursively including computed inputs, without mutating the good copy.
export function staleValue<T>(value: T): T {
  const visited = new WeakMap<object, unknown>();
  const visit = (item: unknown): unknown => {
    if (!item || typeof item !== "object" || item instanceof Date) return item;
    if (visited.has(item)) return visited.get(item);
    if (item instanceof Map) { const result = new Map(); visited.set(item, result); for (const [key, child] of item) result.set(key, visit(child)); return result; }
    if (item instanceof Set) { const result = new Set(); visited.set(item, result); for (const child of item) result.add(visit(child)); return result; }
    const result: Record<string, unknown> | unknown[] = Array.isArray(item) ? [] : {};
    visited.set(item, result);
    for (const [key, child] of Object.entries(item)) Object.defineProperty(result, key, { value: visit(child), enumerable: true, writable: true, configurable: true });
    if ("kind" in item && ["retrieved", "computed", "assumption"].includes(String(item.kind))) Object.defineProperty(result, "stale", { value: true, enumerable: true, writable: true, configurable: true });
    return result;
  };
  return visit(value) as T;
}
