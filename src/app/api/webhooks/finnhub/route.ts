import { after } from "next/server";
import { handleEvent, parseEvent, validSecret } from "@/lib/webhooks/finnhub";

export const runtime = "nodejs";
// The refresh itself runs after the response: a Radar re-check can take most of a minute.
export const maxDuration = 60;

// Finnhub webhook: new filings, news and earnings for tickers. Answers 401 unless X-Finnhub-Secret matches
// FINNHUB_WEBHOOK_SECRET, and otherwise acknowledges at once (Finnhub wants a fast 2xx), refreshing in the background.
export async function POST(request: Request) {
  if (!validSecret(request.headers.get("x-finnhub-secret"), process.env.FINNHUB_WEBHOOK_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // Finnhub's test ping may have no JSON body; acknowledge it all the same.
  }
  const event = parseEvent(body);
  after(async () => {
    try {
      const { refreshed } = await handleEvent(event);
      if (refreshed.length) console.log(`[webhook] ${event.kind}: refreshed ${refreshed.join(", ")}`);
    } catch (err) {
      console.error("[webhook] refresh failed:", err instanceof Error ? err.message : "unknown");
    }
  });
  return Response.json({ ok: true, kind: event.kind, tickers: event.tickers.length });
}
