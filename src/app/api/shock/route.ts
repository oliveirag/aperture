import { SCENARIOS } from "@/data/shock";
import { buildLiveScenario, type LiveScenario } from "@/lib/shock/live";
import { lookthroughInputs, MAX_POSITIONS, modelFor, parseHoldings } from "@/lib/xray/live";

export const runtime = "nodejs";

export type ShockResponse = { total: number; colors: Record<string, string>; scenarios: LiveScenario[] };

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Both Shock Test scenarios mapped onto a real portfolio's look-through exposures. Body: { holdings: [{ ticker, shares, price?, name? }] }.
// Deterministic: fixed sensitivities times exposure values, at each scenario's base severity (the client scales linearly).
export async function POST(request: Request) {
  let body: { holdings?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const holdings = parseHoldings(body.holdings);
  if (holdings.size === 0) return fail("No holdings", 400);
  if (holdings.size > MAX_POSITIONS) return fail(`At most ${MAX_POSITIONS} positions`, 400);

  const inputs = await lookthroughInputs(holdings);
  const model = await modelFor(inputs);
  if (!model) return fail("No prices available", 502);
  const colors = Object.fromEntries(model.map.positions.map((p) => [p.ticker, p.color]));
  const res: ShockResponse = { total: model.total, colors, scenarios: SCENARIOS.map((s) => buildLiveScenario(s, inputs, model.sources)) };
  return Response.json(res);
}
