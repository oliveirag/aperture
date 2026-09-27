// Pure: a portfolio value series from weekly closes, assuming today's share counts throughout.
import type { HistoryResult, Weekly } from "@/lib/history";
import type { NumericProvenance, Provenance } from "@/lib/provenance";
import type { PerformancePoint } from "@/types/demo";
import { portfolioValue, positionValue } from "@/lib/xray/valuation";

export const RANGES = [
  { id: "1M", weeks: 4 },
  { id: "6M", weeks: 26 },
  { id: "1Y", weeks: 52 },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];

export type PerformanceHolding = { ticker: string; shares: number; price: number; marketValue?: number; kind?: string; provenance?: Provenance };

// Apply before provider requests as well as in the calculation. Reviewed values
// never imply a fabricated quantity or a historical price basis.
export function performanceEligible(h: PerformanceHolding): boolean {
  return h.kind !== "cash" && h.kind !== "opaque" && h.kind !== "unsupported" && h.ticker !== "USD" && h.marketValue === undefined && h.shares > 0 && h.price > 0;
}
export type HoldingReturn = { ticker: string; value: number; returns: Partial<Record<RangeId, number>> };
export type PerformanceResponse = {
  series: PerformancePoint[];
  holdings: HoldingReturn[];
  // Positions left out because there's no price history for them.
  excluded: string[];
  // Share of today's value the series covers.
  coverage: number;
  // The HTTP boundary adds sourced metadata; the pure calculator has no provider context.
  unmodeled?: { ticker: string; marketValue: number; portfolioWeight: number; reason: string }[];
  historySources?: Record<string, Pick<HistoryResult, "status" | "provenance" | "stale" | "adjustment" | "crossValidation" | "warning">>;
  provenance?: NumericProvenance;
  methodology?: string;
};

// Close on or before a date (weekly series, oldest first).
function closeAt(w: Weekly, date: string) {
  let lo = 0;
  let hi = w.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (w[mid].date <= date) {
      found = w[mid].close;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function buildPerformance(holdings: PerformanceHolding[], histories: Record<string, Weekly | null>, today: string): PerformanceResponse {
  const included = holdings.filter((h) => performanceEligible(h) && (histories[h.ticker]?.length ?? 0) > 1);
  const excluded = holdings.filter((h) => !included.includes(h)).map((h) => h.ticker);
  const totalNow = portfolioValue(holdings);
  const nowValue = portfolioValue(included);
  if (included.length === 0) return { series: [], holdings: [], excluded, coverage: 0 };

  // Weekly dates over the last year, from the longest history, starting once every included position has a price.
  const start = included.reduce((m, h) => (histories[h.ticker]![0].date > m ? histories[h.ticker]![0].date : m), "");
  const dates = [...new Set(included.flatMap((h) => histories[h.ticker]!.map((p) => p.date)))].filter((d) => d >= start && d < today).sort().slice(-52);
  const series: PerformancePoint[] = dates.map((date) => ({
    date,
    value: Math.round(included.reduce((s, h) => s + h.shares * (closeAt(histories[h.ticker]!, date) ?? 0), 0)),
  }));
  // Last point is the COVERED subset of the shared valuation, not a replacement
  // portfolio total. Missing-history and unsupported values remain in coverage's denominator.
  series.push({ date: today, value: Math.round(nowValue) });

  const returns = (h: PerformanceHolding) => {
    const out: Partial<Record<RangeId, number>> = {};
    for (const r of RANGES) {
      const i = series.length - 1 - r.weeks;
      if (i < 0) continue;
      const then = closeAt(histories[h.ticker]!, series[i].date);
      if (then) out[r.id] = h.price / then - 1;
    }
    return out;
  };
  return {
    series,
    holdings: included.map((h) => ({ ticker: h.ticker, value: positionValue(h), returns: returns(h) })).sort((a, b) => b.value - a.value),
    excluded,
    coverage: totalNow > 0 ? nowValue / totalNow : 0,
  };
}

// Return over the last `weeks` points of a series (the last point is now).
export function seriesReturn(series: PerformancePoint[], weeks: number) {
  if (series.length < 2) return null;
  const then = series[Math.max(0, series.length - 1 - weeks)].value;
  return then > 0 ? series[series.length - 1].value / then - 1 : null;
}
