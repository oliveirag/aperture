import { getHistory, type HistoryResult, type Weekly } from "@/lib/history";
import { buildPerformance, performanceEligible, type PerformanceHolding } from "@/lib/performance";
import { MAX_POSITIONS, parseHoldings } from "@/lib/xray/live";
import { portfolioValue, positionValue } from "@/lib/xray/valuation";
import type { Provenance } from "@/lib/provenance";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;
function fail(error: string, status: number) { return Response.json({ error }, { status }); }

// Unsupported/cash/value-only exposure is retained in the denominator, but must
// never spend history quota or acquire a price-return curve from a ticker match.
export async function POST(request: Request) {
  const limited = await rateLimit(request, "data");
  if (limited) return limited;
  let body: { holdings?: unknown } | null;
  try { body = await request.json(); } catch { return fail("Expected JSON", 400); }
  if (!Array.isArray(body?.holdings) || !body.holdings.length) return fail("No holdings", 400);
  if (body.holdings.length > MAX_POSITIONS) return fail(`At most ${MAX_POSITIONS} positions`, 400);
  const holdings: PerformanceHolding[] = [];
  const seen = new Set<string>();
  try {
    for (const raw of body.holdings) {
      if (!raw || typeof raw !== "object") throw new Error("Invalid position");
      const row = { ...raw, shares: raw.shares ?? 0, marketValue: raw.marketValue ?? raw.value, kind: raw.kind === "unsupported" ? "opaque" : raw.kind };
      if (row.kind !== undefined && !["stock", "etf", "cash", "opaque"].includes(row.kind)) throw new Error("Invalid security kind");
      if (row.price !== undefined && (typeof row.price !== "number" || !Number.isFinite(row.price) || row.price < 0)) throw new Error("Invalid price");
      const parsed = parseHoldings([row]);
      if (parsed.size !== 1) throw new Error("Invalid position; no exposure was discarded");
      const [ticker, h] = [...parsed][0];
      if (seen.has(ticker)) throw new Error("Provide unique symbols; merge lots during import review");
      seen.add(ticker);
      holdings.push({ ticker, shares: h.shares, price: h.price ?? 0, kind: h.kind, marketValue: h.marketValue, provenance: h.provenance });
    }
    portfolioValue(holdings);
  } catch (error) { return fail(error instanceof Error ? error.message : "Invalid valuation", 400); }
  const total = portfolioValue(holdings);
  const results = await Promise.all(holdings.map(async (holding): Promise<HistoryResult> => {
    if (performanceEligible(holding)) return getHistory(holding.ticker);
    return { symbol: holding.ticker, status: "unsupported", daily: [], weekly: [], numericProvenance: {}, stale: false,
      warning: "Cash, unsupported or explicit reviewed value has no modeled share-price history; value retained in coverage",
      adjustment: { status: "unverified", suspiciousDates: [], reason: "No modeled history basis" },
      crossValidation: { status: "not-comparable", primary: "none", secondary: "none", selected: "none", reason: "History was not requested" } };
  }));
  const histories: Record<string, Weekly | null> = {};
  const historySources = Object.fromEntries(results.map(result => {
    histories[result.symbol] = result.status === "available" && !result.adjustment.suspiciousDates.length && result.adjustment.status !== "mismatch" ? result.weekly : null;
    return [result.symbol, { status: result.status, provenance: result.provenance, stale: result.stale, adjustment: result.adjustment, crossValidation: result.crossValidation, warning: result.warning }];
  }));
  const performance = buildPerformance(holdings, histories, new Date().toISOString().slice(0, 10));
  const included = new Set(performance.holdings.map(holding => holding.ticker));
  const input: Provenance = { kind: "assumption", source: "Caller-supplied portfolio positions", rationale: "Current quantities/prices/values require user review; caller provenance is retained but not independently verified by this API" };
  const evidence = (holding: PerformanceHolding) => holding.provenance ?? input;
  const sources: Provenance[] = [...holdings.map(evidence), ...results.flatMap(result => result.provenance ? [result.provenance] : [])];
  const provenance: Record<string, Provenance> = {};
  performance.series.forEach((_, index) => { provenance[`/series/${index}/value`] = { kind: "computed", formula: "Rounded sum of current share counts × sourced closes on or before date; final point uses caller current prices (constant-share assumption)", inputs: sources }; });
  performance.holdings.forEach((holding, index) => {
    provenance[`/holdings/${index}/value`] = { kind: "computed", formula: "current shares × caller current price", inputs: [evidence(holdings.find(h=>h.ticker===holding.ticker)!)] };
    for (const range of Object.keys(holding.returns)) provenance[`/holdings/${index}/returns/${range}`] = { kind: "computed", formula: "current price / historical close selected by buildPerformance range - 1 (constant-share price-return approximation; adjustment state disclosed)", inputs: sources };
  });
  provenance["/coverage"] = { kind: "computed", formula: "sum of modeled current values / sum of ALL declared current values; zero if total is zero", inputs: sources };
  const unmodeled = holdings.flatMap((holding, index) => included.has(holding.ticker) ? [] : [{ ticker: holding.ticker, marketValue: positionValue(holding), portfolioWeight: total > 0 ? positionValue(holding) / total : 0, reason: results[index].warning ?? "Insufficient history, unresolved adjustment basis or unknown quantity; not modeled" }]);
  unmodeled.forEach((holding, index) => {
    provenance[`/unmodeled/${index}/marketValue`] = evidence(holdings.find(h=>h.ticker===holding.ticker)!);
    provenance[`/unmodeled/${index}/portfolioWeight`] = { kind: "computed", formula: "excluded declared position value / all declared position values; zero if total is zero", inputs: holdings.map(evidence) };
  });
  for (const result of results) if (result.crossValidation.differencePct !== undefined) provenance[`/historySources/${result.symbol.replace(/~/g, "~0").replace(/\//g, "~1")}/crossValidation/differencePct`] = result.numericProvenance["/crossValidation/differencePct"];
  return Response.json({ ...performance, unmodeled, historySources, provenance, methodology: "Constant current holdings, not account performance; unsupported rows retained in excluded/coverage. Adjustment status is explicit; no verified total-return claim." }, { headers: { "Cache-Control": "private, max-age=300" } });
}
