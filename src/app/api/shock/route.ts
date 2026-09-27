import { SCENARIOS } from "@/data/shock";
import { buildLiveScenario, type LiveScenario } from "@/lib/shock/live";
import { apertureInputs, applySuppliedPrices, MAX_POSITIONS, modelFor, parseHoldings, priceModeOf } from "@/lib/xray/live";
import { rateLimit } from "@/lib/rate-limit";
import type { Valuation } from "@/lib/xray/types";

export const runtime = "nodejs";
// A 50-position portfolio can wait on the shared Finnhub rate limit.
export const maxDuration = 60;

export type ShockResponse = {
  total: number;
  colors: Record<string, string>;
  // Each position's value at the prices used, so the graph draws the same dollars the totals use.
  values: Record<string, number>;
  valuation?: Valuation;
  scenarios: LiveScenario[];
};

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Both Shock Test scenarios mapped onto a real portfolio's look-through exposures.
// Body: { holdings: [{ ticker, shares, price?, name? }], priceMode?: "live" | "supplied" }. "supplied" keeps the prices
// sent (a saved snapshot's valuation) so the Shock Test and the X-Ray show the same portfolio value.
// Deterministic: fixed sensitivities times exposure values, at each scenario's base severity (the client scales linearly).
export async function POST(request: Request) {
  const limited = await rateLimit(request, "data");
  if (limited) return limited;
  let body: { holdings?: unknown; priceMode?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const holdings = parseHoldings(body.holdings);
  if (holdings.size === 0) return fail("No holdings", 400);
  if (holdings.size > MAX_POSITIONS) return fail(`At most ${MAX_POSITIONS} positions`, 400);

  const inputs = await apertureInputs(holdings);
  if (priceModeOf(body.priceMode) === "supplied") applySuppliedPrices(inputs, holdings);
  const model = await modelFor(inputs);
  if (!model) return fail("No prices available", 502);
  const colors = Object.fromEntries(model.map.positions.map((p) => [p.ticker, p.color]));
  const values = Object.fromEntries(inputs.filter((p) => p.price > 0).map((p) => [p.ticker, p.shares * p.price]));
  const res: ShockResponse = { total: model.total, colors, values, valuation: model.valuation, scenarios: SCENARIOS.map((s) => buildLiveScenario(s, inputs, model.sources)) };
  return Response.json(res);
}
