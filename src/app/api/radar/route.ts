import { geminiConfigured } from "@/lib/gemini";
import { radarFor } from "@/lib/radar/live";
import type { RadarEvent } from "@/lib/radar/types";

export const runtime = "nodejs";
// Two filings plus a long-context Gemini comparison.
export const maxDuration = 60;

const TICKER = /^[A-Z][A-Z.]{0,5}$/;
const MAX_TICKERS = 3;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Real Filing Radar for up to three tickers. Body: { tickers: string[], fresh?: boolean }.
// Streams NDJSON RadarEvents: progress lines while it reads, then one result, unsupported or error per ticker.
export async function POST(request: Request) {
  if (!geminiConfigured()) return fail("Filing Radar is not configured", 503);
  let body: { tickers?: unknown; fresh?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const tickers = Array.isArray(body.tickers)
    ? [...new Set(body.tickers.filter((t): t is string => typeof t === "string").map((t) => t.trim().toUpperCase()))]
    : [];
  if (tickers.length === 0) return fail("Pass { tickers: [\"AAPL\"] }", 400);
  if (tickers.length > MAX_TICKERS) return fail(`At most ${MAX_TICKERS} tickers per request`, 400);
  if (!tickers.every((t) => TICKER.test(t))) return fail("Invalid ticker", 400);
  const fresh = body.fresh === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: RadarEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      await Promise.all(
        tickers.map(async (ticker) => {
          try {
            const out = await radarFor(ticker, { fresh, onProgress: (message) => send({ type: "progress", ticker, message }) });
            send(out.status === "ok" ? { type: "result", ticker, filing: out.filing } : { type: "unsupported", ticker, reason: out.reason });
          } catch (err) {
            console.error(`[radar] ${ticker}:`, err instanceof Error ? err.message.slice(0, 160) : "unknown");
            const sec = err instanceof Error && err.message.startsWith("sec ");
            send({
              type: "error",
              ticker,
              error: sec ? "SEC EDGAR didn't answer. Try again in a moment." : "Gemini couldn't compare the filings right now. Try again in a moment.",
            });
          }
        }),
      );
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
