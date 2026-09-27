import { getWeekly, historyConfigured } from "@/lib/history";
import { buildOutlook } from "@/lib/outlook";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

// Historical range for one ticker. Body: { ticker, price }. Weekly adjusted closes come from Alpha Vantage; no model is invented here.
export async function POST(request: Request) {
  const limited = await rateLimit(request, "data");
  if (limited) return limited;
  if (!historyConfigured()) return Response.json({ error: "Price history is not configured" }, { status: 503 });
  let body: { ticker?: unknown; price?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Expected JSON" }, { status: 400 }); }
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const price = Number(body.price);
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker) || !Number.isFinite(price) || price <= 0) return Response.json({ error: "Provide a ticker and a positive price" }, { status: 400 });
  try {
    const weekly = await getWeekly(ticker);
    const outlook = weekly ? buildOutlook(ticker, weekly, price, new Date().toISOString().slice(0, 10)) : null;
    if (!outlook) return Response.json({ error: `${ticker} needs about four years of weekly history for a validated range; it has less, or none.` }, { status: 422 });
    return Response.json(outlook, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    console.error("[outlook]", error instanceof Error ? error.message.slice(0, 120) : "failed");
    return Response.json({ error: "Price history is unavailable right now" }, { status: 502 });
  }
}
