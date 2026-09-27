// Server-only: webhook effects are repeatable cache invalidations, not payments
// or notifications. Partial completion can safely be retried.
import { timingSafeEqual } from "node:crypto";
import { forgetKeys } from "@/lib/cache";
import { companyFor } from "@/lib/sec";
import { trackedAmong } from "@/lib/radar/tracked";
import { ticker } from "../news/normalize";
import type { DeliveryContext } from "./receive";

export type EventKind = "filings" | "news" | "earnings" | "other";
export type ParsedEvent = { kind: EventKind; tickers: string[] };

// Constant-time comparison for equal byte lengths; never log either secret.
export function validSecret(header: string | null, secret: string | undefined) {
  if (!secret || !header || secret.length > 1024 || header.length > 1024) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseEvent(body: unknown): ParsedEvent {
  const b = (body ?? {}) as { event?: unknown; type?: unknown; data?: unknown };
  const label = b.event ?? b.type;
  const name = typeof label === "string" && label.length <= 100 ? label.toLowerCase() : "";
  const kind: EventKind = ["filings", "filing", "sec"].includes(name) ? "filings" : ["news", "company-news", "press-release"].includes(name) ? "news" : ["earnings", "earning"].includes(name) ? "earnings" : "other";
  const items = Array.isArray(b.data) ? b.data : b.data ? [b.data] : [];
  if (items.length > 100) throw new Error("Webhook item limit exceeded");
  const tickers = new Set<string>();
  for (const item of items as Record<string, unknown>[]) {
    for (const field of [item?.symbol, item?.ticker, item?.related]) {
      if (typeof field !== "string") continue;
      if (field.length > 2000) throw new Error("Webhook ticker field limit exceeded");
      for (const t of field.split(",")) {
        const normalized = ticker(t);
        if (normalized) tickers.add(normalized);
        if (tickers.size > 100) throw new Error("Webhook ticker limit exceeded");
      }
    }
  }
  return { kind, tickers: [...tickers] };
}

// Explicit no-account/local mode is empty; a configured backend failure is NOT.
export async function heldAmong(tickers: string[], signal?: AbortSignal): Promise<Set<string>> {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.APERTURE_LOCAL_VERIFICATION === "1" || process.env.NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION === "1") return new Set();
  if ((!rawUrl && !key) || tickers.length === 0) return new Set();
  if (!rawUrl || !key) throw new Error("Holdings backend incompletely configured");
  if (tickers.length > 100 || tickers.some(t => ticker(t) !== t)) throw new Error("Invalid holdings targets");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid holdings backend");
  try {
    // Include common class-share spellings; normalize returned holdings too.
    const aliases = [...new Set(tickers.flatMap(t => [t, t.replaceAll(".", "-"), t.replaceAll(".", "/")]))];
    const res = await fetch(`${url.origin}/rest/v1/holdings?select=ticker&ticker=in.(${aliases.map(encodeURIComponent).join(",")})`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
      cache: "no-store", redirect: "error",
    });
    if (!res.ok) throw new Error("Holdings unavailable");
    const rows: unknown = await res.json();
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== "object" || !ticker(r.ticker))) throw new Error("Invalid holdings response");
    const requested = new Set(tickers);
    return new Set(rows.map(r => ticker(r.ticker)!).filter(t => requested.has(t)));
  } catch { throw new Error("Holdings lookup unavailable"); }
}

// Injected refreshes/invalidations must cooperate with context and be retry-safe.
export type Refresh = (ticker: string, context?: DeliveryContext) => Promise<unknown>;
export async function handleEvent(
  event: ParsedEvent,
  deps: { interested?: (tickers: string[]) => Promise<Set<string>>; refreshRadar?: Refresh; forget?: (keys: string[]) => unknown; context?: DeliveryContext } = {},
) {
  const checkpoint = () => deps.context?.checkpoint();
  const interested = deps.interested ?? (async (tickers: string[]) => {
    const [tracked, held] = await Promise.all([trackedAmong(tickers), heldAmong(tickers, deps.context?.signal)]);
    return new Set([...tracked, ...held]);
  });
  const forget = deps.forget ?? forgetKeys;
  // Eager radarFor is not cancellable. Invalidate the filing list instead;
  // Radar computes the new pair on its next read, using existing cache APIs.
  const refreshRadar = deps.refreshRadar ?? (async (t: string) => {
    const company = await companyFor(t);
    checkpoint();
    if (company) await forget([`sec:filings:${company.cik}`]);
  });
  checkpoint();
  if (event.kind === "other" || event.tickers.length === 0) return { refreshed: [] as string[] };
  if (event.tickers.length > 100 || event.tickers.some(t => ticker(t) !== t)) throw new Error("Invalid webhook targets");
  const requested = new Set(event.tickers);
  const targets = [...new Set([...(await interested(event.tickers))].map(ticker).filter((t): t is string => t !== null && requested.has(t)))];
  checkpoint();
  const day = new Date().toISOString().slice(0, 10);
  for (const t of targets) {
    checkpoint();
    const keys = [`ic:facts:${t}:${day}`];
    if (event.kind === "news") keys.push(`finnhub:news:${t}:14`);
    if (event.kind === "earnings") keys.push(`finnhub:earnings:${t}`, `finnhub:metric:${t}`);
    await forget(keys);
  }
  if (event.kind === "filings") {
    // Sequential, bounded target count. No uncancelled Promise.all fan-out.
    for (const t of targets) {
      checkpoint();
      await refreshRadar(t, deps.context);
    }
  }
  checkpoint();
  return { refreshed: targets };
}
