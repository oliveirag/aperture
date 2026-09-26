import { getWeekly, historyConfigured, type Weekly } from "@/lib/history";
import { buildPerformance, type PerformanceHolding } from "@/lib/performance";
import { MAX_POSITIONS, parseHoldings } from "@/lib/xray/live";

export const runtime = "nodejs";
// Alpha Vantage calls are spaced about a second apart on a cold cache.
export const maxDuration = 60;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Portfolio value over the last year from weekly closes, at today's share counts. Body: { holdings: [{ ticker, shares, price }] },
// where price is the current (live or import-time) price. Positions without history are excluded and named.
export async function POST(request: Request) {
  if (!historyConfigured()) return fail("Price history is not configured", 503);
  let body: { holdings?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const merged = parseHoldings(body.holdings);
  if (merged.size === 0) return fail("No holdings", 400);
  if (merged.size > MAX_POSITIONS) return fail(`At most ${MAX_POSITIONS} positions`, 400);
  const holdings: PerformanceHolding[] = [...merged].map(([ticker, h]) => ({ ticker, shares: h.shares, price: h.price ?? 0 }));

  const results = await Promise.allSettled(holdings.map((h) => getWeekly(h.ticker)));
  const histories: Record<string, Weekly | null> = {};
  holdings.forEach((h, i) => {
    const r = results[i];
    histories[h.ticker] = r.status === "fulfilled" ? r.value : null;
    if (r.status === "rejected") console.error(`[performance] ${h.ticker}:`, r.reason instanceof Error ? r.reason.message : "unknown");
  });
  const today = new Date().toISOString().slice(0, 10);
  return Response.json(buildPerformance(holdings, histories, today), { headers: { "Cache-Control": "private, max-age=300" } });
}
