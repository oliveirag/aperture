// Server-only: what a Finnhub webhook event means for Lookthrough, and the cache refreshes it triggers.
import { timingSafeEqual } from "node:crypto";
import { forgetKeys } from "@/lib/cache";
import { radarFor } from "@/lib/radar/live";
import { trackedAmong } from "@/lib/radar/tracked";

export type EventKind = "filings" | "news" | "earnings" | "other";
export type ParsedEvent = { kind: EventKind; tickers: string[] };

const TICKER = /^[A-Z][A-Z.]{0,5}$/;

// Constant-time check of the X-Finnhub-Secret header. No secret configured means every request is refused.
export function validSecret(header: string | null, secret: string | undefined) {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Finnhub posts { event, data: [...] }; items name their company in `symbol`, `ticker` or (news) a comma list in `related`.
export function parseEvent(body: unknown): ParsedEvent {
  const b = (body ?? {}) as { event?: unknown; type?: unknown; data?: unknown };
  const name = String(b.event ?? b.type ?? "").toLowerCase();
  const kind: EventKind = /filing|sec/.test(name) ? "filings" : /news|press/.test(name) ? "news" : /earning/.test(name) ? "earnings" : "other";
  const items = Array.isArray(b.data) ? b.data : b.data ? [b.data] : [];
  const tickers = new Set<string>();
  for (const item of items as Record<string, unknown>[]) {
    for (const field of [item?.symbol, item?.ticker, item?.related]) {
      if (typeof field !== "string") continue;
      for (const t of field.split(",")) {
        const ticker = t.trim().toUpperCase().replace(/[/-]/g, ".");
        if (TICKER.test(ticker)) tickers.add(ticker);
      }
    }
  }
  return { kind, tickers: [...tickers] };
}

// Tickers held in any saved portfolio (Supabase, with the service role key), when accounts are set up.
async function heldAmong(tickers: string[]): Promise<Set<string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || tickers.length === 0) return new Set();
  try {
    const res = await fetch(`${url}/rest/v1/holdings?select=ticker&ticker=in.(${tickers.map(encodeURIComponent).join(",")})`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return new Set();
    return new Set(((await res.json()) as { ticker: string }[]).map((r) => r.ticker));
  } catch {
    return new Set();
  }
}

export type Refresh = (ticker: string) => Promise<unknown>;

// Refreshes only what the event touches, and only for tickers someone holds or follows in Radar.
export async function handleEvent(
  event: ParsedEvent,
  deps: { interested?: (tickers: string[]) => Promise<Set<string>>; refreshRadar?: Refresh; forget?: (keys: string[]) => void } = {},
) {
  const interested =
    deps.interested ??
    (async (tickers: string[]) => {
      const [tracked, held] = await Promise.all([trackedAmong(tickers), heldAmong(tickers)]);
      return new Set([...tracked, ...held]);
    });
  const refreshRadar = deps.refreshRadar ?? ((t: string) => radarFor(t, { fresh: true }));
  const forget = deps.forget ?? forgetKeys;
  if (event.kind === "other" || event.tickers.length === 0) return { refreshed: [] as string[] };

  const targets = [...(await interested(event.tickers))];
  const day = new Date().toISOString().slice(0, 10);
  for (const t of targets) {
    // The IC Room's fact pack for today is rebuilt with the new filing, headline or date.
    const keys = [`ic:facts:${t}:${day}`];
    if (event.kind === "news") keys.push(`finnhub:news:${t}:14`);
    if (event.kind === "earnings") keys.push(`finnhub:earnings:${t}`, `finnhub:metric:${t}`);
    forget(keys);
  }
  if (event.kind === "filings") await Promise.allSettled(targets.map((t) => refreshRadar(t)));
  return { refreshed: targets };
}
