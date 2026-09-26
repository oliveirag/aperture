import { lookthrough, MAX_POSITIONS, parseHoldings } from "@/lib/xray/live";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// A 50-position portfolio can wait on the shared Finnhub rate limit.
export const maxDuration = 60;

type Body = { holdings?: unknown };

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Real look-through for an imported portfolio: live Finnhub prices and profiles, ETF holdings from the seed or Alpha Vantage.
// Body: { holdings: [{ ticker, shares, price?, name? }] }. `price` is the import-time fallback when there's no live quote.
export async function POST(request: Request) {
  const limited = await rateLimit(request, "data");
  if (limited) return limited;
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const merged = parseHoldings(body.holdings);
  if (merged.size === 0) return fail("No holdings", 400);
  if (merged.size > MAX_POSITIONS) return fail(`At most ${MAX_POSITIONS} positions`, 400);

  const model = await lookthrough(merged);
  if (!model) return fail("No prices available", 502);
  return Response.json(model);
}
