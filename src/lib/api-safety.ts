// Integration helpers; route owners must opt in without dropping their authentication/origin checks.
import { rateLimit, type LimitName } from "./rate-limit";
import type { Provider } from "./provenance";

const ERRORS = {
  INVALID_INPUT: [400, "Invalid request input."],
  INVALID_JSON: [400, "Invalid JSON request body."],
  JSON_OBJECT_REQUIRED: [400, "Expected a JSON object."],
  UNAUTHENTICATED: [401, "Sign in to continue."],
  FORBIDDEN: [403, "This request is not permitted."],
  BODY_TOO_LARGE: [413, "Request body is too large."],
  UNSUPPORTED_MEDIA_TYPE: [415, "Content-Type must be application/json."],
  RATE_LIMITED: [429, "Too many requests. Try again later."],
  PROVIDER_UNAVAILABLE: [502, "The data provider is unavailable."],
  LIMITER_UNAVAILABLE: [503, "Request limiter unavailable. Try again shortly."],
  TIMEOUT: [504, "The request timed out."],
  INTERNAL_ERROR: [500, "The request could not be completed."],
} as const;
export class ApiError extends Error {
  constructor(readonly code: keyof typeof ERRORS, readonly provider?: Provider) { super(ERRORS[code][1]); }
}
export function safeApiError(error: unknown): Response {
  const known = error instanceof ApiError ? error : new ApiError("INTERNAL_ERROR");
  const [status, message] = ERRORS[known.code];
  return Response.json({ error: { code: known.code, message, ...(known.provider ? { provider: known.provider } : {}) } }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function guardRateLimit(request: Request, name: LimitName): Promise<Response | null> {
  const denied = await rateLimit(request, name);
  if (!denied) return null;
  const response = safeApiError(new ApiError(denied.status === 429 ? "RATE_LIMITED" : "LIMITER_UNAVAILABLE"));
  response.headers.set("Retry-After", denied.headers.get("Retry-After") ?? "30");
  return response;
}
// The callback must pass this signal to fetch/DB calls; the race bounds response latency even for a stuck callback.
export async function withDeadline<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = 10_000, parent?: AbortSignal): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new ApiError("INVALID_INPUT");
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([controller.signal, parent]) : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      abort = () => reject(new ApiError("TIMEOUT"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      timer = setTimeout(() => controller.abort(), timeoutMs);
    });
    return await Promise.race([timeout, Promise.resolve().then(() => { if (signal.aborted) throw new ApiError("TIMEOUT"); return run(signal); })]);
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener("abort", abort);
  }
}
export async function readJson(request: Request, options: { maxBytes?: number; timeoutMs?: number } = {}): Promise<Record<string, unknown>> {
  const maxBytes = options.maxBytes ?? 256 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new ApiError("INVALID_INPUT");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError("UNSUPPORTED_MEDIA_TYPE");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new ApiError("BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("INVALID_INPUT");
  try {
    const raw = await withDeadline(async signal => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        if (signal.aborted) throw new ApiError("TIMEOUT");
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new ApiError("BODY_TOO_LARGE");
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString("utf8");
    }, options.timeoutMs ?? 5000, request.signal);
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new ApiError("INVALID_JSON"); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError("JSON_OBJECT_REQUIRED");
    return data as Record<string, unknown>;
  } finally { void reader.cancel().catch(() => undefined); }
}
export function symbols(input: unknown, max = 100): string[] {
  if (typeof input !== "string" || !input || input.length > max * 17 || !Number.isSafeInteger(max) || max < 1 || max > 1000) throw new ApiError("INVALID_INPUT");
  const values = input.split(",");
  if (values.length > max) throw new ApiError("INVALID_INPUT");
  const normalized = values.map(value => value.trim().toUpperCase());
  if (normalized.some(value => !/^[A-Z0-9][A-Z0-9.\-^]{0,14}$/.test(value))) throw new ApiError("INVALID_INPUT");
  return [...new Set(normalized)];
}
