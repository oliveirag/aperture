import { MAX_HOLDINGS, priceHoldings, type RawHolding, type SnapHolding } from "@/lib/price-holdings";

export const runtime = "nodejs";

export type PriceResponse = { holdings: SnapHolding[] };

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Brokers export descriptions in capitals ("SCHWAB US DIVIDEND EQUITY ETF"); acronyms like ETF or S&P stay as they are.
const KEEP_UPPER = new Set(["ETF", "US", "USA", "REIT", "S&P", "MSCI", "II", "III"]);
function titleCase(s: string) {
  if (s !== s.toUpperCase()) return s;
  return s
    .split(/\s+/)
    .map((w) => (KEEP_UPPER.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Prices positions the user typed or uploaded as CSV: live Finnhub quotes and profiles, no Gemini.
// Body: { holdings: [{ ticker, shares?, marketValue?, name? }] }, at least one of shares or marketValue per row.
// `name` (a CSV description) only fills in when Finnhub has no profile, as for ETFs.
export async function POST(request: Request) {
  let body: { holdings?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  if (!Array.isArray(body.holdings) || body.holdings.length === 0) return fail("No positions to price", 400);
  if (body.holdings.length > MAX_HOLDINGS) return fail(`At most ${MAX_HOLDINGS} positions per import`, 400);

  const raw: RawHolding[] = body.holdings.map((h: { ticker?: unknown; shares?: unknown; marketValue?: unknown; name?: unknown }) => ({
    ticker: typeof h?.ticker === "string" ? h.ticker : "",
    shares: num(h?.shares),
    marketValue: num(h?.marketValue),
    name: typeof h?.name === "string" && h.name.trim() ? titleCase(h.name.trim().slice(0, 80)) : null,
  }));
  const holdings = await priceHoldings(raw);
  if (holdings.length === 0) return fail("None of these positions could be read", 422);
  const res: PriceResponse = { holdings };
  return Response.json(res);
}
