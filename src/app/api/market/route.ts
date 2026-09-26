import { finnhubConfigured, getProfile, getQuote, type MarketResponse } from "@/lib/finnhub";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const SYMBOL = /^[A-Z][A-Z.]{0,5}$/;
const MAX_SYMBOLS = 12;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Live quotes and company profiles for a small set of symbols. A symbol that fails is left out; the client keeps its snapshot value.
export async function GET(request: Request) {
  const limited = await rateLimit(request, "market");
  if (limited) return limited;
  if (!finnhubConfigured()) return fail("Market data is not configured", 503);

  const raw = new URL(request.url).searchParams.get("symbols") ?? "";
  const symbols = [...new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (symbols.length === 0) return fail("Pass ?symbols=AAPL,MSFT", 400);
  if (symbols.length > MAX_SYMBOLS) return fail(`At most ${MAX_SYMBOLS} symbols`, 400);
  if (!symbols.every((s) => SYMBOL.test(s))) return fail("Invalid symbol", 400);

  // ?fields=profile skips quotes, for logo lookups that don't need prices.
  const fields = new URL(request.url).searchParams.get("fields")?.split(",") ?? ["quote", "profile"];
  const skip = async () => null;
  const [quotes, profiles] = await Promise.all([
    Promise.allSettled(symbols.map(fields.includes("quote") ? getQuote : skip)),
    Promise.allSettled(symbols.map(fields.includes("profile") ? getProfile : skip)),
  ]);

  const body: MarketResponse = { quotes: {}, profiles: {} };
  symbols.forEach((s, i) => {
    const q = quotes[i];
    const p = profiles[i];
    if (q.status === "fulfilled" && q.value) body.quotes[s] = q.value;
    if (p.status === "fulfilled" && p.value) body.profiles[s] = p.value;
  });

  const failed = [...quotes, ...profiles].filter((r) => r.status === "rejected");
  if (Object.keys(body.quotes).length + Object.keys(body.profiles).length === 0 && failed.length > 0) {
    const reason = (failed[0] as PromiseRejectedResult).reason;
    console.error("[market] finnhub failed:", reason instanceof Error ? reason.message : "unknown");
    return fail("Market data is unavailable", 502);
  }

  return Response.json(body, { headers: { "Cache-Control": "private, max-age=30" } });
}
