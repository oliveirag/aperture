import { geminiConfigured } from "@/lib/gemini";
import { RunError, runCommittee } from "@/lib/ic/run";
import type { IcEvent } from "@/lib/ic/types";
import { MAX_POSITIONS, parseHoldings } from "@/lib/xray/live";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const TICKER = /^[A-Z][A-Z.]{0,5}$/;
const MAX_THESIS = 600;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Runs the investment committee on any ticker. Body: { ticker, thesis, amount, holdings: [{ ticker, shares, price?, name? }] }.
// Streams NDJSON IcEvents: fact pack steps, facts and fit, assumptions, bull, bear, then the chair's memo.
export async function POST(request: Request) {
  const limited = await rateLimit(request, "ic");
  if (limited) return limited;
  if (!geminiConfigured()) return fail("The IC Room is not configured", 503);
  let body: { ticker?: unknown; thesis?: unknown; amount?: unknown; holdings?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const thesis = typeof body.thesis === "string" ? body.thesis.trim() : "";
  const amount = typeof body.amount === "number" ? Math.round(body.amount) : NaN;
  if (!TICKER.test(ticker)) return fail("Invalid ticker", 400);
  if (!thesis || thesis.length > MAX_THESIS) return fail(`Write a thesis of at most ${MAX_THESIS} characters`, 400);
  if (!(amount >= 100 && amount <= 10_000_000)) return fail("Amount must be between $100 and $10,000,000", 400);
  const holdings = parseHoldings(body.holdings);
  if (holdings.size === 0) return fail("No holdings", 400);
  if (holdings.size > MAX_POSITIONS) return fail(`At most ${MAX_POSITIONS} positions`, 400);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: IcEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await runCommittee({ ticker, thesis, amount, holdings }, send);
      } catch (err) {
        console.error(`[ic] ${ticker}:`, err instanceof Error ? err.message.slice(0, 160) : "unknown");
        send({ type: "error", error: err instanceof RunError ? err.message : "The committee couldn't meet right now. Try again in a moment." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
