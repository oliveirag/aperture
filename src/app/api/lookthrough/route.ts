import { HOLDINGS } from "@/data/portfolio";
import { getEtfProfile, normalizeTicker } from "@/lib/etf";
import { finnhubConfigured, getProfile, getQuote } from "@/lib/finnhub";
import { computeXray, type LookthroughInput } from "@/lib/xray/compute";

export const runtime = "nodejs";

const MAX_POSITIONS = 25;
const TICKER = /^[A-Z][A-Z.]{0,5}$/;
const KNOWN_COLORS = new Map(HOLDINGS.map((h) => [h.ticker, h.color]));

type Body = { holdings?: { ticker?: unknown; shares?: unknown; price?: unknown; name?: unknown }[] };

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Real look-through for an imported portfolio: live Finnhub prices and profiles, ETF holdings from the seed or Alpha Vantage.
// Body: { holdings: [{ ticker, shares, price?, name? }] }. `price` is the import-time fallback when there's no live quote.
export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const raw = Array.isArray(body.holdings) ? body.holdings : [];
  const merged = new Map<string, { shares: number; price: number | null; name: string | null }>();
  for (const h of raw) {
    if (typeof h?.ticker !== "string" || typeof h.shares !== "number" || !(h.shares > 0)) continue;
    const ticker = normalizeTicker(h.ticker);
    if (!TICKER.test(ticker)) continue;
    const prev = merged.get(ticker);
    merged.set(ticker, {
      shares: (prev?.shares ?? 0) + h.shares,
      price: typeof h.price === "number" && h.price > 0 ? h.price : (prev?.price ?? null),
      name: typeof h.name === "string" ? h.name : (prev?.name ?? null),
    });
  }
  if (merged.size === 0) return fail("No holdings", 400);
  if (merged.size > MAX_POSITIONS) return fail(`At most ${MAX_POSITIONS} positions`, 400);

  const tickers = [...merged.keys()];
  const live = finnhubConfigured();
  const [quotes, profiles] = await Promise.all([
    Promise.allSettled(tickers.map((t) => (live ? getQuote(t) : Promise.resolve(null)))),
    Promise.allSettled(tickers.map((t) => (live ? getProfile(t) : Promise.resolve(null)))),
  ]);

  // A Finnhub company profile means a stock; no profile, try it as an ETF.
  const inputs: LookthroughInput[] = await Promise.all(
    tickers.map(async (ticker, i) => {
      const h = merged.get(ticker)!;
      const quote = quotes[i].status === "fulfilled" ? quotes[i].value : null;
      const profile = profiles[i].status === "fulfilled" ? profiles[i].value : null;
      const price = quote?.price ?? h.price ?? 0;
      const name = profile?.name ?? h.name ?? ticker;
      if (profile) return { ticker, name, shares: h.shares, price, kind: "stock" as const, industry: profile.industry || null };
      const etf = await getEtfProfile(ticker);
      if (etf) return { ticker, name, shares: h.shares, price, kind: "etf" as const, etf };
      return { ticker, name, shares: h.shares, price, kind: "opaque" as const };
    }),
  );

  if (!inputs.some((p) => p.price > 0)) return fail("No prices available", 502);

  // ETF files spell names in capitals ("NVIDIA CORP"); swap in Finnhub names for the companies the page names.
  const first = computeXray(inputs, KNOWN_COLORS);
  const named = first.topTen.filter((e) => !e.sources.some((s) => s.via === "Direct")).map((e) => e.ticker);
  const names = new Map<string, string>();
  if (live) {
    const found = await Promise.allSettled(named.map(getProfile));
    named.forEach((t, i) => {
      const r = found[i];
      if (r.status === "fulfilled" && r.value) names.set(t, r.value.name);
    });
  }
  return Response.json(names.size ? computeXray(inputs, KNOWN_COLORS, names) : first);
}
