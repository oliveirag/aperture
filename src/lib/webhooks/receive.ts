import { createHash, randomUUID } from "node:crypto";
import { handleEvent, parseEvent, validSecret, type ParsedEvent } from "./finnhub";

export type Claim = { state: "claimed"; token: string } | { state: "duplicate" } | { state: "busy" } | { state: "full" };
export type DeliveryContext = { signal: AbortSignal; checkpoint: () => void };
// A production multi-instance deployment must inject an atomic durable store.
// Token ownership prevents an old completion/release deleting a newer claim.
export interface DeliveryStore {
  claim(key: string): Promise<Claim>;
  complete(key: string, token: string): Promise<void>;
  release(key: string, token: string): Promise<void>;
}

// Bounded single-process implementation for local use/testing, NOT a distributed
// exactly-once guarantee. Successful claims expire; in-flight claims never evict.
export function createMemoryDeliveryStore(options: { capacity?: number; ttlMs?: number; now?: () => number } = {}): DeliveryStore {
  const capacity = options.capacity ?? 1000, ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
  const now = options.now ?? Date.now;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000 || !Number.isFinite(ttlMs) || ttlMs < 1) throw new Error("Invalid delivery store bounds");
  const entries = new Map<string, { token: string; expires: number; complete: boolean }>();
  return {
    async claim(key) {
      const time = now();
      for (const [id, entry] of entries) if (entry.complete && entry.expires <= time) entries.delete(id);
      const existing = entries.get(key);
      if (existing) return { state: existing.complete ? "duplicate" : "busy" };
      if (entries.size >= capacity) return { state: "full" };
      const token = randomUUID();
      entries.set(key, { token, expires: Infinity, complete: false });
      return { state: "claimed", token };
    },
    async complete(key, token) {
      const entry = entries.get(key);
      if (!entry || entry.token !== token) throw new Error("Delivery claim ownership lost");
      entries.set(key, { token, complete: true, expires: now() + ttlMs });
    },
    async release(key, token) {
      if (entries.get(key)?.token === token) entries.delete(key);
    },
  };
}

class RequestFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const MAX_BYTES = 256 * 1024;
async function boundedJson(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) throw new RequestFailure(413, "BODY_TOO_LARGE", "Webhook body exceeds limit");
  if (request.headers.get("content-encoding") && request.headers.get("content-encoding") !== "identity") throw new RequestFailure(415, "UNSUPPORTED_ENCODING", "Compressed webhook bodies are not accepted");
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new RequestFailure(415, "CONTENT_TYPE", "Expected application/json");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestFailure(400, "INVALID_JSON", "Expected JSON body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new RequestFailure(408, "BODY_TIMEOUT", "Webhook body timed out")), 5000); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new RequestFailure(413, "BODY_TOO_LARGE", "Webhook body exceeds limit");
      chunks.push(value);
    }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new RequestFailure(400, "INVALID_JSON", "Invalid JSON body"); }
  } finally {
    clearTimeout(timeout);
    // Do not wait on a hostile underlying stream's cancel implementation.
    void reader.cancel().catch(() => undefined);
  }
}

function canonical(value: unknown, depth = 0): string {
  if (depth > 20) throw new RequestFailure(400, "BODY_DEPTH", "Webhook nesting exceeds limit");
  if (Array.isArray(value)) return `[${value.map(v => canonical(v, depth + 1)).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v, depth + 1)}`).join(",")}}`;
  return JSON.stringify(value);
}
function deliveryKey(body: Record<string, unknown>): string {
  // Hash the full content, not just kind + tickers; distinct headlines must not
  // suppress each other. Normalize batch order and object key order for retries.
  const normalized = { ...body, ...(Array.isArray(body.data) ? { data: body.data.map(item => canonical(item)).sort() } : {}) };
  return createHash("sha256").update(canonical(normalized)).digest("hex");
}
function failure(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, provider: "finnhub" } }, { status, headers: { "Cache-Control": "no-store", ...(status === 503 ? { "Retry-After": "30" } : {}) } });
}

// Work completes before 2xx. Delivery suppression is not exactly-once effects:
// handlers MUST safely rerun after partial completion and cooperatively check
// context after awaits / before effects (or fence effects in their own store).
// The default handler only invalidates caches; it does not start an uncancellable
// Radar/Gemini refresh. No automatic renewal: 20s work budget < 120s SQL lease.
export async function receiveFinnhubWebhook(request: Request, options: {
  secret: string | undefined;
  store: DeliveryStore;
  handle?: (event: ParsedEvent, context: DeliveryContext) => Promise<unknown>;
  timeoutMs?: number;
}): Promise<Response> {
  if (!options.secret) return failure(503, "NOT_CONFIGURED", "Webhook is not configured");
  if (!validSecret(request.headers.get("x-finnhub-secret"), options.secret)) return failure(401, "UNAUTHORIZED", "Unauthorized");
  if (request.method !== "POST") return failure(405, "METHOD", "Expected POST");
  let body: Record<string, unknown>, event: ParsedEvent, key: string;
  try {
    const parsed = await boundedJson(request);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new RequestFailure(400, "INVALID_EVENT", "Expected an event object");
    body = parsed as Record<string, unknown>;
    if (typeof (body.event ?? body.type) !== "string" || !String(body.event ?? body.type).trim() || String(body.event ?? body.type).length > 100) throw new RequestFailure(400, "INVALID_EVENT", "Expected event name");
    if (body.data !== undefined && (!body.data || typeof body.data !== "object")) throw new RequestFailure(400, "INVALID_EVENT", "Invalid event data");
    if (Array.isArray(body.data) && body.data.some(item => !item || typeof item !== "object" || Array.isArray(item))) throw new RequestFailure(400, "INVALID_EVENT", "Expected event data objects");
    event = parseEvent(body);
    key = deliveryKey(body);
  } catch (error) {
    if (error instanceof RequestFailure) return failure(error.status, error.code, error.message);
    return failure(400, "INVALID_EVENT", "Invalid or excessive webhook event");
  }
  // Start before the claim round trip: a paused response must not grant an old
  // worker a fresh budget after its database lease has already expired.
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.min(20_000, Math.max(1, options.timeoutMs!)) : 20_000;
  const deadline = performance.now() + timeoutMs;
  let claim: Claim;
  try { claim = await options.store.claim(key); }
  catch { return failure(503, "STORE_UNAVAILABLE", "Webhook delivery store unavailable"); }
  if (claim.state === "full") return failure(503, "STORE_FULL", "Webhook delivery store at capacity");
  if (claim.state === "busy") return failure(503, "DELIVERY_BUSY", "Webhook delivery still processing; retry later");
  if (claim.state === "duplicate") return Response.json({ ok: true, duplicate: true }, { headers: { "Cache-Control": "no-store" } });
  const controller = new AbortController();
  const context: DeliveryContext = {
    signal: controller.signal,
    checkpoint() {
      if (performance.now() >= deadline) controller.abort();
      controller.signal.throwIfAborted();
    },
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<Response>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(failure(503, "PROCESSING_TIMEOUT", "Webhook processing timed out; retry later"));
    }, Math.max(1, deadline - performance.now()));
  });
  const work = (async () => {
    try {
      context.checkpoint();
      await (options.handle ?? ((event, ctx) => handleEvent(event, { context: ctx })))(event, context);
      context.checkpoint();
      await options.store.complete(key, claim.token);
      return Response.json({ ok: true, duplicate: false, kind: event.kind }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      // This runs only after the handler settles, NEVER merely because the
      // response timed out. A crashed process is recovered by the bounded lease.
      await options.store.release(key, claim.token).catch(() => undefined);
      return failure(503, "PROCESSING_FAILED", "Webhook processing unavailable; retry later");
    } finally { clearTimeout(timer); }
  })();
  return Promise.race([work, expired]);
}
