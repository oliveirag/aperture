import { buildFactPack, UnknownTicker } from "@/lib/ic/facts";

export const runtime = "nodejs";
export const maxDuration = 60;

const TICKER = /^[A-Z][A-Z.]{0,5}$/;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// The IC Room fact pack for a ticker: SEC filing and XBRL facts, Finnhub market data and cited recent news, ids F1..Fn.
// Body: { ticker }. Cached per ticker and day.
export async function POST(request: Request) {
  let body: { ticker?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  if (!TICKER.test(ticker)) return fail("Invalid ticker", 400);
  try {
    const pack = await buildFactPack(ticker);
    return Response.json({ ticker: pack.ticker, name: pack.name, facts: pack.facts, notes: pack.notes });
  } catch (err) {
    if (err instanceof UnknownTicker) return fail(`Couldn't find ${ticker}`, 404);
    return fail("Couldn't gather facts right now", 502);
  }
}
